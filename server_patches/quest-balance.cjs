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

  function pickArtifact(names){
    const pool=(Array.isArray(names)?names:[]).map(name=>({name,weight:Number(artifactMeta.get(name)?.weight)||1}));
    if(!pool.length)return null;
    const total=pool.reduce((n,x)=>n+x.weight,0);
    let roll=Math.random()*total;
    for(const item of pool){if(roll<item.weight)return item.name;roll-=item.weight;}
    return pool.at(-1).name;
  }

  function normalizeQuestState(data){
    const q=data.quests&&typeof data.quests==='object'?data.quests:{};
    q.accepted=Array.isArray(q.accepted)?q.accepted.filter(x=>x&&typeof x.id==='string').slice(0,8):[];
    q.activeId=typeof q.activeId==='string'&&q.accepted.some(x=>x.id===q.activeId)?q.activeId:null;
    q.completed=Array.isArray(q.completed)?q.completed.filter(Boolean).slice(-50):[];
    q.completedCount=Math.max(q.completed.length,Math.floor(Number(q.completedCount)||0));
    q.lastRaidReturnAt=Math.max(0,Number(q.lastRaidReturnAt)||0);
    data.quests=q;return q;
  }
  function load(playerId){
    const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);
    if(!row)throw new Error('Игрок не найден');
    const data=JSON.parse(row.data||'{}');normalizeQuestState(data);data.inventory=data.inventory||{};data.coins=Math.max(0,Number(data.coins)||0);return data;
  }
  function save(playerId,data){
    db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?').run(JSON.stringify(data),Date.now(),playerId);
  }
  function cleanBase(name){
    const raw=String(name||'').replace(/[\u200B\u200C\u200D\u2060\uFEFF]+$/,'');
    try{return parseGearNameServer?parseGearNameServer(raw).baseName:raw.replace(/\s+\+\d+$/,'');}
    catch(_){return raw.replace(/\s+\+\d+$/,'');}
  }
  function inventoryQty(data,itemName){
    const target=cleanBase(itemName);
    return Object.entries(data.inventory||{}).reduce((sum,[name,qty])=>sum+(cleanBase(name)===target?Math.max(0,Number(qty)||0):0),0);
  }
  function consume(data,itemName,qty){
    let left=Math.max(1,Math.floor(Number(qty)||1)),target=cleanBase(itemName);
    for(const key of Object.keys(data.inventory||{})){
      if(cleanBase(key)!==target)continue;
      const have=Math.max(0,Math.floor(Number(data.inventory[key])||0));
      if(!have)continue;
      const take=Math.min(have,left);
      data.inventory[key]=have-take;if(data.inventory[key]<=0)delete data.inventory[key];
      left-=take;if(left<=0)return true;
    }
    return false;
  }

  function dailySeed(playerId,vendor){
    return crypto.createHash('sha256').update(playerId+'|'+vendor+'|'+new Date().toISOString().slice(0,10)).digest();
  }
  function randomFrom(seed,index){
    const h=crypto.createHash('sha256').update(seed).update('|'+index).digest();
    return h.readUInt32BE(0)/0x100000000;
  }
  function sampleUnique(pool,count,seed,offset=0){
    const left=[...pool],out=[];
    for(let i=0;i<count&&left.length;i++){
      const n=Math.floor(randomFrom(seed,offset+i)*left.length);
      out.push(left.splice(Math.min(n,left.length-1),1)[0]);
    }
    return out;
  }
  function topBand(items,level){
    const sorted=[...items].sort((a,b)=>(Number(a.unlockLevel??a.tier)||0)-(Number(b.unlockLevel??b.tier)||0)||(Number(a.price)||0)-(Number(b.price)||0));
    if(!sorted.length)return [];
    const accessible=sorted.filter(x=>(Number(x.unlockLevel)||0)<=level+15);
    const src=accessible.length?accessible:sorted.slice(0,Math.min(6,sorted.length));
    const size=Math.max(5,Math.ceil(src.length*0.35));
    return src.slice(-size);
  }
  function bestSale(itemName,qty,playerId){
    let base=5,category='unknown';
    if(typeof resolveSellPriceServer==='function'){
      const r=resolveSellPriceServer(itemName,playerId)||{};base=Math.max(1,Number(r.price)||5);category=r.category||category;
    }else{
      const name=cleanBase(itemName);
      const found=(SHOP_WEAPONS||[]).find(x=>x.name===name)||(SHOP_ARMOR||[]).find(x=>x.name===name)||(SHOP_ARTIFACTS||[]).find(x=>x.name===name)||(SHOP_MUTANT_LOOT||[]).find(x=>x.name===name);
      base=Math.max(1,Math.round((Number(found?.price)||10)*.5));
    }
    const multiplier=category==='artifact'?1.35:category==='loot'?1.20:(category==='weapon'||category==='armor')?1.02:1;
    return Math.max(1,Math.round(base*multiplier*Math.max(1,qty)));
  }
  function questReward(itemName,qty,playerId,difficulty){
    const sale=bestSale(itemName,qty,playerId);
    const mult=1.70+Math.min(.55,Math.max(0,Number(difficulty)||0)*.035);
    return Math.max(sale+1,Math.ceil(sale*mult));
  }
  function questId(playerId,vendor,itemName,qty){
    return crypto.createHash('sha256').update(playerId+'|'+vendor+'|'+itemName+'|'+qty+'|'+new Date().toISOString().slice(0,10)).digest('hex').slice(0,20);
  }
  function makeOffer(playerId,data,vendor,item,index){
    const level=Math.max(1,Number(data.level)||1),qty=Math.max(1,Number(item.questQty)||1),difficulty=Number(item.tier)||Math.floor((Number(item.unlockLevel)||level)/40);
    const title=vendor==='leonov'?(item.questKind==='loot'?'Образец мутанта':'Артефакт для исследований'):vendor==='zhuchara'?'Броня для заказа':'Оружие для заказа';
    return {
      id:questId(playerId,vendor,item.name,qty),vendor,title,itemName:item.name,qty,
      reward:questReward(item.name,qty,playerId,difficulty),levelAtOffer:level,difficulty,index
    };
  }
  function makeOffers(playerId,data,vendor){
    if(!vendors.has(vendor))return [];
    const level=Math.max(1,Number(data.level)||1),seed=dailySeed(playerId,vendor);
    let candidates=[];
    if(vendor==='zhuchara'){
      candidates=topBand((SHOP_ARMOR||[]).filter(a=>!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit),level)
        .map(a=>({...a,questQty:1,questKind:'armor'}));
    }else if(vendor==='diesel'){
      candidates=topBand((SHOP_WEAPONS||[]).filter(w=>!w.adminOnly&&!w.isPremiumWeapon),level)
        .map(w=>({...w,questQty:1,questKind:'weapon'}));
    }else{
      const maxArtifactTier=Math.min(8,Math.max(1,1+Math.floor((level-1)/55)));
      const arts=(SHOP_ARTIFACTS||[]).filter(a=>!a.adminOnly&&!a.isNamedArtifact&&Number(a.tier)<=maxArtifactTier)
        .sort((a,b)=>(Number(a.tier)||0)-(Number(b.tier)||0)||(Number(a.price)||0)-(Number(b.price)||0));
      const artBand=arts.slice(-Math.max(7,Math.ceil(arts.length*.25))).map(a=>({...a,questQty:Math.min(3,1+Math.floor(level/180)),questKind:'artifact'}));
      const maxMutantTier=Math.min(27,Math.max(1,1+Math.floor(level/20)));
      const lootTier=new Map((PVE_MUTANTS||[]).filter(m=>m.loot).map(m=>[m.loot,Number(m.tier)||0]));
      const loots=(SHOP_MUTANT_LOOT||[]).filter(l=>(lootTier.get(l.name)||0)<=maxMutantTier)
        .map(l=>({...l,tier:lootTier.get(l.name)||1,questQty:Math.min(4,1+Math.floor(level/140)),questKind:'loot'}));
      const lootBand=loots.slice(-Math.max(5,Math.ceil(loots.length*.3)));
      candidates=[...sampleUnique(artBand,2,seed,10),...sampleUnique(lootBand,2,seed,20)];
    }
    const picked=sampleUnique(candidates,3,seed,30);
    return picked.map((item,index)=>makeOffer(playerId,data,vendor,item,index));
  }

  function publicState(data){
    const q=normalizeQuestState(data);
    return {accepted:q.accepted,activeId:q.activeId,completed:q.completed,completedCount:q.completedCount,lastRaidReturnAt:q.lastRaidReturnAt};
  }
  const limiter=(name,max=30)=>typeof rateLimit==='function'?rateLimit('quests-'+name,max,10000):(_req,_res,next)=>next();

  app.get('/api/quests/version',(_req,res)=>res.json({success:true,version:1,balanceVersion:'2026-09-19'}));

  app.post('/api/quests/state',requireAuth,limiter('state',60),(req,res)=>{
    try{const data=load(String(req.telegramUser.id));return res.json({success:true,...publicState(data)});}
    catch(e){return res.status(400).json({success:false,error:e.message});}
  });
  app.post('/api/quests/offers',requireAuth,limiter('offers',40),(req,res)=>{
    try{
      const playerId=String(req.telegramUser.id),vendor=String(req.body?.vendor||'');
      if(!vendors.has(vendor))return res.status(400).json({success:false,error:'Неизвестный заказчик'});
      const data=load(playerId);
      return res.json({success:true,offers:makeOffers(playerId,data,vendor)});
    }catch(e){return res.status(400).json({success:false,error:e.message});}
  });
  app.post('/api/quests/accept',requireAuth,limiter('accept',20),(req,res)=>{
    try{
      const playerId=String(req.telegramUser.id),vendor=String(req.body?.vendor||''),questId=String(req.body?.questId||'');
      if(!vendors.has(vendor))return res.status(400).json({success:false,error:'Неизвестный заказчик'});
      const data=load(playerId),q=normalizeQuestState(data);
      if(q.accepted.length>=8)return res.status(400).json({success:false,error:'Одновременно можно держать не больше 8 заданий'});
      if(q.accepted.some(x=>x.id===questId))return res.json({success:true,...publicState(data)});
      const offer=makeOffers(playerId,data,vendor).find(x=>x.id===questId);
      if(!offer)return res.status(400).json({success:false,error:'Этот заказ больше недоступен'});
      const accepted={...offer,acceptedAt:Date.now()};
      q.accepted.push(accepted);save(playerId,data);
      return res.json({success:true,...publicState(data)});
    }catch(e){return res.status(400).json({success:false,error:e.message});}
  });
  app.post('/api/quests/activate',requireAuth,limiter('activate',30),(req,res)=>{
    try{
      const playerId=String(req.telegramUser.id),questId=String(req.body?.questId||''),data=load(playerId),q=normalizeQuestState(data);
      if(!q.accepted.some(x=>x.id===questId))return res.status(404).json({success:false,error:'Задание не найдено'});
      q.activeId=questId;save(playerId,data);return res.json({success:true,...publicState(data)});
    }catch(e){return res.status(400).json({success:false,error:e.message});}
  });
  app.post('/api/quests/abandon',requireAuth,limiter('abandon',20),(req,res)=>{
    try{
      const playerId=String(req.telegramUser.id),vendor=String(req.body?.vendor||''),questId=String(req.body?.questId||''),data=load(playerId),q=normalizeQuestState(data);
      const quest=q.accepted.find(x=>x.id===questId);
      if(!quest||quest.vendor!==vendor)return res.status(400).json({success:false,error:'Отказаться от задания можно только у его заказчика'});
      q.accepted=q.accepted.filter(x=>x.id!==questId);if(q.activeId===questId)q.activeId=null;save(playerId,data);
      return res.json({success:true,...publicState(data)});
    }catch(e){return res.status(400).json({success:false,error:e.message});}
  });
  app.post('/api/quests/turn-in',requireAuth,limiter('turnin',20),(req,res)=>{
    try{
      const playerId=String(req.telegramUser.id),vendor=String(req.body?.vendor||''),questId=String(req.body?.questId||'');
      const result=db.transaction(()=>{
        const data=load(playerId),q=normalizeQuestState(data),quest=q.accepted.find(x=>x.id===questId);
        if(!quest||quest.vendor!==vendor)throw new Error('Это задание получено у другого торговца');
        if(q.lastRaidReturnAt<=Number(quest.acceptedAt||0))throw new Error('Сначала вернись из рейда после получения задания');
        if(inventoryQty(data,quest.itemName)<Number(quest.qty||1))throw new Error('Нужных предметов пока недостаточно');
        if(!consume(data,quest.itemName,quest.qty))throw new Error('Не удалось списать предметы задания');
        data.coins=Math.max(0,Number(data.coins)||0)+Math.max(1,Math.round(Number(quest.reward)||0));
        const done={...quest,completedAt:Date.now()};
        q.accepted=q.accepted.filter(x=>x.id!==questId);if(q.activeId===questId)q.activeId=null;
        q.completed.push(done);if(q.completed.length>50)q.completed=q.completed.slice(-50);q.completedCount+=1;
        save(playerId,data);
        return {reward:quest.reward,coins:data.coins,inventory:data.inventory,...publicState(data)};
      })();
      return res.json({success:true,...result});
    }catch(e){return res.status(400).json({success:false,error:e.message});}
  });

  function markRaidReturn(playerId){
    try{
      const data=load(String(playerId)),q=normalizeQuestState(data);q.lastRaidReturnAt=Date.now();save(String(playerId),data);return q.lastRaidReturnAt;
    }catch(e){console.error('[quest raid return]',e);return 0;}
  }

  return Object.freeze({version:1,pickArtifact,markRaidReturn,artifactMeta,makeOffers});
};
