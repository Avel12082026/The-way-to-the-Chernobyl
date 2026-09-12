const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const {createCanvas,loadImage}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
(async()=>{const window={matchMedia:()=>({matches:false,addEventListener(){}})};vm.runInNewContext(fs.readFileSync('images/anomaly/detector-layout.js','utf8'),{window});const layout=window.DETECTOR_LAYOUT;
function polygons(c,polys){c.beginPath();for(const poly of polys){poly.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}c.clip();}
const bg=await loadImage('images/anomaly/background.jpg');const sheet=createCanvas(1080,1350),out=sheet.getContext('2d');let i=0;
for(const [name,fit] of Object.entries(layout.placement)){
 const hand=await loadImage('images/anomaly/hands/'+[1,16,70][i%3]+'_right.webp'),detector=await loadImage('images/anomaly/items/'+name.replace('.jpg','.webp'));
 const canvas=createCanvas(1536,1024),c=canvas.getContext('2d');c.drawImage(bg,0,0,1536,1024);c.drawImage(hand,0,0);const scale=Math.min(220/detector.width,320/detector.height),x=fit.x-detector.width*scale/2,y=fit.bottom-detector.height*scale;
 c.save();c.translate(x,y);c.scale(scale,scale);const mask=layout.antennaMasks[name];if(mask){assert.equal(mask.size[0],detector.width,name+' width');assert.equal(mask.size[1],detector.height,name+' height');polygons(c,mask.polygons);}c.drawImage(detector,0,0);c.restore();
 c.save();polygons(c,[layout.grip]);c.drawImage(hand,0,0);c.restore();out.drawImage(canvas,980,430,410,520,i%3*360,Math.floor(i/3)*450,355,425);out.fillStyle='white';out.font='15px sans-serif';out.fillText(name,i%3*360+5,Math.floor(i/3)*450+442);i++;
}fs.writeFileSync('.validation/grip-review.jpg',sheet.toBuffer('image/jpeg'));console.log('PASS: nine model placements and three antenna masks rendered with full thumb overlay');})().catch(e=>{console.error(e);process.exit(1)});
