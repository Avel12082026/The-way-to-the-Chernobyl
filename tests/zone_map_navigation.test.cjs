'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');
const index=fs.readFileSync('index.html','utf8');

assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'raid door wiring changed unexpectedly');
const enter=(js.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("setZoneLocation(1)")&&enter.includes("openZoneMap('camp')"),'raid door must open location 1 map first');
assert(!enter.includes('startRaid()'),'raid door must not start raid before marker selection');

assert(js.includes("version: '0.4.0'"),'ZoneMap API version mismatch');
assert(js.includes("window.BunkerMenu = {version: '1.8.0'"),'BunkerMenu version mismatch');
assert(js.includes("1: {path:'/api/zone-map/1', width:890, height:1536}"),'location 1 server image missing');
assert(js.includes("2: {path:'/api/zone-map/2', width:1397, height:1536}"),'location 2 server image missing');
assert(js.includes('SERVER_URL')&&js.includes('config.path')&&js.includes('20260920-map5'),'map image must be loaded from game server');

assert(js.includes("id:'transition-to-2'")&&js.includes('targetLocation:2'),'location 1 -> 2 transition missing');
assert(js.includes("id:'transition-to-1'")&&js.includes('targetLocation:1'),'location 2 -> 1 transition missing');
assert(js.includes("id:'transition-future-top'")&&js.includes("id:'transition-future-left'"),'future location markers missing');
assert(js.includes('Переход откроется, когда станет доступна вторая десятка пистолетов.'),'second pistol decade gate missing');
assert(js.includes('Локация ещё не открыта сталкерами.'),'future location closed message missing');
assert(js.includes('firstLocationToSecondReady()'),'location 2 gear gate missing');

const loc2Block=(js.match(/2: \[([\s\S]*?)\n    \]/)||[])[1]||'';
assert.equal((loc2Block.match(/kind:'enemy'/g)||[]).length,3,'location 2 must have three human-enemy markers');
assert.equal((loc2Block.match(/kind:'mutant'/g)||[]).length,3,'location 2 mutant marker count changed');
assert.equal((loc2Block.match(/kind:'anomaly'/g)||[]).length,2,'location 2 anomaly marker count changed');
assert.equal((loc2Block.match(/kind:'camp'/g)||[]).length,0,'location 2 must not have traders/camp');
assert.equal((loc2Block.match(/label:'Бандиты'/g)||[]).length,3,'all location 2 human markers must be Bandits');

assert(js.includes('zoneKind: zoneRaidKind, zoneLocation'),'raid route must carry location + marker type');
assert(js.includes("firstLocationWeaponList")&&js.includes("firstLocationArmorList"),'first-location shop split missing');
assert(js.includes("slice(10, 20)"),'second pistol decade definition missing');

assert(index.includes('id="raidMapBtn"'),'raid map button missing');
assert(index.includes("BunkerMenu.openZoneMap('raid')"),'raid map button not wired');
assert(index.includes('>Открыть карту</button>'),'raid map caption missing');
assert(index.includes('ui/bunker-menu.css?v=20260920-map7'),'CSS cache version mismatch');
assert(index.includes('ui/bunker-menu.js?v=20260920-map7'),'JS cache version mismatch');

assert(css.includes('width:100vw;height:100dvh'),'map canvas must fill the viewport');
assert(css.includes('object-fit:fill'),'map must fill the screen without top/bottom crop');
assert(css.includes('background:transparent')&&css.includes('opacity:.001'),'marker hit areas must stay invisible');

console.log('PASS: two full-screen maps, location transitions, invisible markers, no map2 traders and client routing gates');
