const assert=require('node:assert/strict'),fs=require('node:fs');
const data=require('../images/combat/fighters.js').data;
const rifleIds=[14,46,42,13,24,23,28,36,30,40,31,27,70,76,39,60,48,64,33,35,66,52,58,49,54,72,78,73,55];
const source=fs.readFileSync(__dirname+'/../index.html','utf8');
const catalog=source.match(/const weapons\s*=\s*\[([\s\S]*?)\n\s*\];/);
assert.ok(catalog,'Game weapon catalog not found');
const entries=[...catalog[1].matchAll(/\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)"/g)].map(m=>({id:Number(m[1]),name:m[2]}));
const rifles=entries.slice(29,58);
assert.deepEqual(rifles.map(w=>w.id),rifleIds,'Rifles must match game catalog entries29–57 in order');
for(const item of rifles){const w=data.weapons[item.id];assert.ok(w,'Missing rifle '+item.id);assert.equal(w.name,item.name);assert.equal(w.pose,'heavy');assert.ok(Array.isArray(w.grip)&&w.grip.length===2&&w.grip.every(Number.isFinite));assert.ok(Number.isFinite(w.scale)&&w.scale>0);}
assert.equal(new Set(rifleIds).size,29);
console.log('PASS: exact29 rifle IDs/names, valid grips/scales and shared heavy poses');
