#!/usr/bin/env python3
"""Install deterministic zone-map raid routing and location-one shop limits."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
ROUTE_MARK='// ZONE_MAP_ROUTING_V1'
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

ZONE_ROUTE=r"""// ZONE_MAP_ROUTING_V1
app.post('/api/raid/zone-step',requireAuth,rateLimit('raid-zone-step',20,10000),(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    const zoneKind=String(req.body?.zoneKind||'');
    if(!['enemy','mutant','anomaly'].includes(zoneKind))
        return res.status(400).json({success:false,error:'Неизвестная точка на карте'});
    try{
        const tx=db.transaction(()=>{
            const sess=raidSession(playerId,token);if(!sess)return{success:false,error:'Рейд не найден'};
            if(sess.pending_type)return{success:false,error:'Сначала завершите текущую встречу'};
            const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);if(!row)return{success:false,error:'Игрок не найден'};
            const data=safeParsePlayerData(row.data);
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
                return{success:true,died:true,state:raidState(data),event:{type:'none'},turnEffects,radiationDamage,starvationDamage,zoneKind};
            }

            let event={type:'none'},pendingType=null,pendingPayload=null;
            const roll=Math.random();

            if(zoneKind==='enemy'&&roll<0.30){
                const npc=raidCreateNpcPayload(data);
                if(npc){
                    npc.faction='Бандиты';
                    const battleToken=crypto.randomBytes(24).toString('hex');
                    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
                    db.prepare('INSERT INTO pve_battles(player_id,token,enemy_kind,enemy_key,payload,started_at) VALUES(?,?,?,?,?,?)')
                      .run(playerId,battleToken,'npc',`Бандиты:${npc.tier}:${npc.name}`,JSON.stringify(npc),Date.now());
                    pendingType='battle';pendingPayload=JSON.stringify({battleToken});
                    event={type:'battle',enemy:{...npc,battleToken,faction:{name:'Бандиты'}}};
                }
            }else if(zoneKind==='anomaly'&&roll<0.30){
                const encounterTier=raidEncounterTier(data);
                const hasT9=data.detector&&data.detector.name==='ВИЗИРЬ';
                const pool=RAID_ANOMALIES.filter(a=>Number(a.tier)<=encounterTier&&(!a.isNamedArtifactAnomaly||hasT9));
                if(pool.length){
                    const a=pool[Math.floor(Math.random()*pool.length)];
                    const payload={...a,attemptsUsed:0,resolved:false};
                    pendingType='anomaly';pendingPayload=JSON.stringify(payload);
                    event={type:'anomaly',anomaly:payload};
                }
            }else if(zoneKind==='mutant'&&roll<0.20){
                const mutant=raidCreateMutantPayload(data);
                if(mutant){
                    const battleToken=crypto.randomBytes(24).toString('hex');
                    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
                    db.prepare('INSERT INTO pve_battles(player_id,token,enemy_kind,enemy_key,payload,started_at) VALUES(?,?,?,?,?,?)')
                      .run(playerId,battleToken,'mutant',mutant.name,JSON.stringify(mutant),Date.now());
                    pendingType='battle';pendingPayload=JSON.stringify({battleToken});
                    event={type:'battle',enemy:{...mutant,battleToken}};
                }
            }

            db.prepare('UPDATE raid_sessions SET pending_type=?,pending_payload=?,updated_at=? WHERE player_id=? AND token=?')
              .run(pendingType,pendingPayload,Date.now(),playerId,token);
            db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?').run(JSON.stringify(data),Date.now(),playerId);
            return{success:true,died:false,state:raidState(data),event,turnEffects,radiationDamage,starvationDamage,zoneKind};
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

def patch(source):
    has_route=ROUTE_MARK in source
    has_shop=SHOP_MARK in source
    if has_route and has_shop:
        return source,False
    if has_route!=has_shop:
        raise RuntimeError('Обнаружена частичная установка карты. Автоматическое продолжение запрещено.')
    text=insert_before_one(
        source,
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
    old=path.read_bytes()
    source=old.decode('utf-8')
    new_text,changed=patch(source)
    if not changed:
        print('ZONE_MAP_ROUTING_V1 уже установлен.')
        return

    with tempfile.TemporaryDirectory(prefix='zone-map-routing-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Совместимость маршрутов карты и синтаксис подтверждены. Файлы не изменены.')
            return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')

    backup=path.with_name(path.name+'.before-zone-map-routing-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.zone-map-routing-',dir=path.parent)
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
                    print('ZONE_MAP_ROUTING_V1 установлен. Backup:',backup)
                    return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после обновления')
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
