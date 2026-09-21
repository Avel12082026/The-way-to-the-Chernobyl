#!/usr/bin/env python3
"""Install/upgrade map-routed raids for three locations and the first-location shop limits."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
OLD_ROUTE_MARKS=('// ZONE_MAP_ROUTING_V1','// ZONE_MAP_ROUTING_V2')
ROUTE_MARK='// ZONE_MAP_ROUTING_V3'
SHOP_MARK='// ZONE_MAP_LOCATION1_SHOP_V1'

SHOP_GUARD=r"""// ZONE_MAP_LOCATION1_SHOP_V1
function zoneMapLocation1WeaponNames(){
    const list=Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[];
    const start=list.findIndex(item=>item&&item.starterGear);
    const end=start>=0?list.findIndex((item,index)=>index>start&&/^Дробовик\b/i.test(String(item&&item.name||''))):-1;
    const group=start>=0?list.slice(start,end>start?end:list.length):list;
    return new Set(group.filter(item=>item&&!item.adminOnly).slice(0,10).map(item=>item.name));
}
const ZONE_MAP_LOCATION1_WEAPONS=zoneMapLocation1WeaponNames();
const ZONE_MAP_LOCATION1_ARMOR=new Set(
    (Array.isArray(SHOP_ARMOR)?SHOP_ARMOR:[])
      .filter(item=>item&&!item.adminOnly&&!item.isResearchSuit&&!item.isPremiumArmor)
      .slice(0,10).map(item=>item.name)
);
app.post('/api/shop/buy',(req,res,next)=>{
    if(String(req.body?.vendor||'')!=='zhuchara')return next();
    const category=String(req.body?.category||''),name=String(req.body?.name||'');
    if(category==='weapon'&&!ZONE_MAP_LOCATION1_WEAPONS.has(name))
        return res.status(400).json({success:false,error:'Этот ствол продаётся на другой локации'});
    if(category==='armor'&&!ZONE_MAP_LOCATION1_ARMOR.has(name))
        return res.status(400).json({success:false,error:'Этот костюм продаётся на другой локации'});
    return next();
});

"""

ZONE_ROUTE=r"""// ZONE_MAP_ROUTING_V3
const ZONE_MAP_FILES=Object.freeze({1:'zone-map1.jpg',2:'zone-map2.jpg',3:'zone-map3.jpg'});
app.get('/api/zone-map/:location',(req,res)=>{
    const location=Number(req.params.location||0),file=ZONE_MAP_FILES[location];
    if(!file)return res.status(404).end();
    return res.sendFile(require('path').join(process.cwd(),'ui',file),err=>{
        if(err&&!res.headersSent)res.status(err.statusCode||404).end();
    });
});

function zoneMapPistolListServer(){
    const list=Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[];
    const start=list.findIndex(item=>item&&item.starterGear);
    const end=start>=0?list.findIndex((item,index)=>index>start&&/^Дробовик\b/i.test(String(item&&item.name||''))):-1;
    const group=start>=0?list.slice(start,end>start?end:list.length):list;
    return group.filter(item=>item&&!item.adminOnly);
}
const ZONE_MAP_PISTOLS_SERVER=zoneMapPistolListServer();
const ZONE_MAP_FIRST_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(0,10);
const ZONE_MAP_LAST_NINE_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(-9);
const ZONE_MAP_FIRST_ARMOR_SERVER=(Array.isArray(SHOP_ARMOR)?SHOP_ARMOR:[])
    .filter(item=>item&&!item.adminOnly&&!item.isResearchSuit&&!item.isPremiumArmor).slice(0,10);

