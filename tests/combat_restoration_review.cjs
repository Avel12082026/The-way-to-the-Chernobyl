const {createCanvas,loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {drawForeground,drawCreature}=require('../images/combat/layout.js');
(async()=>{
 const out=root+'/.validation';fs.mkdirSync(out,{recursive:true});
 const sleeve=await loadImage(root+'/images/anomaly/hands/31_right.webp');
 const ids=require('../images/combat/catalog.json').pistols.map(p=>p.id);
 const scene=createCanvas(1536,1024),sc=scene.getContext('2d');
 for(let page=0;page<3;page++){
  const sheet=createCanvas(1800,1200),ctx=sheet.getContext('2d');
  for(let j=0;j<9;j++){
   const id=ids[page*9+j];if(!id)continue;
   const gun=await loadImage(root+`/images/combat/pistols/${id}.png`);
   const x=j%3*600,y=Math.floor(j/3)*400;
   for(let k=0;k<2;k++){
    sc.fillStyle=k?'#172329':'#eeeeee';sc.fillRect(0,0,1536,1024);
    drawForeground(sc,gun,sleeve,id);
    ctx.fillStyle=sc.fillStyle;ctx.fillRect(x+k*300,y,300,400);
    ctx.drawImage(scene,800,400,736,624,x+k*300,y+40,300,300*624/736);
    ctx.fillStyle='#d05500';ctx.font='20px sans-serif';ctx.fillText('Weapon '+id,x+k*300+5,y+26);
   }
  }
  fs.writeFileSync(out+`/restored-pistols-${page+1}.jpg`,sheet.toBuffer('image/jpeg'));
 }
 const sheet=createCanvas(1536,2046),ctx=sheet.getContext('2d');
 for(const [i,id] of ['boar','flesh','isotope','zombie','chernobyl-dog','hinge'].entries()){
  const creature=await loadImage(root+`/images/combat/mutants/${id}.png`);
  for(let v=1;v<=3;v++){
   const background=require('../images/combat/catalog.json').species.find(species=>species.id===id).backgrounds[v-1];
   const bg=await loadImage(root+'/images/combat/'+background);
   sc.drawImage(bg,0,0,1536,1024);drawCreature(sc,creature,id);
   drawForeground(sc,await loadImage(root+'/images/combat/pistols/87.png'),sleeve,87);
   ctx.drawImage(scene,(v-1)*512,i*341,512,341);
   ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText(id+' '+v,(v-1)*512+10,i*341+22);
  }
 }
 fs.writeFileSync(out+'/restored-scenes.jpg',sheet.toBuffer('image/jpeg'));
 console.log('Rendered 26 pistols on light/dark and 18 combat scenes');
})().catch(e=>{console.error(e);process.exitCode=1});
