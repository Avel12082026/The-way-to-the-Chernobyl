'use strict';
// Environmental balance. All values are calculated by the server, never by the client.
const VERSION='20260920.1';
const ANOMALY_KEYS=Object.freeze(['Жарка','Электра','Воронка','Кислотный туман','Карусель','Мясорубка','Печка','Плазменная сфера']);
const DAMAGE=Object.freeze([0,6,10,15,22,30,40,52,66,180]);
const DOSE=Object.freeze([0,6,10,14,18,23,28,34,40,120]);
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const round=v=>Math.round(v*10)/10;
function reduction(defense,scale,cap){
  const d=finite(defense);
  // Negative protection remains harmful; no singularities and no accidental immunity.
  return d<0 ? 1+Math.min(2,-d/scale) : 1-Math.min(cap,d/(scale+d));
}
function environmentalUpgrades(upgrades){
  return clamp(Object.entries(upgrades||{}).reduce((n,[key,v])=>
    n+((key==='radiation'||key.startsWith('anomaly_'))?Math.max(0,Math.floor(finite(v))):0),0),0,50);
}
function search(data,anomaly,gear={},rng=Math.random){
  const tier=clamp(Math.floor(finite(anomaly.tier,1)),1,9);
  const resist=data.anomalyResist||{};
  let defense=finite(resist[anomaly.name]);
  if(tier===9){
    // Named anomalies have no matching ordinary upgrade keys. They use a composite
    // of the eight actual environmental protections, rather than ignoring the suit.
    defense+=ANOMALY_KEYS.reduce((n,key)=>n+finite(resist[key]),0)/ANOMALY_KEYS.length;
  }
  const upgrades=environmentalUpgrades(gear.upgrades);
  const severe=tier===9;
  // Tier 9 overwhelms ordinary/unmodified suits. Environmental upgrades of research
  // suits lift the mitigation cap gradually; bullet/impact upgrades do not qualify.
  const cap=gear.adminSuit?0.995:!severe?0.95:
    gear.researchSuit&&upgrades>0?Math.min(0.75,0.15+0.012*upgrades):0.15;
  const scale=severe?40:20;
  const variation=()=>0.95+clamp(finite(rng(),0.5),0,1)*0.10;
  const anomalyDmg=round(Math.max(0.1,DAMAGE[tier]*variation()*reduction(defense,scale,cap)));
  const radiationDose=round(Math.max(0,DOSE[tier]*variation()*reduction(data.radiationResist,scale,cap)));
  const oldRad=clamp(finite(data.radiation),0,100);
  data.radiation=round(clamp(oldRad+radiationDose,0,100));
  data.health=round(Math.max(0,finite(data.health)-anomalyDmg));
  // Reaching radiation 100 does NOT directly kill. Sickness is applied by the next
  // actual travel/combat turn after leaving the anomaly, allowing use of an antirad.
  return {anomalyDmg,radiationAdded:round(data.radiation-oldRad),radiationDose,searchDmg:0};
}
function radiationDamage(data){
  const damage=round(clamp(finite(data.radiation),0,100)*0.15);
  data.health=round(Math.max(0,finite(data.health)-damage));
  return damage;
}
module.exports=Object.freeze({version:VERSION,travelCost:2,ANOMALY_KEYS,DAMAGE,DOSE,environmentalUpgrades,search,radiationDamage});
