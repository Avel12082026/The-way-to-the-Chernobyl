'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');

function array(name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);');
  const m=html.match(re);assert(m,'missing '+name);
  return vm.runInNewContext(m[1],{});
}
const rawWeapons=array('weapons').filter(w=>!w.adminOnly);
const armor=array('armorItems').filter(a=>!a.adminOnly&&!a.isResearchSuit&&Number.isFinite(Number(a.unlockLevel)));
const artifacts=array('artifacts').filter(a=>!a.adminOnly&&Number(a.tier)<=8);
const mutants=array('mutants').filter(m=>!m.adminOnly);
assert.equal(rawWeapons.length,116);
assert(armor.length&&artifacts.length&&mutants.length);

const automatics=rawWeapons.slice(0,29);
const rifles=rawWeapons.slice(29,58);
const pistols=rawWeapons.slice(58,87);
const shotguns=rawWeapons.slice(87,116);
const weapons=[...pistols,...shotguns,...automatics,...rifles];
weapons.forEach((w,i)=>{w.unlockLevel=1+i*3;w.progressionIndex=i;});

const NPC_HP={1:240,2:480,3:690,4:1095,5:1720,6:2685,7:4160,8:6420,9:9250,10:13310,11:19170,12:27600,13:39750,14:57240};
const NPC_DMG={1:28,2:45,3:46,4:47,5:50,6:53,7:56,8:60,9:72,10:84,11:95,12:106,13:117,14:129};

function bestUnlocked(list,level,stat){
  let pool=list.filter(x=>Number(x.unlockLevel)<=level);
  if(!pool.length)pool=[...list].sort((a,b)=>a.unlockLevel-b.unlockLevel).slice(0,1);
  return pool.reduce((a,b)=>(Number(b[stat])||0)>(Number(a[stat])||0)?b:a);
}
function maxPlayerStat(base){return Math.round((Number(base)||0)*1.25);}
function damageAfterDefense(raw,defense){return Number(raw)*100/(100+Math.max(0,Number(defense)||0));}
function rawForNet(net,defense){return Math.max(1,Math.round(net*(100+Math.max(0,defense))/100));}
function topSixPositive(stat){
  return artifacts.map(a=>Math.max(0,Number(a.stats&&a.stats[stat])||0)).sort((a,b)=>b-a).slice(0,6).reduce((n,x)=>n+x,0);
}
const artifactStress={
  health:topSixPositive('health'),
  bulletResist:topSixPositive('bulletResist'),
  hitAbsorption:topSixPositive('hitAbsorption')
};

function npcTargetShots(tier){return Math.min(10,7+Math.floor((tier-1)/4));}
function mutantTargetShots(tier){return Math.min(11,6+Math.floor(Math.max(0,tier)/5));}
function npcSurvivalHits(tier){return Math.max(4.2,5.8-(tier-1)*0.12);}
function mutantSurvivalHits(tier){return Math.max(4.0,6.0-Math.max(0,tier)*0.07);}

const rows=[];
let minMutantHits=Infinity,maxMutantHits=0,minNpcHits=Infinity,maxNpcHits=0;
let minNpcSurvival=Infinity,maxNpcSurvival=0,minMutantSurvival=Infinity,maxMutantSurvival=0;

for(let level=1;level<=600;level++){
  const weapon=bestUnlocked(weapons,level,'dmg');
  const armorItem=bestUnlocked(armor,level,'hitAbsorption');
  const playerDamage=maxPlayerStat(weapon.dmg);
  const maxHealth=Math.max(100,100+artifactStress.health);
  const hitAbsorption=maxPlayerStat(armorItem.hitAbsorption||0)+artifactStress.hitAbsorption;
  const bulletResist=maxPlayerStat(armorItem.armor||0)+artifactStress.bulletResist;

  const mutantTier=Math.min(Math.max(...mutants.map(m=>Number(m.tier)||0)),1+Math.floor(level/20));
  const mutantPool=mutantTier===1
    ?mutants.filter(m=>[0,1].includes(Number(m.tier)||0))
    :mutants.filter(m=>Number(m.tier)===mutantTier);
  if(mutantPool.length){
    for(const m of mutantPool){
      const tier=Math.max(0,Number(m.tier)||0);
      const hp=Math.max(Number(m.hp)||1,playerDamage*mutantTargetShots(tier));
      const raw=Math.max(Number(m.dmg)||1,rawForNet(maxHealth/mutantSurvivalHits(tier),hitAbsorption));
      const hits=Math.ceil(hp/playerDamage);
      const survival=maxHealth/damageAfterDefense(raw,hitAbsorption);
      minMutantHits=Math.min(minMutantHits,hits);maxMutantHits=Math.max(maxMutantHits,hits);
      minMutantSurvival=Math.min(minMutantSurvival,survival);maxMutantSurvival=Math.max(maxMutantSurvival,survival);
    }
  }

  const npcTier=Math.min(14,1+Math.floor(level/40));
  const npcHp=Math.max(NPC_HP[npcTier],playerDamage*npcTargetShots(npcTier));
  const npcRaw=Math.max(NPC_DMG[npcTier],rawForNet(maxHealth/npcSurvivalHits(npcTier),bulletResist));
  const npcHits=Math.ceil(npcHp/playerDamage);
  const npcSurvival=maxHealth/damageAfterDefense(npcRaw,bulletResist);
  minNpcHits=Math.min(minNpcHits,npcHits);maxNpcHits=Math.max(maxNpcHits,npcHits);
  minNpcSurvival=Math.min(minNpcSurvival,npcSurvival);maxNpcSurvival=Math.max(maxNpcSurvival,npcSurvival);

  if([1,40,80,120,160,200,240,280,320,360,400,440,480,520,560,600].includes(level)){
    rows.push({
      level,weapon:weapon.name,weaponDamage:playerDamage,armor:armorItem.name,
      stressArtifacts:artifactStress,npcTier,npcHits,
      npcPlayerHitsToDeath:+npcSurvival.toFixed(2),
      mutantTier,
      mutantHits:mutantPool.length?Math.min(...mutantPool.map(m=>{
        const tier=Math.max(0,Number(m.tier)||0);
        return Math.ceil(Math.max(Number(m.hp)||1,playerDamage*mutantTargetShots(tier))/playerDamage);
      })):null
    });
  }
}

assert(minNpcHits>=7&&maxNpcHits<=10,'NPC target shots left 7..10 range');
assert(minMutantHits>=6&&maxMutantHits<=11,'mutant target shots left 6..11 range');
assert(minNpcSurvival>=3.7&&maxNpcSurvival<=6.2,'NPC damage no longer challenges armored/artifact player');
assert(minMutantSurvival>=3.6&&maxMutantSurvival<=6.4,'mutant damage no longer challenges armored/artifact player');

const report={
  scope:'adaptive PvE with ordinary +50 gear and a six-artifact defensive stress set',
  upgradeModel:{maxLevel:50,maxBonusPct:25},
  artifactStress,
  mutant:{hitsToKill:[minMutantHits,maxMutantHits],playerHitsToDeath:[+minMutantSurvival.toFixed(2),+maxMutantSurvival.toFixed(2)]},
  npc:{hitsToKill:[minNpcHits,maxNpcHits],playerHitsToDeath:[+minNpcSurvival.toFixed(2),+maxNpcSurvival.toFixed(2)]},
  milestones:rows
};
fs.writeFileSync('pve-balance-simulation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
