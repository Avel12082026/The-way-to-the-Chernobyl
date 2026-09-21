#!/usr/bin/env python3
"""Install 3-level weapon progression, trader gating, and NPC weapon loot scaling."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
MARK='// WEAPON_UNLOCK_EVERY_3_LEVELS_V1'
NPC_MARK='// NPC_WEAPON_PROGRESS_WINDOW_V1'
VICTORY_MARK='// NPC_WEAPON_LOOT_WINDOW_V1'

CORE=r"""// WEAPON_UNLOCK_EVERY_3_LEVELS_V1
function buildWeaponProgressionServer(list){
    const regular=(Array.isArray(list)?list:[]).filter(w=>w&&!w.adminOnly);
    const rifleStart=regular.findIndex(w=>/^Винтовка(?:\s|$)/i.test(String(w&&w.name||'')));
    const pistolStart=regular.findIndex(w=>!!(w&&w.starterGear)||String(w&&w.name||'')==='Beretta 21A Bobcat'||Number(w&&w.id)===86);
    const shotgunStart=regular.findIndex(w=>/^Дробовик(?:\s|$)/i.test(String(w&&w.name||'')));
    if(rifleStart<0||pistolStart<0||shotgunStart<0||
       !(rifleStart<pistolStart&&pistolStart<shotgunStart))
        throw new Error('WEAPON_UNLOCK_EVERY_3_LEVELS_V1: не удалось определить классы оружия');
    const automatics=regular.slice(0,rifleStart);
    const rifles=regular.slice(rifleStart,pistolStart);
    const pistols=regular.slice(pistolStart,shotgunStart);
    const shotguns=regular.slice(shotgunStart);
    // Live SHOP_WEAPONS historically did not carry starterGear on Beretta.
    // Restore that canonical marker so the already-installed map gates also
    // recognise the pistol block correctly.
    if(pistols[0]&&!pistols[0].starterGear)pistols[0].starterGear=true;
    if(automatics.length!==29||rifles.length!==29||pistols.length!==29||shotguns.length!==29)
        throw new Error('WEAPON_UNLOCK_EVERY_3_LEVELS_V1: ожидалось по 29 стволов каждого класса');
    const ordered=[...pistols,...shotguns,...automatics,...rifles];
    ordered.forEach((weapon,index)=>{
        weapon.progressionIndex=index;
        weapon.unlockLevel=1+index*3;
        weapon.progressionClass=index<29?'pistol':index<58?'shotgun':index<87?'automatic':'rifle';
    });
    return ordered;
}
const WEAPON_PROGRESSION_SERVER=buildWeaponProgressionServer(SHOP_WEAPONS);
const WEAPON_PROGRESSION_BY_NAME_SERVER=new Map(WEAPON_PROGRESSION_SERVER.map((w,i)=>[w.name,{weapon:w,index:i}]));
const WEAPON_PROGRESSION_NAMES_SERVER=new Set(WEAPON_PROGRESSION_SERVER.map(w=>w.name));

function weaponProgressionBaseNameServer(value){
    const raw=typeof value==='string'?value:String(value&&value.name||'');
    if(typeof parseGearNameServer==='function'){
        try{
            const parsed=parseGearNameServer(raw);
            if(parsed&&parsed.baseName)return String(parsed.baseName);
        }catch(_){}
    }
    return raw.replace(/\s+\+\d+$/,'').trim();
}
function weaponProgressionPlayerIndexServer(data){
    const equipped=weaponProgressionBaseNameServer(data&&data.weapon);
    const found=WEAPON_PROGRESSION_BY_NAME_SERVER.get(equipped);
    if(found)return found.index;
    const level=Math.max(1,Number(data&&data.level)||1);
    return Math.max(0,Math.min(WEAPON_PROGRESSION_SERVER.length-1,Math.floor((level-1)/3)));
}
function weaponProgressionNpcWeaponServer(data){
    const base=weaponProgressionPlayerIndexServer(data);
    const shift=Math.floor(Math.random()*3)-1;
    const index=Math.max(0,Math.min(WEAPON_PROGRESSION_SERVER.length-1,base+shift));
    return WEAPON_PROGRESSION_SERVER[index];
}

