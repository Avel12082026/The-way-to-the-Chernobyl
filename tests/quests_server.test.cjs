const assert=require('node:assert/strict');
const install=require('../server_patches/quest-balance.cjs');

class FakeDB{
  constructor(data){
    this.rows=new Map([['p1',{data:JSON.stringify(data)}]]);
    this.receipts=[];this.seq=0;this.raid=new Set();this.battles=new Set();this.migrations=new Map();this.market=[];
  }
  exec(){return this;}
  prepare(sql){
    if(sql.startsWith('SELECT details FROM balance_migrations'))return{get:name=>this.migrations.has(name)?{details:this.migrations.get(name)}:undefined};
    if(sql.startsWith('SELECT id,data FROM players'))return{all:()=>[...this.rows].map(([id,row])=>({id,data:row.data}))};
    if(sql.startsWith('SELECT id,item FROM market'))return{all:()=>this.market.map(x=>({...x}))};
    if(sql.startsWith('UPDATE market SET item='))return{run:(item,id)=>{const row=this.market.find(x=>x.id===id);if(!row)return{changes:0};row.item=item;return{changes:1};}};
    if(sql.startsWith('INSERT INTO balance_migrations'))return{run:(name,_at,details)=>{this.migrations.set(name,details);return{changes:1};}};
    if(sql.startsWith('UPDATE players SET data=? WHERE id=?'))return{run:(data,id)=>{if(!this.rows.has(id))return{changes:0};this.rows.set(id,{data});return{changes:1};}};
    if(sql.startsWith('SELECT data FROM players'))return{get:id=>this.rows.get(id)};
    if(sql.startsWith('UPDATE players SET data='))return{run:(data,_last,id)=>{this.rows.set(id,{data});return{changes:1};}};
    if(sql.startsWith('SELECT 1 FROM raid_sessions'))return{get:id=>this.raid.has(id)?{1:1}:undefined};
    if(sql.startsWith('SELECT 1 FROM pve_battles'))return{get:id=>this.battles.has(id)?{1:1}:undefined};
    if(sql.startsWith('SELECT status,payload FROM quest_receipts'))return{get:(id,qid)=>{
      const r=this.receipts.find(x=>x.player_id===id&&x.quest_id===qid);return r?{status:r.status,payload:r.payload}:undefined;
    }};
    if(sql.startsWith('SELECT COUNT(*) AS n FROM quest_receipts WHERE player_id=? AND vendor='))return{get:(id,vendor,day)=>({n:this.receipts.filter(x=>x.player_id===id&&x.vendor===vendor&&x.day===day).length})};
    if(sql.includes("SELECT COUNT(*) AS n FROM quest_receipts")&&sql.includes("status='completed'"))return{get:id=>({n:this.receipts.filter(x=>x.player_id===id&&x.status==='completed').length})};
    if(sql.startsWith("SELECT seq,payload FROM quest_receipts")&&sql.includes("status='completed'")){
      return{all:(id,before)=>{
        let rows=this.receipts.filter(x=>x.player_id===id&&x.status==='completed');
        if(sql.includes('seq<?'))rows=rows.filter(x=>x.seq<before);
        return rows.sort((a,b)=>b.seq-a.seq).slice(0,51).map(x=>({seq:x.seq,payload:x.payload}));
      }};
    }
    if(sql.startsWith('INSERT INTO quest_receipts'))return{run:(player_id,quest_id,vendor,day,status,payload)=>{
      if(this.receipts.some(x=>x.player_id===player_id&&x.quest_id===quest_id))throw new Error('UNIQUE');
      this.receipts.push({seq:++this.seq,player_id,quest_id,vendor,day,status,payload});return{changes:1};
    }};
    if(sql.startsWith("UPDATE quest_receipts SET status='abandoned'"))return{run:(id,qid)=>{
      const r=this.receipts.find(x=>x.player_id===id&&x.quest_id===qid&&x.status==='accepted');
      if(!r)return{changes:0};r.status='abandoned';return{changes:1};
    }};
    if(sql.startsWith("UPDATE quest_receipts SET status='completed',payload=?"))return{run:(payload,id,qid)=>{
      const r=this.receipts.find(x=>x.player_id===id&&x.quest_id===qid&&x.status==='accepted');
      if(!r)return{changes:0};r.status='completed';r.payload=payload;return{changes:1};
    }};
    throw new Error('Unexpected SQL: '+sql);
  }
  transaction(fn){return(...args)=>fn(...args);}
}
const routes={},app={
  post(path,...handlers){routes[path]=handlers.at(-1);},
  get(path,...handlers){routes[path]=handlers.at(-1);}
};
const weapons=[
 {name:'ПМ',tier:1,price:200,unlockLevel:1},
 {name:'АК-74',tier:2,price:1000,unlockLevel:50},
 {name:'СВД',tier:3,price:3000,unlockLevel:100},
 {name:'РПК',tier:5,price:7000,unlockLevel:200},
 {name:'Админ-пушка',tier:14,price:999999,dmg:999999,unlockLevel:1,adminOnly:true}
];
const armor=[
 {name:'Юность',tier:1,price:200,unlockLevel:1},
 {name:'Беркут',tier:2,price:1500,unlockLevel:50},
 {name:'СЕВА',tier:3,price:4000,unlockLevel:100},
 {name:'Экзоскелет',tier:5,price:9000,unlockLevel:200},
 {name:'Админ-броня',tier:14,price:999999,armor:9999,hitAbsorption:9999,unlockLevel:1,adminOnly:true}
];
const artifacts=[
 {name:'А1',tier:1,price:100,stats:{health:4,hunger:-3}},
 {name:'А2',tier:1,price:200,stats:{health:4,hunger:-3}},
 {name:'А3',tier:1,price:300,stats:{health:4,hunger:-3}},
 {name:'А2Т',tier:2,price:600,stats:{health:5,hunger:-3}},
 {name:'А5Т',tier:5,price:1800,stats:{health:8,hunger:-2}},
 {name:'Админ-артефакт',tier:1,price:999999,stats:{health:999,hunger:999},adminOnly:true}
];
const loot=[{name:'Хвост',price:200},{name:'Ухо',price:500}];
const mutants=[{name:'Тушкан',tier:0,loot:'Хвост',lootChance:50},{name:'Пёс',tier:1,loot:'Ухо',lootChance:50}];
const anomalies=[
 {id:1,name:'Жарка',tier:1,artifacts:['А1','А2','А3','Админ-артефакт']},
 {id:2,name:'Электра',tier:2,artifacts:['А2Т']},
 {id:5,name:'Разлом',tier:5,artifacts:['А5Т']}
];
const data={level:120,coins:0,inventory:{},quests:{}};
const db=new FakeDB(data);
function sell(name){
 const all=[...weapons,...armor,...artifacts,...loot];const item=all.find(x=>x.name===name);
 const category=weapons.includes(item)?'weapon':armor.includes(item)?'armor':artifacts.includes(item)?'artifact':'loot';
 return{price:Math.max(1,Math.round((item?.price||10)*.5)),category};
}
const api=install({
 app,db,requireAuth:(_q,_s,n)=>n(),rateLimit:()=>((_q,_s,n)=>n()),
 SHOP_WEAPONS:weapons,SHOP_ARMOR:armor,SHOP_ARTIFACTS:artifacts,SHOP_MUTANT_LOOT:loot,
 PVE_MUTANTS:mutants,RAID_ANOMALIES:anomalies,resolveSellPriceServer:sell,
 parseGearNameServer:n=>({baseName:String(n).replace(/\s+\+\d+$/,'')})
});
assert.equal(api.version,2);
assert.equal(api.artifactMeta.get('А1').weight,18);
assert.equal(api.artifactMeta.get('А3').weight,2);
assert.equal(api.artifactMeta.has('Админ-артефакт'),false);
assert.deepEqual(artifacts.find(a=>a.name==='Админ-артефакт').stats,{health:999,hunger:999});
assert(artifacts[2].stats.health>artifacts[0].stats.health,'rarer artifact must have stronger positive stat');
assert(Math.abs(artifacts[2].stats.hunger)<Math.abs(artifacts[0].stats.hunger),'rarer artifact must have softer drawback');

