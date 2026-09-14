const assert=require('node:assert/strict');
const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const {drawForeground,layout}=require('../images/combat/layout.js');
const path=require('node:path'),root=path.resolve(__dirname,'..');
(async()=>{
 const sleeves=await Promise.all(Array.from({length:96},(_,i)=>loadImage(root+`/images/anomaly/hands/${i+1}_right.webp`)));
 const canvas=createCanvas(1536,1024),ctx=canvas.getContext('2d');
 let count=0;
 for(const p of require('../images/combat/catalog.json').pistols.filter(p=>p.ready)){
  const gun=await loadImage(root+'/images/combat/'+p.image),fit=layout.pistols[p.id];
  assert.ok(fit.x>=768,'Pistol must stay in the right half');
  for(const [i,sleeve] of sleeves.entries()){
   ctx.clearRect(0,0,1536,1024);assert.ok(drawForeground(ctx,gun,sleeve,p.id));
   for(const t of [.3,.5,.7]){
    const u=1-t,x=u*u*u*1228+3*u*u*t*1240+3*u*t*t*1290+t*t*t*(fit.wristX||1340);
    const y=u*u*u*955+3*u*u*t*915+3*u*t*t*862+t*t*t*(fit.wristY||850);
    for(const offset of [-4,0,4])assert.ok(ctx.getImageData(Math.round(x),Math.round(y)+offset,1,1).data[3]>240,`Wrist gap: pistol ${p.id}, armor ${i+1}, t=${t}, offset=${offset}`);
   }
   if(i===0){
    const left=ctx.getImageData(0,0,768,1024).data;
    for(let a=3;a<left.length;a+=4)assert.equal(left[a],0,`Unexpected left foreground: ${p.id}`);
   }
   count++;
  }
 }
 console.log(`${count} weapon/armor combinations: opaque wrist junctions; all weapons stay on the right`);
})().catch(e=>{console.error(e);process.exitCode=1});
