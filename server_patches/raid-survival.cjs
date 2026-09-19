'use strict';
// Environmental balance. All values are calculated by the server, never by the client.
const VERSION='20260920.2';
const ANOMALY_KEYS=Object.freeze(['Жарка','Электра','Воронка','Кислотный туман','Карусель','Мясорубка','Печка','Плазменная сфера']);
// Direct HP damage grows sharply with anomaly tier. Tier 9 remains a separate end-game wall.
const DAMAGE=Object.freeze([0,10,16,24,34,46,60,76,94,230]);
const DOSE=Object.freeze([0,6,10,14,18,23,28,34,40,120]);
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const round=v=>Math.round(v*10)/10;

function reduction(defense,scale,cap){
  const d=finite(defense);
  // Armour/faction protection keeps diminishing returns. Signed belt-artifact effects
  // are applied separately below so +3 is exactly -3 damage and -3 is exactly +3.
  return d<0 ? 1+Math.min(2,-d/scale) : 1-Math.min(cap,d/(scale+d));
}
function environmentalUpgrades(upgrades){
  return clamp(Object.entries(upgrades||{}).reduce((n,[key,v])=>
    n+((key==='radiation'||key.startsWith('anomaly_'))?Math.max(0,Math.floor(finite(v))):0),0),0,50);
}
function anomalyValue(map,anomaly,tier){
  const src=map&&typeof map==='object'?map:{};
  let value=finite(src[anomaly.name]);
  if(tier===9){
    value+=ANOMALY_KEYS.reduce((n,key)=>n+finite(src[key]),0)/ANOMALY_KEYS.length;
  }
  return value;
}
function search(data,anomaly,gear={},rng=Math.random){
  const tier=clamp(Math.floor(finite(anomaly.tier,1)),1,9);
  const artifactScale=clamp(finite(gear.artifactDerivedScale,1),0,10);

  // serverRecomputeArtifactDerived stores armour + belt artifacts together. The
  // patcher also passes the raw belt values. Subtract the derived copy first,
  // then apply the raw belt value linearly, preserving the exact stat contract.
  const artifactAnomaly=anomalyValue(gear.artifactAnomaly,anomaly,tier);
  const combinedAnomaly=anomalyValue(data.anomalyResist,anomaly,tier);
  const explicitArmourAnomaly=gear.armourAnomaly&&typeof gear.armourAnomaly==='object';
  const armourAnomaly=explicitArmourAnomaly
    ? anomalyValue(gear.armourAnomaly,anomaly,tier)
    : combinedAnomaly-artifactAnomaly*artifactScale;

  const artifactRadiation=finite(gear.artifactRadiation);
  const explicitArmourRadiation=Object.prototype.hasOwnProperty.call(gear,'armourRadiation');
  const armourRadiation=explicitArmourRadiation
    ? finite(gear.armourRadiation)
    : finite(data.radiationResist)-artifactRadiation*artifactScale;

  const upgrades=environmentalUpgrades(gear.upgrades);
  const severe=tier===9;
  const cap=gear.adminSuit?0.995:!severe?0.95:
    gear.researchSuit&&upgrades>0?Math.min(0.75,0.15+0.012*upgrades):0.15;
  const scale=severe?40:20;
  const variation=()=>0.95+clamp(finite(rng(),0.5),0,1)*0.10;

  const armourAdjustedDamage=DAMAGE[tier]*variation()*reduction(armourAnomaly,scale,cap);
  const anomalyDmg=round(Math.max(0,armourAdjustedDamage-artifactAnomaly));

  const armourAdjustedDose=DOSE[tier]*variation()*reduction(armourRadiation,scale,cap);
  const radiationDose=round(Math.max(0,armourAdjustedDose-artifactRadiation));

  const oldRad=clamp(finite(data.radiation),0,100);
  data.radiation=round(clamp(oldRad+radiationDose,0,100));
  data.health=round(Math.max(0,finite(data.health)-anomalyDmg));
  // Reaching radiation 100 does NOT directly kill. Sickness is applied by the next
  // actual travel/combat turn after leaving the anomaly, allowing use of an antirad.
  return {
    anomalyDmg,
    radiationAdded:round(data.radiation-oldRad),
    radiationDose,
    searchDmg:0,
    artifactAnomaly,
    artifactRadiation
  };
}
function radiationDamage(data){
  const damage=round(clamp(finite(data.radiation),0,100)*0.15);
  data.health=round(Math.max(0,finite(data.health)-damage));
  return damage;
}
module.exports=Object.freeze({version:VERSION,travelCost:2,ANOMALY_KEYS,DAMAGE,DOSE,environmentalUpgrades,search,radiationDamage});
