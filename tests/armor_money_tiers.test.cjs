'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const arrayMatch=html.match(/const armorItems = (\[[\s\S]*?\n    \]);/);
assert(arrayMatch,'armor array missing');
const block=html.match(/\/\/ ARMOR_LOCATION_TIERS_V1([\s\S]*?)\/\/ ===== ДЕТЕКТОРЫ =====/);
assert(block,'armor tier mapping missing');
const ctx={console}; vm.createContext(ctx);
vm.runInContext('const armorItems='+arrayMatch[1]+';\n// ARMOR_LOCATION_TIERS_V1'+block[1]+'\nglobalThis.__armor=armorItems;',ctx);
const armor=ctx.__armor;
const regular=armor.filter(a=>!a.adminOnly&&!a.isPremiumArmor&&!a.isResearchSuit);
assert.equal(regular.length,80);
const expected=[8,8,8,7,7,7,7,7,7,7,7];
for(let tier=1;tier<=11;tier++) assert.equal(regular.filter(a=>a.tier===tier).length,expected[tier-1],'armor tier '+tier);
for(let i=1;i<regular.length;i++){
  assert(regular[i].armor>=regular[i-1].armor,'armor strength must not go backwards');
  assert(regular[i].price>=regular[i-1].price,'armor price must not go backwards');
}
assert(!html.includes('player.level >= (a.unlockLevel || 0)'),'armor shop must not be level-gated');
console.log('PASS: armor is money-gated and mapped cleanly to T1-T11');