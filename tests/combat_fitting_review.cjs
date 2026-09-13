const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const {drawForeground,drawCreature}=require(root+'/images/combat/layout.js');
(async()=>{const c=createCanvas(1536,1024),ctx=c.getContext('2d');const [bg,mutant,gun]=await Promise.all(['backgrounds/zombie/1.png','mutants/zombie.png','pistols/87.png'].map(p=>loadImage(root+'/images/combat/'+p)));
for(let i=0;i<4;i++){const armor=[1,16,70,96][i];const sleeve=await loadImage(root+'/images/anomaly/hands/'+armor+'_right.webp');ctx.save();ctx.translate(i%2*768,Math.floor(i/2)*512);ctx.scale(.5,.5);ctx.drawImage(bg,0,0,1536,1024);drawCreature(ctx,mutant,'zombie');drawForeground(ctx,gun,sleeve,87);ctx.fillStyle='white';ctx.font='28px sans-serif';ctx.fillText('Armor '+armor,24,42);ctx.restore();}fs.mkdirSync(root+'/.validation',{recursive:true});fs.writeFileSync(root+'/.validation/recovered-ppk.jpg',c.toBuffer('image/jpeg'));})();
