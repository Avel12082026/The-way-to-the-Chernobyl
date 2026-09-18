const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');

function array(name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);');
  const m=html.match(re);assert(m,'missing '+name);
  return vm.runInNewContext(m[1],{});
}
function functionBlock(name){
  const start=html.indexOf('function '+name+'(');assert(start>=0,'missing '+name);
  const brace=html.indexOf('{',start);let depth=0,i=brace;
  for(;i<html.length;i++){
    if(html[i]==='{')depth++;
    else if(html[i]==='}'&&--depth===0)return html.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

const weapons=array('weapons'),armor=array('armorItems'),artifacts=array('artifacts'),anomalies=array('anomalies');
const adminWeapon=weapons.find(x=>x.name==='Убиваю взглядом');
const adminArmor=armor.find(x=>x.name==='Плащ тёмного сталкера');
const adminArtifact=artifacts.find(x=>x.name==='Сердце Зоны: Абсолют');
assert(adminWeapon?.adminOnly===true,'admin weapon must remain flagged adminOnly');
assert(adminArmor?.adminOnly===true,'admin armor must remain flagged adminOnly');
assert(adminArtifact?.adminOnly===true,'admin artifact must remain flagged adminOnly');

const ctx={
  weapons,armorItems:armor,artifacts,anomalies,window:{},
  document:{getElementById(){return null},createElement(){return{append(){},className:'',textContent:''}}},
  stripInvisibleSuffix:s=>s,console
};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('ui/balance-tuning.js','utf8'),ctx);
assert(!ctx.GameBalanceTuning.artifactModel.some(x=>x.name===adminArtifact.name),'admin artifact entered client rebalance');
assert(!ctx.GameBalanceTuning.researchPrices.some(x=>x.name===adminArmor.name),'admin armor entered research pricing');

const next=functionBlock('getNextItemCeiling');
assert(next.includes('!o.adminOnly'),'player gear ceiling must exclude admin equipment');

const server=fs.readFileSync('server_patches/quest-balance.cjs','utf8');
for(const required of [
  "(SHOP_WEAPONS||[]).filter(x=>!x.adminOnly)",
  "(SHOP_ARMOR||[]).filter(x=>!x.adminOnly)",
  "(SHOP_ARTIFACTS||[]).filter(a=>!a.adminOnly)",
  "filter(name=>artifactMeta.has(name))"
])assert(server.includes(required),'server admin exclusion missing: '+required);

const audit=fs.readFileSync('tools/audit_balance.cjs','utf8');
assert(audit.includes('adminExcluded')&&audit.includes('balanceArtifacts=report.artifacts.filter(x=>!x.adminOnly)'));
const live=fs.readFileSync('tools/audit_live_balance_readonly.py','utf8');
assert(/admin_gear\s*=\s*admin_weapons\s*\|\s*admin_armor/.test(live)&&live.includes("'adminExcluded'"));

console.log('administrator weapon/armor/artifact are excluded from all player balance pools: OK');
