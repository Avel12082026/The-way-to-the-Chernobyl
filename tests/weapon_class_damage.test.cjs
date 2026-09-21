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

for(const [name,group] of Object.entries({automatics,rifles,pistols,shotguns})){
  assert.equal(group.length,29,name+' must contain 29 weapons');
  assert(group.every(w=>!w.adminOnly),name+' contains admin weapon');
}

const progression=[...pistols,...shotguns,...automatics,...rifles];
assert.equal(progression.length,116);
for(let i=0;i<progression.length;i++){
  const expected=Math.round(80*Math.pow(1.05,i));
  assert.equal(progression[i].dmg,expected,'damage progression index '+i);
  if(i>0)assert(progression[i].dmg>progression[i-1].dmg,'damage must strictly increase at '+i);
}
assert(Math.max(...pistols.map(w=>w.dmg))<Math.min(...shotguns.map(w=>w.dmg)),'pistols must be below shotguns');
assert(Math.max(...shotguns.map(w=>w.dmg))<Math.min(...automatics.map(w=>w.dmg)),'shotguns must be below automatics');
assert(Math.max(...automatics.map(w=>w.dmg))<Math.min(...rifles.map(w=>w.dmg)),'automatics must be below rifles');

assert.equal(admin.name,'Убиваю взглядом');
assert.equal(admin.dmg,6660,'admin-only weapon must not be rebalanced');

assert(html.includes('WEAPON_CLASS_DAMAGE_V1'),'client balance marker missing');
assert(html.includes('function getWeaponDamageClass(list, item)'),'weapon class helper missing');
assert(html.includes('if (item.progressionClass) return String(item.progressionClass);'),'weapon class helper must use progression class');
assert(html.includes('getWeaponDamageClass(list, o) === weaponClass'),'upgrade ceiling must stay inside weapon class');

const range=group=>({min:group[0].dmg,max:group.at(-1).dmg});
console.log(JSON.stringify({
  status:'passed',
  pistol:range(pistols),
  shotgun:range(shotguns),
  automatic:range(automatics),
  rifle:range(rifles)
},null,2));
