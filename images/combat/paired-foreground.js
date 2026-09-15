(function(root){
'use strict';
// One reviewed foreground is shared by ready and firing states.
// Opt-in renderer; callers must supply a reviewed image and muzzle profile.
function recoilY(elapsed){return elapsed>=0&&elapsed<220?Math.sin(Math.PI*elapsed/220)*12:0;}
function draw(ctx,image,profile,{shot=false,elapsed=Infinity,reducedMotion=false}={},effects=root.CombatEffects){
 if(!image||!profile)return false;
 const {x,y,scale,muzzle,angle}=profile;
 if(![x,y,scale,angle,...(muzzle||[])].every(Number.isFinite)||scale<=0||muzzle?.length!==2)return false;
 ctx.save();
 try{
  ctx.translate(0,shot&&!reducedMotion?recoilY(elapsed):0);
  ctx.drawImage(image,x,y,image.width*scale,image.height*scale);
  if(shot&&!reducedMotion)effects?.drawShot(ctx,{shot:true},elapsed,profile.weaponId,{suppressed:profile.suppressed},{x:x+muzzle[0]*scale,y:y+muzzle[1]*scale,angle});
 }finally{ctx.restore();}
 return true;
}
const api={draw,recoilY};root.CombatPairedForeground=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
