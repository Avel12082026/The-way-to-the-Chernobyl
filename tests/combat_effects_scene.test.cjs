const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=1000,rafId=0,images=[],frames=new Map(),visible=[],listeners={},reduced={matches:false};
const host={children:[],replaceChildren(...items){this.children=items;},setAttribute(){}};
const ctx={clearRect(){visible=[];},fillRect(){},drawImage(){},save(){},restore(){},translate(){}};
const fighters={data:{version:'test'},resolve(g){return{...g,key:g?.armorId+':'+g?.weaponId,ready:!!g?.armorId};},async load(g){return g.ready?g:null;},draw(){},feet(){return[];},muzzle(l,side){return l?{x:side==='player'?600:936,y:500,angle:side==='player'?0:Math.PI,side,weaponId:l.weaponId}:null;}};
const doc={hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(n,fn){listeners[n]=fn;}};
const context={console,setTimeout,clearTimeout,document:doc,performance:{now:()=>now},requestAnimationFrame(fn){const id=++rafId;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},Image:class{set src(value){images.push(()=>this.onload?.());}},window:{matchMedia:()=>reduced,COMBAT_ASSETS:{},CombatScene:{show(){},hide(){},react(){}},CombatFighters:fighters,CombatLayout:{drawCreature(){}},CombatAssets:{getVisuals:enemy=>enemy.mutant?{ready:true,species:'boar',mutant:'boar.png',background:'bg.webp'}:{ready:false}},CombatEffects:{drawGroundShadow(){},drawMuzzleFlash(ctx,m,options){if(m&&options.age>=0&&options.age<130)visible.push({side:m.side,age:options.age,weaponId:m.weaponId});}}}};
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
 console.log('PASS: player/NPC flash timing, misses, actions, expiry, gear changes, hidden tab, reduced motion and mutant exclusion');
})().catch(error=>{console.error(error);process.exitCode=1;});
