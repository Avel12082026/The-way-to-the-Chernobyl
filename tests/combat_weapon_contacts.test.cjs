const assert=require('node:assert/strict');
const f=require('../images/combat/fighters.js');
const originals=require('./baseline-reviewed-weapon-fits.json');
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// These native forearm poses were separately reviewed at their exact scale.
const reviewedScaleBounds={'32-56':[.38967,.38969],'32-62':[.39707,.39709],'32-91':[.38501,.38504],'32-96':[.37985,.37988]};
for(const weaponId of [114,32]){
const profile=require('../asset_sources/combat_weapon_fits/'+weaponId+'.json');
assert.equal(profile.weaponId,weaponId);
assert.equal(Object.keys(profile.armorOverrides).length,96,'Every armor needs an independently inspected index-finger target');
let count=0,movedArms=0;
for(let armorId=1;armorId<=96;armorId++){
 const resolved=f.resolve({armorId,weaponId}),c=resolved.character,w=resolved.weapon,a=resolved.adjustment,o=profile.armorOverrides[armorId];
 assert.ok(originals.pairAdjustments[armorId+'-'+weaponId],'The pre-change fit remains available for regression review');
 assert.equal(resolved.gun,'images/combat/modular/weapons/'+weaponId+'.png','All suits share one weapon PNG');
 const scale=w.scale*a.size/100,r=a.angle*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
 const trigger=o.trigger||c.trigger,bodySupport=o.support||c.support,shift=a.supportShift||[0,0];
 const actualSupport=[bodySupport[0]+shift[0],bodySupport[1]+shift[1]];
 assert.ok(Math.hypot(...shift)<=(o.maximumSupportShift??profile.maximumSupportShift)+.001,'Armor '+armorId+' exceeds the reviewed forearm travel');
 assert.ok(Math.abs(a.angle)<25,'Weapon must remain in a plausible low-ready direction');
 const [minimumScale,maximumScale]=reviewedScaleBounds[weaponId+'-'+armorId]||[.4,.65];
 assert.ok(scale>=minimumScale&&scale<=maximumScale,'Weapon proportions must remain within the reviewed bounds on '+weaponId+'/'+armorId);
 // Independently project the inspected trigger and reverse-project the physical
 // supporting palm. The latter must lie on the actual source pump segment.
 const project=p=>[c.grip[0]+a.dx+scale*((p[0]-w.grip[0])*co-(p[1]-w.grip[1])*si),c.grip[1]+a.dy+scale*((p[0]-w.grip[0])*si+(p[1]-w.grip[1])*co)];
 assert.ok(distance(project(profile.sourceTrigger),trigger)<.001,'Trigger misses the index pad on armor '+armorId);
 const px=actualSupport[0]-c.grip[0]-a.dx,py=actualSupport[1]-c.grip[1]-a.dy;
 const contact=[w.grip[0]+(px*co+py*si)/scale,w.grip[1]+(-px*si+py*co)/scale];
 const [start,end]=profile.sourceSupportSegment;
 const vx=end[0]-start[0],vy=end[1]-start[1];
 const t=((contact[0]-start[0])*vx+(contact[1]-start[1])*vy)/(vx*vx+vy*vy);
 const nearest=[start[0]+t*vx,start[1]+t*vy];
 assert.ok(t>=-.00002&&t<=1.00002&&distance(contact,nearest)<.002,'Supporting palm misses the inspected fore-end on armor '+armorId);
 const layers={...resolved,body:{width:1024,height:1536}};
 const p=f.project(layers,'player',profile.sourceTrigger),e=f.project(layers,'enemy',profile.sourceTrigger);
 assert.ok(Math.abs(p.x+e.x-1536)<.001&&Math.abs(p.y-e.y)<.001,'NPC orientation must preserve the exact contact');
 if(a.supportShift)movedArms++;count++;
}
console.log(JSON.stringify({passed:true,weapon:weaponId,indexContacts:count,foreEndContacts:count,sharedWeaponPNGs:1,movedArms}));
}
// Overrides are local to the reviewed pair and never replace a shared PNG/pose.
const reviewed=f.resolve({armorId:19,weaponId:114}),unreviewed=f.resolve({armorId:19,weaponId:20});
assert.equal(reviewed.character,unreviewed.character);
assert.notEqual(reviewed.adjustment.handMasks,unreviewed.adjustment.handMasks);
assert.equal(unreviewed.adjustment.handMasks,undefined);
