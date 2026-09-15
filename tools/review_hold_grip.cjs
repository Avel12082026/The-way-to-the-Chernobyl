// Holding-pose review only. No firing-pose approval is implied.
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const fs=require('fs'),path=require('path');process.chdir(path.resolve(__dirname,'..'));
const layout=require('../images/combat/layout.js');
(async()=>{
const dir='asset_sources/forward_grips/9-91';
const [hand,bg,enemy]=await Promise.all([loadImage(dir+'/hold-v4.webp'),loadImage('images/combat/backgrounds/zombie/1.png'),loadImage('images/combat/mutants/zombie.png')]);
const fit=JSON.parse(fs.readFileSync(dir+'/placement.json'));
const c=createCanvas(1536,1024),ctx=c.getContext('2d');ctx.drawImage(bg,0,0,1536,1024);layout.drawCreature(ctx,enemy,'zombie');ctx.drawImage(hand,fit.x,fit.y,hand.width*fit.scale,hand.height*fit.scale);fs.writeFileSync(dir+'/hold-v4-scene.jpg',c.toBuffer('image/jpeg'));
})();
