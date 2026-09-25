#!/usr/bin/env python3
"""Install/upgrade map-routed raids for four locations and the first-location shop limits."""
from pathlib import Path
import argparse, hashlib, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
OLD_ROUTE_MARKS=('// ZONE_MAP_ROUTING_V1','// ZONE_MAP_ROUTING_V2','// ZONE_MAP_ROUTING_V3')
ROUTE_MARK='// ZONE_MAP_ROUTING_V4'
SHOP_MARK='// ZONE_MAP_LOCATION1_SHOP_V1'
BARMAN_MARK='// ROSTOK_BARMAN_SHOP_V1'
POSITION_MARK='// PLAYER_WORLD_POSITION_V1'
UNIQUE_MUTANT_MARK='// UNIQUE_STRONGLAV_MAP_POOL_V1'
UNIQUE_MUTANT_GUARD="""    // UNIQUE_STRONGLAV_MAP_POOL_V1
    // Filter after tier routing so the remaining location tiers never shift.
    pool=pool.filter(m=>!['стронглав','самка стронглава'].includes(String(m.name||'').trim().toLowerCase()));
"""

SHOP_GUARD=r"""// ZONE_MAP_LOCATION1_SHOP_V1
function zoneMapZhucharaPistolsServer(){
    const list=(Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[]).filter(item=>item&&!item.adminOnly);
    const marked=list.filter(item=>String(item.progressionClass||'')==='pistol');
    if(marked.length===29)return marked;
    const start=list.findIndex(item=>!!item.starterGear||String(item.name||'')==='Beretta 21A Bobcat'||Number(item.id)===86);
    return start>=0?list.slice(start,start+29):[];
}
const ZONE_MAP_LOCATION1_PISTOLS=new Set(zoneMapZhucharaPistolsServer().map(item=>item.name));
const ZONE_MAP_LOCATION1_ARMOR=new Set(
    (Array.isArray(SHOP_ARMOR)?SHOP_ARMOR:[])
      .filter(item=>item&&!item.adminOnly&&!item.isResearchSuit&&!item.isPremiumArmor)
      .slice(0,29).map(item=>item.name)
);
app.post('/api/shop/buy',(req,res,next)=>{
    if(String(req.body?.vendor||'')!=='zhuchara'||String(req.body?.sourceVendor||'')==='barman')return next();
    const category=String(req.body?.category||''),name=String(req.body?.name||'');
    if(category==='weapon'&&!ZONE_MAP_LOCATION1_PISTOLS.has(name))
        return res.status(400).json({success:false,error:'У Жучары продаются только пистолеты'});
    if(category==='armor'&&!ZONE_MAP_LOCATION1_ARMOR.has(name))
        return res.status(400).json({success:false,error:'У Жучары продаются только первые 29 костюмов'});
    return next();
});

"""

BARMAN_GUARD=r"""// ROSTOK_BARMAN_SHOP_V1
const ROSTOK_BARMAN_CONSUMABLES_SERVER=new Set([
    'Хлеб','Тушенка','Вода','Энергетик',
    'Аптечка гражданская','Аптечка армейская','Аптечка научная','Антирад'
]);
function rostokBarmanShotgunsServer(){
    const list=(Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[]).filter(item=>item&&!item.adminOnly);
    const marked=list.filter(item=>String(item.progressionClass||'')==='shotgun');
    if(marked.length===29)return marked;
    const pistolStart=list.findIndex(item=>!!item.starterGear||String(item.name||'')==='Beretta 21A Bobcat'||Number(item.id)===86);
    return pistolStart>=0?list.slice(pistolStart+29,pistolStart+58):[];
}
const ROSTOK_BARMAN_SHOTGUNS_SERVER=new Set(rostokBarmanShotgunsServer().map(item=>item.name));
const ROSTOK_BARMAN_ARMOR_SERVER=new Set(
    (Array.isArray(SHOP_ARMOR)?SHOP_ARMOR:[])
      .filter(item=>item&&!item.adminOnly&&!item.isResearchSuit&&!item.isPremiumArmor)
      .slice(29,58).map(item=>item.name)
);
app.post('/api/shop/buy',(req,res,next)=>{
    const sourceVendor=String(req.body?.sourceVendor||req.body?.vendor||'');
    if(sourceVendor!=='barman')return next();
    const category=String(req.body?.category||''),rawName=String(req.body?.name||'');
    if(category==='consumable'){
        if(!ROSTOK_BARMAN_CONSUMABLES_SERVER.has(rawName))
            return res.status(400).json({success:false,error:'Этого припаса у Бармена нет'});
        return next();
    }
    let baseName=rawName;
    if(typeof parseGearNameServer==='function'){
        try{baseName=String(parseGearNameServer(rawName)?.baseName||rawName);}catch(_){}
    }
    if(category==='weapon'&&!ROSTOK_BARMAN_SHOTGUNS_SERVER.has(baseName))
        return res.status(400).json({success:false,error:'У Бармена продаются только дробовики'});
    if(category==='armor'&&!ROSTOK_BARMAN_ARMOR_SERVER.has(baseName))
        return res.status(400).json({success:false,error:'У Бармена продаются костюмы с 30-го по 58-й'});
    if(!['weapon','armor'].includes(category))
        return res.status(400).json({success:false,error:'Бармен торгует дробовиками, бронёй и припасами'});
    return next();
});

"""

