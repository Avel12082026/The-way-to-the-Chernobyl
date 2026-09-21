'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const m=html.match(/const weapons = (\[[\s\S]*?\n    \]);/);
assert(m,'weapons array missing');
const weapons=vm.runInNewContext(m[1],{});
assert.equal(weapons.length,117,'unexpected weapon roster');

const automatics=weapons.slice(0,29);
const rifles=weapons.slice(29,58);
const pistols=weapons.slice(58,87);
const shotguns=weapons.slice(87,116);
const admin=weapons[116];

for(const entry of Object.entries({automatics,rifles,pistols,shotguns})){
  const name=entry[0],group=entry[1];
  assert.equal(group.length,29,name+' must contain 29 weapons');
  assert(group.every(w=>!w.adminOnly),name+' contains admin weapon');
}

const byLevel=group=>new Map(group.map(w=>[Number(w.unlockLevel),w]));
const pm=byLevel(pistols),sm=byLevel(shotguns),am=byLevel(automatics),rm=byLevel(rifles);
const common=[...pm.keys()].filter(level=>sm.has(level)&&am.has(level)&&rm.has(level)).sort((a,b)=>a-b);
assert.equal(common.length,28,'expected 28 shared progression levels');
for(const level of common){
  const p=pm.get(level).dmg,s=sm.get(level).dmg,a=am.get(level).dmg,r=rm.get(level).dmg;
  assert(p<s && s<a && a<r,'damage class hierarchy broken at unlock '+level+': '+[p,s,a,r].join(','));
  assert.equal(s,Math.round(p*1.25),'shotgun multiplier at unlock '+level);
  assert.equal(a,Math.round(p*1.50),'automatic multiplier at unlock '+level);
  assert.equal(r,Math.round(p*1.75),'rifle multiplier at unlock '+level);
}
assert.equal(admin.name,'Убиваю взглядом');
assert.equal(admin.dmg,6660,'admin-only weapon must not be rebalanced');

assert(html.includes('WEAPON_CLASS_DAMAGE_V1'),'client balance marker missing');
assert(html.includes('function getWeaponDamageClass(list, item)'),'weapon class helper missing');
assert(html.includes('getWeaponDamageClass(list, o) === weaponClass'),'upgrade ceiling must stay inside weapon class');

console.log(JSON.stringify({
  status:'passed',
  unlock20:{pistol:pm.get(20).dmg,shotgun:sm.get(20).dmg,automatic:am.get(20).dmg,rifle:rm.get(20).dmg},
  unlock580:{pistol:pm.get(580).dmg,shotgun:sm.get(580).dmg,automatic:am.get(580).dmg,rifle:rm.get(580).dmg}
},null,2));
