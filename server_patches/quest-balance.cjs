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
  const artifactByName=new Map((SHOP_ARTIFACTS||[]).map(a=>[a.name,a]));
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
  for(const suit of (SHOP_ARMOR||[]).filter(a=>a.isResearchSuit)){
    const same=(SHOP_ARMOR||[]).filter(a=>!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit&&Number(a.tier)===Number(suit.tier));
    if(same.length){
      const floor=Math.min(...same.map(a=>Number(a.price)||Infinity));
      suit.price=Math.round(floor*1.10);
    }
  }

  function pickArtifact(names){
    const pool=(Array.isArray(names)?names:[]).map(name=>({name,weight:Number(artifactMeta.get(name)?.weight)||1}));
    if(!pool.length)return null;
    const total=pool.reduce((n,x)=>n+x.weight,0);
    let roll=Math.random()*total;
    for(const item of pool){if(roll<item.weight)return item.name;roll-=item.weight;}
    return pool.at(-1).name;
  }

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
    if(q.lastRaidReturnAt<=quest.acceptedAt)throw new Error('Сначала вернись из рейда после получения задания');
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
  return Object.freeze({version:2,pickArtifact,markRaidReturn,artifactMeta,makeOffers,inventoryQty});
};
