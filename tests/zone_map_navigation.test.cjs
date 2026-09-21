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

assert(js.includes("version: '0.6.1'"),'ZoneMap API version mismatch');
assert(js.includes("window.BunkerMenu = {version: '1.10.2'"),'BunkerMenu version mismatch');
assert(js.includes("const ZONE_MAP_NAMES = Object.freeze({1:'Кардон',2:'Свалка',3:'НИИ Агропром'})"),'three map titles missing');
assert(js.includes("1: {path:'/api/zone-map/1', width:890, height:1536}"),'location 1 asset missing');
assert(js.includes("2: {path:'/api/zone-map/2', width:1397, height:1536}"),'location 2 asset missing');
assert(js.includes("3: {path:'/api/zone-map/3', width:863, height:1536}"),'NII Agroprom asset missing');
assert(js.includes('20260921-map11'),'map image cache key missing');

assert(js.includes("id:'transition-to-3'")&&js.includes("label:'Переход на НИИ Агропром'"),'Svalka -> NII Agroprom transition missing');
assert(js.includes("targetLocation:3,unlock:'last-nine-pistols'"),'NII Agroprom transition must use last-nine gate');
assert(js.includes("id:'transition-to-2'")&&js.includes("label:'Переход на Свалку'"),'NII Agroprom -> Svalka transition missing');
assert(js.includes('Чтобы попасть на НИИ Агропром, должны быть открыты последние 9 пистолетов.'),'last-nine warning missing');
assert(js.includes('function lastNinePistols()')&&js.includes('slice(-9)'),'last nine pistol list missing');
assert(js.includes('function lastNinePistolsReady()')&&js.includes('lastNinePistolsReady'),'last nine pistol gate missing');

const loc3Block=(js.match(/3: \[([\s\S]*?)\n    \]/)||[])[1]||'';
assert.equal((loc3Block.match(/kind:'enemy'/g)||[]).length,2,'NII Agroprom human marker count changed');
assert.equal((loc3Block.match(/label:'Военные'/g)||[]).length,2,'NII Agroprom humans must be Military only');
assert.equal((loc3Block.match(/kind:'mutant'/g)||[]).length,2,'NII Agroprom mutant marker count changed');
assert.equal((loc3Block.match(/kind:'anomaly'/g)||[]).length,2,'NII Agroprom anomaly marker count changed');
assert.equal((loc3Block.match(/kind:'transition'/g)||[]).length,1,'NII Agroprom must have one return transition');
assert.equal((loc3Block.match(/kind:'camp'/g)||[]).length,0,'NII Agroprom must not have camp/traders');

assert(js.includes('await travelToZoneLocation(3)'),'NII Agroprom transition must use loading screen');
assert(js.includes('zoneKind: zoneRaidKind, zoneLocation'),'raid route must carry selected location');
assert(!js.includes("if (item?.category === 'weapon') return weaponNames.has(item.name);"),'zone shop must not cap weapon stock at first ten pistols');
assert(index.includes('ui/bunker-menu.css?v=20260921-map12'),'CSS cache version mismatch');
assert(index.includes('ui/bunker-menu.js?v=20260921-map12'),'JS cache version mismatch');

const zoneCss=css.slice(css.indexOf('/* Zone map.'));
assert(zoneCss.includes('object-fit:contain'),'maps must keep original proportions');
assert(!zoneCss.includes('object-fit:fill'),'zone maps must not be stretched');
assert(zoneCss.includes('.zone-map-travel-bar')&&zoneCss.includes('.zone-map-title'),'travel bar/title styling missing');

console.log('PASS: NII Agroprom map, Military-only NPC markers, last-nine-pistol gate, proportional layout and loading transitions');
