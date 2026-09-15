// Exhaustive candidate contact sheets; rendering is not visual approval.
const fs=require('fs'),path=require('path'),vm=require('vm');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.join(root,'asset_sources/hand_transparency_review');
const data=JSON.parse(fs.readFileSync(path.join(root,'asset_sources/prepared_hand_pack/fits.json')));
const handFits=JSON.parse(fs.readFileSync(path.join(root,'asset_sources/prepared_hand_pack/hand-fits.json')));
const window={};const context=vm.createContext({window});
for(const name of ['modular/data.js','modular/renderer.js','layout.js','effects.js'])vm.runInContext(fs.readFileSync(path.join(root,'images/combat',name),'utf8'),context);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const weapons={};
 for(const id of Object.keys(data))weapons[id]=await loadImage(path.join(root,`images/combat/modular/weapons/${id}.png`));
 const all=[];
 for(let armor=1;armor<=75;armor++){
  const corrected=armor>73,id=corrected?armor-73:armor;
  const hand=await loadImage(path.join(root,corrected?`images/combat/modular/hands/${id}.webp`:`asset_sources/prepared_hand_pack/hands/${id}.webp`));
  const sheet=createCanvas(2400,1750),sc=sheet.getContext('2d');
  let j=0;const pairs=[];
  for(const [wid,gun] of Object.entries(weapons)){
   const c=createCanvas(1536,1024),ctx=c.getContext('2d');
   const fit=data[wid],hf=handFits[id];
   if(corrected)window.CombatModular.drawForeground(ctx,gun,hand,window.CombatModular.resolve(wid,id));
   else {ctx.drawImage(gun,fit.x,fit.y,fit.width,fit.height);if(hf)ctx.drawImage(hand,hf.x,hf.y,hf.width,hf.height);else ctx.drawImage(hand,0,0,1536,1024);}
   const px=j%6*400,py=Math.floor(j/6)*350;
   sc.fillStyle=j%2?'#e8e8e0':'#223a4a';sc.fillRect(px,py,400,350);
   sc.drawImage(c,780,420,756,604,px,py+24,400,320);
   sc.fillStyle=j%2?'#111':'#fff';sc.font='17px sans-serif';sc.fillText(`${corrected?'corrected':'prepared'} hand ${id} / gun ${wid}${!corrected&&!hf?' NO FIT':''}`,px+5,py+19);
   pairs.push({weapon:Number(wid),armor:id,mode:corrected?'corrected':'prepared',fit_present:corrected||!!hf,visual_review:'pending'});j++;
  }
  const name=`${corrected?'corrected':'prepared'}-${id}.jpg`;
  fs.writeFileSync(path.join(out,name),sheet.toBuffer('image/jpeg'));
  all.push({sheet:name,pairs});
 }
 fs.writeFileSync(path.join(out,'combinations.json'),JSON.stringify(all,null,2));
 console.log('Rendered '+all.reduce((n,s)=>n+s.pairs.length,0)+' combinations in '+all.length+' sheets.');
})().catch(e=>{console.error(e);process.exitCode=1});
