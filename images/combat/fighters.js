(function(root){
'use strict';
// Every entry is a complete character WITH its exact equipment, facing right.
// No interchangeable limbs, hand masks or substitute equipment.
const sprites={
 "1:12": {
  "image": "images/combat/fighters/1-12.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1478,
  "feet": [
   {
    "x": 106,
    "y": 1474,
    "rx": 89,
    "ry": 13
   },
   {
    "x": 756,
    "y": 1437,
    "rx": 152,
    "ry": 16
   }
  ]
 },
 "40:12": {
  "image": "images/combat/fighters/40-12.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1502,
  "feet": [
   {
    "x": 118,
    "y": 1498,
    "rx": 92,
    "ry": 14
   },
   {
    "x": 749,
    "y": 1461,
    "rx": 177,
    "ry": 18
   }
  ]
 },
 "2:12": {
  "image": "images/combat/fighters/2-12.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1429,
  "feet": [
   {
    "x": 104,
    "y": 1425,
    "rx": 77,
    "ry": 16
   },
   {
    "x": 688,
    "y": 1390,
    "rx": 142,
    "ry": 16
   }
  ]
 },
 "7:12": {
  "image": "images/combat/fighters/7-12.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1471,
  "feet": [
   {
    "x": 132,
    "y": 1467,
    "rx": 96,
    "ry": 16
   },
   {
    "x": 769,
    "y": 1453,
    "rx": 158,
    "ry": 16
   }
  ]
 },
 "16:12": {
  "image": "images/combat/fighters/16-12.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1473,
  "feet": [
   {
    "x": 148,
    "y": 1469,
    "rx": 70,
    "ry": 14
   },
   {
    "x": 768,
    "y": 1436,
    "rx": 116,
    "ry": 14
   }
  ]
 },
 "29:12": {
  "image": "images/combat/fighters/29-12.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1492,
  "feet": [
   {
    "x": 125,
    "y": 1488,
    "rx": 68,
    "ry": 14
   },
   {
    "x": 668,
    "y": 1448,
    "rx": 133,
    "ry": 14
   }
  ]
 },
 "1:1": {
  "image": "images/combat/fighters/1-1.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1422,
  "feet": [
   {
    "x": 195,
    "y": 1417,
    "rx": 63,
    "ry": 14
   },
   {
    "x": 774,
    "y": 1390,
    "rx": 115,
    "ry": 14
   }
  ]
 },
 "40:1": {
  "image": "images/combat/fighters/40-1.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1515,
  "feet": [
   {
    "x": 199.5,
    "y": 1510,
    "rx": 79.5,
    "ry": 14
   },
   {
    "x": 874.5,
    "y": 1431,
    "rx": 85.5,
    "ry": 14
   }
  ]
 },
 "1:11": {
  "image": "images/combat/fighters/1-11.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1463,
  "feet": [
   {
    "x": 168,
    "y": 1459,
    "rx": 76,
    "ry": 14
   },
   {
    "x": 812,
    "y": 1431,
    "rx": 119,
    "ry": 14
   }
  ]
 },
 "40:11": {
  "image": "images/combat/fighters/40-11.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1497,
  "feet": [
   {
    "x": 144,
    "y": 1493,
    "rx": 74,
    "ry": 14
   },
   {
    "x": 786,
    "y": 1456,
    "rx": 92,
    "ry": 14
   }
  ]
 },
 "1:13": {
  "image": "images/combat/fighters/1-13.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1419,
  "feet": [
   {
    "x": 91,
    "y": 1415,
    "rx": 63,
    "ry": 14
   },
   {
    "x": 695,
    "y": 1393,
    "rx": 126,
    "ry": 14
   }
  ]
 },
 "40:13": {
  "image": "images/combat/fighters/40-13.png",
  "width": 1024,
  "height": 1536,
  "soleY": 1410,
  "feet": [
   {
    "x": 80.5,
    "y": 1406,
    "rx": 71.5,
    "ry": 14
   },
   {
    "x": 659,
    "y": 1392,
    "rx": 167,
    "ry": 14
   }
  ]
 }
};
function resolve(gear){
 const armorId=Number(gear?.armorId),weaponId=Number(gear?.weaponId);
 const key=armorId+':'+weaponId;
 return {key,armorId,weaponId,...sprites[key],ready:!!sprites[key]};
}
function draw(ctx,image,side,offset=0,options={}){
 if(!image||!['player','enemy'].includes(side))return false;
 // Both complete sprites have the same size and ground line. Reflect the
 // entire enemy around its centre, preserving stock and hand contacts.
 const height=800,width=height*image.width/image.height;
 const fit=options.fit,scale=height/image.height;
 const soleY=fit?.soleY??image.height;
 const top=-soleY*scale;
 const groundY=options.groundY??940;
 const x=(side==='player'?340:1196)+offset;
 ctx.save();ctx.translate(x,groundY);ctx.scale(side==='enemy'?-1:1,1);
 // Two contact shadows follow the actual soles, including the farther foot.
 // Empty PNG padding is never treated as the ground contact point.
 for(const foot of fit?.feet||[]){
  ctx.save();ctx.translate((foot.x-image.width/2)*scale,(foot.y-soleY)*scale+2);
  ctx.scale(foot.rx*scale*1.08,foot.ry*scale*1.3);
  const shadow=ctx.createRadialGradient(0,0,0,0,0,1);
  const opacity=options.shadowOpacity??.3;
  shadow.addColorStop(0,`rgba(14,17,12,${opacity})`);
  shadow.addColorStop(.55,`rgba(14,17,12,${opacity*.65})`);
  shadow.addColorStop(1,'rgba(14,17,12,0)');
  ctx.fillStyle=shadow;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 ctx.drawImage(image,-width/2,top,width,height);ctx.restore();return true;
}
const api={resolve,draw,sprites};root.CombatFighters=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
