(function(root) {
  'use strict';
  const layout = {
    width:1536, height:1024,
    pistols:{86:{x:880,y:478,width:515,height:515},2:{x:830,y:427,width:577,height:577,wristX:1375,wristY:840},87:{x:850,y:450,width:577,height:519,wristX:1375,wristY:840}},
    creature:{x:500,y:450,width:420,height:420},
    creatures:{tushkan:{x:610,y:580,width:255,height:255},'chernobyl-dog':{x:480,y:490,width:456,height:380},flesh:{x:460,y:500,width:480,height:360,brightness:.78},boar:{x:455,y:450,width:480,height:400,brightness:.88},isotope:{x:455,y:530,width:495,height:330,brightness:.85},hinge:{x:485,y:400,width:437,height:460,brightness:.85},zombie:{x:505,y:275,width:400,height:600,brightness:.88}}
  };
  // Standing humanoids need a taller frame; quadrupeds stay near ground level.
  for (const id of ['owl','bloodsucker','fracture','controller','stronglav','observer']) {
    layout.creatures[id]={x:470,y:300,width:470,height:570,brightness:.88};
  }
  for (const id of ['poltergeist','fire-poltergeist']) {
    layout.creatures[id]={x:480,y:285,width:450,height:520,brightness:.9};
  }
  for (const id of ['blind-dog','krakozyabra','pseudodog','lynx','chupacabra','psydog','bayun','stregun']) {
    layout.creatures[id]={x:470,y:470,width:470,height:400,brightness:.9};
  }
  for (const id of ['moose','chimera','electrochimera','pseudogiant']) {
    layout.creatures[id]={x:420,y:370,width:570,height:500,brightness:.9};
  }
  layout.creatures.snork={x:470,y:440,width:470,height:430,brightness:.9};
  layout.creatures.burer={x:470,y:420,width:470,height:450,brightness:.88};
  // Each restored weapon is reviewed below with the same armor wrist anchor.
  for (const id of [1,3,5,6,7,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105]) {
    layout.pistols[id]={x:850,y:450,width:577,height:577,wristX:1375,wristY:840};
  }
  function drawForeground(ctx,pistol,sleeve,weaponId) {
    const fit=layout.pistols[weaponId]; if(!fit) return false;
    const wx=fit.wristX||1340, wy=fit.wristY||850;
    // Keep the wrist behind the cuff. Two complementary antialiased clips
    // left a transparent seam and made the skin look cut off at the sleeve.
    ctx.save();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(1190,1024);ctx.lineTo(1228,957);
    ctx.bezierCurveTo(1240,917,1290,864,wx,wy+2);
    ctx.lineTo(1536,772);ctx.lineTo(1536,0);ctx.closePath();ctx.clip();
    ctx.drawImage(pistol,fit.x,fit.y,fit.width,fit.height);ctx.restore();
    // The equipped armor supplies the entire sleeve, including the wrist edge.
    ctx.save(); ctx.beginPath(); ctx.moveTo(1228,955);
    ctx.bezierCurveTo(1240,915,1290,862,wx,wy);
    ctx.bezierCurveTo(1400,885,1470,930,1536,960);
    ctx.lineTo(1536,1024);ctx.lineTo(1258,1024);
    ctx.bezierCurveTo(1244,1004,1232,978,1228,955);ctx.closePath();ctx.clip();
    ctx.translate(1536,1024);ctx.scale(1.85,1.85);
    ctx.drawImage(sleeve,-1536,-1024,1536,1024);ctx.restore();
    return true;
  }
  function drawCreature(ctx,image,species,lunge=0) {
    const fit=layout.creatures[species]||layout.creature;
    const scale=Math.min(fit.width/image.width,fit.height/image.height);
    const imageWidth=image.width*scale,imageHeight=image.height*scale;
    ctx.save();ctx.translate(fit.x+fit.width*.5,fit.y+fit.height*.95);ctx.scale(fit.width*.43,fit.height*.075);
    const shadow=ctx.createRadialGradient(0,0,0,0,0,1);
    shadow.addColorStop(0,'rgba(9,11,8,.42)');shadow.addColorStop(.45,'rgba(9,11,8,.23)');shadow.addColorStop(1,'rgba(9,11,8,0)');
    ctx.fillStyle=shadow;ctx.fillRect(-1,-1,2,2);ctx.restore();
    ctx.save();ctx.translate(fit.x+fit.width/2,fit.y+fit.height);ctx.scale(1+lunge/250,1+lunge/250);
    if(fit.brightness)ctx.filter=`brightness(${fit.brightness})`;
    ctx.drawImage(image,-imageWidth/2,-imageHeight,imageWidth,imageHeight);ctx.restore();
  }
  const api={layout,drawForeground,drawCreature};root.CombatLayout=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
