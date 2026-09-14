(function(root){
'use strict';
// Muzzle coordinates are in the 1536×1024 battle canvas. Only reviewed sprites
// are enabled: unsupported weapons must never flash at an invented position.
const muzzles={1:{x:1105,y:683,angle:-2.65}};
function effectKind(reaction,elapsed,weapon){
 if(!reaction?.shot||elapsed<0||!weapon)return null;
 if(weapon.suppressed===true)return elapsed<650?'smoke':null;
 if(weapon.suppressed===false)return elapsed<90?'flash':null;
 return null;
}
function shouldFlash(reaction,elapsed,weaponId,suppressed=false){return !!(muzzles[weaponId]&&effectKind(reaction,elapsed,{suppressed})==='flash');}
function drawSmoke(ctx,reaction,elapsed,muzzle){
 if(!muzzle||effectKind(reaction,elapsed,{suppressed:true})!=='smoke')return false;
 const progress=elapsed/650;
 ctx.save();ctx.globalCompositeOperation='source-over';
 for(let i=0;i<3;i++){
  const drift=progress*(20+i*9),radius=4+progress*(12+i*5);
  const x=muzzle.x+Math.cos(muzzle.angle)*drift+Math.sin(progress*4+i)*3;
  const y=muzzle.y+Math.sin(muzzle.angle)*drift-progress*24;
  const gradient=ctx.createRadialGradient(x,y,0,x,y,radius);
  gradient.addColorStop(0,`rgba(184,188,180,${.11*(1-progress)})`);gradient.addColorStop(1,'rgba(184,188,180,0)');
  ctx.fillStyle=gradient;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
 }
 ctx.restore();return true;
}
function drawShot(ctx,reaction,elapsed,weaponId,weapon){
 const kind=effectKind(reaction,elapsed,weapon);
 // The point must be calibrated at the actual barrel/suppressor tip.
 if(kind==='smoke')return drawSmoke(ctx,reaction,elapsed,muzzles[weaponId]);
 if(kind==='flash')return drawFlash(ctx,reaction,elapsed,weaponId);
 return false;
}
function drawFlash(ctx,reaction,elapsed,weaponId){
 if(!shouldFlash(reaction,elapsed,weaponId))return false;
 const muzzle=muzzles[weaponId],fade=1-elapsed/90;
 ctx.save();ctx.translate(muzzle.x,muzzle.y);ctx.rotate(muzzle.angle);ctx.globalCompositeOperation='screen';ctx.globalAlpha=fade;
 const glow=ctx.createRadialGradient(0,0,2,0,0,75);glow.addColorStop(0,'rgba(255,243,178,.9)');glow.addColorStop(.35,'rgba(255,170,38,.45)');glow.addColorStop(1,'rgba(255,120,10,0)');ctx.fillStyle=glow;ctx.fillRect(-75,-75,150,150);
 ctx.fillStyle='#ffdc78';ctx.beginPath();ctx.moveTo(-9,-6);ctx.lineTo(28,-14);ctx.lineTo(20,-30);ctx.lineTo(55,-12);ctx.lineTo(94,0);ctx.lineTo(51,10);ctx.lineTo(25,28);ctx.lineTo(28,11);ctx.lineTo(-9,6);ctx.closePath();ctx.fill();
 ctx.fillStyle='#fffce9';ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(44,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fill();ctx.restore();return true;
}
const api={drawFlash,drawSmoke,drawShot,effectKind,shouldFlash,muzzles};root.CombatEffects=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
