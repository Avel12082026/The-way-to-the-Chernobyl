const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let now=1000,rafId=0,images=[],frames=new Map(),translations=[],listeners={},reduced={matches:false};
const host={children:[],replaceChildren(...items){this.children=items;},setAttribute(){}};
const ctx={clearRect(){translations=[];},drawImage(){},save(){},restore(){},translate(x,y){translations.push([x,y]);}};
const doc={hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(n,fn){listeners[n]=fn;}};
const context={console,setTimeout,clearTimeout,document:doc,performance:{now:()=>now},requestAnimationFrame(fn){const id=++rafId;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},Image:class{set src(value){images.push(()=>this.onload?.());}},window:{matchMedia:()=>reduced,COMBAT_ASSETS:{pistols:[{id:86,ready:true,image:'pistol.png'}],armorIds:[1]},CombatLayout:{drawCreature(){},drawForeground(){}},CombatAssets:{getVisuals:()=>({ready:true,species:'boar',mutant:'boar.png',background:'bg.webp'})}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/scene.js','utf8'),context);const scene=context.window.CombatScene;
const input={armor:1,weaponId:86,enemy:{battleToken:'a',name:'Кабан',hp:100}};
async function show(next=input){const p=scene.show(next);images.splice(0).forEach(fn=>fn());return await p;}
function tick(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}
(async()=>{
 await show();assert.equal(scene.pulse('wrong','player'),false);assert.equal(scene.pulse('a','enemy'),false);assert.equal(frames.size,0);
 for(let i=0;i<3;i++){
  now=1000+i*240;assert.equal(scene.pulse('a','player'),true);tick(now+35);
  assert.deepEqual(translations,[[0,12]],'Legacy foreground recoils once for each pulse');assert.match(host.children[1].textContent,/100 HP/);
  tick(now+36);assert.deepEqual(translations,[]);assert.equal(frames.size,0);
 }
 scene.react('a',{success:true,enemyHp:0,victoryReady:true},'attack',{externalShots:true});assert.match(host.children[1].textContent,/0 HP/);
 tick(now+65);assert.deepEqual(translations,[],'External shots cannot add an extra legacy recoil');tick(now+650);
 await show();scene.pulse('a','player');scene.hide();assert.equal(frames.size,0);assert.equal(scene.pulse('a','player'),false);
 await show();assert.deepEqual(translations,[]);scene.pulse('a','player');await show({...input,enemy:{...input.enemy,battleToken:'next'}});assert.equal(frames.size,0);assert.equal(scene.pulse('a','player'),false);
 reduced.matches=true;assert.equal(scene.pulse('next','player'),false);reduced.matches=false;
 scene.pulse('next','player');doc.hidden=true;listeners.visibilitychange();assert.equal(frames.size,0);assert.equal(scene.pulse('next','player'),false);doc.hidden=false;listeners.visibilitychange();assert.deepEqual(translations,[]);
 console.log('PASS: legacy per-shot recoil, deferred HP, no duplicate reaction, battle/visibility/hide cancellation and reduced motion');
})().catch(error=>{console.error(error);process.exitCode=1;});
