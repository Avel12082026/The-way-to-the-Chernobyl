const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=1000,rafId=0,images=[],frames=new Map(),visible=[],listeners={},reduced={matches:false},legacyCalls=[];
const host={children:[],replaceChildren(...items){this.children=items;},setAttribute(){}};
const ctx={clearRect(){visible=[];},fillRect(){},drawImage(){},save(){},restore(){},translate(){}};
const fighters={data:{version:'test'},resolve(g){return{...g,key:g?.armorId+':'+g?.weaponId,ready:!!g?.armorId};},async load(g){return g.ready?g:null;},draw(){},feet(){return[];},muzzle(l,side){return l?{x:side==='player'?600:936,y:500,angle:side==='player'?0:Math.PI,side,weaponId:l.weaponId}:null;}};
const doc={hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(n,fn){listeners[n]=fn;}};
const context={console,setTimeout,clearTimeout,document:doc,performance:{now:()=>now},requestAnimationFrame(fn){const id=++rafId;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},Image:class{set src(value){images.push(()=>this.onload?.());}},window:{matchMedia:()=>reduced,COMBAT_ASSETS:{},CombatScene:{show(){},hide(){},react(...args){legacyCalls.push(['react',...args]);},pulse(...args){legacyCalls.push(['pulse',...args]);return true;}},CombatFighters:fighters,CombatLayout:{drawCreature(){}},CombatAssets:{getVisuals:enemy=>enemy.mutant?{ready:true,species:'boar',mutant:'boar.png',background:'bg.webp'}:{ready:false}},CombatEffects:{drawGroundShadow(){},drawMuzzleFlash(ctx,m,options){if(m&&options.age>=0&&options.age<130)visible.push({side:m.side,age:options.age,weaponId:m.weaponId});}}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/side-scene.js','utf8'),context);const scene=context.window.CombatScene;
const input={armor:1,weaponId:14,enemyGear:{armorId:2,weaponId:20},enemy:{battleToken:'a',name:'NPC',hp:100}};
async function show(next=input){const p=scene.show(next);images.splice(0).forEach(fn=>fn());return await p;}
function tick(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}
const sides=()=>visible.map(x=>x.side);
(async()=>{
 await show();scene.react('wrong',{success:true,enemyTurn:{}},'attack');assert.deepEqual(sides(),[]);assert.equal(frames.size,0);
 scene.react('a',{success:false,enemyTurn:{}},'attack');assert.deepEqual(sides(),[]);assert.equal(frames.size,0);
 scene.react('a',{success:true,enemyHp:90,enemyTurn:{damage:0}},'attack');assert.deepEqual(sides(),['player'],'A missed shot still fires from the player weapon');assert.match(host.children[1].textContent,/90 HP/);
 tick(1065);assert.deepEqual(sides(),['player']);tick(1140);assert.deepEqual(sides(),[]);
 tick(1240);assert.deepEqual(sides(),['enemy'],'NPC countershot begins after the player flash');tick(1371);assert.deepEqual(sides(),[]);assert.equal(frames.size,0,'Expired reaction stops animation');
 now=2000;scene.react('a',{success:true,enemyTurn:{damage:0}},'consumable');assert.deepEqual(sides(),['enemy'],'Consumable never flashes the player weapon');tick(2140);assert.equal(frames.size,0);
 now=3000;scene.react('a',{success:true},'wait');assert.deepEqual(sides(),[]);tick(3140);
 now=4000;scene.react('a',{success:true,enemyTurn:{},victoryReady:true},'attack');assert.deepEqual(sides(),['player']);tick(4250);assert.deepEqual(sides(),[]);
 now=5000;scene.react('a',{success:true,enemyTurn:{}},'attack');await show({...input,weaponId:46});assert.deepEqual(sides(),[],'Changing equipment clears the old shot');assert.equal(frames.size,0);
 scene.react('a',{success:true,enemyTurn:{}},'attack');scene.hide();assert.equal(frames.size,0);assert.equal(host.hidden,true);
 await show();reduced.matches=true;scene.react('a',{success:true,enemyTurn:{}},'attack');assert.deepEqual(sides(),[]);assert.equal(frames.size,0);reduced.matches=false;
 scene.react('a',{success:true,enemyTurn:{}},'attack');doc.hidden=true;listeners.visibilitychange();assert.equal(frames.size,0);doc.hidden=false;listeners.visibilitychange();assert.deepEqual(sides(),[],'Returning to a tab cannot replay a stale flash');
 await show({...input,enemy:{battleToken:'m',name:'Кабан',hp:50,mutant:true}});scene.react('m',{success:true,enemyTurn:{}},'attack');assert.deepEqual(sides(),['player']);tick(now+245);assert.deepEqual(sides(),[],'A mutant cannot emit an NPC gun flash');
 // A burst only draws shots. The single authoritative damage result is applied
 // after the coordinator finishes, including when that result kills the enemy.
 await show();now=10000;
 assert.equal(scene.pulse('wrong','player'),false);assert.equal(scene.pulse('a','wrong'),false);assert.equal(frames.size,0);
 for(let i=0;i<3;i++){
  now=10000+i*240;assert.equal(scene.pulse('a','player'),true);
  assert.deepEqual(sides(),['player']);assert.equal(visible[0].age,0);
  assert.match(host.children[1].textContent,/100 HP/,'A pulse cannot apply damage early');
  tick(now+71);assert.deepEqual(sides(),[],'Each flash fades before the next pistol shot');
 }
 scene.react('a',{success:true,enemyHp:0,victoryReady:true},'attack',{externalShots:true});
 assert.match(host.children[1].textContent,/0 HP/);assert.deepEqual(sides(),[],'The final HP update cannot add a fourth flash');assert.equal(frames.size,0);
 await show();
 for(let i=0;i<6;i++){
  now=12000+i*100;assert.equal(scene.pulse('a','enemy'),true);
  assert.deepEqual(sides(),['enemy']);assert.equal(visible[0].age,0);
  tick(now+71);assert.deepEqual(sides(),[],'Every 100 ms machine-gun shot has a visible off gap');
 }
 now=14000;scene.pulse('a','player');now=14030;scene.pulse('a','enemy');
 assert.deepEqual(sides(),['player','enemy']);assert.equal(visible[0].age,30*(130/70));assert.equal(visible[1].age,0,'An NPC pulse keeps the player flash clock');
 now=14050;scene.pulse('a','player');
 assert.deepEqual(sides(),['player','enemy']);assert.equal(visible[0].age,0);assert.equal(visible[1].age,20*(130/70),'A repeated player shot keeps the NPC flash clock');
 tick(14101);assert.deepEqual(sides(),['player']);tick(14121);assert.deepEqual(sides(),[]);assert.equal(frames.size,0);
 scene.pulse('a','player');await show({...input,weaponId:46});assert.deepEqual(sides(),[]);assert.equal(frames.size,0,'A gear change cancels pulses');
 scene.pulse('a','player');await show({...input,enemy:{...input.enemy,battleToken:'new'}});assert.deepEqual(sides(),[]);assert.equal(scene.pulse('a','player'),false,'The previous battle cannot pulse the new scene');
 scene.pulse('new','enemy');scene.hide();assert.equal(frames.size,0);assert.equal(scene.pulse('new','player'),false);await show();assert.deepEqual(sides(),[],'Reopening cannot resume a hidden burst');
 reduced.matches=true;assert.equal(scene.pulse('a','player'),false);assert.deepEqual(sides(),[]);assert.equal(frames.size,0);reduced.matches=false;
 scene.pulse('a','player');doc.hidden=true;listeners.visibilitychange();assert.equal(scene.pulse('a','enemy'),false);assert.equal(frames.size,0);doc.hidden=false;listeners.visibilitychange();assert.deepEqual(sides(),[]);
 await show({...input,armor:0,weaponId:0,enemyGear:null});assert.equal(scene.pulse('legacy','player'),true);
 const result={success:true,enemyHp:0},options={externalShots:true};scene.react('legacy',result,'attack',options);
 assert.deepEqual(legacyCalls,[['pulse','legacy','player'],['react','legacy',result,'attack',options]],'Fallback forwards the pulse API and external-shot suppression');
 console.log('PASS: independent 3/6-shot flash pulses, deferred HP, legacy delegation, player/NPC timing, cancellation, misses, reduced motion and mutant exclusion');
})().catch(error=>{console.error(error);process.exitCode=1;});
