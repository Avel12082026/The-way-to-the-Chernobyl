// Render the actual scene at controlled shot times, one weapon at a time.
// A rendered image is evidence for inspection, not automatic anatomy approval.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCanvas,Image}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.validation',process.env.WIP_ROOT?'candidate-shots':'individual-shots');
const catalog=require('../images/combat/catalog.json');
let now=1000,frame,scene;
const calls=[],listeners={};
function element(){return {hidden:false,textContent:'',setAttribute(){},replaceChildren(){}};}
const host=element();
const document={hidden:false,getElementById:()=>host,addEventListener:(name,fn)=>listeners[name]=fn,
 createElement(name){if(name!=='canvas')return element();scene=createCanvas(1536,1024);scene.setAttribute=()=>{};return scene;}};
function LocalImage(){const im=new Image(),setter=Object.getOwnPropertyDescriptor(Image.prototype,'src').set;Object.defineProperty(im,'src',{set(url){
 let file=path.join(root,url.split('?')[0]);
 if(process.env.WIP_ROOT){
  const match=url.match(/images\/combat\/pistols\/(\d+)\.png/);
  if(match)file=path.join(process.env.WIP_ROOT,'weapons',match[1]+'.png');
  if(url.startsWith('images/anomaly/hands/1_right.webp'))file=path.join(root,'asset_sources/combat_hand_repair/combat-1-candidate.webp');
 }
 setter.call(im,file);
}});return im;}
const window={document,COMBAT_ASSETS:catalog,matchMedia:()=>({matches:false}),
 CombatAssets:{getVisuals:()=>({ready:true,species:'boar',background:'images/combat/backgrounds/boar/1.png',mutant:'images/combat/mutants/boar.png'})}};
const context=vm.createContext({window,document,Image:LocalImage,performance:{now:()=>now},console,setTimeout,clearTimeout,
 requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame:()=>{frame=null;}});
for(const file of ['layout.js','effects.js','scene.js'])vm.runInContext(fs.readFileSync(path.join(root,'images/combat',file),'utf8'),context);
if(process.env.WIP_ROOT){
 Object.assign(window.CombatLayout.layout.pistols,JSON.parse(fs.readFileSync(path.join(process.env.WIP_ROOT,'fits.json'))));
 Object.assign(window.CombatEffects.sourceMuzzles,JSON.parse(fs.readFileSync(path.join(process.env.WIP_ROOT,'muzzles.json'))));
 window.CombatLayout.drawForeground=(ctx,gun,hand,id)=>{
  const fit=window.CombatLayout.layout.pistols[id];if(!fit)return false;
  ctx.drawImage(hand,0,0,1536,1024);ctx.drawImage(gun,fit.x,fit.y,fit.width,fit.height);
  // Trial contour: index remains behind the gun; thumb and glove remain whole.
  const contour=[[1000,701],[1090,699],[1136,703],[1160,713],[1190,704],[1205,680],[1230,670],[1290,725],[1536,900],[1536,1024],[1000,1024]];
  ctx.save();ctx.beginPath();contour.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(hand,0,0,1536,1024);ctx.restore();return true;
 };
}
const originalShot=window.CombatEffects.drawShot;
window.CombatEffects.drawShot=(ctx,reaction,elapsed,id,weapon)=>{
 const transform=ctx.getTransform(),point=window.CombatEffects.getMuzzle(id);
 const rendered=originalShot(ctx,reaction,elapsed,id,weapon);
 calls.push({elapsed,id,rendered,x:point.x+transform.e,y:point.y+transform.f,recoil:transform.f});return rendered;
};
const phases=[0,40,89,90,150,240];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const results=[];
 const filter=process.argv[2]?Number(process.argv[2]):null;
 for(const weapon of catalog.pistols.filter(w=>!filter||w.id===filter)){
  now+=2000;const token='review-'+weapon.id;calls.length=0;
  assert.equal(await window.CombatScene.show({weaponId:weapon.id,armor:1,enemy:{battleToken:token,name:'Кабан',hp:100}}),true);
  const sheet=createCanvas(1440,840),ctx=sheet.getContext('2d');
  // Untouched idle frame for checking the actual barrel mouth without flash.
  fs.writeFileSync(path.join(out,`${weapon.id}-idle.png`),scene.toBuffer('image/png'));
  window.CombatScene.react(token,{success:true,enemyHp:90},'attack');const start=now;
  for(let i=0;i<phases.length;i++){
   now=start+phases[i];assert.ok(frame,'Missing animation callback');const run=frame;frame=null;run(now);
   const event=calls.at(-1);assert.equal(event.elapsed,phases[i]);
   assert.equal(event.rendered,phases[i]<90,`${weapon.id}: flash lifetime`);
   assert.ok(Math.abs(event.recoil-Math.sin(Math.PI*Math.min(1,phases[i]/220))*12)<.001,'Effect does not follow recoil');
   const x=i%3*480,y=Math.floor(i/3)*420;
   ctx.fillStyle='#172329';ctx.fillRect(x,y,480,420);
   ctx.drawImage(scene,800,400,736,624,x,y+20,480,400);
   ctx.fillStyle='white';ctx.font='16px sans-serif';ctx.fillText(`${weapon.id} ${weapon.name} · ${phases[i]} ms`,x+8,y+17);
  }
  // Failed/stale actions must not start a shot, and a medkit must not flash.
  window.CombatScene.hide();frame=null;calls.length=0;
  await window.CombatScene.show({weaponId:weapon.id,armor:1,enemy:{battleToken:token,name:'Кабан',hp:100}});
  window.CombatScene.react(token,{success:false},'attack');assert.equal(frame,null);
  window.CombatScene.react('old-token',{success:true},'attack');assert.equal(frame,null);
  window.CombatScene.react(token,{success:true},'medkit');const medkitFrame=frame;frame=null;medkitFrame(now+40);
  assert.equal(calls.at(-1).rendered,false,'Medkit incorrectly produced a muzzle flash');
  fs.writeFileSync(path.join(out,`${weapon.id}-shot.jpg`),sheet.toBuffer('image/jpeg'));
  const inputs=['images/combat/scene.js','images/combat/layout.js','images/combat/effects.js',
   process.env.WIP_ROOT?path.resolve(process.env.WIP_ROOT,'weapons',weapon.id+'.png'):'images/combat/'+weapon.image,
   process.env.WIP_ROOT?'asset_sources/combat_hand_repair/combat-1-candidate.webp':'images/anomaly/hands/1_right.webp'];
  if(process.env.WIP_ROOT)inputs.push(...['fits.json','muzzles.json'].map(file=>path.resolve(process.env.WIP_ROOT,file)));
  const hashes=Object.fromEntries(inputs.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex')]));
  results.push({id:weapon.id,name:weapon.name,armor:1,mode:process.env.WIP_ROOT?'candidate':'current',phaseTimes:phases,
   animationChecks:'passed',visualReview:'pending',inputHashes:hashes});
  console.log(`Rendered weapon ${weapon.id}: six phases; timing, recoil, failed/stale actions and medkit checked`);
 }
 fs.writeFileSync(path.join(out,filter?`${filter}-checks.json`:'checks.json'),JSON.stringify(results,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
