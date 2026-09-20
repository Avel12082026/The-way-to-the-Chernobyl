'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');
const index=fs.readFileSync('index.html','utf8');

function mapBytes(prefix,count){
  const b64=Array.from({length:count},(_,i)=>
    fs.readFileSync(`ui/${prefix}-${String(i).padStart(2,'0')}.b64`,'utf8')
  ).join('').replace(/\s+/g,'');
  return Buffer.from(b64,'base64');
}
const map1=mapBytes('zone-map1-hq',11);
const map2=mapBytes('zone-map2-hq',22);

assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'raid door wiring changed unexpectedly');
const enter=(js.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("openZoneMap('camp')"),'raid door must open map first');
assert(!enter.includes('startRaid()'),'raid door must not start raid before map selection');

assert(js.includes("window.ZoneMap = Object.freeze"),'ZoneMap API missing');
assert(js.includes("version: '0.3.0'"),'ZoneMap API version mismatch');
assert(js.includes("window.BunkerMenu = {version: '1.7.0'"),'BunkerMenu version mismatch');

assert(js.includes("1: {prefix:'ui/zone-map1-hq-', parts:11, mime:'image/avif', width:890, height:1536}"),'location 1 native asset config missing');
assert(js.includes("2: {prefix:'ui/zone-map2-hq-', parts:22, mime:'image/avif', width:1397, height:1536}"),'location 2 native asset config missing');
assert(js.includes("targetLocation:2")||js.includes("targetLocation: 2"),'location 1 -> 2 transition missing');
assert(js.includes("targetLocation:1")||js.includes("targetLocation: 1"),'location 2 -> 1 transition missing');
assert(js.includes("targetLocation:3")||js.includes("targetLocation: 3"),'future location 3 marker missing');
assert(js.includes("targetLocation:4")||js.includes("targetLocation: 4"),'future location 4 marker missing');
assert(js.includes('вторая десятка пистолетов')||js.includes('второй десятки пистолетов'),'future transition pistol gate message missing');
assert(js.includes('Локация ещё не открыта сталкерами.'),'future-location closed message missing');

for(const kind of ['camp','enemy','anomaly','mutant','transition']){
  assert(js.includes("'"+kind+"'"),'marker kind missing: '+kind);
}
assert.equal((js.match(/location:1/g)||[]).length>=0,true);
assert(js.includes("zoneLocation")&&js.includes("/api/raid/zone-step"),'map route must carry selected location to server');
assert(js.includes("firstLocationWeaponList")&&js.includes("firstLocationArmorList"),'first-location gear gate/catalog split missing');
assert(js.includes("secondPistol")||js.includes("secondDecade")||js.includes("slice(10, 20)")||js.includes("slice(10,20)"),'second pistol decade gate missing');

assert(index.includes('id="raidMapBtn"'),'raid map button missing');
assert(index.includes("BunkerMenu.openZoneMap('raid')"),'raid map button not wired');
assert(index.includes('>Открыть карту</button>'),'raid map caption missing');
assert(index.includes('ui/bunker-menu.css?v=20260920-map5'),'CSS cache version mismatch');
assert(index.includes('ui/bunker-menu.js?v=20260920-map5'),'JS cache version mismatch');

assert(css.includes('#zoneMapScreen.zone-map-screen'),'zone map screen CSS missing');
assert(css.includes('.zone-map-canvas'),'native-aspect map canvas missing');
assert(css.includes('object-fit:contain'),'maps must fit without top/bottom crop');
assert(css.includes('background:transparent')&&css.includes('opacity:.001'),'marker hit areas must stay invisible');

for(const [bytes,label] of [[map1,'map1'],[map2,'map2']]){
  assert(bytes.length>50000,label+' asset unexpectedly small');
  assert.equal(bytes.subarray(4,12).toString('ascii'),'ftypavif',label+' is not AVIF');
}
assert(map2.length>map1.length,'map2 high-resolution asset should be larger than map1');

console.log('PASS: two native-resolution AVIF maps, full-map contain layout, invisible markers, transitions and route/location gates');
