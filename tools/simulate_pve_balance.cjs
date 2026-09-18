'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');

function array(name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);');
  const m=html.match(re);assert(m,'missing '+name);
  return vm.runInNewContext(m[1],{});
}
const weapons=array('weapons').filter(w=>!w.adminOnly&&Number.isFinite(Number(w.unlockLevel)));
const armor=array('armorItems').filter(a=>!a.adminOnly&&!a.isResearchSuit&&Number.isFinite(Number(a.unlockLevel)));
const mutants=array('mutants').filter(m=>!m.adminOnly);
assert(weapons.length&&armor.length&&mutants.length);

const NPC_HP={1:240,2:480,3:690,4:1095,5:1720,6:2685,7:4160,8:6420,9:9250,10:13310,11:19170,12:27600,13:39750,14:57240};
const NPC_DMG={1:28,2:45,3:46,4:47,5:50,6:53,7:56,8:60,9:72,10:84,11:95,12:106,13:117,14:129};
const NPC_MULT={1:1.00,2:0.97,3:1.05,4:1.08,5:1.14,6:1.05,7:0.97,8:0.86,9:0.86,10:0.72,11:0.76,12:0.87,13:0.78,14:0.84};

function bestUnlocked(list,level,stat){
  let pool=list.filter(x=>Number(x.unlockLevel)<=level);
  if(!pool.length)pool=[...list].sort((a,b)=>a.unlockLevel-b.unlockLevel).slice(0,1);
  return pool.reduce((a,b)=>(Number(b[stat])||0)>(Number(a[stat])||0)?b:a);
}
function maxPlayerStat(base){return Math.round((Number(base)||0)*1.25);}
function mutantHp(m){
  const tier=Number(m.tier)||0;
  const floor=tier<=0?160:tier<=1?240:tier<=3?420:0;
  return Math.max(Number(m.hp)||1,floor);
}
function damageAfterDefense(raw,defense){
  return Number(raw)*100/(100+Math.max(0,Number(defense)||0));
}

const rows=[];
let minMutantHits=Infinity,maxMutantHits=0,minNpcHits=Infinity,maxNpcHits=0;
let minMutantIncoming=Infinity,maxMutantIncoming=0,minNpcIncoming=Infinity,maxNpcIncoming=0;
for(let level=1;level<=600;level++){
  const weapon=bestUnlocked(weapons,level,'dmg');
  const armorItem=bestUnlocked(armor,level,'hitAbsorption');
  const playerDamage=maxPlayerStat(weapon.dmg);
  const hitAbsorption=maxPlayerStat(armorItem.hitAbsorption||0);
  const bulletResist=maxPlayerStat(armorItem.armor||0);

  const mutantTier=Math.min(Math.max(...mutants.map(m=>Number(m.tier)||0)),1+Math.floor(level/20));
  const mutantPool=mutantTier===1
    ?mutants.filter(m=>[0,1].includes(Number(m.tier)||0))
    :mutants.filter(m=>Number(m.tier)===mutantTier);
  if(mutantPool.length){
    const minHp=Math.min(...mutantPool.map(mutantHp));
    const maxRaw=Math.max(...mutantPool.map(m=>Number(m.dmg)||0));
    const hits=Math.ceil(minHp/playerDamage);
    const incoming=damageAfterDefense(maxRaw,hitAbsorption);
    minMutantHits=Math.min(minMutantHits,hits);maxMutantHits=Math.max(maxMutantHits,hits);
    minMutantIncoming=Math.min(minMutantIncoming,incoming);maxMutantIncoming=Math.max(maxMutantIncoming,incoming);
  }

  const npcTier=Math.min(14,1+Math.floor(level/40));
  const npcHits=Math.ceil(NPC_HP[npcTier]/playerDamage);
  const npcIncoming=damageAfterDefense(NPC_DMG[npcTier]*NPC_MULT[npcTier],bulletResist);
  minNpcHits=Math.min(minNpcHits,npcHits);maxNpcHits=Math.max(maxNpcHits,npcHits);
  minNpcIncoming=Math.min(minNpcIncoming,npcIncoming);maxNpcIncoming=Math.max(maxNpcIncoming,npcIncoming);

  if([1,20,40,80,120,160,200,240,280,320,360,400,440,480,520,560,580].includes(level)){
    rows.push({level,weapon:weapon.name,weaponDamage:playerDamage,armor:armorItem.name,
      mutantTier,mutantHits:mutantPool.length?Math.ceil(Math.min(...mutantPool.map(mutantHp))/playerDamage):null,
      npcTier,npcHits});
  }
}

const adminWeapons=array('weapons').filter(w=>w.adminOnly);
const adminArmor=array('armorItems').filter(a=>a.adminOnly);
const adminArtifacts=array('artifacts').filter(a=>a.adminOnly);
assert(adminWeapons.length>0&&adminArmor.length>0&&adminArtifacts.length>0,'expected admin fixtures');
assert(weapons.every(w=>!w.adminOnly)&&armor.every(a=>!a.adminOnly),'administrator equipment entered simulation');

// Ordinary +50 gear should make fights deliberate without creating giant health inflation.
assert(minMutantHits>=2,'an ordinary fully upgraded weapon can one-shot a normal raid mutant');
assert(maxMutantHits<=8,'mutant fights became excessively spongy');
assert(minNpcHits>=2,'an ordinary fully upgraded weapon can one-shot a normal NPC');
assert(maxNpcHits<=8,'NPC fights became excessively spongy');
assert(minMutantIncoming>=20,'mutants became harmless against the best ordinary armor');
assert(minNpcIncoming>=20,'NPCs became harmless against the best ordinary armor');
assert(maxMutantIncoming<=80&&maxNpcIncoming<=80,'incoming PvE damage is too bursty for the ordinary armor curve');

const report={
  scope:'ordinary player balance only; administrator items excluded',
  upgradeModel:{maxLevel:50,maxBonusPct:25},
  mutant:{hitsToKill:[minMutantHits,maxMutantHits],incomingDamageAgainstBestArmor:[+minMutantIncoming.toFixed(1),+maxMutantIncoming.toFixed(1)]},
  npc:{hitsToKill:[minNpcHits,maxNpcHits],incomingDamageAgainstBestArmor:[+minNpcIncoming.toFixed(1),+maxNpcIncoming.toFixed(1)]},
  adminExcluded:{weapons:adminWeapons.map(x=>x.name),armor:adminArmor.map(x=>x.name),artifacts:adminArtifacts.map(x=>x.name)},
  milestones:rows
};
fs.writeFileSync('pve-balance-simulation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