POSITION_ROUTE=r"""// PLAYER_WORLD_POSITION_V1
const PLAYER_WORLD_POSITION_PLACES=new Set([
    'cordon-camp','zone-map','rostok-bar','barman','inventory','kpk',
    'warehouse','arena','market','chat','zhuchara','diesel','leonov','smoker'
]);
const PLAYER_WORLD_POSITION_ORIGINS=new Set(['cordon-camp','zone-map','rostok-bar']);

app.post('/api/player/position',requireAuth,rateLimit('player-position',40,10000),(req,res)=>{
    const playerId=String(req.telegramUser.id);
    try{
        const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);
        if(!row)return res.status(404).json({success:false,error:'Игрок не найден'});
        const data=safeParsePlayerData(row.data);
        let zoneLocation=Number(req.body?.zoneLocation||1);
        if(![1,2,3,4].includes(zoneLocation)||!zoneMapLocationUnlocked(data,zoneLocation))zoneLocation=1;
        let place=String(req.body?.place||'cordon-camp');
        if(!PLAYER_WORLD_POSITION_PLACES.has(place))place='cordon-camp';
        let origin=String(req.body?.origin||'cordon-camp');
        if(!PLAYER_WORLD_POSITION_ORIGINS.has(origin))origin='cordon-camp';

        if(['rostok-bar','barman'].includes(place)){
            if(zoneMapLocationUnlocked(data,4)){zoneLocation=4;origin='rostok-bar';}
            else{zoneLocation=1;place='cordon-camp';origin='cordon-camp';}
        }else if(['cordon-camp','zhuchara','diesel','leonov','smoker','arena','market','chat'].includes(place)){
            zoneLocation=1;origin='cordon-camp';
        }else if(['inventory','kpk','warehouse'].includes(place)){
            if(origin==='rostok-bar'&&zoneMapLocationUnlocked(data,4))zoneLocation=4;
            else{zoneLocation=1;origin='cordon-camp';}
        }else if(place==='zone-map'){
            origin='zone-map';
        }
        data.worldPosition={zoneLocation,place,origin,updatedAt:Date.now()};
        const result=db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?')
          .run(JSON.stringify(data),Date.now(),playerId);
        if(result&&Number(result.changes)===0)return res.status(409).json({success:false,error:'Позиция не сохранена'});
        return res.json({success:true,worldPosition:data.worldPosition});
    }catch(e){
        console.error('[/api/player/position]',e);
        return res.status(500).json({success:false,error:'Не удалось сохранить позицию'});
    }
});

"""

