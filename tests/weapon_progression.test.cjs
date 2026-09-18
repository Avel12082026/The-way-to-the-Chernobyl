'use strict';
const assert=require('node:assert/strict');
const data=require('../data/weapon-progression.json');
const install=require('../server_patches/weapon-progression.cjs');

assert.equal(data.entries.length,116);
assert.deepEqual(data.adminExcluded,['Убиваю взглядом']);
const cats=['pistol','shotgun','automatic','rifle'];
for(const cat of cats){
  const rows=data.entries.filter(x=>x.category===cat).sort((a,b)=>a.sequence-b.sequence);
  assert.equal(rows.length,29,cat);
  rows.forEach((x,i)=>assert.equal(x.sequence,i+1));
  for(let i=1;i<rows.length;i++){
    assert(rows[i].unlockLevel>rows[i-1].unlockLevel,cat+' unlock order');
    assert(rows[i].damage>rows[i-1].damage,cat+' damage order');
  }
}
const row=(cat,n)=>data.entries.find(x=>x.category===cat&&x.sequence===n);
assert.equal(row('pistol',1).unlockLevel,1);
assert.equal(row('pistol',14).unlockLevel,65);
assert.equal(row('shotgun',1).unlockLevel,65);
assert.equal(row('shotgun',14).unlockLevel,130);
assert.equal(row('automatic',1).unlockLevel,130);
assert.equal(row('automatic',14).unlockLevel,195);
assert.equal(row('rifle',1).unlockLevel,195);
assert.equal(row('rifle',29).unlockLevel,335);
assert(row('shotgun',1).damage>row('pistol',14).damage);
assert(row('automatic',1).damage>row('shotgun',14).damage);
assert(row('rifle',1).damage>row('automatic',14).damage);

const catalog=data.entries.map(x=>({
  name:x.name,tier:1,price:1,dmg:1,unlockLevel:999,adminOnly:false
}));
catalog.push({name:'Убиваю взглядом',tier:14,price:666000,dmg:6660,adminOnly:true});
const adminBefore=JSON.stringify(catalog.at(-1));
const mutants=[{name:'Тушкан',tier:0,hp:16,dmg:38},{name:'Псевдогигант',tier:28,hp:68685,dmg:129}];
const hp={},dmg={},mult={};
const routes={};
const app={get(path,fn){routes[path]=fn;}};
const api=install({app,SHOP_WEAPONS:catalog,PVE_MUTANTS:mutants,PVE_NPC_TIER_HP:hp,PVE_NPC_TIER_DMG:dmg,PVE_NPC_TIER_MULT:mult});
assert.equal(api.version,'2026-09-19-overlap-v1');
assert.equal(JSON.stringify(catalog.at(-1)),adminBefore,'admin weapon changed');
assert.equal(catalog.find(x=>x.name==='Beretta 21A Bobcat').dmg,row('pistol',1).damage);
assert.equal(catalog.find(x=>x.name==='Дробовик Сайга-410').unlockLevel,65);
assert.equal(api.available(1).length,1);
assert(api.combatPool(65).some(x=>x.name===row('shotgun',1).name));
assert.equal(hp[1],280);
assert.equal(hp[14],13300);
assert.equal(mult[14],1);
assert.equal(mutants[0].hp,160);
assert.equal(mutants[1].hp,Math.round(160+18*28*28));
assert.equal(api.effectiveDamage('Beretta 21A Bobcat +50'),Math.round(row('pistol',1).damage*1.25));
const res={json(v){this.body=v;return v;}};
routes['/api/weapon-progression/version']({},res);
assert.equal(res.body.success,true);
assert.equal(res.body.finalUnlockLevel,335);
console.log('weapon progression: 4x29 overlap, monotonic damage, admin exclusion and PvE curve OK');
