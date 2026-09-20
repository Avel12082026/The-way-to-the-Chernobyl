'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');
const index=fs.readFileSync('index.html','utf8');
const b64=Array.from({length:8},(_,i)=>fs.readFileSync(`ui/zone-map-v2-${String(i).padStart(2,'0')}.b64`,'utf8')).join('').replace(/\\s+/g,'');

assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'raid door wiring changed unexpectedly');
const enter=(js.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("openZoneMap('camp')"),'raid door must open the zone map first');
assert(!enter.includes('startRaid()'),'raid door must not start the raid before map selection');

assert(js.includes("el.id = 'zoneMapScreen'"),'zone map screen missing');
assert(js.includes("Array.from({length: 8}")&&js.includes("'ui/zone-map-v2-'"),'annotated zone map chunks not loaded');
assert(js.includes("window.ZoneMap = Object.freeze"),'ZoneMap API missing');
assert(js.includes("setPoints: setZoneMapPoints"),'configurable marker API missing');
for(const kind of ['camp','enemy','anomaly','mutant','transition']){
  assert(js.includes("'"+kind+"'"),'marker kind missing: '+kind);
}
assert(js.includes("id:'transition-1'")&&js.includes("id:'camp-1'"),'annotated point coordinates missing');
assert.equal((js.match(/\{id:'(?:transition|anomaly|mutant|enemy|camp)-\d+'/g)||[]).length,11,'expected 11 annotated map points');
assert(js.includes("if (kind === 'camp')")&&js.includes('await endRaid()'),'camp marker must end an active raid before returning to traders');
assert(js.includes("if (kind === 'transition')")&&js.includes('Локация ещё не открыта сталкерами.'),'locked transition message missing');
assert(js.includes("/api/raid/zone-step")&&js.includes("zoneKind: zoneRaidKind"),'selected marker must route raid steps');
assert(js.includes("firstLocationWeaponList")&&js.includes("firstLocationArmorList"),'location-one gear split missing');
assert(js.includes("slice(0, 10)"),'location-one first-ten limit missing');

assert(index.includes('id="raidMapBtn"'),'raid map button missing');
assert(index.includes("BunkerMenu.openZoneMap('raid')"),'raid map button does not open map');
assert(index.includes('>Открыть карту</button>'),'raid map caption missing');
assert(index.includes('ui/bunker-menu.css?v=20260920-map3'));
assert(index.includes('ui/bunker-menu.js?v=20260920-map3'));

assert(css.includes('#zoneMapScreen.zone-map-screen'),'zone map CSS missing');
assert(css.includes('aspect-ratio:890/1536'),'map coordinate frame must preserve artwork aspect ratio');
assert(css.includes('background:transparent')&&css.includes('opacity:.001'),'map marker hit areas must be invisible');
assert(css.includes('.zone-map-point-icon,')&&css.includes('display:none!important'),'baked-in markers must not be duplicated by HTML');

const bytes=Buffer.from(b64,'base64');
assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF','zone map is not WebP/RIFF');
assert(bytes.length>20000,'annotated zone map asset unexpectedly small');

console.log('PASS: annotated map, 11 invisible marker hit areas, routed raids, camp/transition behavior and location-one gear limit');