function call(path,body={}){
 const req={telegramUser:{id:'p1'},body};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return v;}};
 const out=routes[path](req,res);return Promise.resolve(out).then(()=>res);
}
(async()=>{
 const migrated=api.migrateProfileForUpgradeCap({
   inventory:{'ПМ +100':1,'Админ-пушка +100':1},
   warehouse:{'Админ-броня +100':1},
   weapon:{name:'Админ-пушка +100',tier:14,dmg:999999},
   armor:{name:'Админ-броня +100',tier:14,armor:9999,hitAbsorption:9999},
   armorUpgradeData:{
     'Юность':{armor:80,hitAbsorption:20},
     'Админ-броня':{armor:100,hitAbsorption:100}
   }
 });
 assert.equal(migrated.data.inventory['ПМ +50'],1);
 assert.equal(migrated.data.inventory['Админ-пушка +100'],1);
 assert.equal(migrated.data.warehouse['Админ-броня +100'],1);
 assert.equal(migrated.data.weapon.name,'Админ-пушка +100');
 assert.equal(migrated.data.armor.name,'Админ-броня +100');
 assert.equal(Object.values(migrated.data.armorUpgradeData['Юность']).reduce((a,b)=>a+b,0),50);
 assert.deepEqual(migrated.data.armorUpgradeData['Админ-броня'],{armor:100,hitAbsorption:100});

 let r=await call('/api/quests/offers',{vendor:'diesel'});assert.equal(r.code,200);assert(r.body.offers.length>0);assert(r.body.offers.every(q=>weapons.some(w=>w.name===q.itemName&&!w.adminOnly)));
 const offer=r.body.offers[0],offer2=r.body.offers[1];
 r=await call('/api/quests/accept',{vendor:'diesel',questId:offer.id});assert.equal(r.body.accepted.length,1);
 r=await call('/api/quests/accept',{vendor:'diesel',questId:offer2.id});assert.equal(r.body.accepted.length,2);
 r=await call('/api/quests/activate',{questId:offer.id});assert.deepEqual(r.body.activeIds,[offer.id]);
 r=await call('/api/quests/activate',{questId:offer2.id});assert.deepEqual(r.body.activeIds,[offer.id,offer2.id]);
 // An item already owned when/after the quest is accepted can be handed in immediately at base.
 let stored=JSON.parse(db.rows.get('p1').data);stored.inventory[offer.itemName]=1;db.rows.set('p1',{data:JSON.stringify(stored)});
 r=await call('/api/quests/turn-in',{vendor:'diesel',questId:offer.id});assert.equal(r.code,200);assert.equal(r.body.completedCount,1);
 assert(r.body.reward>sell(offer.itemName).price*1.02,'quest reward must exceed best ordinary sale');
 assert.equal(r.body.inventory[offer.itemName],undefined);
 assert.deepEqual(r.body.activeIds,[offer2.id]);
 // Leonov never asks for armor or guns.
 r=await call('/api/quests/offers',{vendor:'leonov'});assert(r.body.offers.every(q=>artifacts.some(a=>a.name===q.itemName&&!a.adminOnly)||loot.some(l=>l.name===q.itemName)));
 // Zhuchara gives exactly one tier-2 artifact, armor and weapon quest.
 r=await call('/api/quests/offers',{vendor:'zhuchara'});assert.equal(r.code,200);assert.equal(r.body.offers.length,3);
 assert.deepEqual(new Set(r.body.offers.map(q=>q.kind)),new Set(['artifact','armor','weapon']));
 assert(r.body.offers.every(q=>q.difficulty===2&&q.qty===1));
 const zFirst=r.body.offers.map(q=>q.id),zQuest=r.body.offers[0];
 let zData=JSON.parse(db.rows.get('p1').data);zData.inventory[zQuest.itemName]=1;db.rows.set('p1',{data:JSON.stringify(zData)});
 assert.equal((await call('/api/quests/accept',{vendor:'zhuchara',questId:zQuest.id})).code,200);
 r=await call('/api/quests/turn-in',{vendor:'zhuchara',questId:zQuest.id});assert.equal(r.code,200);
 assert.equal(r.body.reward,Math.max(zQuest.saleValue+1,Math.ceil(zQuest.saleValue*1.5)),'quest payout must be 150% of ordinary sale value');
 const zNext=(await call('/api/quests/offers',{vendor:'zhuchara'})).body.offers;assert.equal(zNext.length,3);
 assert(zNext.every(q=>!zFirst.includes(q.id)),'Zhuchara must refresh offers after turn-in');

 // Barman gives exactly one tier-5 artifact, armor and weapon quest and refreshes after hand-in.
 r=await call('/api/quests/offers',{vendor:'barman'});assert.equal(r.code,200);assert.equal(r.body.offers.length,3);
 assert.deepEqual(new Set(r.body.offers.map(q=>q.kind)),new Set(['artifact','armor','weapon']));
 assert(r.body.offers.every(q=>q.difficulty===5&&q.qty===1));
 const bFirst=r.body.offers.map(q=>q.id),bQuest=r.body.offers[0];
 let bData=JSON.parse(db.rows.get('p1').data);bData.inventory[bQuest.itemName]=1;db.rows.set('p1',{data:JSON.stringify(bData)});
 assert.equal((await call('/api/quests/accept',{vendor:'barman',questId:bQuest.id})).code,200);
 r=await call('/api/quests/turn-in',{vendor:'barman',questId:bQuest.id});assert.equal(r.code,200);
 assert.equal(r.body.reward,Math.max(bQuest.saleValue+1,Math.ceil(bQuest.saleValue*1.5)));
 const bNext=(await call('/api/quests/offers',{vendor:'barman'})).body.offers;assert.equal(bNext.length,3);
 assert(bNext.every(q=>!bFirst.includes(q.id)),'Barman must refresh offers after turn-in');
 console.log('quests server: OK');
})().catch(e=>{console.error(e);process.exitCode=1});