ZONE_ROUTE=r"""// ZONE_MAP_ROUTING_V4
const ZONE_MAP_FILES=Object.freeze({1:'zone-map1.jpg',2:'zone-map2.jpg',3:'zone-map3.jpg',4:'zone-map4.jpg'});
const ZONE_CAMP_FILES=Object.freeze({4:'rostok-bar.png'});
app.get('/api/zone-map/:location',(req,res)=>{
    const location=Number(req.params.location||0),file=ZONE_MAP_FILES[location];
    if(!file)return res.status(404).end();
    return res.sendFile(require('path').join(process.cwd(),'ui',file),err=>{
        if(err&&!res.headersSent)res.status(err.statusCode||404).end();
    });
});
app.get('/api/zone-camp/:location',(req,res)=>{
    const location=Number(req.params.location||0),file=ZONE_CAMP_FILES[location];
    if(!file)return res.status(404).end();
    return res.sendFile(require('path').join(process.cwd(),'ui',file),err=>{
        if(err&&!res.headersSent)res.status(err.statusCode||404).end();
    });
});

function zoneMapPistolListServer(){
    const list=Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[];
    const start=list.findIndex(item=>!!(item&&item.starterGear)||String(item&&item.name||'')==='Beretta 21A Bobcat'||Number(item&&item.id)===86);
    const end=start>=0?list.findIndex((item,index)=>index>start&&/^Дробовик(?:\s|$)/i.test(String(item&&item.name||''))):-1;
    const group=start>=0?list.slice(start,end>start?end:list.length):list;
    return group.filter(item=>item&&!item.adminOnly);
}
const ZONE_MAP_PISTOLS_SERVER=zoneMapPistolListServer();
const ZONE_MAP_FIRST_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(0,10);
const ZONE_MAP_SECOND_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(10,20);
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
    if(location===4)return zoneMapListUnlocked(data,ZONE_MAP_SECOND_PISTOLS_SERVER,10);
    return false;
}
const ZONE_MAP_NPC_STATS=Object.freeze({1:{hp:240,dmg:28},2:{hp:480,dmg:45},4:{hp:960,dmg:80}});
function zoneMapNpcPayload(data,zoneTier,zoneLocation){
    const forcedLevel=zoneTier<=1?1:1+(zoneTier-1)*40;
    const rawNpc=raidCreateNpcPayload({...data,level:forcedLevel});
    if(!rawNpc)return null;
    const npc=typeof pveAdaptiveNpcPayloadServer==='function'
        ?pveAdaptiveNpcPayloadServer(data,rawNpc):rawNpc;
    npc.tier=zoneTier;
    // Compatibility fallback when the adaptive PvE patch has not been installed yet.
    const stats=ZONE_MAP_NPC_STATS[zoneTier];
    if(typeof pveAdaptiveNpcPayloadServer!=='function'&&stats){
        npc.hp=stats.hp;
        npc.enemyHp=stats.hp;
        npc.maxEnemyHp=stats.hp;
        npc.dmg=stats.dmg;
    }
    if(zoneLocation===2)npc.faction='Бандиты';
    if(zoneLocation===3)npc.faction='Военные';
    if(zoneLocation===4)npc.faction='Наёмники';
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
    // UNIQUE_STRONGLAV_MAP_POOL_V1
    // Filter after tier routing so the remaining location tiers never shift.
    pool=pool.filter(m=>!['стронглав','самка стронглава'].includes(String(m.name||'').trim().toLowerCase()));
    if(!pool.length)return null;
    const pick=pool[Math.floor(Math.random()*pool.length)];
    const baseHp=Math.max(1,Number(pick.hp)||1);
    const floor=zoneTier<=1?240:zoneTier===2?420:0;
    const hp=Math.max(baseHp,floor);
    const payload={...pick,sourceTier:Number(pick.tier)||0,tier:zoneTier,kind:'mutant',
        hp,enemyHp:hp,maxEnemyHp:hp,medkitsUsed:0};
    return typeof pveAdaptiveMutantPayloadServer==='function'
        ?pveAdaptiveMutantPayloadServer(data,payload):payload;
}

app.post('/api/raid/zone-step',requireAuth,rateLimit('raid-zone-step',20,10000),(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    const zoneKind=String(req.body?.zoneKind||'');
    const zoneLocation=Number(req.body?.zoneLocation||1);
    if(!['enemy','mutant','anomaly'].includes(zoneKind))
        return res.status(400).json({success:false,error:'Неизвестная точка на карте'});
    if(![1,2,3,4].includes(zoneLocation))
        return res.status(400).json({success:false,error:'Неизвестная локация'});
    try{
        const tx=db.transaction(()=>{
            const sess=raidSession(playerId,token);if(!sess)return{success:false,error:'Рейд не найден'};
            if(sess.pending_type)return{success:false,error:'Сначала завершите текущую встречу'};
            const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);if(!row)return{success:false,error:'Игрок не найден'};
            const data=safeParsePlayerData(row.data);
            if(!zoneMapLocationUnlocked(data,zoneLocation)){
                const error=zoneLocation===4
                    ?'Россток пока закрыт. Должна быть открыта вторая десятка пистолетов.'
                    :zoneLocation===3
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

def _find_handler_block_end(text,route_start):
    route_anchor="app.post('/api/raid/zone-step'"
    route_pos=text.find(route_anchor,route_start)
    if route_pos<0:
        route_anchor='app.post("/api/raid/zone-step"'
        route_pos=text.find(route_anchor,route_start)
    if route_pos<0:
        return -1

    arrow=text.find('=>',route_pos)
    if arrow<0:
        return -1
    brace=text.find('{',arrow)
    if brace<0:
        return -1

    depth=0
    quote=None
    escape=False
    line_comment=False
    block_comment=False
    i=brace
    while i<len(text):
        ch=text[i]
        nxt=text[i+1] if i+1<len(text) else ''

        if line_comment:
            if ch=='\n':
                line_comment=False
            i+=1
            continue
        if block_comment:
            if ch=='*' and nxt=='/':
                block_comment=False
                i+=2
                continue
            i+=1
            continue
        if quote:
            if escape:
                escape=False
            elif ch=='\\':
                escape=True
            elif ch==quote:
                quote=None
            i+=1
            continue

        if ch=='/' and nxt=='/':
            line_comment=True
            i+=2
            continue
        if ch=='/' and nxt=='*':
            block_comment=True
            i+=2
            continue
        if ch in ("'",'"','`'):
            quote=ch
            i+=1
            continue
        if ch=='{':
            depth+=1
        elif ch=='}':
            depth-=1
            if depth==0:
                j=i+1
                while j<len(text) and text[j] in ' \t\r\n':
                    j+=1
                if text.startswith(');',j):
                    return j+2
                if text.startswith(')',j):
                    j+=1
                    while j<len(text) and text[j] in ' \t\r\n':
                        j+=1
                    if j<len(text) and text[j]==';':
                        j+=1
                    return j
                return i+1
        i+=1
    return -1

def upgrade_route(text):
    matches=[mark for mark in OLD_ROUTE_MARKS if mark in text]
    if len(matches)!=1:
        raise RuntimeError(f'Ожидался один старый маршрут карты, найдено {len(matches)}.')
    start=text.find(matches[0])

    # Replace exactly the old /api/raid/zone-step handler. The previous implementation
    # searched for the first literal "});" after console.error(), but a nested
    # res.status(...).json({...}); contains the same bytes and can leave a stray brace.
    route_end=_find_handler_block_end(text,start)
    if route_end>=0:
        return text[:start]+ZONE_ROUTE+text[route_end:]

    listen=text.find('app.listen(',start)
    if listen<0:
        raise RuntimeError('После старого маршрута карты не найден app.listen. Ничего не изменено.')
    return text[:start]+ZONE_ROUTE+text[listen:]

def upgrade_shop_guard_for_barman(text):
    if SHOP_MARK not in text:
        return text,False
    start=text.find(SHOP_MARK)
    end=text.find("app.post('/api/raid/zone-step'",start)
    if end<0:
        end=text.find(ROUTE_MARK,start)
    if end<0:
        end=len(text)
    block=text[start:end]
    changed=False

    old="if(String(req.body?.vendor||'')!=='zhuchara')return next();"
    new="if(String(req.body?.vendor||'')!=='zhuchara'||String(req.body?.sourceVendor||'')==='barman')return next();"
    if old in block:
        block=block.replace(old,new,1); changed=True
    elif new not in block:
        raise RuntimeError('Не удалось обновить защиту магазина Жучары для Бармена.')

    if 'zoneMapZhucharaPistolsServer' not in block:
        armor_anchor='const ZONE_MAP_LOCATION1_ARMOR=new Set('
        if armor_anchor not in block:
            raise RuntimeError('Не найден список брони Жучары.')
        pistol_defs="""function zoneMapZhucharaPistolsServer(){
    const list=(Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[]).filter(item=>item&&!item.adminOnly);
    const marked=list.filter(item=>String(item.progressionClass||'')==='pistol');
    if(marked.length===29)return marked;
    const start=list.findIndex(item=>!!item.starterGear||String(item.name||'')==='Beretta 21A Bobcat'||Number(item.id)===86);
    return start>=0?list.slice(start,start+29):[];
}
const ZONE_MAP_LOCATION1_PISTOLS=new Set(zoneMapZhucharaPistolsServer().map(item=>item.name));
"""
        block=block.replace(armor_anchor,pistol_defs+armor_anchor,1); changed=True

    if '.slice(0,10).map(item=>item.name)' in block:
        block=block.replace('.slice(0,10).map(item=>item.name)','.slice(0,29).map(item=>item.name)',1); changed=True
    elif '.slice(0,29).map(item=>item.name)' not in block:
        raise RuntimeError('Не удалось расширить список костюмов Жучары до 29.')

    weapon_guard="""    if(category==='weapon'&&!ZONE_MAP_LOCATION1_PISTOLS.has(name))
        return res.status(400).json({success:false,error:'У Жучары продаются только пистолеты'});
