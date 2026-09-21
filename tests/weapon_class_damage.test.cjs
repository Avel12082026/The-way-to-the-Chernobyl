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

for(let i=0;i<29;i++){
  const p=pistols[i].dmg,s=shotguns[i].dmg,a=automatics[i].dmg,r=rifles[i].dmg;
  assert(p<s && s<a && a<r,'damage class hierarchy broken at rung '+(i+1)+': '+[p,s,a,r].join(','));
  assert.equal(s,Math.round(p*1.25),'shotgun multiplier rung '+(i+1));
  assert.equal(a,Math.round(p*1.50),'automatic multiplier rung '+(i+1));
  assert.equal(r,Math.round(p*1.75),'rifle multiplier rung '+(i+1));
}
assert.equal(admin.name,'Убиваю взглядом');
assert.equal(admin.dmg,6660,'admin-only weapon must not be rebalanced');

assert(html.includes('WEAPON_CLASS_DAMAGE_V1'),'client balance marker missing');
assert(html.includes('function getWeaponDamageClass(list, item)'),'weapon class helper missing');
assert(html.includes('getWeaponDamageClass(list, o) === weaponClass'),'upgrade ceiling must stay inside weapon class');

console.log(JSON.stringify({
  status:'passed',
  first:{pistol:pistols[0].dmg,shotgun:shotguns[0].dmg,automatic:automatics[0].dmg,rifle:rifles[0].dmg},
  last:{pistol:pistols[28].dmg,shotgun:shotguns[28].dmg,automatic:automatics[28].dmg,rifle:rifles[28].dmg}
},null,2));
