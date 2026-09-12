const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const {createCanvas,loadImage}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
(async()=>{
const src=fs.readFileSync('images/anomaly/scene.js','utf8').replace('root.AnomalyScene={show,hide};','root.testPaint=(h,s,t)=>{host=h;animationState=s;paintAnimation(t)};root.screens=screens;');
const window={matchMedia:()=>({matches:false,addEventListener(){}})};vm.runInNewContext(src,{window,document:{addEventListener(){}},console});
const sheet=createCanvas(900,1050),out=sheet.getContext('2d');out.fillStyle='#333';out.fillRect(0,0,900,1050);
let i=0;for(const key of Object.keys(window.screens)){
 const img=await loadImage('images/anomaly/items/'+key.replace('.jpg','.webp'));const field=createCanvas(1536,1024),screen=createCanvas(1536,1024);
 const host={getBoundingClientRect:()=>({left:0,top:0,width:1536,height:1024}),parts:{field,screen,detector:{hidden:false,complete:true,naturalWidth:img.width,getBoundingClientRect:()=>({left:0,top:0,width:img.width,height:img.height})}}};
 const state={id:1,detector:key,searching:true,pending:false};window.testPaint(host,state,1000);const a=screen.toBuffer('image/png');window.testPaint(host,state,1600);assert(!a.equals(screen.toBuffer('image/png')),key+' must animate');
 const tile=createCanvas(img.width,img.height),c=tile.getContext('2d');c.drawImage(img,0,0);c.drawImage(screen,0,0);const scale=Math.min(280/img.width,310/img.height);out.drawImage(tile,i%3*300,Math.floor(i/3)*350+25,img.width*scale,img.height*scale);out.fillStyle='white';out.font='14px sans-serif';out.fillText(key,i%3*300+5,Math.floor(i/3)*350+18);
 window.testPaint(host,{...state,searching:false},2000);assert(!screen.getContext('2d').getImageData(0,0,1536,1024).data.some(x=>x),key+' clears after search');i++;
}
fs.mkdirSync('.validation',{recursive:true});fs.writeFileSync('.validation/detector-animation-review.jpg',sheet.toBuffer('image/jpeg'));console.log('PASS: all nine animated displays, frame changes, stop clears overlays');
})().catch(e=>{console.error(e);process.exit(1)});
