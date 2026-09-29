'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const server=fs.readFileSync('server_patches/progression_economy_hot_20260929.patch','utf8');
const checks=[
  ['Аптечка гражданская',750],
  ['Аптечка армейская',2000],
  ['Аптечка научная',6000]
];
for(const [name,price] of checks){
  const line=html.split('\n').find(x=>x.includes('name: "'+name+'"')&&x.includes('type: "medkit"'));
  assert(line&&line.includes('price: '+price),name+' client price');
  assert(server.includes("'"+name+"':"+price),name+' server price');
}
assert(server.includes('const MEDKIT_HEAL_TICKS=5;'));
assert(server.includes('const MEDKIT_HEAL_INTERVAL_MS=2000;'));
assert(server.includes("error:'Предыдущая аптечка ещё действует'"));
assert(server.includes("error:'Лечение сейчас не требуется'"));
assert(server.includes('function pveAdvanceHealingTurn'));
assert(server.includes('function pveSyncHealingByTime'));
assert(server.includes('vitalityGranted:false'));
console.log('PASS: medkits are expensive, heal over time, and cannot overlap');