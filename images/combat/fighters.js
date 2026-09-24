(function(root){
'use strict';
// Every entry is a complete character WITH its exact equipment, facing right.
// No interchangeable limbs, hand masks or substitute equipment.
const sprites={
 '1:86':{image:'images/combat/fighters/1-86.png',width:1024,height:1536}
};
function resolve(gear){
 const armorId=Number(gear?.armorId),weaponId=Number(gear?.weaponId);
 const key=armorId+':'+weaponId;
 return {key,armorId,weaponId,...sprites[key],ready:!!sprites[key]};
}
function draw(ctx,image,side,offset=0){
 if(!image||!['player','enemy'].includes(side))return false;
 // Both complete sprites have the same size and ground line. Reflect the
 // entire enemy around its centre, preserving stock and hand contacts.
 const height=800,width=height*image.width/image.height;
 const x=(side==='player'?340:1196)+offset;
 ctx.save();ctx.translate(x,940);ctx.scale(side==='enemy'?-1:1,1);
 ctx.drawImage(image,-width/2,-height,width,height);ctx.restore();return true;
}
const api={resolve,draw,sprites};root.CombatFighters=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
