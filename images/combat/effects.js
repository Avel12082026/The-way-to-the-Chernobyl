(function(root){
'use strict';
// Muzzle coordinates are in the 1536×1024 battle canvas. Only reviewed sprites
// are enabled: unsupported weapons must never flash at an invented position.
const muzzles={1:{x:1105,y:683,angle:-2.65}};
function shouldFlash(reaction,elapsed,weaponId){return !!(reaction?.shot&&muzzles[weaponId]&&elapsed>=0&&elapsed<90);}
function drawFlash(ctx,reaction,elapsed,weaponId){
 if(!shouldFlash(reaction,elapsed,weaponId))return false;
 const muzzle=muzzles[weaponId],fade=1-elapsed/90;
 ctx.save();ctx.translate(muzzle.x,muzzle.y);ctx.rotate(muzzle.angle);ctx.globalCompositeOperation='screen';ctx.globalAlpha=fade;
 const glow=ctx.createRadialGradient(0,0,2,0,0,75);glow.addColorStop(0,'rgba(255,243,178,.9)');glow.addColorStop(.35,'rgba(255,170,38,.45)');glow.addColorStop(1,'rgba(255,120,10,0)');ctx.fillStyle=glow;ctx.fillRect(-75,-75,150,150);
 ctx.fillStyle='#ffdc78';ctx.beginPath();ctx.moveTo(-9,-6);ctx.lineTo(28,-14);ctx.lineTo(20,-30);ctx.lineTo(55,-12);ctx.lineTo(94,0);ctx.lineTo(51,10);ctx.lineTo(25,28);ctx.lineTo(28,11);ctx.lineTo(-9,6);ctx.closePath();ctx.fill();
 ctx.fillStyle='#fffce9';ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(44,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fill();ctx.restore();return true;
}
const api={drawFlash,shouldFlash,muzzles};root.CombatEffects=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
