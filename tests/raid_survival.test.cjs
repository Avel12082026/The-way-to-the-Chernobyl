'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const model=require('../server_patches/raid-survival.cjs');
const fullDose={health:200,radiation:100};assert.equal(model.radiationDamage(fullDose),15);assert.equal(fullDose.health,185);
const rows=[];
for(let tier=1;tier<=9;tier++){
  const d={health:1000,radiation:0,anomalyResist:{},radiationResist:0};
  const x=model.search(d,{name:'Жарка',tier},{},()=>.5);rows.push(x);
  assert.equal(x.searchDmg,0);assert.equal(d.health,1000-x.anomalyDmg);
  assert(Number.isFinite(d.health)&&Number.isFinite(d.radiation));
  if(tier>1){assert(x.anomalyDmg>rows[tier-2].anomalyDmg);assert(x.radiationDose>rows[tier-2].radiationDose);}
}
const protection=Object.fromEntries(model.ANOMALY_KEYS.map(k=>[k,120]));
const run=(gear,rad=90)=>{const d={health:1000,radiation:rad,radiationResist:120,anomalyResist:protection};return [model.search(d,{tier:9,name:'Смерч'},gear,()=>.5),d];};
const ordinary=run({}),baseResearch=run({researchSuit:true}),upgraded=run({researchSuit:true,upgrades:{radiation:25,'anomaly_Жарка':25}});
assert.equal(ordinary[0].anomalyDmg,baseResearch[0].anomalyDmg);
assert(upgraded[0].anomalyDmg<ordinary[0].anomalyDmg/2);
assert(upgraded[0].radiationDose<ordinary[0].radiationDose/2);
assert.equal(ordinary[1].radiation,100);assert(ordinary[1].health>0,'full contamination is not instant death during search');
assert.equal(run({researchSuit:true,upgrades:{armor:50}})[0].anomalyDmg,ordinary[0].anomalyDmg);
const neg={health:1000,radiation:0,radiationResist:-100,anomalyResist:{Жарка:-100}};
const negative=model.search(neg,{tier:1,name:'Жарка'},{},()=>.5);assert(negative.anomalyDmg>6&&Number.isFinite(neg.health));

assert.equal(model.DAMAGE[1],10,'tier-1 direct anomaly damage was raised');
assert.equal(model.DAMAGE[8],94,'tier-8 direct anomaly damage was raised');
const exactHazard=(anomalyStat=0,radiationStat=0)=>{
  const d={health:1000,radiation:0,radiationResist:radiationStat,anomalyResist:{Жарка:anomalyStat}};
  return model.search(d,{tier:3,name:'Жарка'},{
    artifactAnomaly:{Жарка:anomalyStat},artifactRadiation:radiationStat,artifactDerivedScale:1
  },()=>.5);
};
const exactNeutral=exactHazard(),exactProtected=exactHazard(3,3),exactVulnerable=exactHazard(-3,-3);
assert.equal(exactNeutral.anomalyDmg-exactProtected.anomalyDmg,3,'belt +3 anomaly protection is exactly -3 HP');
assert.equal(exactVulnerable.anomalyDmg-exactNeutral.anomalyDmg,3,'belt -3 anomaly protection is exactly +3 HP');
assert.equal(exactNeutral.radiationDose-exactProtected.radiationDose,3,'belt +3 radiation is exactly -3 dose');
assert.equal(exactVulnerable.radiationDose-exactNeutral.radiationDose,3,'belt -3 radiation is exactly +3 dose');
const exactWithScaledArmour=artifactStat=>{
  const d={health:1000,radiation:0,radiationResist:999,anomalyResist:{Жарка:999}};
  return model.search(d,{tier:3,name:'Жарка'},{
    artifactAnomaly:{Жарка:artifactStat},artifactRadiation:artifactStat,artifactDerivedScale:1.15,
    armourAnomaly:{Жарка:7.25},armourRadiation:5.75
  },()=>.5);
};
const scaledNeutral=exactWithScaledArmour(0),scaledProtected=exactWithScaledArmour(3);
assert.equal(Math.round((scaledNeutral.anomalyDmg-scaledProtected.anomalyDmg)*10)/10,3,'belt +3 stays exact with fractional armour/faction scaling');
assert.equal(Math.round((scaledNeutral.radiationDose-scaledProtected.radiationDose)*10)/10,3,'radiation +3 stays exact with fractional armour/faction scaling');

