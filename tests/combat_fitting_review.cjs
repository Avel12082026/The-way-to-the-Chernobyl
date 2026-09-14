const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {drawForeground}=require(root+'/images/combat/layout.js');
(async()=>{
 const gun=await loadImage(root+'/images/combat/pistols/87.png');
 const scene=createCanvas(1536,1024),sc=scene.getContext('2d');
 const out=root+'/.validation';fs.mkdirSync(out,{recursive:true});
 for(let page=0;page<4;page++){
  const sheet=createCanvas(1600,1200),ctx=sheet.getContext('2d');
  for(let j=0;j<24;j++){
   const armor=page*24+j+1,sleeve=await loadImage(root+`/images/anomaly/hands/${armor}_right.webp`);
   const x=j%4*400,y=Math.floor(j/4)*200;
   for(let k=0;k<2;k++){
    sc.clearRect(0,0,1536,1024);sc.fillStyle=k?'#172329':'#eeeeee';sc.fillRect(0,0,1536,1024);
    drawForeground(sc,gun,sleeve,87);
    ctx.fillStyle=k?'#172329':'#eeeeee';ctx.fillRect(x+k*200,y,200,200);
    ctx.drawImage(scene,850,450,686,574,x+k*200,y+28,200,167);
    ctx.fillStyle='#d05500';ctx.font='16px sans-serif';ctx.fillText('Armor '+armor,x+k*200+5,y+20);
   }
  }
  fs.writeFileSync(out+`/combat-fittings-${page+1}.jpg`,sheet.toBuffer('image/jpeg'));
 }
 console.log('Rendered 96 right-hand fittings on light and dark backgrounds');
})().catch(error=>{console.error(error);process.exitCode=1});
