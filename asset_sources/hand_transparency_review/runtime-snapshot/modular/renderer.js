(function(root){
'use strict';
function resolve(weaponId,armorId){
 const data=root.COMBAT_MODULAR_DATA,weapon=data?.weapons[weaponId],hand=data?.hands[armorId];
 if(!weapon||!hand)return null;
 const [x,y,angle,width,height]=weapon.sourceMuzzle,fit=weapon.fit;
 const sx=fit.width/width,sy=fit.height/height;
 return {weapon:weapon.image,hand,fit,contour:data.frontContour,
  muzzle:{x:fit.x+x*sx,y:fit.y+y*sy,angle:Math.atan2(Math.sin(angle)*sy,Math.cos(angle)*sx)}};
}
function drawForeground(ctx,weapon,hand,visual){
 if(!visual)return false;
 const fit=visual.fit;
 // One complete hand: the index is behind the weapon, the thumb and palm in front.
 // The trigger guard's alpha reveals the index without cutting out a floating tip.
 ctx.drawImage(hand,0,0,1536,1024);
 ctx.drawImage(weapon,fit.x,fit.y,fit.width,fit.height);
 ctx.save();ctx.beginPath();
 visual.contour.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.clip();ctx.drawImage(hand,0,0,1536,1024);ctx.restore();
 return true;
}
root.CombatModular={resolve,drawForeground};
})(window);
