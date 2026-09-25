'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const bunker=fs.readFileSync('ui/bunker-menu.js','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const html=fs.readFileSync('index.html','utf8');

assert(trade.includes("barman: {"),'Barman vendor missing');
assert(trade.includes("title: () => 'БАРМЕН — ТОРГОВЛЯ'"),'Barman trade title missing');
assert(trade.includes("getShopCatalog().filter(item => item?.category === 'consumable')"),'Barman must inherit all Zhuchara consumables');
assert(trade.includes("markedPistols.length === 29"),'Zhuchara 29-pistol class detection missing');
assert(trade.includes("weaponOrder.slice(pistolStart, pistolStart + 29)"),'Zhuchara pistol fallback range missing');
assert(trade.includes("regularArmorRange(1, 29)"),'Zhuchara armor IDs 1-29 range missing');
assert(trade.includes("markedShotguns.length === 29"),'Barman 29-shotgun class detection missing');
assert(trade.includes("weaponOrder.slice(pistolStart + 29, pistolStart + 58)"),'Barman shotgun fallback range missing');
assert(trade.includes("regularArmorRange(30, 58)"),'Barman armor IDs 30-58 range missing');
assert(!trade.includes("Number(w.tier) >= 4"),'Old Barman weapon tier gate must be removed');
assert(!trade.includes("Number(a.tier) >= 4"),'Old Barman armor tier gate must be removed');
assert(trade.includes("serverVendor: 'zhuchara'"),'Barman must reuse Zhuchara pricing/route');
assert(trade.includes("sourceVendor: currentVendor"),'Barman source marker missing from requests');
assert(trade.includes("id === 'barman' && window.BunkerMenu?.openBarmanHub"),'Trade Back must return to Barman');
assert(trade.includes("version: '1.3.7'"),'TradeMenu version not bumped');

assert(bunker.includes('id="rostokBarmanHotspot"'),'Barman invisible hotspot missing');
assert(bunker.includes('id="rostokWarehouseHotspot"'),'Rostok warehouse door hotspot missing');
assert(bunker.includes('data-rostok-action="warehouse"'),'Rostok warehouse action missing');
assert(bunker.includes('aria-label="Бармен"'),'Barman hotspot/name missing');
for(const action of ['talk','trade','back'])assert(bunker.includes('data-barman-action="'+action+'"'),'Barman '+action+' missing');
assert(bunker.includes("screen === 'main' && rostokReturnPending"),'Rostok sub-screen return interception missing');
assert(bunker.includes("['inventory','kpk','warehouse'].includes(saved.place)"),'Rostok warehouse/PDA/inventory origin restore missing');
assert(bunker.includes("function restorePlayerWorldPositionWhenReady"),'startup world-position restore poll missing');
assert(bunker.includes("window.BunkerMenu = {version: '1.20.0'"),'BunkerMenu version not bumped');

assert(bunker.includes('id="rostokLowerHud"')&&bunker.includes('ui/rostok-lower-hud.png?v=09db18421007'),'Rostok clean lower menu asset missing');
assert(css.includes('.rostok-lower-hud')&&css.includes('object-fit:fill;object-position:center'),'Clean lower menu styling missing');
assert(!css.includes('clip-path:inset(84.35% 0 0 0)'),'Old oversized HUD strip must not return');
assert(css.includes('.rostok-warehouse-hotspot'),'Warehouse door hotspot styling missing');

for(const ref of [
  'ui/bunker-menu.js?v=20260925-zone-travel1',
  'ui/bunker-menu.css?v=20260925-zone-travel1',
  'ui/trade-menu.js?v=20260925-zhuchara-armor-id1',
  'ui/trader-hubs.js?v=20260922-position3'
])assert(html.includes(ref),'cache key missing: '+ref);

console.log('PASS: Rostok Barman has 29 shotguns + armor 30-58; Zhuchara has 29 pistols + armor 1-29');