app.post('/api/shop/buy',requireAuth,(req,res,next)=>{
    try{
        const name=String(req.body&&req.body.name||'');
        const entry=WEAPON_PROGRESSION_BY_NAME_SERVER.get(name);
        if(!entry)return next();
        const playerId=String(req.telegramUser.id);
        const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);
        if(!row)return res.status(404).json({success:false,error:'Игрок не найден'});
        const data=safeParsePlayerData(row.data);
        const level=Math.max(1,Number(data&&data.level)||1);
        const required=Number(entry.weapon.unlockLevel)||1;
        if(level<required)
            return res.status(400).json({
                success:false,
                error:'Это оружие откроется на '+required+' уровне',
                requiredLevel:required,
                progressionIndex:entry.index
            });
        return next();
    }catch(e){
        console.error('[weapon progression shop]',e);
        return res.status(500).json({success:false,error:'Ошибка проверки уровня оружия'});
    }
});

"""

NPC_WRAP=r"""// NPC_WEAPON_PROGRESS_WINDOW_V1
const raidCreateNpcPayloadWeaponProgressionNative=raidCreateNpcPayload;
raidCreateNpcPayload=function(data){
    const npc=raidCreateNpcPayloadWeaponProgressionNative(data);
    if(!npc)return npc;
    const weapon=weaponProgressionNpcWeaponServer(data);
    if(weapon){
        npc.weapon={
            id:weapon.id,
            name:weapon.name,
            dmg:Number(weapon.dmg)||0,
            tier:Number(weapon.tier)||1,
            unlockLevel:Number(weapon.unlockLevel)||1,
            progressionIndex:Number(weapon.progressionIndex)||0
        };
        npc.weaponName=weapon.name;
        npc.weaponDrop=weapon.name;
        npc.weaponProgressionIndex=Number(weapon.progressionIndex)||0;
        npc.weaponUnlockLevel=Number(weapon.unlockLevel)||1;
    }
    return npc;
};

"""

VICTORY_MIDDLEWARE=r"""// NPC_WEAPON_LOOT_WINDOW_V1
app.post('/api/pve/victory',requireAuth,(req,res,next)=>{
    let ctx=null;
    try{
        const playerId=String(req.telegramUser.id);
        const token=String(req.body&&req.body.battleToken||'');
        const battle=db.prepare('SELECT enemy_kind,payload FROM pve_battles WHERE player_id=? AND token=?').get(playerId,token);
        if(battle&&String(battle.enemy_kind)==='npc'){
            let payload={};
            try{payload=JSON.parse(battle.payload||'{}')||{};}catch(_){}
            const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);
            if(row){
                const before=safeParsePlayerData(row.data);
                const requested=WEAPON_PROGRESSION_BY_NAME_SERVER.get(String(payload.weaponDrop||payload.weaponName||''))?.weapon
                    ||weaponProgressionNpcWeaponServer(before);
                if(requested){
                    const snapshot={};
                    const inv=before.inventory||{};
                    for(const w of WEAPON_PROGRESSION_SERVER)snapshot[w.name]=Number(inv[w.name])||0;
                    ctx={playerId,weapon:requested,before:snapshot};
                }
            }
        }
    }catch(e){console.error('[npc weapon loot pre]',e);}

    if(!ctx)return next();
    const sendJson=res.json.bind(res);
    res.json=function(body){
        if(!body||body.success!==true)return sendJson(body);
        try{
            const row=db.prepare('SELECT data FROM players WHERE id=?').get(ctx.playerId);
            if(row){
                const data=safeParsePlayerData(row.data);
                data.inventory=data.inventory||{};
                // Любой старый случайный оружейный дроп от NPC заменяем одним оружием
                // из окна: оружие игрока по прогрессии, на 1 позицию слабее или сильнее.
                for(const w of WEAPON_PROGRESSION_SERVER){
                    const before=Number(ctx.before[w.name])||0;
                    const now=Number(data.inventory[w.name])||0;
                    if(now>before){
                        if(before>0)data.inventory[w.name]=before;
                        else delete data.inventory[w.name];
                    }
                }
                data.inventory[ctx.weapon.name]=(Number(data.inventory[ctx.weapon.name])||0)+1;
                db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?')
                  .run(JSON.stringify(data),Date.now(),ctx.playerId);

                if(body.state&&typeof body.state==='object')
                    body.state={...body.state,inventory:{...data.inventory}};
                const rewards=Array.isArray(body.rewards)?body.rewards:[];
                body.rewards=rewards.filter(line=>
                    ![...WEAPON_PROGRESSION_NAMES_SERVER].some(name=>String(line).includes(name))
                );
                body.rewards.push('Оружие с NPC: '+ctx.weapon.name);
                body.npcWeaponDrop={
                    name:ctx.weapon.name,
                    progressionIndex:Number(ctx.weapon.progressionIndex)||0,
                    unlockLevel:Number(ctx.weapon.unlockLevel)||1
                };
            }
        }catch(e){console.error('[npc weapon loot post]',e);}
        return sendJson(body);
    };
    return next();
});

