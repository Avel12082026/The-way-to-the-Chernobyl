const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function array(name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);');
  const m=html.match(re);assert(m,'missing '+name);return vm.runInNewContext(m[1],{});
}
const artifacts=array('artifacts'),anomalies=array('anomalies'),armorItems=array('armorItems');
const ctx={
  artifacts,anomalies,armorItems,
  window:{},
  document:{getElementById(){return null},createElement(){return{append(){},className:'',textContent:''}}},
  stripInvisibleSuffix:s=>s,console
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('ui/balance-tuning.js','utf8'),ctx);
const model=ctx.GameBalanceTuning.artifactModel;
assert(model.length>=70,'expected regular artifact model');
assert(model.every(x=>x.tier>=1&&x.tier<=8),'tier-9 named artifacts must stay outside rebalance');
const balancedNames=new Set(model.map(x=>x.name));
for(const admin of artifacts.filter(a=>a.adminOnly))assert(!balancedNames.has(admin.name),'admin artifact entered balance model: '+admin.name);
for(const level of [1,134,135,174,175,569,570]) assert.equal(ctx.GameBalanceTuning.researchTier(level),14,'research suits are money-gated, not level-gated');
assert.equal(ctx.GameBalanceTuning.maxUpgradeLevel,100);
assert.equal(ctx.GameBalanceTuning.flatUpgradePerPoint,1);
assert.equal(ctx.GameBalanceTuning.maxUpgradeBonusPct,null);
assert.equal(ctx.GameBalanceTuning.byteUpgradeThreshold,50);

const researchPrices=ctx.GameBalanceTuning.researchPrices;
assert.equal(researchPrices.length,11);
for(const row of researchPrices){
  const same=armorItems.filter(a=>!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit&&Number(a.tier)===Number(row.tier));
  assert(same.length,'normal armor tier '+row.tier);
  const floor=Math.min(...same.map(a=>Number(a.price)));
  assert.equal(row.price,Math.round(floor*1.10),'research price tier '+row.tier);
}

const byName=new Map(artifacts.map(a=>[a.name,a]));
const tierStrength=new Map();
for(const anomaly of anomalies.filter(a=>a.tier>=1&&a.tier<=8)){
  const defs=anomaly.artifacts.map(n=>byName.get(n)).filter(a=>a&&!a.adminOnly).sort((a,b)=>a.price-b.price);
  assert(defs.length>=8,anomaly.name);
  for(let i=1;i<defs.length;i++){
    assert(defs[i].catchChancePercent<=defs[i-1].catchChancePercent+1e-9,anomaly.name+' chance');
    const positives=o=>Object.values(o.stats).filter(v=>v>0);
    const negatives=o=>Object.values(o.stats).filter(v=>v<0).map(Math.abs);
    assert(Math.max(...positives(defs[i]))>=Math.max(...positives(defs[i-1])),anomaly.name+' positive rarity');
    assert(Math.max(...negatives(defs[i]))<=Math.max(...negatives(defs[i-1])),anomaly.name+' drawback rarity');
  }
  tierStrength.set(anomaly.tier,Math.max(...Object.values(defs.at(-1).stats).filter(v=>v>0)));
}
for(let t=2;t<=8;t++)assert(tierStrength.get(t)>tierStrength.get(t-1),'tier '+t+' should improve smoothly');
assert.match(html,/const\s+UPGRADE_MAX_LEVEL\s*=\s*100\s*;/);
assert.match(html,/const\s+UPGRADE_BYTE_THRESHOLD\s*=\s*50\s*;/);
assert(!/UPGRADE_MAX_BONUS_PCT\s*=/.test(html),'percentage upgrade curve must be gone');
assert(html.includes('UPGRADE_FLAT_100_V1'));
console.log('artifact tiers/rarity and flat +100 upgrade budget: OK');