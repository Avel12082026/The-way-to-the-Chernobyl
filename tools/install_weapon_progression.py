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
    const classSize=29;
    if(regular.length!==classSize*4)
        throw new Error('WEAPON_UNLOCK_EVERY_3_LEVELS_V1: ожидалось 116 обычных стволов');
    const pistolStart=regular.findIndex(w=>!!(w&&w.starterGear)||String(w&&w.name||'')==='Beretta 21A Bobcat'||Number(w&&w.id)===86);
    if(pistolStart!==classSize*2)
        throw new Error('WEAPON_UNLOCK_EVERY_3_LEVELS_V1: нарушена структура каталога оружия');
    const automatics=regular.slice(0,classSize);
    const rifles=regular.slice(classSize,classSize*2);
    const pistols=regular.slice(classSize*2,classSize*3);
    const shotguns=regular.slice(classSize*3,classSize*4);
    // Live SHOP_WEAPONS historically did not carry starterGear on Beretta.
    // Restore that canonical marker so the already-installed map gates also
    // recognise the pistol block correctly.
    if(pistols[0]&&!pistols[0].starterGear)pistols[0].starterGear=true;
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
    // NPC progression follows the player's level, not the currently equipped gun.
    // One new progression step opens every 3 player levels.
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
        const sourceVendor=String(req.body&&req.body.sourceVendor||req.body&&req.body.vendor||'');
        const cls=String(entry.weapon.progressionClass||'');
        if((sourceVendor==='zhuchara'&&cls==='pistol')||(sourceVendor==='barman'&&cls==='shotgun'))
            return next();
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
const NPC_CONSUMABLE_LOOT_NAMES=Object.freeze([
    'Хлеб','Тушенка','Вода','Энергетик',
    'Аптечка гражданская','Аптечка армейская','Аптечка научная','Антирад'
]);
const NPC_REGULAR_ARMOR_SERVER=(Array.isArray(SHOP_ARMOR)?SHOP_ARMOR:[])
    .filter(a=>a&&!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit);
const NPC_LOOT_TRACKED_NAMES_SERVER=new Set([
    ...WEAPON_PROGRESSION_NAMES_SERVER,
    ...NPC_REGULAR_ARMOR_SERVER.map(a=>a.name),
    ...NPC_CONSUMABLE_LOOT_NAMES
]);