"""
    armor_guard="""    if(category==='armor'&&!ZONE_MAP_LOCATION1_ARMOR.has(name))
        return res.status(400).json({success:false,error:'У Жучары продаются только первые 29 костюмов'});
"""
    if "if(category==='weapon'&&!ZONE_MAP_LOCATION1_PISTOLS.has(name))" not in block:
        armor_pos=block.find("    if(category==='armor'&&!ZONE_MAP_LOCATION1_ARMOR.has(name))")
        if armor_pos<0:
            raise RuntimeError('Не найден серверный фильтр брони Жучары.')
        block=block[:armor_pos]+weapon_guard+block[armor_pos:]; changed=True
    old_armor_error="return res.status(400).json({success:false,error:'Этот костюм продаётся на другой локации'});"
    new_armor_error="return res.status(400).json({success:false,error:'У Жучары продаются только первые 29 костюмов'});"
    if old_armor_error in block:
        block=block.replace(old_armor_error,new_armor_error,1); changed=True
    elif new_armor_error not in block:
        raise RuntimeError('Не удалось обновить сообщение ограничения брони Жучары.')

    return text[:start]+block+text[end:],changed

def insert_position_route(text):
    if POSITION_MARK in text:
        return text,False
    if ROUTE_MARK not in text:
        raise RuntimeError('Нельзя добавить позицию игрока без ZONE_MAP_ROUTING_V4.')
    return insert_before_one(text,["app.listen("],POSITION_ROUTE,'app.listen для позиции игрока'),True

def _next_shop_buy_route(text,after=0):
    anchors=["app.post('/api/shop/buy'","app.post(\"/api/shop/buy\""]
    positions=[text.find(a,after) for a in anchors]
    positions=[p for p in positions if p>=0]
    return min(positions) if positions else -1

def insert_barman_guard(text):
    if BARMAN_MARK in text:
        start=text.find(BARMAN_MARK)
        first=_next_shop_buy_route(text,start)
        if first<0:
            raise RuntimeError('Маркер Бармена есть, но его маршрут покупки не найден.')
        end=_next_shop_buy_route(text,first+1)
        if end<0:
            raise RuntimeError('Не найден следующий маршрут покупки после блока Бармена.')
        block=text[start:end]
        if BARMAN_GUARD.strip() in block:
            return text,False
        # Upgrade any older Barman middleware in place, including the tier-based version.
        return text[:start]+BARMAN_GUARD+text[end:],True

    pos=_next_shop_buy_route(text,0)
    if pos<0:
        raise RuntimeError('Не найден маршрут покупки для защиты Бармена.')
    return text[:pos]+BARMAN_GUARD+text[pos:],True

def exclude_unique_map_mutants(text):
    """Upgrade the existing map selector without changing its roster/tier mapping."""
    start=text.find('function zoneMapMutantPayload(data,zoneTier){')
    if start<0:
        raise RuntimeError('Не найден поддерживаемый генератор мутантов карты. Ничего не изменено.')
    end=text.find("app.post('/api/raid/zone-step'",start)
    if end<0:
        raise RuntimeError('Не найдена граница генератора мутантов карты. Ничего не изменено.')
    block=text[start:end]
    if UNIQUE_MUTANT_MARK in block:
        if UNIQUE_MUTANT_GUARD.strip() not in block:
            raise RuntimeError('Обнаружено неполное исключение Стронглава из встреч карты.')
        return text,False
    anchor='    if(!pool.length)return null;'
    if block.count(anchor)!=1 or '    let pool=[];' not in block:
        raise RuntimeError('Неизвестный формат пула мутантов карты. Ничего не изменено.')
    block=block.replace(anchor,UNIQUE_MUTANT_GUARD+anchor,1)
    return text[:start]+block+text[end:],True

def patch(source):
    has_v4=ROUTE_MARK in source
    old_marks=[mark for mark in OLD_ROUTE_MARKS if mark in source]
    has_shop=SHOP_MARK in source
    changed=False

    if has_v4:
        if not has_shop: raise RuntimeError('Маршрут V4 есть, но защита магазина отсутствует.')
        text=source
    elif old_marks:
        if len(old_marks)!=1: raise RuntimeError('Найдено несколько старых маршрутов карты.')
        if not has_shop: raise RuntimeError('Обнаружена частичная старая установка. Автоматическое продолжение запрещено.')
        text=upgrade_route(source)
        changed=True
    else:
        text=source
        if not has_shop:
            text=insert_before_one(
                text,
                ["app.post('/api/shop/buy'","app.post(\"/api/shop/buy\""],
                SHOP_GUARD,
                'маршрут покупки'
            )
            changed=True
        text=insert_before_one(text,["app.listen("],ZONE_ROUTE,'app.listen')
        changed=True

    text,shop_barman_changed=upgrade_shop_guard_for_barman(text)
    changed=changed or shop_barman_changed
    text,barman_changed=insert_barman_guard(text)
    changed=changed or barman_changed
    text,position_changed=insert_position_route(text)
    changed=changed or position_changed
    text,unique_changed=exclude_unique_map_mutants(text)
    changed=changed or unique_changed
    return text,changed

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
        (root/'ui'/'zone-map1.jpg',b'\xff\xd8',None),
        (root/'ui'/'zone-map2.jpg',b'\xff\xd8',None),
        (root/'ui'/'zone-map3.jpg',b'\xff\xd8',None),
        # Rostok assets are copied byte-for-byte. The checksums deliberately reject
        # any rescale/re-encode/recompression before the server update is applied.
        (root/'ui'/'zone-map4.jpg',b'\xff\xd8','017f3b41e187a44f33505bd007374ae3a2281c2cefc7bdda1c1ab0bc69ac22aa'),
        (root/'ui'/'rostok-bar.png',b'\x89PNG','bf138d0c05afc2c4d65c504a135d35a1b3af3ecf74ebe8e740d7c3be5b17054c'),
    ]
    for asset,signature,expected_sha256 in assets:
        if not asset.is_file():
            raise RuntimeError(f'Не найден файл локации: {asset}. Сначала скопируйте его в /var/www/pocketzone/ui.')
        raw_asset=asset.read_bytes()
        if len(raw_asset)<50000 or not raw_asset.startswith(signature):
            raise RuntimeError(f'Файл локации повреждён или слишком мал: {asset}')
        if expected_sha256 and hashlib.sha256(raw_asset).hexdigest()!=expected_sha256:
            raise RuntimeError(f'Файл локации изменён или пережат: {asset}. Нужен исходный файл без перекодирования.')
    old=path.read_bytes()
    source=old.decode('utf-8')
    new_text,changed=patch(source)
    if not changed:
        print('ZONE_MAP_ROUTING_V4 уже установлен.')
        return

    with tempfile.TemporaryDirectory(prefix='zone-map-routing-v4-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Совместимость четырёх локаций, тиров и маршрутов подтверждена. Файлы не изменены.')
            return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')

    backup=path.with_name(path.name+'.before-zone-map-routing-v4-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.zone-map-routing-v4-',dir=path.parent)
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
                    print('ZONE_MAP_ROUTING_V4 установлен. Backup:',backup)
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
