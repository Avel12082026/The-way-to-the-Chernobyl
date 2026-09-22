'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const bunker=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('index.html','utf8');

assert(trade.includes("barman: {"),'Barman vendor missing');
assert(trade.includes("title: () => 'БАРМЕН — ТОРГОВЛЯ'"),'Barman trade title missing');
assert(trade.includes("getShopCatalog().filter(item => item?.category === 'consumable')"),'Barman must inherit all Zhuchara consumables');
assert(trade.includes("Number(w.tier) >= 4"),'Barman weapon tier 4+ client gate missing');
assert(trade.includes("Number(a.tier) >= 4"),'Barman armor tier 4+ client gate missing');
assert(trade.includes("...armorItems"),'Barman must use full armor catalog so body armor/vests are present');
assert(trade.includes("serverVendor: 'zhuchara'"),'Barman must reuse Zhuchara pricing/route');
assert(trade.includes("sourceVendor: currentVendor"),'Barman source marker missing from requests');
assert(trade.includes("id === 'barman' && window.BunkerMenu?.openBarmanHub"),'Trade Back must return to Barman');
assert(trade.includes("version: '1.3.5'"),'TradeMenu version not bumped');

assert(bunker.includes('id="rostokBarmanHotspot"'),'Barman invisible hotspot missing');
assert(bunker.includes('id="rostokWarehouseHotspot"'),'Rostok warehouse door hotspot missing');
assert(bunker.includes('data-rostok-action="warehouse"'),'Rostok warehouse action missing');
assert(bunker.includes('aria-label="Бармен"'),'Barman hotspot/name missing');
for(const action of ['talk','trade','back'])assert(bunker.includes('data-barman-action="'+action+'"'),'Barman '+action+' missing');
assert(bunker.includes("screen === 'main' && rostokReturnPending"),'Rostok sub-screen return interception missing');
assert(bunker.includes("['inventory','kpk','warehouse'].includes(saved.place)"),'Rostok warehouse/PDA/inventory origin restore missing');
assert(bunker.includes("function restorePlayerWorldPositionWhenReady"),'startup world-position restore poll missing');
assert(bunker.includes("window.BunkerMenu = {version: '1.15.0'"),'BunkerMenu version not bumped');

assert(bunker.includes('class="rostok-cordon-hud-artwork"'),'Rostok must reuse exact Cordon HUD artwork');
assert(css.includes('.rostok-cordon-hud-artwork')&&css.includes('clip-path:inset(84.35% 0 0 0)'),'Cordon HUD raster overlay missing');
assert(css.includes('.rostok-warehouse-hotspot'),'Warehouse door hotspot styling missing');

for(const ref of [
  'ui/bunker-menu.js?v=20260922-position2',
  'ui/bunker-menu.css?v=20260922-position2',
  'ui/trade-menu.js?v=20260922-position2',
  'ui/trader-hubs.js?v=20260922-position2'
])assert(html.includes(ref),'cache key missing: '+ref);

console.log('PASS: Rostok exact Cordon HUD, warehouse door, persistent return and Barman consumables/tier-4 gear');