function zoneMapListUnlocked(data,list,count){
    const level=Math.max(1,Number(data&&data.level)||1);
    return list.length>=count&&list.every(item=>level>=Number(item.unlockLevel||0));
}
function zoneMapLocationUnlocked(data,location){
    if(location===1)return true;
    if(location===2)return zoneMapListUnlocked(data,ZONE_MAP_FIRST_PISTOLS_SERVER,10)&&
        zoneMapListUnlocked(data,ZONE_MAP_FIRST_ARMOR_SERVER,10);
    if(location===3)return zoneMapListUnlocked(data,ZONE_MAP_LAST_NINE_PISTOLS_SERVER,9);
    return false;
}
const ZONE_MAP_NPC_STATS=Object.freeze({1:{hp:240,dmg:28},2:{hp:480,dmg:45}});
function zoneMapNpcPayload(data,zoneTier,zoneLocation){
    const forcedLevel=zoneTier<=1?1:1+(zoneTier-1)*40;
    const npc=raidCreateNpcPayload({...data,level:forcedLevel});
    if(!npc)return null;
    const stats=ZONE_MAP_NPC_STATS[zoneTier];
    npc.tier=zoneTier;
    if(stats){
        npc.hp=stats.hp;
        npc.enemyHp=stats.hp;
        npc.maxEnemyHp=stats.hp;
        npc.dmg=stats.dmg;
    }
    if(zoneLocation===2)npc.faction='Бандиты';
    if(zoneLocation===3)npc.faction='Военные';
    return npc;
}
function zoneMapMutantPayload(data,zoneTier){
    const list=(Array.isArray(PVE_MUTANTS)?PVE_MUTANTS:[]).filter(m=>m&&!m.adminOnly);
    let pool=[];
    if(zoneTier<=1){
        pool=list.filter(m=>[0,1].includes(Number(m.tier)||0));
    }else{
        const internalTiers=[...new Set(list.map(m=>Number(m.tier)||0).filter(t=>t>1))].sort((a,b)=>a-b);
        const internalTier=internalTiers[Math.min(internalTiers.length-1,Math.max(0,zoneTier-2))];
        pool=list.filter(m=>(Number(m.tier)||0)===internalTier);
    }
    if(!pool.length)return null;
    const pick=pool[Math.floor(Math.random()*pool.length)];
    const baseHp=Math.max(1,Number(pick.hp)||1);
    const floor=zoneTier<=1?240:zoneTier===2?420:0;
    const hp=Math.max(baseHp,floor);
    return {...pick,sourceTier:Number(pick.tier)||0,tier:zoneTier,kind:'mutant',
        hp,enemyHp:hp,maxEnemyHp:hp,medkitsUsed:0};
}

app.post('/api/raid/zone-step',requireAuth,rateLimit('raid-zone-step',20,10000),(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    const zoneKind=String(req.body?.zoneKind||'');
    const zoneLocation=Number(req.body?.zoneLocation||1);
    if(!['enemy','mutant','anomaly'].includes(zoneKind))
        return res.status(400).json({success:false,error:'Неизвестная точка на карте'});
    if(![1,2,3].includes(zoneLocation))
        return res.status(400).json({success:false,error:'Неизвестная локация'});
    try{
        const tx=db.transaction(()=>{
            const sess=raidSession(playerId,token);if(!sess)return{success:false,error:'Рейд не найден'};
            if(sess.pending_type)return{success:false,error:'Сначала завершите текущую встречу'};
            const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);if(!row)return{success:false,error:'Игрок не найден'};
            const data=safeParsePlayerData(row.data);
            if(!zoneMapLocationUnlocked(data,zoneLocation)){
                const error=zoneLocation===3
                    ?'НИИ Агропром пока закрыт. Должны быть открыты последние 9 пистолетов.'
                    :'Вторая локация пока закрыта. Нужны первые 10 пистолетов и первые 10 костюмов.';
                return{success:false,error};
            }

            const zoneTier=zoneLocation;
            data.hunger=Math.max(0,Math.min(Number(data.maxHunger)||100,(Number(data.hunger)||0)-2));
            data.thirst=Math.max(0,Math.min(Number(data.maxThirst)||100,(Number(data.thirst)||0)-2));
            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);
            const turnEffects=pveArtifactTurnEffects(data);
            const radiationDamage=pveRadiationDamage(data);
            let starvationDamage=0;
            if(data.hunger<=0)starvationDamage+=3;if(data.thirst<=0)starvationDamage+=3;
            if(starvationDamage>0)data.health=Math.round(((Number(data.health)||0)-starvationDamage)*10)/10;
            if(data.health<=0){
                pveApplyDeathNow(data);
                db.prepare('DELETE FROM raid_sessions WHERE player_id=?').run(playerId);
                db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
                db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?').run(JSON.stringify(data),Date.now(),playerId);
                return{success:true,died:true,state:raidState(data),event:{type:'none'},turnEffects,radiationDamage,starvationDamage,zoneKind,zoneLocation,zoneTier};
            }

            let event={type:'none'},pendingType=null,pendingPayload=null;
            const roll=Math.random();

            if(zoneKind==='enemy'&&roll<0.30){
                const npc=zoneMapNpcPayload(data,zoneTier,zoneLocation);
                if(npc){
                    const battleToken=crypto.randomBytes(24).toString('hex');
                    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
                    db.prepare('INSERT INTO pve_battles(player_id,token,enemy_kind,enemy_key,payload,started_at) VALUES(?,?,?,?,?,?)')
                      .run(playerId,battleToken,'npc',`${npc.faction}:${npc.tier}:${npc.name}`,JSON.stringify(npc),Date.now());
                    pendingType='battle';pendingPayload=JSON.stringify({battleToken});
                    event={type:'battle',enemy:{...npc,battleToken,faction:{name:npc.faction}}};
                }
            }else if(zoneKind==='anomaly'&&roll<0.30){
                const pool=(Array.isArray(RAID_ANOMALIES)?RAID_ANOMALIES:[])
                    .filter(a=>Number(a.tier)===zoneTier&&!a.isNamedArtifactAnomaly);
                if(pool.length){
                    const a=pool[Math.floor(Math.random()*pool.length)];
                    const payload={...a,tier:zoneTier,attemptsUsed:0,resolved:false};
                    pendingType='anomaly';pendingPayload=JSON.stringify(payload);event={type:'anomaly',anomaly:payload};
                }
            }else if(zoneKind==='mutant'&&roll<0.20){
                const mutant=zoneMapMutantPayload(data,zoneTier);
                if(mutant){
                    const battleToken=crypto.randomBytes(24).toString('hex');
                    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
                    db.prepare('INSERT INTO pve_battles(player_id,token,enemy_kind,enemy_key,payload,started_at) VALUES(?,?,?,?,?,?)')
                      .run(playerId,battleToken,'mutant',`location:${zoneLocation}:${mutant.name}`,JSON.stringify(mutant),Date.now());
                    pendingType='battle';pendingPayload=JSON.stringify({battleToken});
                    event={type:'battle',enemy:{...mutant,battleToken}};
                }
            }

            db.prepare('UPDATE raid_sessions SET pending_type=?,pending_payload=?,updated_at=? WHERE player_id=? AND token=?')
              .run(pendingType,pendingPayload,Date.now(),playerId,token);
            db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?').run(JSON.stringify(data),Date.now(),playerId);
            return{success:true,died:false,state:raidState(data),event,turnEffects,radiationDamage,starvationDamage,zoneKind,zoneLocation,zoneTier};
        });
        return res.json(tx());
    }catch(e){
        console.error('[/api/raid/zone-step]',e);
        return res.status(500).json({success:false,error:'Ошибка шага рейда по карте'});
    }
});

