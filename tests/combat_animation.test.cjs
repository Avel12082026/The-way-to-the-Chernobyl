const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const catalog=require('../images/combat/catalog.json');
const {createResolver}=require('../images/combat/assets.js');
let now=0,id=0,frames=new Map(),listener,fail=false;
const calls=[],host={hidden:true,setAttribute(){},replaceChildren(){}};
const ctx={clearRect(){},drawImage(){},save(){},restore(){},translate(x,y){calls.push(['recoil',y]);}};
const reduced={matches:false};
const env={window:{COMBAT_ASSETS:catalog,CombatAssets:createResolver(catalog),matchMedia:()=>reduced,
 CombatLayout:{drawCreature(c,i,s,l){calls.push(['lunge',l]);},drawForeground(){}}},
 document:{hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener:(n,f)=>listener=f},
 performance:{now:()=>now},requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i),
 Image:class{set src(v){queueMicrotask(()=>fail?this.onerror():this.onload());}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../images/combat/scene.js'),'utf8'),env);
const scene=env.window.CombatScene;
function tick(t){now=t;const pending=[...frames.values()];frames.clear();calls.length=0;pending.forEach(f=>f(t));}
const config={enemy:{name:catalog.entries[0].name,hp:100,battleToken:'a'},weaponId:87,armor:1};
(async()=>{
 assert.equal(await scene.show(config),true);assert.equal(host.hidden,false);
 scene.react('wrong',{success:true,enemyTurn:{}},'attack');assert.equal(frames.size,0);
 scene.react('a',{success:false,enemyTurn:{}},'attack');assert.equal(frames.size,0);
 scene.react('a',{success:true,enemyHp:80,enemyTurn:{damage:5}},'attack');
 tick(110);assert.ok(calls.some(c=>c[0]==='recoil'&&c[1]>0));assert.equal(calls.find(c=>c[0]==='lunge')[1],0);
 tick(545);assert.ok(calls.find(c=>c[0]==='lunge')[1]>30);
 tick(900);assert.equal(frames.size,0);assert.equal(calls.find(c=>c[0]==='lunge')[1],0);
 for(const action of ['escape','medkit','wait','consumable']){
  scene.react('a',{success:true,enemyTurn:{damage:0}},action);tick(now+325);
  assert.ok(calls.find(c=>c[0]==='lunge')[1]>30,action);tick(now+400);
 }
 scene.react('a',{success:true,victoryReady:true,enemyHp:0,enemyTurn:{}},'attack');tick(now+545);
 assert.equal(calls.find(c=>c[0]==='lunge')[1],0,'Dead mutant must not attack');
 scene.hide();assert.equal(frames.size,0);assert.equal(host.hidden,true);
 reduced.matches=true;await scene.show(config);scene.react('a',{success:true,enemyTurn:{}},'wait');tick(now+325);
 assert.equal(frames.size,0);assert.equal(calls.find(c=>c[0]==='lunge')[1],0);
 reduced.matches=false;scene.react('a',{success:true,enemyTurn:{}},'wait');env.document.hidden=true;listener();assert.equal(frames.size,0);
 env.document.hidden=false;listener();
 // A late image load cannot reopen a hidden or replaced battle.
 const loading=scene.show({...config,armor:2});scene.hide();await loading;assert.equal(host.hidden,true);
 fail=true;assert.equal(await scene.show({...config,armor:3}),false);assert.equal(host.hidden,true);
 console.log('Combat animation: shot/attack order, misses, consumables, victory, reduced motion, visibility and loading cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
