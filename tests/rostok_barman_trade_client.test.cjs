'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const bunker=fs.readFileSync('ui/bunker-menu.js','utf8');
const html=fs.readFileSync('index.html','utf8');

assert(trade.includes("barman: {"),'Barman vendor missing');
assert(trade.includes("title: () => 'БАРМЕН — ТОРГОВЛЯ'"),'Barman trade title missing');
assert(trade.includes("['weapon','armor'].includes(String(item?.category||''))"),'Barman must only show weapon/armor');
assert(trade.includes("Number(item?.tier) >= 4"),'Barman tier 4+ client gate missing');
assert(trade.includes("serverVendor: 'zhuchara'"),'Barman must reuse Zhuchara pricing/route');
assert(trade.includes("sourceVendor: currentVendor"),'Barman source marker missing from requests');
assert(trade.includes("id === 'barman' && window.BunkerMenu?.openBarmanHub"),'Trade Back must return to Barman');
assert(trade.includes("version: '1.3.3'"),'TradeMenu version not bumped');

assert(bunker.includes('id="rostokBarmanHotspot"'),'Barman invisible hotspot missing');
assert(bunker.includes('aria-label="Бармен"'),'Barman hotspot/name missing');
for(const action of ['talk','trade','back'])assert(bunker.includes('data-barman-action="'+action+'"'),'Barman '+action+' missing');
assert(bunker.includes("screen === 'main' && rostokReturnPending"),'Rostok sub-screen return interception missing');
assert(bunker.includes("rostokReturnPending = true"),'Rostok origin not recorded');
assert(bunker.includes("window.BunkerMenu = {version: '1.13.0'"),'BunkerMenu version not bumped');

assert(html.includes('ui/bunker-menu.js?v=20260922-barman1'),'Bunker JS cache key missing');
assert(html.includes('ui/bunker-menu.css?v=20260922-barman1'),'Bunker CSS cache key missing');
assert(html.includes('ui/trade-menu.js?v=20260922-barman1'),'Trade JS cache key missing');

console.log('PASS: Rostok Barman hotspot, tier-4 trade, Zhuchara route reuse and Rostok return context');
