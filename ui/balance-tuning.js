(() => {
'use strict';
if (window.GameBalanceTuning) return;

const CATCH_MIN=2;
const CATCH_MAX=18;

const RESEARCH_UNLOCKS=[[4,135],[5,175],[6,220],[7,265],[8,305],[9,350],[10,395],[11,440],[12,480],[13,525],[14,570]];
function researchTier(level){
  const lv=Math.max(1,Number(level)||1);
  let tier=0;
  for(const [value,required] of RESEARCH_UNLOCKS)if(lv>=required)tier=value;
  return tier;
}
function rebalanceResearchPrices(){
  if(typeof armorItems==='undefined')return [];
  const normal=armorItems.filter(a=>!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit);
  const changed=[];
  for(const suit of armorItems.filter(a=>a.isResearchSuit&&!a.adminOnly)){
    const same=normal.filter(a=>Number(a.tier)===Number(suit.tier));
    if(!same.length)continue;
    const floor=Math.min(...same.map(a=>Number(a.price)||Infinity));
    const price=Math.round(floor*1.10);
    suit.price=price;changed.push({name:suit.name,tier:suit.tier,price});
  }
  return changed;
}

function rebalanceArtifacts(){
  if(typeof artifacts==='undefined'||typeof anomalies==='undefined')return [];
  const records=[];
  // Administrator-only artifacts never participate in rarity/stat balancing.
  const byName=new Map(artifacts.filter(a=>!a.adminOnly).map(a=>[a.name,a]));
  for(const anomaly of anomalies){
    const tier=Number(anomaly.tier)||0;
    if(tier<1||tier>8||!Array.isArray(anomaly.artifacts))continue; // named tier-9 anomalies stay untouched
    const defs=anomaly.artifacts.map(name=>byName.get(name)).filter(Boolean);
    const ranked=[...defs].sort((a,b)=>(Number(a.price)||0)-(Number(b.price)||0)||String(a.name).localeCompare(String(b.name),'ru'));
    const n=ranked.length;
    ranked.forEach((def,rank)=>{
      const rarity=n<=1?0:rank/(n-1); // 0 common -> 1 rare
      const weight=Math.round(CATCH_MAX-(CATCH_MAX-CATCH_MIN)*rarity);
      const posBase=2.5*tier+1.5;
      const negBase=1.2*tier+1;
      const pos=Math.max(1,Math.round(posBase*(0.90+0.25*rarity)));
      const neg=Math.max(1,Math.ceil(negBase*(1.20-0.50*rarity)));
      const stats={};
      for(const [key,value] of Object.entries(def.stats||{})){
        const num=Number(value)||0;
        if(num>0)stats[key]=pos;
        else if(num<0)stats[key]=-neg;
        else stats[key]=0;
      }
      def.stats=stats;
      def.catchWeight=weight;
      def.rarityRank=rank+1;
      def.rarityCount=n;
      records.push({name:def.name,tier,anomaly:anomaly.name,weight,rank:rank+1,count:n});
    });
    const sum=ranked.reduce((total,d)=>total+(Number(d.catchWeight)||1),0);
    ranked.forEach(def=>{def.catchChancePercent=Math.round((Number(def.catchWeight)||1)/sum*1000)/10;});
  }
  return records;
}

const artifactModel=rebalanceArtifacts();
const researchPrices=rebalanceResearchPrices();

// Replace only the research-suit availability gate. Normal armor progression is preserved.
try{window.getResearchSuitUnlockTier=researchTier;}catch(_){}

const nativeInfo=window.showItemInfoModal;
if(typeof nativeInfo==='function'){
  window.showItemInfoModal=function(name){
    const result=nativeInfo.apply(this,arguments);
    try{
      const clean=typeof stripInvisibleSuffix==='function'?stripInvisibleSuffix(name):String(name||'').replace(/[\u200B\u200C]+$/,'');
      const def=typeof artifacts!=='undefined'?artifacts.find(a=>a.name===clean):null;
      if(def&&!def.adminOnly&&Number(def.tier)<=8&&Number.isFinite(Number(def.catchChancePercent))){
        const body=document.getElementById('itemInfoModalBody');
        if(body&&!body.querySelector('.artifact-catch-chance')){
          const line=document.createElement('div');
          line.className='artifact-catch-chance';
          line.textContent=`Шанс среди находок этой аномалии: ${def.catchChancePercent}%`;
          body.append(line);
        }
      }
    }catch(_){}
    return result;
  };
}

window.GameBalanceTuning=Object.freeze({
  version:'1.0.0',
  maxUpgradeLevel:50,
  maxUpgradeBonusPct:0.25,
  byteUpgradeThreshold:25,
  researchTier,
  researchPrices,
  artifactModel
});
})();