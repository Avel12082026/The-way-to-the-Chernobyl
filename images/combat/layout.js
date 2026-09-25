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
  layout.creatureGround={"tushkan":{"groundY":1230,"width":1254,"height":1254,"feet":[{"x":534.0,"y":1230,"width":127.0},{"x":1044.0,"y":1115,"width":89.0}],"floating":false},"blind-dog":{"groundY":1191,"width":1254,"height":1254,"feet":[{"x":918.0,"y":1191,"width":211.0}],"floating":false},"chernobyl-dog":{"groundY":1221,"width":1254,"height":1254,"feet":[{"x":109.5,"y":1067,"width":142.0},{"x":422.0,"y":1221,"width":203.0}],"floating":false},"krakozyabra":{"groundY":1227,"width":1254,"height":1254,"feet":[{"x":177.0,"y":1115,"width":157.0},{"x":575.5,"y":1227,"width":140.0}],"floating":false},"flesh":{"groundY":1223,"width":1254,"height":1254,"feet":[{"x":132.0,"y":1080,"width":45.0},{"x":818.0,"y":1223,"width":49.0},{"x":1162.0,"y":1158,"width":33.0}],"floating":false},"boar":{"groundY":1221,"width":1254,"height":1254,"feet":[{"x":130.0,"y":1047,"width":121.0},{"x":650.5,"y":1221,"width":164.0},{"x":1087.0,"y":1108,"width":155.0}],"floating":false},"isotope":{"groundY":1002,"width":1536,"height":1024,"feet":[{"x":229.0,"y":964,"width":261.0},{"x":835.0,"y":1002,"width":267.0}],"floating":false},"hinge":{"groundY":1237,"width":1254,"height":1254,"feet":[{"x":448.0,"y":1218,"width":283.0},{"x":1083.0,"y":1237,"width":211.0}],"floating":false},"zombie":{"groundY":1516,"width":1024,"height":1536,"feet":[{"x":432.0,"y":1516,"width":111.0},{"x":736.5,"y":1409,"width":96.0}],"floating":false},"pseudodog":{"groundY":1219,"width":1254,"height":1254,"feet":[{"x":870.0,"y":1219,"width":215.0},{"x":1156.5,"y":1069,"width":132.0}],"floating":false},"lynx":{"groundY":1158,"width":1254,"height":1254,"feet":[{"x":138.5,"y":1031,"width":216.0},{"x":869.5,"y":1158,"width":138.0},{"x":1124.5,"y":1141,"width":204.0}],"floating":false},"chupacabra":{"groundY":1188,"width":1254,"height":1254,"feet":[{"x":934.94,"y":1188,"width":133.12}],"floating":false},"psydog":{"groundY":1206,"width":1254,"height":1254,"feet":[{"x":877.15,"y":1206,"width":205.3},{"x":1159.0,"y":1076,"width":121.0}],"floating":false},"bayun":{"groundY":1227,"width":1254,"height":1254,"feet":[{"x":296.0,"y":1227,"width":189.0}],"floating":false},"snork":{"groundY":1014,"width":1536,"height":1024,"feet":[{"x":147.5,"y":945,"width":214.0},{"x":1072.0,"y":1014,"width":219.0},{"x":1413.0,"y":913,"width":153.0}],"floating":false},"stregun":{"groundY":1097,"width":1254,"height":1254,"feet":[{"x":728.0,"y":1057,"width":133.0},{"x":1064.5,"y":1097,"width":94.0}],"floating":false},"owl":{"groundY":1362,"width":1145,"height":1374,"feet":[{"x":379.59,"y":1362,"width":231.82},{"x":789.0,"y":1278,"width":115.0}],"floating":false},"bloodsucker":{"groundY":1225,"width":1254,"height":1254,"feet":[{"x":495.55,"y":1225,"width":177.9},{"x":792.5,"y":1144,"width":140.0}],"floating":false},"poltergeist":{"groundY":1364,"width":1145,"height":1374,"feet":[{"x":173.25,"y":1330,"width":67.5},{"x":945.58,"y":1364,"width":83.84}],"floating":true},"fire-poltergeist":{"groundY":1230,"width":1145,"height":1374,"feet":[{"x":590.0,"y":1230,"width":183.0}],"floating":true},"fracture":{"groundY":1521,"width":1024,"height":1536,"feet":[{"x":470.0,"y":1521,"width":139.0},{"x":877.96,"y":1348,"width":110.92}],"floating":false},"burer":{"groundY":1364,"width":1140,"height":1380,"feet":[{"x":301.0,"y":1310,"width":203.0},{"x":954.5,"y":1364,"width":218.0}],"floating":false},"moose":{"groundY":1241,"width":1254,"height":1254,"feet":[{"x":117.5,"y":1156,"width":142.0},{"x":508.5,"y":1109,"width":118.0},{"x":703.0,"y":1241,"width":149.0},{"x":952.5,"y":1166,"width":92.0}],"floating":false},"controller":{"groundY":1523,"width":1024,"height":1536,"feet":[{"x":315.5,"y":1404,"width":138.0},{"x":813.5,"y":1523,"width":174.0}],"floating":false},"stronglav":{"groundY":1247,"width":1254,"height":1254,"feet":[{"x":441.0,"y":1247,"width":221.0},{"x":812.0,"y":1158,"width":157.0}],"floating":false},"chimera":{"groundY":1018,"width":1526,"height":1031,"feet":[{"x":290.0,"y":970,"width":315.0},{"x":667.5,"y":893,"width":172.0},{"x":756.5,"y":1018,"width":244.0},{"x":1235.5,"y":965,"width":318.0}],"floating":false},"electrochimera":{"groundY":1024,"width":1526,"height":1031,"feet":[{"x":282.98,"y":974,"width":313.04},{"x":753.0,"y":1024,"width":247.0},{"x":1237.0,"y":970,"width":321.0}],"floating":false},"observer":{"groundY":1242,"width":1254,"height":1254,"feet":[{"x":554.5,"y":1242,"width":106.0},{"x":711.5,"y":1153,"width":102.0}],"floating":false},"pseudogiant":{"groundY":1287,"width":1218,"height":1292,"feet":[{"x":193.5,"y":1287,"width":204.0},{"x":1088.2,"y":1205,"width":212.6}],"floating":false}};
  function drawCreature(ctx,image,species,lunge=0,appearance) {
    const baseFit=layout.creatures[species]||layout.creature;
    const fit=appearance?{...baseFit,y:appearance.contact?.floating?baseFit.y:940-baseFit.height,...appearance.fit}:baseFit;
    const scale=Math.min(fit.width/image.width,fit.height/image.height);
    const imageWidth=image.width*scale,imageHeight=image.height*scale;
    const contact=appearance?appearance.contact:layout.creatureGround[species];
    const grounded=contact&&!contact.floating&&contact.width===image.width&&contact.height===image.height;
    const groundY=grounded?contact.groundY:image.height;
    ctx.save();ctx.translate(fit.x+fit.width/2,fit.y+fit.height);ctx.scale(1+lunge/250,1+lunge/250);
    function shadow(x,y,width,height) {
      ctx.save();ctx.translate(x,y);ctx.scale(width,height);
      const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
      gradient.addColorStop(0,'rgba(9,11,8,.46)');gradient.addColorStop(.45,'rgba(9,11,8,.25)');gradient.addColorStop(1,'rgba(9,11,8,0)');
      ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
    }
    if(grounded){
      // Each paw shares the sprite's transform, including perspective depth and lunge.
      for(const foot of contact.feet)shadow((foot.x-image.width/2)*scale,(foot.y-groundY)*scale,Math.max(9,foot.width*scale*.65),Math.max(3,foot.width*scale*.10));
    }else shadow(0,-fit.height*.05,fit.width*.43,fit.height*.075);
    if(fit.brightness)ctx.filter=`brightness(${fit.brightness})`;
    ctx.drawImage(image,-imageWidth/2,-groundY*scale,imageWidth,imageHeight);ctx.restore();
  }
  const api={layout,drawForeground,drawCreature};root.CombatLayout=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
