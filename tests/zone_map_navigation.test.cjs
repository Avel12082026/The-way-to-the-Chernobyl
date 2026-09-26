'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('ui/bunker-menu.html','utf8');

assert(html.includes('id="bunkerRaid"')&&html.includes('BunkerMenu.enterRaid()'),'raid door wiring changed unexpectedly');
const enter=(js.match(/async function enterRaid\(\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(enter.includes("setZoneLocation(1)")&&enter.includes("openZoneMap('camp')"),'raid door must open location 1 map first');

assert(js.includes("version: '0.6.9'"),'ZoneMap API version mismatch');
assert(js.includes("window.BunkerMenu = {version: '1.20.0'"),'BunkerMenu version mismatch');
assert(js.includes("const ZONE_MAP_NAMES = Object.freeze({1:'Кордон',2:'Свалка',3:'НИИ Агропром',4:'Россток'})"),'four map titles missing');
assert(js.includes("1: {path:'/api/zone-map/1', width:890, height:1536}"),'location 1 asset missing');
assert(js.includes("2: {path:'/api/zone-map/2', width:864, height:1536}"),'location 2 asset missing');
assert(js.includes("3: {path:'/api/zone-map/3', width:863, height:1536}"),'NII Agroprom asset missing');
assert(js.includes("4: {path:'/api/zone-map/4', width:865, height:1536}"),'Rostok asset missing');
assert(js.includes("1:'images/zone-travel/kordon-village.webp'")&&js.includes("2:'images/anomaly/background.jpg'")&&js.includes("3:'images/combat/environments/11.webp'")&&js.includes("4:'images/combat/environments/16.webp'"),'destination loading artwork for four current locations missing');
assert(js.includes("kind:'camp'")&&js.includes("kind:'anomaly'")&&js.includes("kind:'mutant'"),'travel scene types missing');
assert(js.includes("1:{kind:'camp'}"),'Kordon must use a single authored Rookie Village camp scene');
assert(js.includes("images/anomaly/items/medusa.webp")&&!js.includes("2:{kind:'anomaly'")===false,'Svalka artifact scene missing');
assert(js.includes("images/combat/mutants/snork.png")&&js.includes("images/combat/mutants/bloodsucker.png"),'in-game mutant loading overlays missing');
assert(js.includes("fighters:[{armorId:31,weaponId:11},{armorId:16,weaponId:12}]")&&js.includes("fighters.resolve")&&js.includes("renderZoneTravelCombat"),'in-game combat fighter loading renderer missing');
assert(js.includes('prepareZoneTravelArtwork(target)')&&js.includes('zoneMapTravelDestination'),'travel screen must select artwork by destination');
assert(css.includes('.zone-map-travel-artwork')&&css.includes('.zone-map-travel-bottom')&&css.includes('bottom:calc(max(18px,env(safe-area-inset-bottom)) + 18px)'), 'travel artwork or bottom progress layout missing');
const campTravelStyle=(css.match(/#zoneMapScreen \.zone-map-travel\[data-scene="camp"\] \.zone-map-travel-artwork\{([^}]*)\}/)||[])[1]||'';
assert(campTravelStyle.includes('width:auto')&&campTravelStyle.includes('height:auto')&&campTravelStyle.includes('max-width:100%')&&campTravelStyle.includes('max-height:100%')&&campTravelStyle.includes('object-fit:contain')&&campTravelStyle.includes('filter:none'),'Kordon camp loading artwork must keep intrinsic resolution without upscale or quality filters');
assert(js.includes('20260922-position3'),'Rostok map cache key missing');

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
assert(js.includes('function ensureRostokCampScreen()')&&js.includes('/api/zone-camp/4?v=20260922-position3'),'Rostok bar screen missing');
assert(js.includes("if (zoneLocation === 4)")&&js.includes('openRostokCamp();'),'Rostok camp marker must open bar screen');
assert(js.includes('zoneKind: zoneRaidKind, zoneLocation'),'raid route must carry selected location');

const zoneCss=css.slice(css.indexOf('/* Zone map.'));
assert(zoneCss.includes('object-fit:contain'),'maps must keep original proportions');
assert(!zoneCss.includes('object-fit:fill'),'zone maps must not be stretched');
assert(zoneCss.includes('.zone-map-travel-bar')&&zoneCss.includes('.zone-map-title'),'travel bar/title styling missing');
assert(css.includes('#rostokCampScreen.rostok-camp-screen'),'Rostok camp styles missing');
assert(['health','hunger','thirst'].every(k=>js.includes('rostok-'+k+' bunker-vital bunker-'+k)&&css.includes('.bunker-'+k)), 'Rostok survival meters must share Cordon rules');
assert(js.includes('id="rostokExperience"')&&js.includes('id="rostokRadiation"'),'Rostok exp/radiation bars missing');
assert(js.includes('id="rostokCoins"')&&js.includes('id="rostokBreedCredits"')&&js.includes('id="rostokKnowledgeBooks"'),'Rostok resources missing');
assert(js.includes('id="rostokReadBook"')&&js.includes('data-rostok-action="read"'),'Rostok read-book control missing');
assert(js.includes('id="rostokInventory"')&&js.includes('data-rostok-action="inventory"'),'Rostok inventory control missing');
assert(js.includes('id="rostokPda"')&&js.includes('data-rostok-action="kpk"'),'Rostok PDA control missing');
assert(css.includes('.rostok-lower-hud-artwork')&&js.includes('rostok-resources bunker-resources')&&js.includes('rostok-quick rostok-inventory bunker-hotspot'), 'Rostok lower hub must reuse Cordon styling');
assert(js.includes('id="rostokLowerHud"')&&js.includes('rostok-lower-hud-artwork'),'Rostok must use a dedicated lower-HUD crop container');
assert(css.includes('height:var(--rostok-hud-height')&&css.includes('object-fit:fill;object-position:center'),'Rostok must render only the clean lower menu artwork');
assert(!css.includes('clip-path:inset(84.35% 0 0 0)'),'Old oversized Cordon strip crop must be removed');
assert(css.includes('.rostok-progress-row{z-index:5;}')&&js.includes('rostok-progress-row bunker-progress-row'), 'Upper meters must overlay the lower HUD in Cordon coordinates');
assert(css.includes(':is(#mainMenu,#rostokCampScreen) .bunker-health { top:96.02%; }'), 'Both camps must keep health at the identical visible position');
assert(js.includes("target.style.setProperty('--rostok-hud-height', h * 182 / 1672 + 'px')")&&js.includes('layoutCampScene(scene);')&&js.includes('layoutCampScene(campScene);'), 'HUD crop must follow the same vertical scaling as Cordon');
assert(!js.includes('class="zone-map-back"'),'Zone maps must not show the top-left Back button');
assert(!js.includes('data-zone-map-action="back"'),'Zone-map Back action must be removed');
assert(js.includes('id="rostokBarmanHotspot"')&&js.includes('data-rostok-action="barman"'),'invisible Barman hotspot missing');
assert(js.includes('id="rostokWarehouseHotspot"')&&js.includes('data-rostok-action="warehouse"'),'Rostok warehouse door hotspot missing');
assert(css.includes('.rostok-warehouse-hotspot'),'Rostok warehouse hotspot CSS missing');
assert(js.includes('id="rostokLowerHudArtwork"')&&js.includes('ui/rostok-lower-hud.png?v=09db18421007'),'Rostok clean lower HUD asset missing');
const rostokHud=fs.readFileSync('ui/rostok-lower-hud.png');
assert.equal(rostokHud.subarray(1,4).toString('ascii'),'PNG','Rostok lower HUD is not PNG');
assert(rostokHud.length>200000,'Rostok lower HUD asset unexpectedly small');
const rostokBlock=js.slice(js.indexOf('function ensureRostokCampScreen()'),js.indexOf('function openRostokCamp()',js.indexOf('function ensureRostokCampScreen()')));
assert(!rostokBlock.includes('images/zone-travel/kordon-village.webp'),'Old Cordon screenshot must not be used inside Rostok');
assert(js.includes('window.GamePosition = Object.freeze')&&js.includes('restorePlayerWorldPositionWhenReady'),'persistent world position API missing');
assert(js.includes("saveWorldPosition('rostok-bar','rostok-bar')"),'Rostok bar position save missing');
assert(js.includes("el.id = 'barmanHubScreen'"),'Barman hub screen missing');
for(const [action,label] of [['talk','Говорить'],['trade','Торговля'],['back','Назад']]){
  assert(js.includes('data-barman-action="'+action+'"'),`Barman ${action} action missing`);
  assert(js.includes('>'+label+'</button>'),`Barman ${label} label missing`);
}
assert(js.includes('rostokReturnPending')&&js.includes("screen === 'main' && rostokReturnPending"),'Rostok PDA/inventory return context missing');

console.log('PASS: Rostok map, clean lower HUD, separate exp/radiation overlay, warehouse and persistent position');
