const fs=require('node:fs'),path=require('node:path');
const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const {sourceMuzzles}=require('../images/combat/effects.js');
const root=path.resolve(__dirname,'..');
(async()=>{
 const ids=process.argv.slice(2).map(Number);if(!ids.length)ids.push(...Object.keys(sourceMuzzles).map(Number));
 for(let start=0;start<ids.length;start+=6){
  const sheet=createCanvas(1200,640),ctx=sheet.getContext('2d');ctx.fillStyle='#344238';ctx.fillRect(0,0,1200,640);
  for(const [i,id] of ids.slice(start,start+6).entries()){
   const [x,y,angle]=sourceMuzzles[id],gun=await loadImage(path.join(root,`images/combat/pistols/${id}.png`));
   const left=i%3*400,top=Math.floor(i/3)*320;
   ctx.drawImage(gun,x-80,y-60,200,150,left,top+20,400,300);
   const px=left+160,py=top+140;
   ctx.strokeStyle='#ff6868';ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,6,0,2*Math.PI);ctx.moveTo(px+10*Math.cos(angle),py+10*Math.sin(angle));ctx.lineTo(px+80*Math.cos(angle),py+80*Math.sin(angle));ctx.stroke();
   ctx.fillStyle='white';ctx.font='17px sans-serif';ctx.fillText(`${id}: source (${x}, ${y})`,left+5,top+17);
  }
  fs.mkdirSync(path.join(root,'.validation'),{recursive:true});fs.writeFileSync(path.join(root,`.validation/muzzle-source-${start/6}.png`),sheet.toBuffer('image/png'));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
