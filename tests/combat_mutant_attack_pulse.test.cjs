const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function fixture(renderer){
 let now=1000,rafId=0,images=[],frames=new Map(),lunges=[],flashes=[];
 const listeners={},reduced={matches:false};
 const host={children:[],replaceChildren(...items){this.children=items;},setAttribute(){}};
 const ctx={clearRect(){lunges=[];flashes=[];},fillRect(){},drawImage(){},save(){},restore(){},translate(){}};
 const doc={hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(n,fn){(listeners[n]??=[]).push(fn);}};
 const fighters={data:{version:'test'},resolve(g){return{...g,key:g?.armorId+':'+g?.weaponId,ready:!!g?.armorId};},async load(g){return g.ready?g:null;},draw(){},feet(){return[];},muzzle(l,side){return l?{side}:null;}};
 const context={console,setTimeout,clearTimeout,document:doc,performance:{now:()=>now},requestAnimationFrame(fn){const id=++rafId;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},Image:class{set src(value){images.push(()=>this.onload?.());}},window:{matchMedia:()=>reduced,COMBAT_ASSETS:{pistols:[{id:86,ready:true,image:'pistol.png'}],armorIds:[1,2]},CombatFighters:fighters,CombatLayout:{drawCreature(c,image,species,lunge){lunges.push(lunge);},drawForeground(){}},CombatAssets:{getVisuals:enemy=>enemy.kind==='npc'||enemy.kind==='missing'?{ready:false}:{ready:true,species:'boar',mutant:'boar.png',background:'bg.webp'}},CombatEffects:{drawGroundShadow(){},drawMuzzleFlash(c,m,{age}){if(m&&age>=0&&age<130)flashes.push(m.side);}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/scene.js','utf8'),context);
 if(renderer==='side')vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/side-scene.js','utf8'),context);
 const scene=context.window.CombatScene,input={armor:1,weaponId:86,enemyGear:null,enemy:{battleToken:'a',name:'Кабан',hp:100,kind:'mutant'}};
 return{scene,input,doc,reduced,host,
  set now(value){now=value;},get now(){return now;},get frameCount(){return frames.size;},get lunge(){return lunges.at(-1);},get flashes(){return flashes;},get caption(){return host.children[1]?.textContent;},
  async show(next=input){const p=scene.show(next);images.splice(0).forEach(fn=>fn());return await p;},
  tick(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));},
  visibility(hidden){doc.hidden=hidden;for(const fn of listeners.visibilitychange||[])fn();}
 };
}

(async()=>{
 for(const renderer of ['legacy','side']){
  const f=fixture(renderer),{scene,input}=f;
  assert.equal(scene.mutantAttack('a'),false,renderer+': unloaded scene cannot attack');
  await f.show();assert.equal(scene.mutantAttack('wrong'),false);assert.equal(f.frameCount,0);
  assert.equal(scene.mutantAttack('a'),true);assert.equal(f.lunge,0);
  f.tick(1060);assert.ok(f.lunge>0&&f.lunge<32,renderer+': lunge starts with attack audio');
  f.tick(1120);assert.equal(f.lunge,32,renderer+': impact peaks at 120 ms');
  f.tick(1240);assert.ok(f.lunge>0&&f.lunge<32,renderer+': lunge eases back');
  assert.match(f.caption,/100 HP/,renderer+': visual attack cannot change HP');assert.deepEqual(f.flashes,[],renderer+': mutant attacks cannot emit weapon flashes');
  f.tick(1360);assert.equal(f.lunge,0);assert.equal(f.frameCount,0,renderer+': attack animation ends after 360 ms');
  scene.react('a',{success:true,enemyHp:80,enemyTurn:{damage:0}},'attack',{externalShots:true,externalMutantAttack:true});
  assert.match(f.caption,/80 HP/);f.tick(1480);assert.equal(f.lunge,0,renderer+': final result cannot repeat the coordinated attack');assert.deepEqual(f.flashes,[]);f.tick(2050);

  f.now=2200;scene.mutantAttack('a');f.tick(2320);assert.equal(f.lunge,32);scene.hide();assert.equal(f.frameCount,0);assert.equal(scene.mutantAttack('a'),false);
  await f.show();assert.equal(f.lunge,0,renderer+': reopening cannot replay a cancelled attack');
  scene.mutantAttack('a');await f.show({...input,armor:2});assert.equal(f.frameCount,0);assert.equal(f.lunge,0,renderer+': changed equipment cancels the lunge');
  scene.mutantAttack('a');await f.show({...input,enemy:{...input.enemy,battleToken:'new'}});assert.equal(f.frameCount,0);assert.equal(f.lunge,0);assert.equal(scene.mutantAttack('a'),false);
  scene.mutantAttack('new');f.visibility(true);assert.equal(f.frameCount,0);assert.equal(scene.mutantAttack('new'),false);f.visibility(false);assert.equal(f.lunge,0,renderer+': hidden tab cannot replay an attack');
  f.reduced.matches=true;assert.equal(scene.mutantAttack('new'),false);assert.equal(f.frameCount,0);f.reduced.matches=false;
  await f.show({...input,enemy:{...input.enemy,kind:'missing'}});assert.equal(scene.mutantAttack('a'),false,renderer+': missing mutant art cannot attack');

  if(renderer==='side'){
   await f.show({...input,enemyGear:{armorId:1,weaponId:86},enemy:{...input.enemy,kind:'npc'}});assert.equal(scene.mutantAttack('a'),false,'An armed NPC cannot use the mutant attack hook');
   await f.show({...input,armor:0,weaponId:0});f.now=3000;assert.equal(scene.mutantAttack('a'),true,'Side wrapper delegates the legacy mutant hook');f.tick(3120);assert.equal(f.lunge,32);
   f.tick(3360);scene.react('a',{success:true,enemyTurn:{damage:0}},'wait',{externalMutantAttack:true});f.tick(3480);assert.equal(f.lunge,0,'Side wrapper forwards duplicate-attack suppression to legacy');
  }else{
   await f.show();f.now=4000;scene.react('a',{success:true,enemyTurn:{damage:0}},'wait');f.tick(4325);assert.equal(f.lunge,32,'Legacy no-audio reaction preserves its 650 ms lunge');f.tick(4650);assert.equal(f.lunge,0);
  }
  scene.hide();
 }
 console.log('PASS: mutant attack onset/120 ms impact/360 ms completion, unchanged HP, no weapon flashes, legacy fallback, duplicate suppression, art/token guards and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
