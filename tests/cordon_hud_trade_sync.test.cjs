'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const bunker=fs.readFileSync('ui/bunker-menu.js','utf8');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const hubs=fs.readFileSync('ui/trader-hubs.js','utf8');

for(const id of ['coins','health','hunger','thirst','bunkerHealth','bunkerHunger','bunkerThirst']){
  const count=(html.match(new RegExp('id=["\\\']'+id+'["\\\']','g'))||[]).length;
  assert.equal(count,1,'HUD id must be unique: '+id);
}

assert(bunker.includes("meter('bunker' + name, player[key], max, label)"),'Cordon vitals are not bound to player state');
assert(bunker.includes("text('coins', Math.max(0, finite(player.coins)))"),'Cordon byte balance is not bound to player.coins');
assert(bunker.includes("const width = clamp(value / max * 100, 0, 100) + '%'"),'vital bar width is not proportional to value/max');
assert(bunker.includes("if (screen === 'main') {\n        refresh();\n        scheduleLayout();"),'main-camp navigation must force a HUD refresh');
assert(bunker.includes("window.BunkerMenu = {version: '1.24.0'"),'BunkerMenu sync release version missing');

assert(trade.includes("for (const key of ['inventory', 'coins', 'breedCredits'"),'trade result does not apply authoritative coins');
assert(trade.includes('native.updateUI();'),'confirmed trade does not update main UI');
assert(trade.includes('window.BunkerMenu?.refresh?.();'),'confirmed trade does not explicitly refresh camp HUD');
assert(trade.includes("window.TradeMenu = Object.freeze({version: '1.6.1'"),'TradeMenu sync release version missing');

const showHub=(hubs.match(/function showHub\(hub, key\) \{([\s\S]*?)\n  \}/)||[])[1]||'';
assert(showHub.includes("nativeOpenScreen('main')"),'trader portrait does not restore the camp first');
assert(showHub.includes('window.BunkerMenu?.refresh?.();'),'opening trader portrait does not refresh camp HUD');
const zhBack=(hubs.match(/if \(action === 'trade'\)[\s\S]*?else if \(action === 'back'\) \{([\s\S]*?)\n      \}/)||[])[1]||'';
assert(zhBack.includes("nativeOpenScreen('main')")&&zhBack.includes('window.BunkerMenu?.refresh?.();'),'Zhuchara Back must refresh camp HUD');
assert(hubs.includes("version:'1.4.6'"),'TraderHubs sync release version missing');

for(const ref of [
  'ui/bunker-menu.js?v=20261001-cordon-hud-sync1',
  'ui/trade-menu.js?v=20261001-cordon-hud-sync1',
  'ui/trader-hubs.js?v=20261001-cordon-hud-sync1'
]) assert(html.includes(ref),'fresh client cache key missing: '+ref);

assert(html.includes('name: "Водка Столичная", type: "vodka", radiationRemove: 50, foodCost: 50, waterCost: 50, price: 100'),'Stolichnaya client definition missing');
assert(trade.includes("ZHUCHARA_CONSUMABLES = new Set(['Хлеб','Вода','Аптечка гражданская','Водка Столичная'])"),'Stolichnaya missing from Zhuchara client stock');

console.log('PASS: Cordon HUD and Zhuchara trade share authoritative player state and force refresh on every return path');
