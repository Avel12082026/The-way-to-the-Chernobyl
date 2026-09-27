'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');

assert(trade.includes("const isYantarLeonovContext"),'Yantar Leonov context detector missing');
assert(trade.includes("pos?.origin === 'yantar-bunker' && location === 6"),'Yantar Leonov must be location-scoped');
assert(trade.includes("w.progressionClass === 'automatic'"),'Yantar Leonov must use the automatic weapon class');
assert(trade.includes("marked.length === 29"),'Yantar Leonov automatic class must contain 29 weapons');
assert(trade.includes("weaponOrder.slice(pistolStart + 58, pistolStart + 87)"),'Yantar Leonov weapon fallback must be the 29 entries after Barman');
assert(trade.includes("!a.adminOnly && !a.isPremiumArmor"),'Yantar armor list must never expose admin/premium armor');
assert(trade.includes("Number(a.id || 0) > 58"),'Yantar armor list must start after Barman armor');
assert(trade.includes("afterBarman.length >= 29 ? afterBarman.slice(0,29) : safe.slice(58,87)"),'Yantar armor list must contain the next 29 safe suits');
assert(trade.includes("sourceVendor = 'leonov-yantar'"),'Yantar purchase provenance missing');
assert(trade.includes("serverVendor = 'zhuchara'"),'Yantar regular gear must reuse the normal gear purchase route');
assert(trade.includes("!item?.isResearchSuit"),'research suits must stay on Leonov server validation');
assert(trade.includes("version: '1.3.9'"),'TradeMenu version mismatch');
console.log('PASS: Yantar Leonov adds the next 29 weapons and 29 safe suits after Barman');
