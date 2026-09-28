'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');

const camp=fs.readFileSync('ui/cordon-zhuchara-camp.png');
const hub=fs.readFileSync('ui/cordon-zhuchara-hub.png');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');
const bunker=fs.readFileSync('ui/bunker-menu.js','utf8');
const hubs=fs.readFileSync('ui/trader-hubs.js','utf8');
const index=fs.readFileSync('index.html','utf8');

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function pngSize(buf){
  assert.equal(buf.subarray(1,4).toString('ascii'),'PNG');
  return [buf.readUInt32BE(16),buf.readUInt32BE(20)];
}
assert.deepEqual(pngSize(camp),[941,1672]);
assert.deepEqual(pngSize(hub),[941,1672]);
assert.equal(camp.length,2576028,'Cordon camp artwork byte length changed');
assert.equal(hub.length,2400152,'Zhuchara portrait byte length changed');
assert.equal(sha(camp),'1521c6a2bccdb14fb74c269b799ef4f1dd15fe4d701236a7251bd10cc1adc838','Cordon camp artwork was altered/recompressed');
assert.equal(sha(hub),'358c352548a7c2e77b2017233545731a21aa8ee07050c522b3f64ac4a91ff336','Zhuchara portrait was altered/recompressed');

assert(html.includes('ui/cordon-zhuchara-camp.png?v=20260927-cordon-zhuchara1'),'approved Cordon camp art not wired');
assert(html.includes('id="bunkerZhuchara"'),'Zhuchara hotspot missing');
assert(html.includes('id="bunkerWarehouse"')&&html.includes('onclick="openScreen(\'warehouse\')"'),'Warehouse door not wired');
assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'Exit door not wired to Cordon map');
for(const removed of ['bunkerLeonov','bunkerDiesel','bunkerSmoker','bunkerArena']){
  assert(!html.includes('id="'+removed+'"'),'Removed Cordon hotspot returned: '+removed);
}

assert(hubs.includes("if (key === 'zhuchara') return 'ui/cordon-zhuchara-hub.png?v=20260927-cordon-zhuchara1'"),'approved Zhuchara portrait not wired');
assert(hubs.includes("const expected = key === 'zhuchara' ? [941, 1672] : [864, 1536]"),'Zhuchara exact portrait dimensions are not guarded');
const block=(hubs.match(/function ensureZhucharaHub\(\)[\s\S]*?return zhucharaHub;\n  }/)||[])[0]||'';
assert(block,'Zhuchara hub block missing');
for(const [id,label] of [['trade','Торговля'],['talk','Говорить'],['back','Назад']]){
  assert(block.includes("{id:'"+id+"', label:'"+label+"'}"),'Zhuchara action missing: '+label);
}
assert.equal((block.match(/\{id:'/g)||[]).length,3,'Zhuchara must have exactly three gameplay buttons');
assert(!block.includes("id:'quests'"),'Zhuchara must not have a separate Quests button');

const enter=(bunker.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("setZoneLocation(1)")&&enter.includes("openZoneMap('camp')"),'Exit must open Cordon map first');
assert(index.includes('ui/bunker-menu.js?v=20260928-qa-fix1'),'Cordon bunker cache key missing');
assert(index.includes('ui/trader-hubs.js?v=20260927-cordon-zhuchara2'),'Zhuchara hub cache key missing');

console.log('PASS: Cordon is Zhuchara-only; exact artwork, portrait, Exit, Warehouse and 3 gameplay buttons are wired');
