const assert=require('node:assert/strict'),fs=require('node:fs');
const data=require('../images/combat/fighters.js').data;
const automaticIds=[11,12,37,21,26,17,38,45,57,69,67,43,16,15,25,18,10,63,51,75,61,59,71,77,22,29,53,47,65];
const source=fs.readFileSync(__dirname+'/../index.html','utf8');
const catalog=source.match(/const weapons\s*=\s*\[([\s\S]*?)\n\s*\];/);
assert.ok(catalog,'Game weapon catalog not found');
const entries=[...catalog[1].matchAll(/\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)"/g)].map(m=>({id:Number(m[1]),name:m[2]}));
assert.deepEqual(entries.slice(0,29).map(w=>w.id),automaticIds,'Supported automatics must exactly match the first 29 game catalog entries, in order');
for(const item of entries.slice(0,29)){
  const weapon=data.weapons[item.id];
  assert.ok(weapon,'Automatic missing from runtime: '+item.id);
  assert.equal(weapon.name,item.name,'Runtime automatic name disagrees with game catalog');
  assert.equal(weapon.pose,'heavy');
}
assert.equal(new Set(automaticIds).size,29);
console.log('PASS: exact 29 automatic catalog IDs, names and heavy poses');
