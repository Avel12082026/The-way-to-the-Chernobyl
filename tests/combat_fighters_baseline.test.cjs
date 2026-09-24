const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const data=require('../images/combat/fighters.js').data;
// Frozen from deployed 8ba7cbc, modular-grip-fix-v2. Sorting object keys permits
// harmless serialization changes while preserving every source value and point.
const oldWeaponIds=[1,2,3,5,6,7,19,20,32,44,50,56,62,68,74,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125];
const shotgunIds=[20,106,107,108,109,110,111,19,112,113,114,32,115,116,44,117,62,118,50,119,56,120,121,68,122,123,74,124,125];
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const oldWeapons=Object.fromEntries(oldWeaponIds.map(id=>[id,data.weapons[id]]));
for(const id of oldWeaponIds)assert.ok(oldWeapons[id],'Missing previously published weapon '+id);
const oldAdjustments=Object.fromEntries(Object.entries(data.pairAdjustments).filter(([key])=>shotgunIds.includes(Number(key.split('-')[1]))));
assert.equal(Object.keys(data.characters).length,96);
assert.equal(Object.keys(oldWeapons).length,55);
assert.equal(Object.keys(oldAdjustments).length,2784);
assert.equal(hash(data.characters),'9c70bf0368d06b7b68faef84163fe76a0e254eae1cfb2de50192fc3cabfc75e5','Existing pistol/heavy poses, grip anchors and masks must remain unchanged');
assert.equal(hash(oldWeapons),'153c0e1a9dd5fc3a3bfa972ee228b15b156641e9bafee4d661d9caba6ab60a98','Existing 55 weapon anchors, guards and scales must remain unchanged');
assert.equal(hash(oldAdjustments),'7772c3ea2ede061d0acb1c4ca41a096b4688c07b3f049095852a2c36c89e78d2','All 2,784 previously fitted shotgun pairs must remain unchanged');
console.log('PASS: deployed 8ba7cbc baseline preserved: 96 characters, 55 weapons, 2784 shotgun adjustments');
