// Candidate renderer. Not wired into production until overlap is reviewed.
const fs=require('fs'),path=require('path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.join(root,'asset_sources/combat_hand_repair/anatomy-74');
const candidate={weapon:1,armor:74,fit:{x:-340,y:-385,width:1450,height:1250},frontContours:[[[415,387],[480,350],[570,337],[665,363],[735,401],[880,440],[1040,590],[1536,800],[1536,1024],[850,1024],[670,825],[665,715],[662,575],[650,470],[580,450],[545,465],[420,460]],[[420,470],[545,462],[605,482],[605,548],[577,564],[437,563]],[[439,565],[580,563],[617,588],[610,647],[580,667],[440,662]],[[453,668],[580,664],[616,687],[612,734],[581,750],[456,742]]],status:'candidate-needs-contour-refinement'};
(async()=>{const hand=await loadImage(path.join(out,'hand-only-v2.webp')),gun=await loadImage(path.join(root,'images/combat/modular/weapons/1.png'));
const c=createCanvas(1536,1024),ctx=c.getContext('2d');ctx.drawImage(hand,0,0);const f=candidate.fit;ctx.drawImage(gun,f.x,f.y,f.width,f.height);
ctx.save();ctx.beginPath();for(const poly of candidate.frontContours){poly.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.clip();ctx.drawImage(hand,0,0);ctx.restore();
fs.writeFileSync(path.join(out,'modular-makarov.png'),c.toBuffer('image/png'));
const s=createCanvas(1536,1024),sc=s.getContext('2d');sc.fillStyle='#deded8';sc.fillRect(0,0,1536,1024);sc.drawImage(c,0,0);fs.writeFileSync(path.join(out,'modular-makarov-review.jpg'),s.toBuffer('image/jpeg'));fs.writeFileSync(path.join(out,'modular-placement.json'),JSON.stringify(candidate,null,2));})();
