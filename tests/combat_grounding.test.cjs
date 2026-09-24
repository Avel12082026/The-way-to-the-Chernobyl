const assert=require('node:assert/strict'),{test}=require('node:test');
const {createCanvas,loadImage}=require('@napi-rs/canvas'),path=require('node:path');
const fighters=require('../images/combat/fighters.js');
for(const [key,fit] of Object.entries(fighters.sprites))test(key+' opaque sole meets ground on both sides',async()=>{
 const image=await loadImage(path.join(__dirname,'..',fit.image));
 // Confirm the measured anchor still belongs to this exact source sprite.
 const source=createCanvas(image.width,image.height),src=source.getContext('2d');src.drawImage(image,0,0);
 const pixels=src.getImageData(0,0,image.width,image.height).data;let bottom=0;
 for(let y=image.height-1;y>=0&&!bottom;y--)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>200){bottom=y+1;break;}
 assert.equal(bottom,fit.soleY,'Re-measure anchor if source sprite changes');
 for(const side of ['player','enemy']){
  const canvas=createCanvas(1536,1024),ctx=canvas.getContext('2d');
  fighters.draw(ctx,image,side,0,{fit,groundY:940,shadowOpacity:0});
  const rgba=ctx.getImageData(0,0,1536,1024).data;let last=-1,left=1536,right=-1;
  for(let y=0;y<1024;y++)for(let x=0;x<1536;x++)if(rgba[(y*1536+x)*4+3]>200){last=y;left=Math.min(left,x);right=Math.max(right,x);}
  assert.ok(last>=938&&last<=940,`Lowest sole ${last} must touch y940`);
  assert.ok(left>0&&right<1535,'Figure and muzzle must remain inside frame');
  if(side==='player')assert.ok(right<768);else assert.ok(left>768);
 }
});
