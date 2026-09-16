// Review candidate only; uses the production recoil and flash timing.
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const effects=require('../images/combat/effects.js'),layout=require('../images/combat/layout.js');
const paired=require('../images/combat/paired-foreground.js');
(async()=>{
const version=process.argv[2]||'fire-v2';
if(!/^fire-v[0-9]+$/.test(version))throw Error('Invalid version');
const dir=`asset_sources/forward_grips/9-91/${version}-stable-review`;
fs.mkdirSync(dir,{recursive:true});
const [fg,bg,enemy]=await Promise.all([loadImage(`asset_sources/forward_grips/9-91/${version}.webp`),loadImage('images/combat/backgrounds/zombie/1.png'),loadImage('images/combat/mutants/zombie.png')]);
const fit=JSON.parse(fs.readFileSync(`asset_sources/forward_grips/9-91/${version}-placement.json`));
const sheet=createCanvas(1536,768),s=sheet.getContext('2d'),checks=[];
for(const [i,ms] of [-1,0,40,110,150,240].entries()){
 const c=createCanvas(1536,1024),ctx=c.getContext('2d');
 const dy=ms>=0?paired.recoilY(ms):0;
 const muzzle={x:fit.x+fit.muzzle[0]*fit.scale,y:fit.y+fit.muzzle[1]*fit.scale};
 paired.draw(ctx,fg,{...fit,weaponId:9,suppressed:false},{shot:ms>=0,elapsed:ms},effects);
 const flash=ms>=0&&ms<90;
 const alpha=ctx.getImageData(0,0,1,1).data[3];if(alpha!==0||flash!==(ms>=0&&ms<90))throw Error('alpha/timing failed');
 fs.writeFileSync(`${dir}/transparent-${ms}.png`,c.toBuffer('image/png'));
 const sc=createCanvas(1536,1024),q=sc.getContext('2d');q.drawImage(bg,0,0,1536,1024);layout.drawCreature(q,enemy,'zombie');q.drawImage(c,0,0);
 fs.writeFileSync(`${dir}/scene-${ms}.png`,sc.toBuffer('image/png'));s.drawImage(sc,(i%3)*512,Math.floor(i/3)*384,512,341);s.fillStyle='white';s.font='20px sans-serif';s.fillText(`${ms}ms`,i%3*512+10,Math.floor(i/3)*384+365);
 checks.push({ms,recoilY:dy,flash,cornerAlpha:alpha,muzzle:{x:muzzle.x,y:muzzle.y+dy}});
}
fs.writeFileSync(dir+'/review-sheet.jpg',sheet.toBuffer('image/jpeg'));fs.writeFileSync(dir+'/technical-review.json',JSON.stringify({status:'candidate-awaiting-visual-review',checks},null,2));
})();