"""

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def find_first(text,anchors,label):
    found=[(text.find(a),a) for a in anchors if text.find(a)>=0]
    if not found:
        raise RuntimeError(f'{label}: якорь не найден.')
    found.sort(key=lambda x:x[0])
    return found[0][1]

def patch(source):
    marks=[MARK in source,NPC_MARK in source,VICTORY_MARK in source]
    if any(marks):
        if not all(marks):
            raise RuntimeError('Обнаружена частичная установка прогрессии оружия.')
        return source,False

    if 'const SHOP_WEAPONS' not in source:
        raise RuntimeError('Не найден SHOP_WEAPONS.')
    if 'function raidCreateNpcPayload' not in source:
        raise RuntimeError('Не найдена raidCreateNpcPayload.')
    if 'pve_battles' not in source:
        raise RuntimeError('Не найдена таблица pve_battles в серверной логике.')

    text=source

    # Старый маршрут первой локации ограничивал Жучару первыми 10 пистолетами.
    # Новая общая прогрессия оружия это ограничение отменяет: у торговца открывается
    # следующий ствол каждые 3 уровня вплоть до винтовок. Ограничение брони сохраняется.
    old_location_weapon_guard="""    if(category==='weapon'&&!ZONE_MAP_LOCATION1_WEAPONS.has(name))
        return res.status(400).json({success:false,error:'Этот ствол продаётся на другой локации'});
"""
    if old_location_weapon_guard in text:
        text=text.replace(old_location_weapon_guard,'',1)
    elif '// ZONE_MAP_LOCATION1_SHOP_V1' in text and 'Этот ствол продаётся на другой локации' in text:
        raise RuntimeError('Не удалось безопасно снять старое ограничение оружия у Жучары.')

    shop_anchor=find_first(
        text,
        ["app.post('/api/shop/buy'","app.post(\"/api/shop/buy\""],
        'маршрут покупки'
    )
    text=text.replace(shop_anchor,CORE+shop_anchor,1)

    raid_anchor=find_first(
        text,
        ["app.post('/api/raid/step'","app.post(\"/api/raid/step\""],
        'маршрут шага рейда'
    )
    text=text.replace(raid_anchor,NPC_WRAP+raid_anchor,1)

    victory_anchor=find_first(
        text,
        ["app.post('/api/pve/victory'","app.post(\"/api/pve/victory\""],
        'маршрут победы PvE'
    )
    text=text.replace(victory_anchor,VICTORY_MIDDLEWARE+victory_anchor,1)

    return text,True

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()

    path=args.server.resolve(strict=True)
    old=path.read_bytes()
    source=old.decode('utf-8')
    new_text,changed=patch(source)

    if not changed:
        print('WEAPON_UNLOCK_EVERY_3_LEVELS_V1 уже установлен.')
        return

    with tempfile.TemporaryDirectory(prefix='weapon-progression-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Прогрессия оружия подтверждена: новый ствол каждые 3 уровня; пистолеты → дробовики → автоматы → винтовки; NPC ±1 позиция. Файлы не изменены.')
            return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')

    backup=path.with_name(path.name+'.before-weapon-progression-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.weapon-progression-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as h:
            h.write(new_text);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp)
        st=path.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if path.read_bytes()!=old:
            raise RuntimeError('server.js изменился во время проверки; установка остановлена.')
        os.replace(tmp,path)
        run(['node','--check',str(path)],timeout=30)
        run(['systemctl','restart',SERVICE],timeout=45)
        for _ in range(20):
            state=run(['systemctl','is-active',SERVICE],capture_output=True,text=True,check=False)
            if state.stdout.strip()=='active':
                probe=run(['curl','-fsS','--max-time','2','http://127.0.0.1:3000/api/market'],
                          capture_output=True,check=False)
                if probe.returncode==0:
                    print('WEAPON_UNLOCK_EVERY_3_LEVELS_V1 установлен. Backup:',backup)
                    print('Открытие: уровни 1,4,7,...,346. NPC: текущая позиция оружия игрока ±1.')
                    return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после обновления.')
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
