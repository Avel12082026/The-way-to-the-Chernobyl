(function(root){
'use strict';
const duration=130;
function drawMuzzleFlash(ctx,muzzle,options={}){
 const age=Number(options.age??0);
 if(!muzzle||![muzzle.x,muzzle.y,muzzle.angle].every(Number.isFinite)||!Number.isFinite(age)||age<0||age>=duration)return false;
 const kind=options.kind||muzzle.kind||'rifle',energy=Number(options.weaponId??muzzle.weaponId)===55;
 const lengths={pistol:52,shotgun:92,automatic:72,rifle:82};
 const suppressed=muzzle.suppressed||kind==='suppressed';
 const fade=1-age/duration,shape=.78+.22*Math.sin(Math.PI*fade);
 const length=(suppressed?28:(lengths[kind]||72))*shape;
 const radius=(suppressed?5:kind==='shotgun'?19:13)*shape;
 ctx.save();ctx.translate(muzzle.x,muzzle.y);ctx.rotate(muzzle.angle);
 // The origin is the reviewed bore exit. All luminous pixels stay in front of it.
 ctx.beginPath();ctx.rect(0,-radius*2,length*1.3,radius*4);ctx.clip();
 ctx.globalAlpha=fade;
 const glow=ctx.createLinearGradient(0,0,length,0);
 glow.addColorStop(0,energy?'rgba(210,251,255,.85)':'rgba(255,243,186,.9)');
 glow.addColorStop(.22,energy?'rgba(78,216,255,.8)':'rgba(255,180,53,.78)');
 glow.addColorStop(1,energy?'rgba(34,118,255,0)':'rgba(255,86,12,0)');
 ctx.fillStyle=glow;
 ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(length*.3,-radius*.45);ctx.lineTo(length*.14,-radius);ctx.lineTo(length*.55,-radius*.42);ctx.lineTo(length*.86,-radius*.64);ctx.lineTo(length*.69,-radius*.13);ctx.lineTo(length,0);ctx.lineTo(length*.65,radius*.19);ctx.lineTo(length*.81,radius*.72);ctx.lineTo(length*.35,radius*.43);ctx.lineTo(length*.16,radius);ctx.lineTo(length*.2,radius*.32);ctx.closePath();ctx.fill();
 ctx.fillStyle=energy?'#eafcff':'#fffce9';
 ctx.beginPath();ctx.moveTo(0,-1.1);ctx.lineTo(length*.32,-radius*.21);ctx.lineTo(length*.69,0);ctx.lineTo(length*.3,radius*.22);ctx.lineTo(0,1.1);ctx.closePath();ctx.fill();
 ctx.restore();return true;
}
function drawGroundShadow(ctx,feet){
 if(!Array.isArray(feet))return false;
 for(const foot of feet){if(![foot.x,foot.y,foot.width].every(Number.isFinite))continue;
  ctx.save();ctx.translate(foot.x,foot.y);ctx.scale(Math.max(12,foot.width*.6),8);
  const gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,'rgba(9,11,8,.46)');gradient.addColorStop(.45,'rgba(9,11,8,.25)');gradient.addColorStop(1,'rgba(9,11,8,0)');ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }return true;
}
const api={drawMuzzleFlash,drawGroundShadow,duration};root.CombatEffects=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
