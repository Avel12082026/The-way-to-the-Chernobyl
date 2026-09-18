const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function array(name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);');
  const m=html.match(re);assert(m,'missing '+name);return vm.runInNewContext(m[1],{});
}
const artifacts=array('artifacts'),anomalies=array('anomalies');
const ctx={
  artifacts,anomalies,
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
assert.equal(ctx.GameBalanceTuning.researchTier(99),0);
assert.equal(ctx.GameBalanceTuning.researchTier(100),4);
assert.equal(ctx.GameBalanceTuning.researchTier(140),5);
assert.equal(ctx.GameBalanceTuning.researchTier(500),14);
assert.equal(ctx.GameBalanceTuning.maxUpgradeLevel,50);
assert.equal(ctx.GameBalanceTuning.maxUpgradeBonusPct,.25);

const byName=new Map(artifacts.map(a=>[a.name,a]));
const tierStrength=new Map();
for(const anomaly of anomalies.filter(a=>a.tier>=1&&a.tier<=8)){
  const defs=anomaly.artifacts.map(n=>byName.get(n)).filter(Boolean).sort((a,b)=>a.price-b.price);
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
assert.match(html,/const\s+UPGRADE_MAX_LEVEL\s*=\s*50\s*;/);
assert.match(html,/const\s+UPGRADE_BYTE_THRESHOLD\s*=\s*25\s*;/);
assert.match(html,/const\s+UPGRADE_MAX_BONUS_PCT\s*=\s*0\.25\s*;/);
console.log('artifact tiers/rarity and +50 upgrade cap: OK');