function npcLootDropChanceServer(tier){
    const t=Math.max(1,Math.min(14,Number(tier)||1));
    // Tier 1: 36%; tier 14: 12.6%. Most NPC kills still yield no item.
    return Math.max(0.12,0.36-(t-1)*0.018);
}
function npcLootMedkitServer(tier){
    const t=Math.max(1,Math.min(14,Number(tier)||1));
    if(t<=4)return'Аптечка гражданская';
    if(t<=9)return'Аптечка армейская';
    return'Аптечка научная';
}
function npcLootConsumableServer(tier){
    const roll=Math.random();
    if(roll<0.22)return npcLootMedkitServer(tier);
    if(roll<0.48)return Math.random()<0.60?'Хлеб':'Тушенка';
    if(roll<0.70)return'Вода';
    if(roll<0.88)return'Энергетик';
    return'Антирад';
}
function npcLootArmorServer(tier){
    if(!NPC_REGULAR_ARMOR_SERVER.length)return null;
    const shift=Math.floor(Math.random()*3)-1;
    const target=Math.max(1,Math.min(14,(Number(tier)||1)+shift));
    let pool=NPC_REGULAR_ARMOR_SERVER.filter(a=>Number(a.tier)===target);
    if(!pool.length){
        const distance=Math.min(...NPC_REGULAR_ARMOR_SERVER.map(a=>Math.abs((Number(a.tier)||1)-target)));
        pool=NPC_REGULAR_ARMOR_SERVER.filter(a=>Math.abs((Number(a.tier)||1)-target)===distance);
    }
    return pool[Math.floor(Math.random()*pool.length)]||null;
}
function npcLootPickServer(ctx){
    // Conditional on a successful item roll: 75% consumable, 15% weapon, 10% armor.
    const categoryRoll=Math.random();
    if(categoryRoll<0.75)
        return{kind:'consumable',name:npcLootConsumableServer(ctx.tier)};
    if(categoryRoll<0.90&&ctx.weapon)
        return{kind:'weapon',name:ctx.weapon.name};
    const armor=npcLootArmorServer(ctx.tier);
    if(armor)return{kind:'armor',name:armor.name};
    return{kind:'consumable',name:npcLootConsumableServer(ctx.tier)};
}

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
                const snapshot={};
                const inv=before.inventory||{};
                for(const name of NPC_LOOT_TRACKED_NAMES_SERVER)snapshot[name]=Number(inv[name])||0;
                ctx={
                    playerId,
                    weapon:requested||null,
                    tier:Math.max(1,Math.min(14,Number(payload.tier)||1)),
                    before:snapshot
                };
            }
        }
    }catch(e){console.error('[npc loot pre]',e);}

    if(!ctx)return next();
    const sendJson=res.json.bind(res);
    res.json=function(body){
        if(!body||body.success!==true)return sendJson(body);
        try{
            const row=db.prepare('SELECT data FROM players WHERE id=?').get(ctx.playerId);
            if(row){
                const data=safeParsePlayerData(row.data);
                data.inventory=data.inventory||{};

                // Remove legacy guaranteed/random NPC gear/consumable drops first.
                for(const name of NPC_LOOT_TRACKED_NAMES_SERVER){
                    const before=Number(ctx.before[name])||0;
                    const now=Number(data.inventory[name])||0;
                    if(now>before){
                        if(before>0)data.inventory[name]=before;
                        else delete data.inventory[name];
                    }
                }

                const chance=npcLootDropChanceServer(ctx.tier);
                let drop=null;
                if(Math.random()<chance){
                    drop=npcLootPickServer(ctx);
                    if(drop&&drop.name)
                        data.inventory[drop.name]=(Number(data.inventory[drop.name])||0)+1;
                }

                db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?')
                  .run(JSON.stringify(data),Date.now(),ctx.playerId);

                if(body.state&&typeof body.state==='object')
                    body.state={...body.state,inventory:{...data.inventory}};

                const rewards=Array.isArray(body.rewards)?body.rewards:[];
                body.rewards=rewards.filter(line=>
                    ![...NPC_LOOT_TRACKED_NAMES_SERVER].some(name=>String(line).includes(name))
                );
                if(drop&&drop.name){
                    const label=drop.kind==='weapon'?'Оружие':drop.kind==='armor'?'Броня':'Припасы';
                    body.rewards.push(label+' с NPC: '+drop.name);
                }
                body.npcLootDrop={
                    dropped:!!(drop&&drop.name),
                    kind:drop&&drop.kind||null,
                    name:drop&&drop.name||null,
                    npcTier:ctx.tier,
                    itemChance:chance
                };
                if(drop&&drop.kind==='weapon'){
                    body.npcWeaponDrop={
                        name:drop.name,
                        progressionIndex:Number(ctx.weapon&&ctx.weapon.progressionIndex)||0,
                        unlockLevel:Number(ctx.weapon&&ctx.weapon.unlockLevel)||1
                    };
                }else delete body.npcWeaponDrop;
            }
        }catch(e){console.error('[npc loot post]',e);}
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

def _replace_installed_block(text,mark,route,new_block,route_occurrence,label):
    start=text.find(mark)
    if start<0:
        raise RuntimeError(f'{label}: маркер не найден.')
    pos=start
    found=-1
    for _ in range(route_occurrence):
        found=text.find(route,pos)
        if found<0:
            raise RuntimeError(f'{label}: не удалось найти границу старого блока.')
        pos=found+len(route)
    return text[:start]+new_block+text[found:]

def patch(source):
    marks=[MARK in source,NPC_MARK in source,VICTORY_MARK in source]
    if any(marks):
        if not all(marks):
            raise RuntimeError('Обнаружена частичная установка прогрессии оружия.')
        current_required=(
            'const classSize=29',
            'weapon.unlockLevel=1+index*3',
            'npcLootDropChanceServer',
            'NPC_CONSUMABLE_LOOT_NAMES',
            'weaponProgressionPlayerIndexServer(data)',
            "sourceVendor==='zhuchara'&&cls==='pistol'",
            "sourceVendor==='barman'&&cls==='shotgun'"
        )
        if all(x in source for x in current_required):
            return source,False

        # Upgrade the earlier V1 blocks in place while preserving original routes.
        text=source
        text=_replace_installed_block(
            text,MARK,"app.post('/api/shop/buy'",CORE,2,'прогрессия магазина'
        )
        text=_replace_installed_block(
            text,NPC_MARK,"app.post('/api/raid/step'",NPC_WRAP,1,'оружие NPC'
        )
        text=_replace_installed_block(
            text,VICTORY_MARK,"app.post('/api/pve/victory'",VICTORY_MIDDLEWARE,2,'лут NPC'
        )
        return text,True

    if 'const SHOP_WEAPONS' not in source:
        raise RuntimeError('Не найден SHOP_WEAPONS.')
    if 'const SHOP_ARMOR' not in source:
        raise RuntimeError('Не найден SHOP_ARMOR.')
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
            print('Прогрессия оружия и редкий NPC-лут подтверждены: оружие каждые 3 уровня; NPC ±1 ступень; шанс предмета падает с тиром. Файлы не изменены.')
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
                    print('Открытие: уровни 1,4,7,...,346. NPC: оружейная ступень по уровню игрока ±1; предметный лут редкий и убывает с тиром.')
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
