const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.join(root,'asset_sources/combat_hand_repair/anatomy-74');
const window={};const context=vm.createContext({window});
for(const p of ['layout.js','effects.js','modular/data.js'])vm.runInContext(fs.readFileSync(path.join(root,'images/combat',p),'utf8'),context);
(async()=>{const fit=JSON.parse(fs.readFileSync(path.join(out,'modular-placement.json'))).fit;
const [x,y,angle,w,h]=window.COMBAT_MODULAR_DATA.weapons[1].sourceMuzzle;
const muzzle={x:fit.x+x*fit.width/w,y:fit.y+y*fit.height/h,angle};
const base=await loadImage(path.join(out,'modular-makarov.png')),sheet=createCanvas(1536,1024),sc=sheet.getContext('2d'),checks=[];
for(const [i,ms] of [0,40,89,90,150,240].entries()){
 const c=createCanvas(1536,1024),ctx=c.getContext('2d');window.CombatEffects.drawShot(ctx,{shot:true},ms,1,{suppressed:false},muzzle);
 const rgba=ctx.getImageData(0,0,1536,1024).data;let count=0,outside=0;
 for(let j=3;j<rgba.length;j+=4)if(rgba[j]){count++;const p=(j-3)/4;if(Math.hypot(p%1536-muzzle.x,Math.floor(p/1536)-muzzle.y)>97)outside++;}
 assert.equal(outside,0);assert.equal(count>0,ms<90);
 const combined=createCanvas(1536,1024),cc=combined.getContext('2d');cc.fillStyle=i%2?'#deded8':'#253746';cc.fillRect(0,0,1536,1024);cc.drawImage(base,0,0);cc.drawImage(c,0,0);
 sc.drawImage(combined,230,55,680,790,(i%3)*512,Math.floor(i/3)*512+25,440,487);sc.fillStyle='#fff';sc.font='20px sans-serif';sc.fillText(ms+' ms',(i%3)*512+10,Math.floor(i/3)*512+22);
 checks.push({ms,alphaPixels:count,outsideEffect:outside});
}
fs.writeFileSync(path.join(out,'modular-flash-review.jpg'),sheet.toBuffer('image/jpeg'));fs.writeFileSync(path.join(out,'modular-flash-checks.json'),JSON.stringify({weapon:1,armor:74,muzzle,checks,status:'candidate-only-not-production'},null,2));console.log(JSON.stringify({muzzle,checks}));})();
