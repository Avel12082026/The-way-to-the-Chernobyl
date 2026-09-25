const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {layout,drawCreature}=require('../images/combat/layout.js');

const html=fs.readFileSync(__dirname+'/../index.html','utf8');
assert.ok(html.indexOf('images/combat/mutants-side/manifest.js')<html.indexOf('images/combat/side-scene.js'),'Side manifest loads before the scene');
assert.match(html,/mutants-side\/manifest\.js\?v=mutants-side-20260925-v2/);

const legacyGround=JSON.stringify(layout.creatureGround),legacyFit=JSON.stringify(layout.creatures);
const contact={width:1200,height:800,groundY:735,feet:[{x:230,y:730,width:95},{x:925,y:735,width:85}],floating:false};
const appearance={image:'images/combat/mutants-side/boar.png',facing:'left',contact};
const urls=[],pending=[],draws=[],shadows=[],scales=[];
let matrix=[1,0,0,1,0,0],stack=[];
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function project(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
const ctx={
 save(){stack.push(matrix.slice());},restore(){matrix=stack.pop();},
 translate(x,y){matrix=multiply(matrix,[1,0,0,1,x,y]);},
 scale(x,y){scales.push([x,y]);matrix=multiply(matrix,[x,0,0,y,0,0]);},
 createRadialGradient(){shadows.push(project(matrix,0,0));return {addColorStop(){}};},
 clearRect(){},fillRect(){},
 drawImage(image,x,y,w,h){draws.push({image,x,y,w,h,m:matrix.slice()});}
};
const host={children:[],replaceChildren(...children){this.children=children;},setAttribute(){}};
const fighters={data:{version:'fighters-independent-v1'},resolve(gear){return {key:gear?.armorId+':'+gear?.weaponId,ready:!!gear?.armorId};},async load(gear){return gear.ready?gear:null;},draw(){}};
const env={
 console:{warn(){}},setTimeout,clearTimeout,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){return 1;},
 Image:class {
  set src(url){
   this.url=url;urls.push(url);
   if(url.includes('mutants-side/')){this.width=contact.width;this.height=contact.height;}
   else {this.width=1254;this.height=1254;}
   pending.push({done:()=>this.onload?.(),fail:()=>this.onerror?.()});
  }
 },
 document:{hidden:false,getElementById:()=>host,createElement:tag=>tag==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(){}},
 window:{
  CombatScene:{show(){return 'legacy';},hide(){},react(){}},matchMedia:()=>({matches:false}),
  CombatFighters:fighters,CombatMutantsSide:{version:'mutants-v1',species:{boar:appearance}},
  COMBAT_ASSETS:{},CombatLayout:{drawCreature},
  CombatAssets:{getVisuals:enemy=>({ready:true,species:enemy.species,mutant:'images/combat/mutants/'+enemy.species+'.png',background:'background.webp'})}
 }
};
vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/side-scene.js','utf8'),env);
async function flush(promise,fail=false){pending.splice(0).forEach(request=>fail?request.fail():request.done());return await promise;}
function sourcePoint(draw,x,y){return project(draw.m,draw.x+x*draw.w/draw.image.width,draw.y+y*draw.h/draw.image.height);}

(async()=>{
 const scene=env.window.CombatScene;
 const input={enemy:{name:'Кабан',species:'boar',battleToken:'one',hp:60,sex:'male'},armor:1,weaponId:86,enemyGear:null};
 assert.equal(await flush(scene.show(input)),true);
 assert.deepEqual(urls,['background.webp?v=fighters-independent-v1',appearance.image+'?v=mutants-v1']);
 const boar=draws.at(-1);
 assert.equal(boar.image.url,appearance.image+'?v=mutants-v1');
 assert.deepEqual(sourcePoint(boar,contact.width/2,contact.groundY),[496+layout.creatures.boar.x+layout.creatures.boar.width/2,940],'Side art lands on the shared player/environment floor at the existing enemy position');
 assert.equal(shadows.length,contact.feet.length);
 contact.feet.forEach((foot,index)=>assert.deepEqual(shadows[index],sourcePoint(boar,foot.x,foot.y),'Side contacts control each paw shadow'));
 assert.ok(scales.every(([x,y])=>x>0&&y>0),'Left-facing mutant art is never mirrored');

 assert.equal(await flush(scene.show({...input,enemy:{...input.enemy,sex:'female',battleToken:'two'}})),true);
 assert.equal(urls.length,2,'Both sexes share one side sprite');
 assert.equal(draws.at(-1).image,boar.image);

 const female={...input,enemy:{...input.enemy,sex:'female',battleToken:'two'}};
 env.window.CombatMutantsSide.version='mutants-v2';
 assert.equal(await flush(scene.show(female)),true);
 assert.equal(urls.length,3,'Changing only the side manifest version reloads the side art');
 assert.equal(urls.at(-1),appearance.image+'?v=mutants-v2');
 assert.equal(draws.at(-1).image.url,urls.at(-1),'Scene signature includes the new side cache revision');

 assert.equal(await flush(scene.show({...input,enemy:{...input.enemy,species:'blind-dog',battleToken:'missing'}})),true);
 assert.equal(urls.at(-1),'images/combat/mutants/blind-dog.png?v=fighters-independent-v1','An unfinished species keeps its legacy source until added to the manifest');
 assert.equal(await scene.show({...input,armor:0}),'legacy','Legacy combat remains available for unsupported player equipment');

 // A failed side download must be retryable without silently showing front-facing art.
 env.window.CombatMutantsSide.version='mutants-v3';
 const beforeFailure=urls.length;
 assert.equal(await flush(scene.show(input),true),false);
 assert.match(host.children[1].textContent,/Не удалось загрузить/);
 assert.equal(host.children[2].hidden,false);
 assert.deepEqual(urls.slice(beforeFailure),[appearance.image+'?v=mutants-v3']);
 assert.equal(await flush(scene.show(input)),true);
 assert.equal(draws.at(-1).image.url,appearance.image+'?v=mutants-v3');

 // Optional art-specific fit overrides must not mutate the legacy layout.
 draws.length=shadows.length=0;
 const fit={x:500,y:300,width:560,height:570,brightness:.95};
 drawCreature(ctx,{width:contact.width,height:contact.height},'boar',0,{...appearance,fit});
 assert.deepEqual(sourcePoint(draws.at(-1),contact.width/2,contact.groundY),[780,870]);
 draws.length=shadows.length=0;
 drawCreature(ctx,{width:contact.width,height:contact.height},'poltergeist',0,{...appearance,contact:{...contact,floating:true}});
 const floatingFit=layout.creatures.poltergeist;
 assert.deepEqual(sourcePoint(draws.at(-1),contact.width/2,contact.height),[floatingFit.x+floatingFit.width/2,floatingFit.y+floatingFit.height],'Floating mutants keep their original hover placement');
 assert.equal(shadows.length,1,'Floating mutants retain the broad hovering shadow');
 assert.equal(JSON.stringify(layout.creatureGround),legacyGround);
 assert.equal(JSON.stringify(layout.creatures),legacyFit);
 assert.equal(stack.length,0);
 console.log('PASS: dedicated left-facing side art, shared sexes, floor/contact placement, independent version cache, legacy fallback and failed-load retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
