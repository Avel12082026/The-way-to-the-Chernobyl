'use strict';

const crypto=require('node:crypto');

module.exports=function installQuestBalance({
  app,db,requireAuth,rateLimit,
  SHOP_WEAPONS,SHOP_ARMOR,SHOP_ARTIFACTS,SHOP_MUTANT_LOOT,PVE_MUTANTS,RAID_ANOMALIES,
  resolveSellPriceServer,parseGearNameServer
}){
  if(!app||!db||typeof requireAuth!=='function')throw new Error('quest-balance: missing server dependencies');

  const vendors=new Set(['leonov','zhuchara','diesel']);
  const regularAnomalies=(RAID_ANOMALIES||[]).filter(a=>Number(a.tier)>=1&&Number(a.tier)<=8&&!a.isNamedArtifactAnomaly);
  const artifactByName=new Map((SHOP_ARTIFACTS||[]).filter(a=>!a.adminOnly).map(a=>[a.name,a]));
  const artifactMeta=new Map();

  function rebalanceArtifacts(){
    for(const anomaly of regularAnomalies){
      const tier=Number(anomaly.tier)||1;
      const defs=(anomaly.artifacts||[]).map(name=>artifactByName.get(name)).filter(Boolean);
      const ranked=[...defs].sort((a,b)=>(Number(a.price)||0)-(Number(b.price)||0)||String(a.name).localeCompare(String(b.name),'ru'));
      const n=ranked.length;
      ranked.forEach((def,rank)=>{
        const rarity=n<=1?0:rank/(n-1);
        const weight=Math.round(18-16*rarity);
        const pos=Math.max(1,Math.round((2.5*tier+1.5)*(0.90+0.25*rarity)));
        const neg=Math.max(1,Math.ceil((1.2*tier+1)*(1.20-0.50*rarity)));
        const stats={};
        for(const [key,value] of Object.entries(def.stats||{})){
          const num=Number(value)||0;
          stats[key]=num>0?pos:num<0?-neg:0;
        }
        def.stats=stats;
        artifactMeta.set(def.name,{tier,weight,rank:rank+1,count:n,anomaly:anomaly.name});
      });
    }
  }
  rebalanceArtifacts();

  // Research suits are specialized anomaly gear, not a cheap shortcut around the
  // normal armor curve. Price each one slightly above the cheapest normal armor
  // of the same tier; its physical armor remains lower while anomaly protection is higher.
  for(const suit of (SHOP_ARMOR||[]).filter(a=>a.isResearchSuit&&!a.adminOnly)){
    const same=(SHOP_ARMOR||[]).filter(a=>!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit&&Number(a.tier)===Number(suit.tier));
    if(same.length){
      const floor=Math.min(...same.map(a=>Number(a.price)||Infinity));
      suit.price=Math.round(floor*1.10);
    }
  }

  function pickArtifact(names){
    const pool=(Array.isArray(names)?names:[]).filter(name=>artifactMeta.has(name)).map(name=>({name,weight:Number(artifactMeta.get(name)?.weight)||1}));
    if(!pool.length)return null;
    const total=pool.reduce((n,x)=>n+x.weight,0);
    let roll=Math.random()*total;
    for(const item of pool){if(roll<item.weight)return item.name;roll-=item.weight;}
    return pool.at(-1).name;
  }

  // One-time compatibility migration for the new global +50 equipment budget.
  // It preserves every item and the player's armor-stat distribution; only excess
  // legacy upgrade levels are compressed into the supported 0..50 range.
  const UPGRADE_CAP=50, UPGRADE_BONUS_PER_LEVEL=0.005, UPGRADE_MAX_BONUS=0.25;
  // Admin-only gear is deliberately outside the player balance model and migration.
  const adminWeaponNames=new Set((SHOP_WEAPONS||[]).filter(x=>x.adminOnly).map(x=>x.name));
  const adminArmorNames=new Set((SHOP_ARMOR||[]).filter(x=>x.adminOnly).map(x=>x.name));
  const weaponByName=new Map((SHOP_WEAPONS||[]).filter(x=>!x.adminOnly).map(x=>[x.name,x]));
  const armorByName=new Map((SHOP_ARMOR||[]).filter(x=>!x.adminOnly).map(x=>[x.name,x]));
  function gearParts(name){
    const raw=String(name||'');
    const suffix=(raw.match(/[\u200B\u200C]+$/)||[''])[0];
    const visible=suffix?raw.slice(0,-suffix.length):raw;
    const m=visible.match(/^(.*) \+(\d+)$/);
    return {raw,baseName:m?m[1]:visible,level:m?Math.max(0,Number(m[2])||0):0,suffix};
  }
  function stableArmorKey(name){
    const p=gearParts(name);return p.baseName+p.suffix;
  }
  function cappedGearName(name,forcedLevel=null){
    const p=gearParts(name);
    if(!weaponByName.has(p.baseName)&&!armorByName.has(p.baseName))return p.raw;
    const level=Math.min(UPGRADE_CAP,Math.max(0,forcedLevel===null?p.level:Number(forcedLevel)||0));
    return p.baseName+(level?(' +'+level):'')+p.suffix;
  }
  function upgradedStat(baseStat,level,ceiling=Infinity){
    const lvl=Math.min(UPGRADE_CAP,Math.max(0,Number(level)||0));
    const base=Number(baseStat)||0;
    const pct=Math.min(UPGRADE_MAX_BONUS,lvl*UPGRADE_BONUS_PER_LEVEL);
    const raw=base===0?Math.round(lvl):Math.round(base*(1+pct));
    return Number.isFinite(ceiling)?Math.min(raw,ceiling):raw;
  }
  function nextCeiling(list,item,statKey){
    if(!item||item.unlockLevel===undefined)return Infinity;
    const candidates=list.filter(o=>!o.adminOnly&&!o.isPremiumArmor&&!o.isResearchSuit&&o.unlockLevel!==undefined&&o.unlockLevel>item.unlockLevel);
    if(!candidates.length)return Infinity;
    const minUnlock=Math.min(...candidates.map(o=>o.unlockLevel));
    const next=candidates.filter(o=>o.unlockLevel===minUnlock).sort((a,b)=>(Number(a[statKey])||0)-(Number(b[statKey])||0))[0];
    return Math.max(Number(item[statKey])||0,upgradedStat(Number(next[statKey])||0,20,nextCeiling(list,next,statKey)));
  }
  function compressUpgradeRecord(record){
    if(!record||typeof record!=='object'||Array.isArray(record))return {record:{},changed:!!record,total:0};
    const copy={...record};
    const numeric=Object.entries(record).map(([key,value])=>[key,Math.max(0,Math.floor(Number(value)||0))]).filter(([,value])=>value>0);
    const total=numeric.reduce((n,[,value])=>n+value,0);
    if(total<=UPGRADE_CAP){
      for(const [key,value] of numeric)copy[key]=value;
      return {record:copy,changed:false,total};
    }
    const scaled=numeric.map(([key,value])=>{
      const exact=value*UPGRADE_CAP/total;
      return {key,value:Math.floor(exact),fraction:exact-Math.floor(exact)};
    });
    let remaining=UPGRADE_CAP-scaled.reduce((n,x)=>n+x.value,0);
    scaled.sort((a,b)=>b.fraction-a.fraction||a.key.localeCompare(b.key));
    for(let i=0;i<scaled.length&&remaining>0;i++,remaining--)scaled[i].value++;
    for(const [key] of numeric)copy[key]=0;
    for(const x of scaled)copy[x.key]=x.value;
    return {record:copy,changed:true,total:UPGRADE_CAP};
  }
  function migrateBag(bag){
    if(!bag||typeof bag!=='object'||Array.isArray(bag))return {bag:bag||{},changed:false};
    const out={};let changed=false;
    for(const [name,qty] of Object.entries(bag)){
      const target=cappedGearName(name);
      if(target!==name)changed=true;
      out[target]=(Number(out[target])||0)+(Number(qty)||0);
    }
    return {bag:out,changed};
  }
  function migrateProfileForUpgradeCap(data){
    if(!data||typeof data!=='object')return {data,changed:false,itemsClamped:0,recordsCompressed:0};
    let changed=false,itemsClamped=0,recordsCompressed=0;
    for(const key of ['inventory','warehouse']){
      const before=data[key]||{},result=migrateBag(before);
      if(result.changed){data[key]=result.bag;changed=true;itemsClamped++;}
    }
    data.armorUpgradeData=data.armorUpgradeData&&typeof data.armorUpgradeData==='object'?data.armorUpgradeData:{};
    for(const key of Object.keys(data.armorUpgradeData)){
      if(adminArmorNames.has(gearParts(key).baseName))continue;
      const result=compressUpgradeRecord(data.armorUpgradeData[key]);
      if(result.changed){data.armorUpgradeData[key]=result.record;recordsCompressed++;changed=true;}
    }
    if(data.weapon&&typeof data.weapon.name==='string'){
      const p=gearParts(data.weapon.name),base=weaponByName.get(p.baseName);
      if(base){
        const level=Math.min(UPGRADE_CAP,p.level),name=cappedGearName(data.weapon.name,level);
        const dmg=upgradedStat(base.dmg,level,nextCeiling(SHOP_WEAPONS,base,'dmg'));
        if(name!==data.weapon.name||Number(data.weapon.dmg)!==dmg){data.weapon={...data.weapon,name,tier:base.tier,dmg};changed=true;if(p.level>UPGRADE_CAP)itemsClamped++;}
      }
    }
    if(data.armor&&typeof data.armor.name==='string'){
      const p=gearParts(data.armor.name),base=armorByName.get(p.baseName);
      if(base){
        const stable=stableArmorKey(data.armor.name);
        const rec=data.armorUpgradeData[stable]||{};
        const total=Math.min(UPGRADE_CAP,Object.values(rec).reduce((n,x)=>n+Math.max(0,Math.floor(Number(x)||0)),0));
        const level=Math.min(UPGRADE_CAP,Math.max(Math.min(p.level,UPGRADE_CAP),total));
        const name=cappedGearName(data.armor.name,level);
        const armor=upgradedStat(base.armor,rec.armor||0,nextCeiling(SHOP_ARMOR,base,'armor'));
        const hitAbsorption=upgradedStat(base.hitAbsorption||0,rec.hitAbsorption||0,nextCeiling(SHOP_ARMOR,base,'hitAbsorption'));
        if(name!==data.armor.name||Number(data.armor.armor)!==armor||Number(data.armor.hitAbsorption)!==hitAbsorption){
          data.armor={...data.armor,name,tier:base.tier,armor,hitAbsorption};changed=true;if(p.level>UPGRADE_CAP)itemsClamped++;
        }
      }
    }
    return {data,changed,itemsClamped,recordsCompressed};
  }

  db.exec(`CREATE TABLE IF NOT EXISTS balance_migrations (
    name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL, details TEXT NOT NULL
  )`);
  function runUpgradeCapMigration(){
    const migration='upgrade_cap_50_v1';
    const old=db.prepare('SELECT details FROM balance_migrations WHERE name=?').get(migration);
    if(old){try{return JSON.parse(old.details);}catch(_){return {alreadyApplied:true};}}
    return db.transaction(()=>{
      const rows=db.prepare('SELECT id,data FROM players').all();
      let profilesChanged=0,itemsClamped=0,recordsCompressed=0;
      for(const row of rows){
        let data;try{data=JSON.parse(row.data||'{}');}catch(_){continue;}
        const result=migrateProfileForUpgradeCap(data);
        if(result.changed){
          const update=db.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(data),row.id);
          if(update.changes!==1)throw new Error('Не удалось перенести улучшения профиля '+row.id);
          profilesChanged++;itemsClamped+=result.itemsClamped;recordsCompressed+=result.recordsCompressed;
        }
      }
      // Market lots only store the item name; clamp their visible legacy +N too.
      let marketLotsClamped=0;
      try{
        for(const row of db.prepare('SELECT id,item FROM market').all()){
          const item=cappedGearName(row.item);
          if(item!==row.item){
            const update=db.prepare('UPDATE market SET item=? WHERE id=?').run(item,row.id);
            if(update.changes!==1)throw new Error('Не удалось перенести рыночный лот '+row.id);
            marketLotsClamped++;
          }
        }
      }catch(error){
        if(!/no such table: market/i.test(String(error&&error.message||error)))throw error;
      }
      const details={profilesScanned:rows.length,profilesChanged,itemsClamped,recordsCompressed,marketLotsClamped,cap:UPGRADE_CAP};
      db.prepare('INSERT INTO balance_migrations(name,applied_at,details) VALUES(?,?,?)').run(migration,Date.now(),JSON.stringify(details));
      return details;
    })();
  }
  const upgradeMigration=runUpgradeCapMigration();

  // Durable receipt journal: completed/cancelled offers cannot be accepted twice.
  // History is paginated, never erased to keep the profile JSON small.
  db.exec(`CREATE TABLE IF NOT EXISTS quest_receipts (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL,
    quest_id TEXT NOT NULL, vendor TEXT NOT NULL, day TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('accepted','completed','abandoned')),
    payload TEXT NOT NULL, UNIQUE(player_id,quest_id));
    CREATE INDEX IF NOT EXISTS quest_receipts_player ON quest_receipts(player_id,status,seq);`);
  const MAX_ACCEPTED=8, OFFERS_PER_VENDOR=3;
  const integer=(v,fallback=0)=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):fallback;
  const today=()=>new Date().toISOString().slice(0,10);
  function normalizeQuestState(data){
    const q=data.quests&&typeof data.quests==='object'&&!Array.isArray(data.quests)?data.quests:{};
    q.accepted=Array.isArray(q.accepted)?q.accepted.filter(x=>x&&typeof x.id==='string'):[];
    q.activeId=q.accepted.some(x=>x.id===q.activeId)?q.activeId:null;
    q.lastRaidReturnAt=integer(q.lastRaidReturnAt);
    data.quests=q;return q;
  }
  function load(playerId){
    const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);
    if(!row)throw new Error('Игрок не найден');
    const data=JSON.parse(row.data);normalizeQuestState(data);
    data.inventory=data.inventory||{};data.coins=integer(data.coins);return data;
  }
  function save(playerId,data){
    const result=db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?').run(JSON.stringify(data),Date.now(),playerId);
    if(result.changes!==1)throw new Error('Не удалось сохранить профиль');
  }
  function atBase(playerId){
    if(db.prepare('SELECT 1 FROM raid_sessions WHERE player_id=?').get(playerId) ||
       db.prepare('SELECT 1 FROM pve_battles WHERE player_id=?').get(playerId))
      throw new Error('Сначала вернись на базу и поговори с заказчиком');
  }
  const cleanName=name=>String(name||'').replace(/[\u200B\u200C\u200D\u2060\uFEFF]+$/,'');
  function parsed(name){return parseGearNameServer(cleanName(name));}
  const lookup=new Map([
    ...(SHOP_WEAPONS||[]).filter(x=>!x.adminOnly&&!x.isPremiumWeapon).map(x=>[x.name,{...x,kind:'weapon'}]),
    ...(SHOP_ARMOR||[]).filter(x=>!x.adminOnly&&!x.isPremiumArmor&&!x.isResearchSuit).map(x=>[x.name,{...x,kind:'armor'}]),
    ...(SHOP_ARTIFACTS||[]).filter(x=>artifactMeta.has(x.name)&&!x.adminOnly&&!x.isNamedArtifact).map(x=>[x.name,{...x,kind:'artifact'}]),
    ...(SHOP_MUTANT_LOOT||[]).map(x=>[x.name,{...x,kind:'loot'}])
  ]);
  function matchingItems(data,quest){
    const target=lookup.get(quest.itemName);if(!target)return [];
    return Object.entries(data.inventory||{}).filter(([name,qty])=>{
      if(!integer(qty)||parsed(name).baseName!==quest.itemName)return false;
      // No silent surrender of valuable upgrades for a base-item order.
      if(['armor','weapon'].includes(target.kind)&&integer(parsed(name).level)>0)return false;
      if(target.kind==='armor'){
        const stable=String(name).replace(/ \+\d+(?=[\u200B\u200C]*$)/,'');
        if(Object.values(data.armorUpgradeData?.[stable]||{}).some(x=>integer(x)>0))return false;
      }
      return true;
    }).sort(([a],[b])=>a.localeCompare(b));
  }
  function inventoryQty(data,quest){return matchingItems(data,quest).reduce((n,[,qty])=>n+integer(qty),0);}
  function consume(data,quest){
    let left=quest.qty;
    for(const [key,qty] of matchingItems(data,quest)){
      const take=Math.min(integer(qty),left);data.inventory[key]-=take;left-=take;
      if(!data.inventory[key])delete data.inventory[key];
      if(left===0)break;
    }
    if(left!==0)throw new Error('Нужных предметов пока недостаточно');
    if(Array.isArray(data.quickSlots))data.quickSlots=data.quickSlots.map(n=>n&&integer(data.inventory[n])?n:null);
  }
  function receipt(playerId,id){return db.prepare('SELECT status,payload FROM quest_receipts WHERE player_id=? AND quest_id=?').get(playerId,id);}
  function remainingToday(playerId,vendor){
    const used=db.prepare('SELECT COUNT(*) AS n FROM quest_receipts WHERE player_id=? AND vendor=? AND day=?').get(playerId,vendor,today()).n;
    return Math.max(0,OFFERS_PER_VENDOR-Number(used));
  }
  function rng(playerId,vendor,index){
    return crypto.createHash('sha256').update([playerId,vendor,today(),index].join('|')).digest().readUInt32BE(0)/0x100000000;
  }
  function sample(pool,count,playerId,vendor,offset=0){
    const left=[...pool],out=[];
    for(let i=0;i<count&&left.length;i++)out.push(left.splice(Math.floor(rng(playerId,vendor,offset+i)*left.length),1)[0]);
    return out;
  }
  function band(items){
    const ordered=[...items].sort((a,b)=>(Number(a.unlockLevel??a.tier)||0)-(Number(b.unlockLevel??b.tier)||0)||(Number(a.price)||0)-(Number(b.price)||0)||a.name.localeCompare(b.name));
    return ordered.slice(-Math.max(3,Math.ceil(ordered.length*.25)));
  }
  function bestSale(itemName,qty,playerId){
    const resolved=resolveSellPriceServer(itemName,playerId);
    if(!resolved||resolved.isNamed||!['weapon','armor','artifact','loot'].includes(resolved.category))throw new Error('Этот предмет не подходит для заказа');
    const markup=resolved.category==='artifact'?1.35:resolved.category==='loot'?1.20:1.02;
    // Round the unit exactly as the real merchant endpoints, then multiply quantity.
    return Math.round(resolved.price*markup)*qty;
  }
  function makeOffers(playerId,data,vendor){
    if(!vendors.has(vendor)||remainingToday(playerId,vendor)===0)return [];
    const level=Math.max(1,integer(data.level,1));
    let candidates=[];
    if(vendor==='zhuchara'||vendor==='diesel'){
      const kind=vendor==='zhuchara'?'armor':'weapon';
      candidates=band([...lookup.values()].filter(x=>x.kind===kind&&integer(x.unlockLevel,Number.MAX_SAFE_INTEGER)<=level));
    }else{
      const artifactTier=Math.min(8,1+Math.floor(level/20));
      const mutantTier=Math.min(28,1+Math.floor(level/20));
      const lootTier=new Map((PVE_MUTANTS||[]).filter(m=>m.loot&&Number(m.lootChance)>0).map(m=>[m.loot,Number(m.tier)]));
      const artBand=band([...lookup.values()].filter(x=>x.kind==='artifact'&&x.tier<=artifactTier));
      const lootBand=band([...lookup.values()].filter(x=>x.kind==='loot'&&lootTier.has(x.name)&&lootTier.get(x.name)<=mutantTier).map(x=>({...x,tier:lootTier.get(x.name)})));
      // Guarantee both specialties when both pools are nonempty.
      candidates=[...sample(artBand,2,playerId,vendor,10),...sample(lootBand,1,playerId,vendor,20)];
    }
    return sample(candidates,OFFERS_PER_VENDOR,playerId,vendor,30).map((item,index)=>{
      const qty=['weapon','armor'].includes(item.kind)?1:Math.min(3,1+Math.floor(level/200));
      const id=crypto.createHash('sha256').update([playerId,vendor,today(),item.name,qty].join('|')).digest('hex').slice(0,24);
      const saleValue=bestSale(item.name,qty,playerId),premium=.20+Math.min(.15,(Number(item.tier)||1)*.01);
      const title=vendor==='leonov'?(item.kind==='loot'?'Образцы для лаборатории':'Артефакт для исследований'):vendor==='zhuchara'?'Броня для заказа':'Оружие для мастерской';
      return {id,vendor,title,itemName:item.name,qty,kind:item.kind,reward:Math.max(saleValue+1,Math.ceil(saleValue*(1+premium))),saleValue,
        levelAtOffer:level,difficulty:Number(item.tier)||1,index,day:today(),baseOnly:['weapon','armor'].includes(item.kind)};
    }).filter(q=>!receipt(playerId,q.id)).slice(0,remainingToday(playerId,vendor));
  }
  function history(playerId,before=0){
    const rows=before
      ?db.prepare("SELECT seq,payload FROM quest_receipts WHERE player_id=? AND status='completed' AND seq<? ORDER BY seq DESC LIMIT 51").all(playerId,before)
      :db.prepare("SELECT seq,payload FROM quest_receipts WHERE player_id=? AND status='completed' ORDER BY seq DESC LIMIT 51").all(playerId);
    const page=rows.slice(0,50);
    return {completed:page.map(x=>JSON.parse(x.payload)),completedNextCursor:rows.length>50?page.at(-1).seq:null};
  }
  function publicState(playerId,data){
    const q=normalizeQuestState(data);
    const count=db.prepare("SELECT COUNT(*) AS n FROM quest_receipts WHERE player_id=? AND status='completed'").get(playerId).n;
    return {accepted:q.accepted.map(x=>({...x,have:inventoryQty(data,x)})),activeId:q.activeId,
      ...history(playerId),completedCount:Number(count),lastRaidReturnAt:q.lastRaidReturnAt};
  }
  const limiter=(name,max=30)=>rateLimit('quests-'+name,max,10000);
  function endpoint(path,fn){
    app.post(API+path,requireAuth,limiter(path),(req,res)=>{
      try{return res.json({success:true,...fn(String(req.telegramUser.id),req.body||{})});}
      catch(e){return res.status(400).json({success:false,error:e.message});}
    });
  }
  const API='/api/quests';
  app.get(API+'/version',(_req,res)=>res.json({success:true,version:2,balanceVersion:'2026-09-19-review',maxAccepted:MAX_ACCEPTED,offersPerVendorPerDay:OFFERS_PER_VENDOR}));
  endpoint('/state',id=>publicState(id,load(id)));
  endpoint('/history',(id,body)=>history(id,integer(body.before)));
  endpoint('/offers',(id,body)=>{
    atBase(id);if(!vendors.has(body.vendor))throw new Error('Неизвестный заказчик');
    return {offers:makeOffers(id,load(id),body.vendor),remainingToday:remainingToday(id,body.vendor)};
  });
  endpoint('/accept',(id,body)=>db.transaction(()=>{
    atBase(id);if(!vendors.has(body.vendor))throw new Error('Неизвестный заказчик');
    const data=load(id),q=normalizeQuestState(data),old=q.accepted.find(x=>x.id===body.questId);
    if(old&&old.vendor===body.vendor)return publicState(id,data);
    if(receipt(id,body.questId))throw new Error('Этот заказ уже взят, выполнен или отменён');
    if(q.accepted.length>=MAX_ACCEPTED)throw new Error('Одновременно можно взять не больше 8 заданий');
    const offer=makeOffers(id,data,body.vendor).find(x=>x.id===body.questId);
    if(!offer)throw new Error('Этот заказ больше недоступен');
    const accepted={...offer,acceptedAt:Date.now()};
    db.prepare('INSERT INTO quest_receipts(player_id,quest_id,vendor,day,status,payload) VALUES(?,?,?,?,?,?)').run(id,offer.id,offer.vendor,offer.day,'accepted',JSON.stringify(accepted));
    q.accepted.push(accepted);save(id,data);return publicState(id,data);
  })());
  endpoint('/activate',(id,body)=>db.transaction(()=>{
    const data=load(id),q=normalizeQuestState(data);
    if(!q.accepted.some(x=>x.id===body.questId))throw new Error('Задание не найдено');
    if(q.activeId!==body.questId){q.activeId=body.questId;save(id,data);}
    return publicState(id,data);
  })());
  endpoint('/abandon',(id,body)=>db.transaction(()=>{
    atBase(id);const data=load(id),q=normalizeQuestState(data),quest=q.accepted.find(x=>x.id===body.questId);
    if(!quest||quest.vendor!==body.vendor)throw new Error('Отказаться можно только в разговоре с заказчиком');
    const result=db.prepare("UPDATE quest_receipts SET status='abandoned' WHERE player_id=? AND quest_id=? AND status='accepted'").run(id,quest.id);
    if(result.changes!==1)throw new Error('Этот заказ уже закрыт');
    q.accepted=q.accepted.filter(x=>x.id!==quest.id);if(q.activeId===quest.id)q.activeId=null;
    save(id,data);return publicState(id,data);
  })());
  endpoint('/turn-in',(id,body)=>db.transaction(()=>{
    atBase(id);const data=load(id),q=normalizeQuestState(data),record=receipt(id,body.questId);
    if(!record||record.status!=='accepted')throw new Error('Этот заказ уже закрыт или не найден');
    const quest=JSON.parse(record.payload); // authoritative receipt, never client reward/quantity
    if(!q.accepted.some(x=>x.id===quest.id)||quest.vendor!==body.vendor)throw new Error('Это задание другого торговца');
    // Existing inventory is valid quest progress. A player who already has the requested
    // item may hand it in immediately at base; only the actual inventory and base checks matter.
    if(inventoryQty(data,quest)<quest.qty)throw new Error('Нужных предметов без улучшений пока недостаточно');
    consume(data,quest);
    const coins=data.coins+quest.reward;if(!Number.isSafeInteger(coins))throw new Error('Лимит валюты: обратитесь к администратору');
    data.coins=coins;
    const done={...quest,completedAt:Date.now()};
    const result=db.prepare("UPDATE quest_receipts SET status='completed',payload=? WHERE player_id=? AND quest_id=? AND status='accepted'").run(JSON.stringify(done),id,quest.id);
    if(result.changes!==1)throw new Error('Этот заказ уже закрыт');
    q.accepted=q.accepted.filter(x=>x.id!==quest.id);if(q.activeId===quest.id)q.activeId=null;
    save(id,data);
    return {reward:quest.reward,coins:data.coins,inventory:data.inventory,quickSlots:data.quickSlots,...publicState(id,data)};
  })());
  function markRaidReturn(playerId){
    // Called in the same transaction as removing the verified raid session.
    const id=String(playerId),data=load(id);data.quests.lastRaidReturnAt=Date.now();save(id,data);
    return data.quests.lastRaidReturnAt;
  }
  return Object.freeze({version:2,pickArtifact,markRaidReturn,artifactMeta,makeOffers,inventoryQty,migrateProfileForUpgradeCap,upgradeMigration});
};
