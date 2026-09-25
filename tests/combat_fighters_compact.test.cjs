const assert=require('node:assert/strict');
const f=require('../images/combat/fighters.js');
const oldWeaponIds=[1,2,3,5,6,7,10,11,12,15,16,17,18,19,20,21,22,25,26,29,32,37,38,43,44,45,47,50,51,53,56,57,59,61,62,63,65,67,68,69,71,74,75,77,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125];
const validPolygon=p=>Array.isArray(p)&&p.length>=3&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite));
// Reviewed original poses reach Groza's horizontal front fore-end without moving the arm.
const nativeContacts={46:[1249,523],51:[1249,523],56:[1240,523],57:[1249,523],58:[1249,523],62:[1249,523],84:[1249,523],91:[1246,523],96:[1249,523]};
assert.equal(Object.keys(f.data.supportArms||{}).length,96,'Release requires a reviewed far-arm outline for every Groza armor');
for(let armorId=1;armorId<=96;armorId++){
 const gear=f.resolve({armorId,weaponId:43}),c=gear.character,w=gear.weapon,a=gear.adjustment;
 assert.ok(gear.ready&&validPolygon(gear.supportArm),'Missing compact arm on armor '+armorId);
 assert.equal(gear.supportArm,f.data.supportArms[armorId]);
 const scale=w.scale*a.size/100;
 const nativeContact=nativeContacts[armorId];
 if(nativeContact){
  assert.equal(a.supportShift,undefined,'Already compatible native poses must not articulate');
  assert.ok(scale>=.4&&scale<=.65&&Math.abs(a.angle)<=30,'Native Groza must retain a natural scale and angle');
  const radians=a.angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  function project(point){const x=(point[0]-w.grip[0])*scale,y=(point[1]-w.grip[1])*scale;return[c.grip[0]+a.dx+x*cos-y*sin,c.grip[1]+a.dy+x*sin+y*cos];}
  for(const [source,target]of [[[970,552],c.trigger],[nativeContact,c.support]]){
   const actual=project(source);for(let axis=0;axis<2;axis++)assert.ok(Math.abs(actual[axis]-target[axis])<.01,'Native Groza misses its reviewed hand contact on armor '+armorId);
  }
 }else{
 assert.ok(Math.abs(scale-.55)<1e-12);
 assert.equal(a.angle,0);
 assert.equal(a.supportShift.length,2);assert.ok(a.supportShift.every(Number.isFinite));
 const actualTrigger=[c.grip[0]+a.dx+(970-w.grip[0])*scale,c.grip[1]+a.dy+(552-w.grip[1])*scale];
 for(let axis=0;axis<2;axis++)assert.ok(Math.abs(actualTrigger[axis]-c.trigger[axis])<1e-8,'Trigger anchor moved on armor '+armorId);
 const front=[c.grip[0]+a.dx+(1230-w.grip[0])*scale,c.grip[1]+a.dy+(500-w.grip[1])*scale];
 for(let axis=0;axis<2;axis++)assert.ok(Math.abs(front[axis]-(c.support[axis]+a.supportShift[axis]))<1e-8,'Far hand misses the real fore-end on armor '+armorId);
 }
 for(const weaponId of oldWeaponIds)if(weaponId!==43)assert.equal(f.resolve({armorId,weaponId}).adjustment?.supportShift,undefined,'Compact path must not alter another weapon');
}
console.log('PASS: 96 arm outlines, 87 horizontal compact Groza poses, 9 reviewed native poses, exact trigger/fore-end contacts, other weapons unchanged');
