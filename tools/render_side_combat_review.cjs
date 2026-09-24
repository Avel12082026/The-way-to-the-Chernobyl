// Render the production canvas scene without a browser. @napi-rs/canvas required.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas,Image,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
const fighters=require('../images/combat/fighters.js');
const backgrounds=require('../images/combat/backgrounds.js');
const layout=require('../images/combat/layout.js');
const {createResolver}=require('../images/combat/assets.js');
const catalogEnv={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'images/combat/catalog.js'),'utf8'),catalogEnv);
const catalog=catalogEnv.window.COMBAT_ASSETS;
const output=path.join(root,'images/combat/review');fs.mkdirSync(output,{recursive:true});
const summaries=[];
async function render(stage,index){
 const canvas=createCanvas(1536,1024);canvas.setAttribute=()=>{};
 const host={hidden:true,setAttribute(){},replaceChildren(...c){this.children=c;}};
 class LocalImage extends Image {set src(url){super.src=path.join(root,url.split('?')[0]);}}
 const env={console,setTimeout,clearTimeout,Image:LocalImage,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){return 1;},
 document:{getElementById:()=>host,createElement:t=>t==='canvas'?canvas:{setAttribute(){}},addEventListener(){}},
 window:{matchMedia:()=>({matches:false}),COMBAT_ASSETS:catalog,CombatAssets:createResolver(catalog),CombatLayout:layout,CombatFighters:fighters,CombatBackgrounds:{resolve:()=>stage}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'images/combat/scene.js'),'utf8'),env);
 const success=await env.window.CombatScene.show({enemy:{name:'Противник',hp:100,battleToken:'review-'+index},armor:1,weaponId:12,enemyGear:{armorId:40,weaponId:12},playerLevel:stage.minLevel});
 if(!success||canvas.hidden)throw Error('Scene failed: '+stage.id+' '+host.children[1].textContent);
 summaries.push({id:stage.id,image:stage.image,groundY:stage.groundY,rendered:true});
 return canvas;
}
(async()=>{
 const cols=2,w=768,h=552,sheet=createCanvas(cols*w,Math.ceil(backgrounds.entries.length/cols)*h),ctx=sheet.getContext('2d');ctx.fillStyle='#20251f';ctx.fillRect(0,0,sheet.width,sheet.height);
 for(let i=0;i<backgrounds.entries.length;i++){
  const stage=backgrounds.entries[i],canvas=await render(stage,i),x=i%cols*w,y=Math.floor(i/cols)*h;
  ctx.drawImage(canvas,x,y,w,512);ctx.font='22px sans-serif';ctx.fillStyle='#f5f1dc';ctx.fillText(stage.id+' | '+stage.minLevel+'+',x+18,y+540);
  if(stage.id==='field'||stage.id==='reactor')fs.writeFileSync(path.join(output,'side-'+stage.id+'.png'),canvas.toBuffer('image/png'));
 }
 fs.writeFileSync(path.join(output,'all-backgrounds.jpg'),sheet.toBuffer('image/jpeg',85));
 fs.writeFileSync(path.join(output,'render-audit.json'),JSON.stringify(summaries,null,2)+'\n');
 console.log('Rendered '+summaries.length+' production NPC scenes; all required images loaded.');
})().catch(e=>{console.error(e);process.exitCode=1;});
