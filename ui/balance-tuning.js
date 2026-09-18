(() => {
'use strict';
if (window.GameBalanceTuning) return;

const CATCH_MIN=2;
const CATCH_MAX=18;

function researchTier(level){
  const lv=Math.max(1,Number(level)||1);
  if(lv<100)return 0;
  return Math.min(14,4+Math.floor((lv-100)/40));
}

function rebalanceArtifacts(){
  if(typeof artifacts==='undefined'||typeof anomalies==='undefined')return [];
  const records=[];
  const byName=new Map(artifacts.map(a=>[a.name,a]));
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
      const neg=Math.max(1,Math.round(negBase*(1.05-0.35*rarity)));
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

// Replace only the research-suit availability gate. Normal armor progression is preserved.
try{window.getResearchSuitUnlockTier=researchTier;}catch(_){}

const nativeInfo=window.showItemInfoModal;
if(typeof nativeInfo==='function'){
  window.showItemInfoModal=function(name){
    const result=nativeInfo.apply(this,arguments);
    try{
      const clean=typeof stripInvisibleSuffix==='function'?stripInvisibleSuffix(name):String(name||'').replace(/[\u200B\u200C]+$/,'');
      const def=typeof artifacts!=='undefined'?artifacts.find(a=>a.name===clean):null;
      if(def&&Number(def.tier)<=8&&Number.isFinite(Number(def.catchChancePercent))){
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
  artifactModel
});
})();