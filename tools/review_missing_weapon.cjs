// Candidate review only. Rendering never grants visual approval.
const fs=require('fs'),path=require('path'),vm=require('vm');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),wid=Number(process.argv[2]||4),out=path.join(root,'asset_sources/missing_weapons',String(wid));
const window={};vm.runInNewContext(fs.readFileSync(path.join(root,'images/combat/effects.js'),'utf8'),{window});
const settings=JSON.parse(fs.readFileSync(path.join(out,'placement.json')));
(async()=>{
const gun=await loadImage(path.join(out,'weapon-v1.webp')),records=[];let sheet,sc;
for(let armor=1;armor<=96;armor++){
 if((armor-1)%6===0){sheet=createCanvas(1800,1800);sc=sheet.getContext('2d');sc.fillStyle='#777';sc.fillRect(0,0,1800,1800);}
 const dir=path.join(root,`asset_sources/combat_hand_repair/anatomy-${armor}`);
 const version=['v4','v3','v2'].find(v=>fs.existsSync(path.join(dir,`hand-only-${v}.webp`)));
 const file=version?path.join(dir,`hand-only-${version}.webp`):path.join(root,`asset_sources/prepared_hand_pack/hands/${armor}.webp`);
 const x=(armor-1)%2*900,y=Math.floor((armor-1)%6/2)*600;
 if(!fs.existsSync(file)){records.push({armor,status:'missing-hand-source'});sc.fillStyle='white';sc.font='25px sans-serif';sc.fillText(`Armor ${armor}: missing`,x+10,y+40);}
 else {
 const hand=await loadImage(file),c=createCanvas(1536,1024),ctx=c.getContext('2d');
 const f=version?settings.modern:settings.legacy;
 if(version)ctx.setTransform(.7,0,0,.7,460,307.2);
 ctx.drawImage(hand,0,0);ctx.drawImage(gun,f.x,f.y,1280*f.scale,1280*f.scale);
 if(version){const profile=['profile-v4.json','profile-v3.json','profile.json','modular-placement.json'].map(n=>path.join(dir,n)).find(p=>fs.existsSync(p));if(profile){const p=JSON.parse(fs.readFileSync(profile));ctx.save();ctx.beginPath();for(const poly of p.frontContours||[]){ctx.moveTo(...poly[0]);poly.slice(1).forEach(q=>ctx.lineTo(...q));ctx.closePath();}ctx.clip();ctx.drawImage(hand,0,0);ctx.restore();}}
 else {ctx.drawImage(hand,0,0);}
 ctx.resetTransform();const muzzle={x:(version?460:0)+(version?.7:1)*(f.x+settings.muzzle[0]*f.scale),y:(version?307.2:0)+(version?.7:1)*(f.y+settings.muzzle[1]*f.scale),angle:settings.angle};
 fs.writeFileSync(path.join(out,`armor-${armor}.png`),c.toBuffer('image/png'));
 for(let bg=0;bg<2;bg++){sc.fillStyle=bg?'#e5e2dc':'#23394a';sc.fillRect(x+bg*450,y,450,420);sc.drawImage(c,650,350,886,674,x+bg*450,y+25,450,342);}
 const checks=[];for(const ms of [0,40,89,90,150,240]){const flash=createCanvas(1536,1024),fc=flash.getContext('2d');window.CombatEffects.drawShot(fc,{shot:true},ms,wid,{suppressed:false},muzzle);const pixels=fc.getImageData(0,0,1536,1024).data;let visible=0;for(let k=3;k<pixels.length;k+=4)if(pixels[k])visible++;if((visible>0)!==(ms<90))throw Error('flash timing');checks.push({ms,visible});if(ms===0){fc.globalCompositeOperation='destination-over';fc.drawImage(c,0,0);fs.writeFileSync(path.join(out,`shot-${armor}.png`),flash.toBuffer('image/png'));sc.fillStyle='#23394a';sc.fillRect(x,y+420,900,180);sc.drawImage(flash,0,0,1536,1024,x+300,y+420,270,180);}}
 sc.fillStyle='red';sc.font='20px sans-serif';sc.fillText(`Weapon ${wid} / armor ${armor}`,x+8,y+23);
 records.push({armor,source:path.relative(root,file),status:'rendered-awaiting-visual-review',muzzle,flashChecks:checks});
 }
 if(armor%6===0)fs.writeFileSync(path.join(out,`sheet-${armor/6}.jpg`),sheet.toBuffer('image/jpeg'));
}
fs.writeFileSync(path.join(out,'review-matrix.json'),JSON.stringify(records,null,2));console.log(JSON.stringify({weapon:wid,rendered:records.filter(r=>r.flashChecks).length,missing:records.filter(r=>!r.flashChecks).map(r=>r.armor)}));
})();
