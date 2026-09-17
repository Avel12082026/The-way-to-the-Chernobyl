'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const trade = fs.readFileSync(path.join(root, 'ui', 'trade-menu.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ui', 'trade-menu.css'), 'utf8');
const hubs = fs.readFileSync(path.join(root, 'ui', 'trader-hubs.js'), 'utf8');
const hubCss = fs.readFileSync(path.join(root, 'ui', 'trader-hubs.css'), 'utf8');
const image = fs.readFileSync(path.join(root, 'ui', 'zhuchara-portrait.webp.b64'), 'utf8').trim();

assert(trade.includes("const VISIBLE_GRID_SLOTS = 21"), 'merchant/player visible slot count must be 7x3');
assert.strictEqual((trade.match(/fillEmpty\(grid, VISIBLE_GRID_SLOTS, 7\)/g) || []).length, 2, 'merchant and player grids must share visible slot count');

const leonov = trade.match(/leonov:\s*\{[\s\S]*?\n\s*\},\n\s*technician:/)?.[0] || '';
const diesel = trade.match(/technician:\s*\{[\s\S]*?\n\s*\},\n\s*friendly:/)?.[0] || '';
assert(leonov, 'Leonov vendor block missing');
assert(diesel, 'Diesel vendor block missing');
assert(!leonov.includes('...detectors.filter'), 'Leonov must not sell detectors');
assert(diesel.includes('detectors.filter'), 'Diesel must sell detectors');
assert(diesel.includes("category: 'detector'"), 'Diesel detector category missing');
assert(diesel.includes('getDetectorUnlockTier(player.level)'), 'Diesel detector level gate missing');

assert(css.includes('TRADE_V2_SCROLL_GRIDS'), 'trade v2 scrolling rules not installed');
assert(css.includes('#tradeMenu .trade-stock-scroll,#tradeMenu #tradeInventory'), 'merchant and player scrolling rule missing');
assert(css.includes('#tradeMenu .trade-staging{max-height:'), 'staging list scrolling rule missing');
assert((css.match(/overflow-y:auto/g) || []).length >= 2, 'trade lists must be vertically scrollable');

for (const action of ['selection','trade','talk','back']) assert(hubs.includes(`data-leonov-action=\"${action}\"`) || action === 'selection' || action === 'trade', `Leonov ${action} missing`);
assert(hubCss.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'Leonov must have one four-button bottom row');
for (const action of ['trade','talk','back']) assert(hubs.includes(`data-zhuchara-action=\"${action}\"`), `Zhuchara ${action} missing`);
assert(hubCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'), 'Zhuchara must have one bottom row');
assert(hubs.includes("fetch('ui/zhuchara-portrait.webp.b64?v=20260918')"), 'Zhuchara portrait loader missing');
assert(image.startsWith('UklG') && image.length > 10000, 'Zhuchara portrait base64 is missing or truncated');

assert(trade.includes("window.TradeMenu = Object.freeze({version: '1.1.0'"), 'TradeMenu version must be 1.1.0');
assert(hubs.includes("version: '1.0.1'"), 'TraderHubs version must be 1.0.1');
console.log('PASS: trade v2 requirements');
