const assert=require('node:assert/strict');
const f=require('../images/combat/fighters.js');
(async()=>{
const urls=new Set();let count=0;
for(const armorId of Object.keys(f.data.characters))for(const weaponId of Object.keys(f.data.weapons)){
 const gear=f.resolve({armorId,weaponId});assert.equal(gear.ready,true);
 const calls=[];const layers=await f.load(gear,async url=>{urls.add(url);return {url,width:1024,height:1536};});
 const ctx={save(){},restore(){},translate(){},scale(){},drawImage(im){calls.push(im.url);}};
 assert.equal(f.draw(ctx,layers,'player'),true);assert.deepEqual(calls,[gear.body,gear.gun,gear.hands]);
 assert.equal(f.draw(ctx,layers,'enemy'),true);count++;
}
assert.equal(count,96*26);assert.equal(urls.size,96*2+26);
assert.equal(f.resolve({armorId:1,weaponId:11}).ready,false);
assert.equal(f.resolve({armorId:999,weaponId:86}).ready,false);
assert.equal(f.resolve(null).ready,false);
await assert.rejects(()=>f.load(f.resolve({armorId:1,weaponId:86}),async()=>{throw Error('missing');}));
console.log(JSON.stringify({combinations:count,uniqueImageURLs:urls.size,passed:true}));
})();
