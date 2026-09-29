'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');

const diesel=fs.readFileSync('ui/diesel-yantar.jpg');
const leonov=fs.readFileSync('ui/leonov-yantar.jpg');
const hubs=fs.readFileSync('ui/trader-hubs.js','utf8');
const bunker=fs.readFileSync('ui/bunker-menu.js','utf8');
const index=fs.readFileSync('index.html','utf8');

const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
assert.equal(diesel.length,353328,'Diesel portrait byte length changed');
assert.equal(leonov.length,305494,'Leonov portrait byte length changed');
assert.equal(sha(diesel),'c8984be4902db2f0a0e164bd4a72903d1976fd3cb18290099976efc2c9e2b0eb','Diesel portrait was recompressed or altered');
assert.equal(sha(leonov),'017bc2d6b9be6de48f36c750616c5796676fee8bf260bde6f7353c9be0813039','Leonov portrait was recompressed or altered');
assert.equal(diesel[0],0xff);assert.equal(diesel[1],0xd8);
assert.equal(leonov[0],0xff);assert.equal(leonov[1],0xd8);

assert(hubs.includes("ui/diesel-yantar.jpg?v=' + YANTAR_PORTRAIT_CACHE"),'Diesel exact portrait is not wired');
assert(hubs.includes("ui/leonov-yantar.jpg?v=' + YANTAR_PORTRAIT_CACHE"),'Leonov exact portrait is not wired');
assert(hubs.includes("YANTAR_PORTRAIT_CACHE = '20260927-yantar-portraits1'"),'portrait cache key missing');
assert(bunker.includes('src="ui/leonov-yantar.jpg?v=20260927-yantar-portraits1"'),'Leonov hub still starts with old portrait');
assert(index.includes('ui/bunker-menu.js?v=20260929-zone-economy3'),'Bunker menu cache was not bumped');
assert(index.includes('ui/trader-hubs.js?v=20260927-cordon-zhuchara2'),'Trader hubs cache was not bumped');
assert(hubs.includes("openTraderDialogue('leonov')"),'Leonov Talk must open quests/dialogue');
assert(hubs.includes("openTraderDialogue('diesel')"),'Diesel Talk must open quests/dialogue');
assert(!hubs.includes('data-leonov-action="quests"'),'Leonov must not have a separate Quests button');
assert(!hubs.includes("{id:'quests', label:'Квесты'}"),'Diesel must not have a separate Quests button');

for(const action of ['selection','trade','talk','back']){
  assert((bunker+hubs).includes('data-leonov-action="'+action+'"'),'Leonov action missing: '+action);
}
const dieselBlock=(hubs.match(/function ensureDieselHub\(\)[\s\S]*?return dieselHub;\n  }/)||[])[0]||'';
assert(dieselBlock,'Diesel hub block missing');
for(const action of ['trade','upgrade','talk','back']){
  assert(dieselBlock.includes("{id:'"+action+"', label:"), 'Diesel action wiring missing: '+action);
}
console.log('PASS: Yantar Leonov/Diesel portraits are byte-exact and existing actions remain wired');