"""

def insert_before_one(text, anchors, block, label):
    matches=[a for a in anchors if text.count(a)]
    total=sum(text.count(a) for a in anchors)
    if total!=1:
        raise RuntimeError(f'{label}: ожидался один якорь, найдено {total}. Ничего не изменено.')
    anchor=matches[0]
    return text.replace(anchor,block+anchor,1)

def upgrade_route(text):
    matches=[mark for mark in OLD_ROUTE_MARKS if mark in text]
    if len(matches)!=1:
        raise RuntimeError(f'Ожидался один старый маршрут карты, найдено {len(matches)}.')
    start=text.find(matches[0])
    listen=text.find('app.listen(',start)
    if listen<0:
        raise RuntimeError('После старого маршрута карты не найден app.listen. Ничего не изменено.')
    return text[:start]+ZONE_ROUTE+text[listen:]

def patch(source):
    has_v3=ROUTE_MARK in source
    old_marks=[mark for mark in OLD_ROUTE_MARKS if mark in source]
    has_shop=SHOP_MARK in source

    if has_v3:
        if not has_shop: raise RuntimeError('Маршрут V3 есть, но защита магазина отсутствует.')
        return source,False

    if old_marks:
        if len(old_marks)!=1: raise RuntimeError('Найдено несколько старых маршрутов карты.')
        if not has_shop: raise RuntimeError('Обнаружена частичная старая установка. Автоматическое продолжение запрещено.')
        return upgrade_route(source),True

    text=source
    if not has_shop:
        text=insert_before_one(
            text,
            ["app.post('/api/shop/buy'","app.post(\"/api/shop/buy\""],
            SHOP_GUARD,
            'маршрут покупки'
        )
    text=insert_before_one(text,["app.listen("],ZONE_ROUTE,'app.listen')
    return text,True

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    path=args.server.resolve(strict=True)
    root=path.parent
    assets=[
        (root/'ui'/'zone-map1.jpg',b'\xff\xd8'),
        (root/'ui'/'zone-map2.jpg',b'\xff\xd8'),
        (root/'ui'/'zone-map3.jpg',b'\xff\xd8'),
    ]
    for asset,signature in assets:
        if not asset.is_file():
            raise RuntimeError(f'Не найдена карта: {asset}. Сначала скопируйте карту в /var/www/pocketzone/ui.')
        raw_asset=asset.read_bytes()
        if len(raw_asset)<50000 or not raw_asset.startswith(signature):
            raise RuntimeError(f'Файл карты повреждён или слишком мал: {asset}')
    old=path.read_bytes()
    source=old.decode('utf-8')
    new_text,changed=patch(source)
    if not changed:
        print('ZONE_MAP_ROUTING_V3 уже установлен.')
        return

    with tempfile.TemporaryDirectory(prefix='zone-map-routing-v3-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Совместимость трёх локаций, тиров и маршрутов подтверждена. Файлы не изменены.')
            return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')

    backup=path.with_name(path.name+'.before-zone-map-routing-v3-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.zone-map-routing-v3-',dir=path.parent)
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
                probe=run(['curl','-fsS','--max-time','2','http://127.0.0.1:3000/api/market'],capture_output=True,check=False)
                if probe.returncode==0:
                    print('ZONE_MAP_ROUTING_V3 установлен. Backup:',backup)
                    return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после обновления')
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
