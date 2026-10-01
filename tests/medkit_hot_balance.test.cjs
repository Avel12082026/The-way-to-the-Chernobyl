'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const server=fs.readFileSync('server_patches/progression_economy_hot_20260929.patch','utf8');
const consumableUpdate=fs.readFileSync('tools/install_consumable_radiation_update.py','utf8');

const checks=[
  ['Аптечка гражданская',750],
  ['Аптечка армейская',2000],
  ['Аптечка научная',6000]
];
for(const [name,price] of checks){
  const line=html.split('\n').find(x=>x.includes('name: "'+name+'"')&&x.includes('type: "medkit"'));
  assert(line&&line.includes('price: '+price),name+' client price');
}
assert(server.includes("'Аптечка гражданская':750"));
assert(server.includes("'Аптечка армейская':2000"));
assert(server.includes("'Аптечка научная':6000"));
assert(html.includes('name: "Аптечка гражданская", type: "medkit", restore: 50, price: 750, healTicks: 5'));
assert(html.includes('name: "Аптечка армейская", type: "medkit", restore: 100, price: 2000, healTicks: 5'));
assert(html.includes('name: "Аптечка научная", type: "medkit", restore: 150, price: 6000, radiationRemove: 100, instantHeal: true'));
assert(consumableUpdate.includes('instantHeal'));
assert(consumableUpdate.includes('"foodCost":25'));
assert(consumableUpdate.includes('"waterCost":25'));
assert(consumableUpdate.includes('"Водка Столичная"'));
console.log('PASS: civilian/army medkits keep timed healing; scientific medkit is instant; antirad/vodka update present');
