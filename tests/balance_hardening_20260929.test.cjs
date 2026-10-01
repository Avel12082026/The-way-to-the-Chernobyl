'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const patch=fs.readFileSync('server_patches/balance_hardening_20260929.patch','utf8');
const added=patch.split('\n').filter(line=>line.startsWith('+')&&!line.startsWith('+++')).join('\n');
const html=fs.readFileSync('index.html','utf8');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const env=require('../images/combat/environments-v2.js');

assert(added.includes('npcLootTrackedBaseServer'),'NPC suffix-aware snapshot missing');
assert(added.includes('npcLootRestoreSnapshotServer'),'NPC restore missing');
assert(added.includes('pveAddItem(data,drop.name,dropQty,true)'),'non-stacking NPC gear drop missing');
assert(added.includes('const wantedQty=titan?2:1'),'Titan double NPC drop missing');
assert(added.includes('50-countNonStackingSlotsServer'),'NPC equipment slot limit missing');
assert(!added.includes('pveAddItem(data,p.weaponName,1,true);'),'legacy guaranteed NPC weapon must be removed');
assert(!added.includes('pveAddItem(data,p.armorName,1,true);'),'legacy guaranteed NPC armor must be removed');

assert(added.includes('migrateZoneRouteUnlocksStrict20260929'),'zone unlock migration missing');
assert(added.includes('return travelled.has(loc)'),'route-authoritative zone unlock missing');
assert(!added.includes('return zoneMapListUnlocked(data,ZONE_MAP_FIRST_PISTOLS_SERVER'),'level fallback must be removed');

assert(added.includes('Math.min(0.95,baseRun+agility*0.003'),'escape cap missing');
assert(added.includes('discountPct=Math.min(0.06'),'server intellect percentage missing');
assert(html.includes('discountPct=Math.min(0.06'),'client intellect percentage missing');

assert(trade.includes('const reachedZoneTier = () =>'),'client reached-zone tier helper missing');
assert(trade.includes('regularArmorByTier(1,Math.min(3,reachedZoneTier()))'),'Zhuchara tier gate missing');
assert(trade.includes('regularArmorByTier(4,Math.min(6,reachedZoneTier()))'),'Barman tier gate missing');
assert(trade.includes('Number(w.tier)>=7&&Number(w.tier)<=Math.min(9,reached)'),'Yantar future automatic gate missing');

assert.equal(env.zones.length,6);
assert.equal(env.select({zoneLocation:5,battleToken:'x'}).zoneId,5);
assert.equal(env.select({zoneLocation:6,battleToken:'x'}).zoneId,6);
assert(env.select({zoneLocation:5,battleToken:'x'}).path.includes('dark-valley-placeholder.svg'));
assert(env.select({zoneLocation:6,battleToken:'x'}).path.includes('yantar-placeholder.svg'));

assert(html.includes('price: 750, healTicks: 5'),'civilian medkit must remain unchanged');
assert(html.includes('price: 2000, healTicks: 5'),'army medkit must remain unchanged');
assert(html.includes('price: 6000, radiationRemove: 100, instantHeal: true'),'scientific medkit must heal instantly');

console.log('PASS: NPC loot hardened, zone routes authoritative, shops geography-gated, agility/intellect balanced, dark T5/T6 placeholders, scientific medkit instant');