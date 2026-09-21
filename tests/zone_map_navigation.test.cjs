'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');

assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'raid door wiring changed unexpectedly');
const enter=(js.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("setZoneLocation(1)")&&enter.includes("openZoneMap('camp')"),'raid door must open location 1 map first');

assert(js.includes("version: '0.6.2'"),'ZoneMap API version mismatch');
assert(js.includes("window.BunkerMenu = {version: '1.11.0'"),'BunkerMenu version mismatch');
assert(js.includes("const ZONE_MAP_NAMES = Object.freeze({1:'Кордон',2:'Свалка',3:'НИИ Агропром',4:'Россток'})"),'four map titles missing');
assert(js.includes("1: {path:'/api/zone-map/1', width:890, height:1536}"),'location 1 asset missing');
assert(js.includes("2: {path:'/api/zone-map/2', width:864, height:1536}"),'location 2 asset missing');
assert(js.includes("3: {path:'/api/zone-map/3', width:863, height:1536}"),'NII Agroprom asset missing');
assert(js.includes("4: {path:'/api/zone-map/4', width:865, height:1536}"),'Rostok asset missing');
assert(js.includes('20260922-rostok1'),'Rostok map cache key missing');

const loc2Block=(js.match(/2: \[([\s\S]*?)\n    \],\n    3:/)||[])[1]||'';
assert.equal((loc2Block.match(/kind:'transition'/g)||[]).length,3,'Svalka must keep bottom/left/top transition markers');
assert.equal((loc2Block.match(/kind:'enemy'/g)||[]).length,3,'Svalka bandit marker count changed');
assert.equal((loc2Block.match(/kind:'mutant'/g)||[]).length,3,'Svalka mutant marker count changed');
assert.equal((loc2Block.match(/kind:'anomaly'/g)||[]).length,2,'Svalka anomaly marker count changed');
assert(loc2Block.includes("id:'transition-to-4'")&&loc2Block.includes("label:'Переход на Россток'"),'Svalka top -> Rostok transition missing');
assert(loc2Block.includes("x:68.26,y:24.48,targetLocation:4,unlock:'second-pistol-decade'"),'Svalka top Rostok hotspot is not aligned');
assert(!loc2Block.includes("transition-future-top"),'Svalka top transition must now be active');
assert(loc2Block.includes("x:62.82,y:71.62,targetLocation:1"),'Svalka bottom transition hotspot is not aligned');
assert(loc2Block.includes("x:10.50,y:47.49,targetLocation:3"),'Svalka left transition hotspot is not aligned');

assert(js.includes("targetLocation:3,unlock:'last-nine-pistols'"),'NII Agroprom transition must use last-nine gate');
assert(js.includes('Чтобы попасть на НИИ Агропром, должны быть открыты последние 9 пистолетов.'),'last-nine warning missing');
assert(js.includes('Чтобы попасть в Россток, должна быть открыта вторая десятка пистолетов.'),'Rostok gate warning missing');
assert(js.includes('await travelToZoneLocation(4)'),'Rostok transition must use loading screen');

const loc4Block=(js.match(/4: \[([\s\S]*?)\n    \]\n  \}\);/)||[])[1]||'';
assert.equal((loc4Block.match(/kind:'enemy'/g)||[]).length,3,'Rostok must have three human enemy markers');
assert.equal((loc4Block.match(/label:'Наёмники'/g)||[]).length,3,'Rostok human enemies must be Mercenaries only');
assert.equal((loc4Block.match(/kind:'mutant'/g)||[]).length,3,'Rostok mutant marker count changed');
assert.equal((loc4Block.match(/kind:'anomaly'/g)||[]).length,3,'Rostok anomaly marker count changed');
assert.equal((loc4Block.match(/kind:'transition'/g)||[]).length,3,'Rostok transition marker count changed');
assert.equal((loc4Block.match(/kind:'camp'/g)||[]).length,1,'Rostok must have one clickable camp');
assert(loc4Block.includes("id:'camp-4'")&&loc4Block.includes("label:'Бар «100 RADS»'"),'Rostok camp/bar hotspot missing');
assert(loc4Block.includes("id:'transition-to-2'")&&loc4Block.includes("x:93.76,y:89.32,targetLocation:2"),'Rostok -> Svalka transition must be bottom-right');
assert(js.includes('function ensureRostokCampScreen()')&&js.includes('/api/zone-camp/4?v=20260922-rostok1'),'Rostok bar screen missing');
assert(js.includes("if (zoneLocation === 4)")&&js.includes('openRostokCamp();'),'Rostok camp marker must open bar screen');
assert(js.includes('zoneKind: zoneRaidKind, zoneLocation'),'raid route must carry selected location');

const zoneCss=css.slice(css.indexOf('/* Zone map.'));
assert(zoneCss.includes('object-fit:contain'),'maps must keep original proportions');
assert(!zoneCss.includes('object-fit:fill'),'zone maps must not be stretched');
assert(zoneCss.includes('.zone-map-travel-bar')&&zoneCss.includes('.zone-map-title'),'travel bar/title styling missing');
assert(css.includes('#rostokCampScreen.rostok-camp-screen'),'Rostok camp styles missing');
assert(css.includes('.rostok-health')&&css.includes('.rostok-hunger')&&css.includes('.rostok-thirst'),'Rostok survival meters missing');

console.log('PASS: Rostok map, Svalka route, Mercenary tier-4 encounters, bottom-right return and 100 RADS camp HUD');
