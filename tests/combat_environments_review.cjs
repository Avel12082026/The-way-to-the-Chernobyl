const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const {drawCreature,drawForeground,layout}=require('../images/combat/layout.js');
const catalog=require('../images/combat/catalog.json'),root=path.resolve(__dirname,'..');
(async()=>{
 const out=root+'/asset_sources/combat_environment_review';fs.mkdirSync(out,{recursive:true});
 const canvas=createCanvas(1536,1024),ctx=canvas.getContext('2d');
 const gun=await loadImage(root+'/images/combat/pistols/87.png'),sleeve=await loadImage(root+'/images/anomaly/hands/31_right.webp');
 let count=0;
 for(let page=0;page<6;page++){
  const sheet=createCanvas(1536,1705),sc=sheet.getContext('2d');
  for(const [j,s] of catalog.species.slice(page*5,page*5+5).entries()){
   assert.ok(s.ready,s.id);assert.equal(new Set(s.backgrounds).size,3);
   const mutant=await loadImage(root+'/images/combat/'+s.mutant),fit=layout.creatures[s.id]||layout.creature;
   const ratio=Math.min(fit.width/mutant.width,fit.height/mutant.height),w=mutant.width*ratio*1.128,h=mutant.height*ratio*1.128;
   assert.ok(fit.x+fit.width/2-w/2>=0&&fit.x+fit.width/2+w/2<1536&&fit.y+fit.height-h>=0&&fit.y+fit.height<=1024,s.id+' attack clips canvas');
   for(const [v,file] of s.backgrounds.entries()){
    const bg=await loadImage(root+'/images/combat/'+file);assert.equal(bg.width,1536);assert.equal(bg.height,1024);
    ctx.drawImage(bg,0,0,1536,1024);drawCreature(ctx,mutant,s.id,32);drawForeground(ctx,gun,sleeve,87);
    sc.drawImage(canvas,v*512,j*341,512,341);sc.fillStyle='#fff';sc.font='18px sans-serif';sc.fillText(s.id+' / '+(v+1)+' / attack',v*512+10,j*341+22);count++;
   }
  }
  fs.writeFileSync(out+`/environments-${page+1}.jpg`,sheet.toBuffer('image/jpeg'));
 }
 console.log(`${count} environments rendered at peak attack; all creatures remain inside the frame`);
})().catch(e=>{console.error(e);process.exitCode=1});
