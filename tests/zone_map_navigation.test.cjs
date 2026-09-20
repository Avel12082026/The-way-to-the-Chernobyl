'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');
const index=fs.readFileSync('index.html','utf8');
const b64=fs.readFileSync('ui/zone-map.webp.b64','utf8').trim();

assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'raid door wiring changed unexpectedly');
const enter=(js.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("openZoneMap('camp')"),'raid door must open the zone map first');
assert(!enter.includes('startRaid()'),'raid door must not start the raid before map selection');

assert(js.includes("el.id = 'zoneMapScreen'"),'zone map screen missing');
assert(js.includes("fetch('ui/zone-map.webp.b64?v=20260920-map1')"),'zone map artwork not loaded');
assert(js.includes("window.ZoneMap = Object.freeze"),'ZoneMap API missing');
assert(js.includes("setPoints: setZoneMapPoints"),'configurable marker API missing');
for(const kind of ['camp','raid','enemy','anomaly','mutant']){
  assert(js.includes("'"+kind+"'"),'marker kind missing: '+kind);
}
assert(js.includes("if (kind === 'camp')")&&js.includes('await endRaid()'),'camp marker must end an active raid before returning to traders');
assert(js.includes("zoneMapPoints = []"),'exact marker coordinates must stay unset until annotated map is supplied');

assert(index.includes('id="raidMapBtn"'),'raid map button missing');
assert(index.includes("BunkerMenu.openZoneMap('raid')"),'raid map button does not open map');
assert(index.includes('>Открыть карту</button>'),'old return-from-raid caption not replaced');
assert(!index.includes('>Вернуться с рейда</button>'),'old return-from-raid button still present');
assert(index.includes('ui/bunker-menu.css?v=20260920-map1'));
assert(index.includes('ui/bunker-menu.js?v=20260920-map1'));

assert(css.includes('#zoneMapScreen.zone-map-screen'),'zone map CSS missing');
assert(css.includes('aspect-ratio:890/1536'),'map coordinate frame must preserve artwork aspect ratio');
assert(css.includes('.zone-map-point-enemy')&&css.includes('.zone-map-point-anomaly')&&css.includes('.zone-map-point-mutant'),'typed marker styles missing');

const bytes=Buffer.from(b64,'base64');
assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF','zone map is not WebP/RIFF');
assert(bytes.length>20000,'zone map asset unexpectedly small');

console.log('PASS: map-first raid entry, open-map raid action, configurable typed markers and camp return');