// Execute the actual patched production route bodies against a fresh in-memory SQLite DB.
const raw=new DatabaseSync(':memory:');
raw.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,data TEXT,last_seen INTEGER);
CREATE TABLE raid_sessions(player_id TEXT PRIMARY KEY,token TEXT,pending_type TEXT,pending_payload TEXT,updated_at INTEGER);
CREATE TABLE pve_battles(player_id TEXT,token TEXT);
CREATE TABLE named_artifacts(id INTEGER,artifact_name TEXT,anomaly_index INTEGER,claimed_by TEXT,claimed_at INTEGER,stats TEXT);
CREATE TABLE crafted_artifacts(name TEXT,stats TEXT,tier INTEGER,price INTEGER,gen INTEGER);`);
const db={prepare:s=>raw.prepare(s),transaction:fn=>(...args)=>{raw.exec('BEGIN');try{const v=fn(...args);raw.exec('COMMIT');return v;}catch(e){raw.exec('ROLLBACK');throw e;}}};
const routes={},app={post:(url,...handlers)=>routes[url]=handlers.at(-1),get(){},listen(){}};
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/raid-survival-live.json'),'utf8'));
function catalogue(name,local){
  if(!fs.existsSync('index.html'))return JSON.parse(fs.readFileSync(local,'utf8'));
  const html=fs.readFileSync('index.html','utf8'),m=html.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n    \\]);'));
  assert(m,'catalogue '+name);return vm.runInNewContext(m[1],{});
}
fixture.armor=catalogue('armorItems','SHOP_ARMOR.json');
fixture.artifacts=catalogue('artifacts','SHOP_ARTIFACTS.json');
const code=fs.readFileSync(process.env.RAID_PATCHED_FIXTURE||'.validation/raid-survival-fixture.js','utf8');
const math=Object.create(Math);math.random=()=>.999; // no loot; movement produces a quiet event
const env={require:n=>{assert.equal(n,'./raid-survival.cjs');return model;},console,Math:math,Date,JSON,Number,Set,Map,db,app,PORT:0,
  requireAuth(){},rateLimit:()=>()=>{},safeParsePlayerData:JSON.parse,SHOP_ARMOR:fixture.armor,SHOP_ARTIFACTS:fixture.artifacts,
  UPGRADE_MAX_LEVEL:50,UPGRADE_MAX_BONUS_PCT_SERVER:.25,
  pveFactionBonuses:()=>({anomalyRadResistPct:0,artifactFindChancePct:0}),pveIsEquippedArmor:()=>false,
  raidState:d=>d,questBalance:{pickArtifact:n=>n[0]},pveAddItem:(d,n,q)=>{d.inventory[n]=(d.inventory[n]||0)+q;},pveBaseName:n=>n,
};
vm.createContext(env);vm.runInContext(fixture.helpers+'\n'+code,env);
function state(){return JSON.parse(raw.prepare('SELECT data FROM players WHERE id=?').get('1').data);}
function setup(attempt=0,health=1000,artifactSlots=[],armorName='Комбинезон Юность',radiation=0){
  raw.prepare('INSERT OR REPLACE INTO players VALUES(?,?,0)').run('1',JSON.stringify({health,maxHealth:1000,hunger:100,thirst:100,radiation,level:1,luck:0,inventory:{},stats:{},artifactSlots,armor:{name:armorName},armorUpgradeData:{}}));
  raw.prepare('INSERT OR REPLACE INTO raid_sessions VALUES(?,?,?,?,0)').run('1','raid','anomaly',JSON.stringify({name:'Жарка',tier:1,attemptsUsed:attempt,artifacts:['Медуза']}));
}
function call(url,body={}){const res={status(){return this;},json(v){this.value=v;return v;}};routes[url]({telegramUser:{id:'1'},body:{raidToken:'raid',...body}},res);return res.value;}
const delta1=(a,b)=>Math.round((a-b)*10)/10;
for(const n of [1,2,3]){
  setup();let total=0,last;
  for(let i=0;i<n;i++){last=call('/api/raid/anomaly/search');assert.equal(last.success,true);assert.equal(last.searchDmg,0);total+=last.anomalyDmg;assert.equal(last.state.health,Math.round((1000-total)*10)/10);}
  const rad=state().radiation;assert(rad>0);
  assert.equal(call(n===3?'/api/raid/anomaly/finish':'/api/raid/anomaly/bypass').success,true);
  const before=state().health,doseDamage=Math.round(rad*0.15*10)/10;const step=call('/api/raid/step');assert.equal(step.success,true);assert.equal(step.radiationDamage,doseDamage);assert.equal(step.state.health,Math.round((before-doseDamage)*10)/10);
  assert.equal(step.state.hunger,98);assert.equal(step.state.thirst,98);
  const second=call('/api/raid/step');assert.equal(second.radiationDamage,doseDamage);assert.equal(second.state.hunger,96);
}
setup();const routeNeutral=call('/api/raid/anomaly/search');
setup(0,1000,['Медуза']);const routeProtected=call('/api/raid/anomaly/search');
assert.equal(delta1(routeNeutral.anomalyDmg,routeProtected.anomalyDmg),2,'Медуза Жарка +2 removes exactly 2 HP damage');
setup(0,1000,['Льдинка']);const routeVulnerable=call('/api/raid/anomaly/search');
assert.equal(delta1(routeVulnerable.anomalyDmg,routeNeutral.anomalyDmg),3,'Льдинка Жарка -3 adds exactly 3 HP damage');
setup(0,1000,['Хрусталик']);const routeRadProtected=call('/api/raid/anomaly/search');
assert.equal(delta1(routeNeutral.radiationAdded,routeRadProtected.radiationAdded),3,'Хрусталик radioprotection +3 removes exactly 3 dose');

// «Радиозащита +N» and harmful «Радиация +N» are deliberately different mechanics.
// radiationLeak is a legacy storage key, but either sign must remain harmful and add contamination each turn.
function quietTurnAfterBypass(){
  assert.equal(call('/api/raid/anomaly/bypass').success,true);
  return call('/api/raid/step');
}
setup(0,1000,['Жемчужина']);const radiationTurn=quietTurnAfterBypass();
assert.equal(radiationTurn.turnEffects.radiationRaw,3,'Жемчужина shows/acts as Radiation +3 per turn');
assert.equal(radiationTurn.turnEffects.radiationProtection,0);
assert.equal(radiationTurn.turnEffects.netLeak,3);
assert.equal(state().radiation,3,'harmful Radiation +3 raises the meter by 3 on the player turn');

setup(0,1000,['Жемчужина','Хрусталик']);const protectedTurn=quietTurnAfterBypass();
assert.equal(protectedTurn.turnEffects.radiationRaw,3);
assert.equal(protectedTurn.turnEffects.radiationProtection,3,'Хрусталик supplies Radioprotection +3');
assert.equal(protectedTurn.turnEffects.netLeak,0);
assert.equal(state().radiation,0,'belt radioprotection offsets equal per-turn artifact radiation');

setup(0,1000,['Жемчужина'],'Исследовательский комбинезон A');const armorProtectedTurn=quietTurnAfterBypass();
assert(armorProtectedTurn.turnEffects.radiationProtection>=12,'armour radioprotection participates in per-turn radiation defense');
assert.equal(armorProtectedTurn.turnEffects.netLeak,0);
assert.equal(state().radiation,0,'armour radioprotection offsets artifact radiation');

raw.prepare('INSERT INTO crafted_artifacts VALUES(?,?,?,?,?)').run('Радиация плюс тест',JSON.stringify({radiationLeak:5}),3,100,1);
setup(0,1000,['Радиация плюс тест']);const positiveLeakTurn=quietTurnAfterBypass();
assert.equal(positiveLeakTurn.turnEffects.radiationRaw,5,'positive legacy radiationLeak cannot flip into protection');
assert.equal(positiveLeakTurn.turnEffects.netLeak,5);
assert.equal(state().radiation,5);

raw.prepare('INSERT INTO crafted_artifacts VALUES(?,?,?,?,?)').run('Радиация плюс тест 2',JSON.stringify({radiationLeak:-4}),3,100,1);
setup(0,1000,['Радиация плюс тест','Радиация плюс тест 2','Хрусталик']);const stackedRadiationTurn=quietTurnAfterBypass();
assert.equal(stackedRadiationTurn.turnEffects.radiationRaw,9,'harmful Radiation +N stacks across equipped artifacts');
assert.equal(stackedRadiationTurn.turnEffects.radiationProtection,3,'Radioprotection remains a separate summed defensive stat');
assert.equal(stackedRadiationTurn.turnEffects.netLeak,6,'Radioprotection subtracts from the total per-turn Radiation +N');
assert.equal(state().radiation,6,'stacked harmful radiation is applied once per player turn after radioprotection');

raw.prepare('INSERT INTO named_artifacts VALUES(?,?,?,?,?,?)').run(101,'Именной тест',1,'1',Date.now(),JSON.stringify({'anomaly_Жарка':3,radiation:3}));
setup(0,1000,['Именной тест']);const routeNamed=call('/api/raid/anomaly/search');
assert.equal(delta1(routeNeutral.anomalyDmg,routeNamed.anomalyDmg),3,'named artifact +3 protection is applied from DB stats');
assert.equal(delta1(routeNeutral.radiationAdded,routeNamed.radiationAdded),3,'named artifact +3 radiation is applied from DB stats');

raw.prepare('INSERT INTO crafted_artifacts VALUES(?,?,?,?,?)').run('Гибрид тест',JSON.stringify({'anomaly_Жарка':-4,radiation:-2}),8,100,7);
setup(0,1000,['Гибрид тест']);const routeCrafted=call('/api/raid/anomaly/search');
assert.equal(delta1(routeCrafted.anomalyDmg,routeNeutral.anomalyDmg),4,'crafted artifact -4 protection adds exactly 4 HP damage');
assert.equal(delta1(routeCrafted.radiationAdded,routeNeutral.radiationAdded),2,'crafted artifact radiation -2 adds exactly 2 dose');

setup();let contaminated=state();contaminated.radiation=100;raw.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(contaminated),'1');
assert.equal(call('/api/raid/anomaly/search').died,false);
assert.equal(state().radiation,100);
call('/api/raid/anomaly/bypass');
contaminated=state();env.pveApplyConsumableServer(contaminated,{type:'antirad',radiationRemove:100});raw.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(contaminated),'1');
assert.equal(call('/api/raid/step').radiationDamage,0);
setup(3);const unchanged=JSON.stringify(state());assert.equal(call('/api/raid/anomaly/search').success,false);assert.equal(JSON.stringify(state()),unchanged);
setup(0,1);assert.equal(call('/api/raid/anomaly/search').died,true);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM raid_sessions').get().n,0);
console.log('PASS: stronger tiers 1–9; exact belt anomaly/radioprotection stats; harmful Radiation +N every turn; armor radioprotection; delayed radiation; antirad; no duplicate/dead search; travel -2/-2');
console.log(JSON.stringify({tier9:{ordinary:ordinary[0],research50:upgraded[0]},tiers:rows},null,2));
