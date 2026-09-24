const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const catalog=require('../images/combat/catalog.json');
const {createResolver}=require('../images/combat/assets.js');
let now=0,id=0,frames=new Map(),listener,fail=false,hold=false;
const calls=[],pending=[],warnings=[],urls=[];
const host={hidden:true,setAttribute(){},replaceChildren(...children){this.children=children;}};
const ctx={clearRect(){},drawImage(image){calls.push(['background',image.url]);},save(){},restore(){},translate(){},fillRect(){}};
const reduced={matches:false};
const fighters={
 resolve(gear){const armor=Number(gear?.armorId),weapon=Number(gear?.weaponId);return {key:armor+':'+weapon,ready:armor>0&&[12,87].includes(weapon),image:`fighter-${armor}-${weapon}`};},
 draw(ctx,image,side,offset){if(image)calls.push(['fighter',side,offset]);}
};
const backgrounds={resolve({playerLevel,battleToken}){return {id:`${battleToken}-${playerLevel||1}`,image:`stage-${battleToken}-${playerLevel||1}`,minLevel:1,maxLevel:600};}};
const env={setTimeout,clearTimeout,console:{warn(...args){warnings.push(args);}},window:{COMBAT_ASSETS:catalog,CombatAssets:createResolver(catalog),CombatBackgrounds:backgrounds,CombatFighters:fighters,matchMedia:()=>reduced,
 CombatLayout:{drawCreature(c,i,s,l){calls.push(['lunge',l]);}}},
 document:{hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener:(n,f)=>listener=f},
 performance:{now:()=>now},requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i),
 Image:class{set src(url){this.url=url;urls.push(url);const finish=error=>error?this.onerror?.():this.onload?.();if(hold)pending.push({url,finish});else queueMicrotask(()=>finish(fail));}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../images/combat/scene.js'),'utf8'),env);
const scene=env.window.CombatScene;
function tick(t){now=t;const scheduled=[...frames.values()];frames.clear();calls.length=0;scheduled.forEach(f=>f(t));}
function release(prefix,error=false){for(let i=pending.length-1;i>=0;i--){if(pending[i].url.startsWith(prefix))pending.splice(i,1)[0].finish(error);}}
const lunge=()=>calls.find(c=>c[0]==='lunge')?.[1];
const offset=side=>calls.find(c=>c[0]==='fighter'&&c[1]===side)?.[2];
const config={enemy:{name:catalog.entries[0].name,hp:100,battleToken:'a'},weaponId:87,armor:1,playerLevel:1};
const battle=token=>({...config,enemy:{...config.enemy,battleToken:token}});
(async()=>{
 assert.equal(await scene.show(config),true);assert.equal(host.hidden,false);
 assert.ok(urls.some(url=>url.startsWith('stage-a-1')),'Every battle loads its selected background');
 scene.react('wrong',{success:true,enemyTurn:{}},'attack');assert.equal(frames.size,0);
 scene.react('a',{success:false,enemyTurn:{}},'attack');assert.equal(frames.size,0);
 scene.react('a',{success:true,enemyHp:80,enemyTurn:{damage:5}},'attack');
 tick(110);assert.ok(offset('player')<0,'Player recoils left along X');assert.equal(lunge(),0);assert.match(host.children[1].textContent,/80 HP/);
 tick(545);assert.ok(lunge()>30);
 tick(900);assert.equal(frames.size,0);assert.equal(lunge(),0);
 for(const action of ['escape','medkit','wait','consumable']){
  scene.react('a',{success:true,enemyTurn:{damage:0}},action);tick(now+325);
  assert.ok(lunge()>30,action);assert.equal(offset('player'),0,'Non-attack actions do not recoil');tick(now+400);
 }
 for(const flag of ['victoryReady','died']){
  scene.react('a',{success:true,[flag]:true,enemyHp:0,enemyTurn:{}},'attack');tick(now+545);
  assert.equal(lunge(),0,'Finished combat must not animate an enemy attack');tick(now+400);
 }
 scene.hide();assert.equal(frames.size,0);assert.equal(host.hidden,true);
 reduced.matches=true;await scene.show(config);scene.react('a',{success:true,enemyTurn:{}},'wait');tick(now+325);
 assert.equal(frames.size,0);assert.equal(lunge(),0);assert.equal(offset('player'),0);
 reduced.matches=false;scene.react('a',{success:true,enemyTurn:{}},'wait');env.document.hidden=true;listener();assert.equal(frames.size,0);
 env.document.hidden=false;listener();assert.equal(lunge(),0,'Returning to visible tab clears the old reaction');
 // Human enemies advance toward the player on the left; no separate limb is drawn.
 const npc={...battle('npc'),enemy:{name:'Боец',hp:100,battleToken:'npc'},weaponId:12,enemyGear:{armorId:40,weaponId:12}};
 assert.equal(await scene.show(npc),true);scene.react('npc',{success:true,enemyTurn:{}},'wait');tick(now+325);
 assert.ok(offset('enemy')<-30);assert.equal(lunge(),undefined);tick(now+400);
 // Unsupported whole-character artwork never hides an otherwise valid mutant fight.
 for(const name of ['Самка наблюдателя','Самка псевдогиганта']){
  for(const weaponId of [105,50,undefined]){
   const token=name+'-'+weaponId;
   assert.equal(await scene.show({...config,weaponId,enemy:{name,hp:100,battleToken:token}}),true);
   assert.equal(host.hidden,false);assert.match(host.children[1].textContent,/Облик игрока ещё не готов/);
   scene.react(token,{success:true,enemyTurn:{damage:0}},'attack');tick(now+545);assert.ok(lunge()>30);tick(now+400);
  }
 }
 // Hold genuinely asynchronous images to exercise cancellation and out-of-order completion.
 await scene.show(config);hold=true;
 let loading=scene.show(battle('hidden'));scene.hide();release('stage-hidden-');assert.equal(await loading,false);assert.equal(host.hidden,true);
 let older=scene.show(battle('older')),newer=scene.show(battle('newer'));
 release('stage-newer-');assert.equal(await newer,true);const count=calls.length;
 release('stage-older-');assert.equal(await older,false);assert.equal(calls.length,count,'Stale success must not redraw the new battle');
 older=scene.show(battle('old-failure'));newer=scene.show(battle('latest'));
 release('stage-latest-');assert.equal(await newer,true);release('stage-old-failure-',true);assert.equal(await older,false);
 assert.equal(host.children[2].hidden,true,'Stale failure must not replace the current battle with Retry');
 loading=scene.show(battle('updated'));assert.equal(await scene.show({...battle('updated'),enemy:{...config.enemy,battleToken:'updated',hp:37},pending:true}),true);
 release('stage-updated-');assert.equal(await loading,true);assert.match(host.children[1].textContent,/37 HP.*Ход выполняется/);
 assert.equal(pending.length,0);hold=false;
 // Required-image failure is recoverable; retry requests the same selected stage again.
 scene.hide();fail=true;const fresh=battle('fresh-background');
 assert.equal(await scene.show(fresh),false);assert.equal(host.hidden,false);assert.equal(host.children[0].hidden,true);
 assert.equal(host.children[2].hidden,false);assert.ok(warnings.length>0);
 fail=false;host.children[2].onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(host.children[0].hidden,false);assert.equal(host.children[2].hidden,true);
 assert.equal(urls.filter(url=>url.startsWith('stage-fresh-background-')).length,2);
 env.window.CombatBackgrounds=null;
 assert.equal(await scene.show(config),false);assert.equal(host.hidden,false);assert.match(host.children[1].textContent,/интерфейс боя/);
 scene.hide();assert.equal(frames.size,0);
 console.log('PASS: whole-fighter recoil, NPC approach, mutant reactions, actions, victory, reduced motion, visibility, stale loads and retry');
})().catch(e=>{console.error(e);process.exitCode=1});
