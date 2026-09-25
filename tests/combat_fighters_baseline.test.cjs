const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const data=require('../images/combat/fighters.js').data;
// Freeze deployed e423b52a. Only these three reviewed contours may differ.
const oldMasks=require('./baseline-old-masks.json'),fixes=require('./baseline-mask-fixes.json');
const oldWeaponIds=[1,2,3,5,6,7,10,11,12,15,16,17,18,19,20,21,22,25,26,29,32,37,38,43,44,45,47,50,51,53,56,57,59,61,62,63,65,67,68,69,71,74,75,77,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125];
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
assert.deepEqual(Object.keys(fixes.supportArms).sort(),['20','69']);
assert.deepEqual(Object.keys(fixes.handMasks),['20']);
assert.deepEqual(Object.keys(fixes.handMasks[20]),['1']);
const characters=structuredClone(data.characters),supportArms=structuredClone(data.supportArms);
for(const id of [20,69]){
 assert.deepEqual(data.supportArms[id],fixes.supportArms[id],'Reviewed support-arm correction differs on armor '+id);
 supportArms[id]=oldMasks.supportArms[id];
}
assert.deepEqual(data.characters[20].poses.heavy.handMasks[1],fixes.handMasks[20][1],'Armor20 must retain the exact reviewed support-hand contour');
characters[20].poses.heavy.handMasks[1]=oldMasks.handMasks[20][1];
const oldWeapons=Object.fromEntries(oldWeaponIds.map(id=>[id,data.weapons[id]]));
for(const id of oldWeaponIds)assert.ok(oldWeapons[id],'Missing previously published weapon '+id);
const oldAdjustments=Object.fromEntries(Object.entries(data.pairAdjustments).filter(([key])=>oldWeaponIds.includes(Number(key.split('-')[1]))));
assert.equal(data.version,'combat-environments-flashes-v1');
assert.equal(Object.keys(data.characters).length,96);
assert.equal(Object.keys(oldWeapons).length,84);
assert.equal(Object.keys(oldAdjustments).length,5568);
assert.equal(Object.keys(data.supportArms).length,96);
assert.equal(hash(characters),'9c70bf0368d06b7b68faef84163fe76a0e254eae1cfb2de50192fc3cabfc75e5','Every character field except the exact reviewed armor20 support-hand outline must remain unchanged');
assert.equal(hash(oldWeapons),'719b8f47589443897a49ab6013cc85a9fd4b6bc31748f2f02a3728176151a39d','All existing 84 weapons must remain unchanged');
assert.equal(hash(oldAdjustments),'af82d8342541e87d8921be45f8dca63aa13786bcb14ea213e68ddf5fbfc7a346','All 5568 shotgun/automatic fits, including Groza87/9, must remain unchanged');
assert.equal(hash(supportArms),'75b1ac151cce923c0f7a74e8e0200d30e14e79e7792ba9d71974b4cb9f62ddf6','All support-arm contours except the exact reviewed20/69 fixes must remain unchanged');
console.log('PASS: deployed e423b52a preserved with exactly three approved mask corrections;84 weapons and5568 fits frozen');
