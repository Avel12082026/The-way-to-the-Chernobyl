'use strict';
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
function array(name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);');
  const m=html.match(re);
  if(!m) throw new Error('missing array '+name);
  return vm.runInNewContext(m[1],{});
}
function fn(name){
  const start=html.indexOf('function '+name+'(');
  if(start<0)return null;
  let brace=html.indexOf('{',start),depth=0,i=brace;
  for(;i<html.length;i++){
    if(html[i]==='{')depth++;
    else if(html[i]==='}'&&--depth===0){i++;break;}
  }
  return html.slice(start,i);
}
const names=['weapons','armorItems','artifacts','anomalies','mutants','detectors'];
const data={};
for(const n of names){try{data[n]=array(n)}catch(e){data[n]={error:e.message}}}
const functions={};
for(const n of ['getResearchSuitUnlockTier','getDetectorUnlockTier','getUpgradedStat','getNextItemCeiling','getUpgradeCostBytes','getUpgradeCostTokens','getPlayerTier','battleAction','startBattle','searchForArtifact','resolveAnomalySearchResult'])functions[n]=fn(n);
const pick=(o,ks)=>Object.fromEntries(ks.filter(k=>o&&Object.hasOwn(o,k)).map(k=>[k,o[k]]));
const report={
 counts:Object.fromEntries(names.map(n=>[n,Array.isArray(data[n])?data[n].length:data[n]])),
 weapons:Array.isArray(data.weapons)?data.weapons.map(x=>pick(x,['id','name','tier','dmg','price','unlockLevel','adminOnly'])):[],
 armor:Array.isArray(data.armorItems)?data.armorItems.map(x=>pick(x,['id','name','tier','armor','hitAbsorption','price','unlockLevel','isResearchSuit','isPremiumArmor','stats'])):[],
 artifacts:Array.isArray(data.artifacts)?data.artifacts.map(x=>pick(x,['id','name','tier','price','chance','rarity','type','stats','anomalyType','adminOnly'])):[],
 anomalies:Array.isArray(data.anomalies)?data.anomalies.map(x=>pick(x,['id','name','tier','type','artifactType','artifacts','chance','searchChance'])):[],
 mutants:Array.isArray(data.mutants)?data.mutants.map(x=>pick(x,['id','name','tier','hp','maxHp','health','damage','dmg','loot','chance','exp','reward'])):[],
 functions
};
const research=report.armor.filter(x=>x.isResearchSuit);
const normals=report.armor.filter(x=>!x.isResearchSuit&&!x.adminOnly&&!x.isPremiumArmor);
report.summary={
 researchSuits:research,
 normalArmorByUnlock:normals.sort((a,b)=>(a.unlockLevel??999)-(b.unlockLevel??999)).slice(0,40),
 weaponByUnlock:report.weapons.filter(x=>!x.adminOnly).sort((a,b)=>(a.unlockLevel??999)-(b.unlockLevel??999)),
 mutantByTier:report.mutants.filter(x=>!String(x.name||'').startsWith('Самка ')).sort((a,b)=>(a.tier??0)-(b.tier??0))
};
fs.writeFileSync('balance-audit.json',JSON.stringify(report,null,2));
console.log('BALANCE_AUDIT_START');
console.log(JSON.stringify(report.summary,null,2));
console.log('FUNCTIONS_START');
for(const [k,v] of Object.entries(functions))console.log('\n### '+k+'\n'+(v||'MISSING'));
console.log('BALANCE_AUDIT_END');
