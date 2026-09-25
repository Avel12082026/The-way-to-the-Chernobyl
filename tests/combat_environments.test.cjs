const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const environments=require('../images/combat/environments-v2.js');
assert.equal(environments.entries.length,20);
assert.equal(new Set(environments.entries.map(x=>x.path)).size,20);
assert.equal(environments.zones.length,4);
const zoneAliases=[[1,'1','cordon','Кордон'],[2,'2','garbage','Свалка'],[3,'3','agroprom','Агропром','НИИ Агропром'],[4,'4','rostok','rosstok','Росток','Россток']];
for(let zoneId=1;zoneId<=4;zoneId++){
 const reachable=new Set();
 const zone=environments.zones[zoneId-1];
 assert.equal(zone.entries.length,5);
 for(let i=0;i<400;i++){
  const token='battle-'+i;
  const expected=environments.select({zoneLocation:zoneId,battleToken:token});
  assert.equal(expected.zoneId,zoneId,'Other locations never leak into this zone');
  assert.ok(expected.id>=(zoneId-1)*5+1&&expected.id<=zoneId*5);
  assert.ok(zone.entries.includes(expected));
  reachable.add(expected.id);
  for(const alias of zoneAliases[zoneId-1]){
   for(const location of [alias,{id:alias},{name:alias},{slug:alias}]){
    assert.equal(environments.select({location,battleToken:token}),expected);
   }
   assert.equal(environments.select({enemy:{zoneLocation:alias,battleToken:token}}),expected);
  }
  assert.equal(environments.select({zoneLocation:zoneId,battleToken:token,level:999,player:{level:999}}),expected,'Unlock level cannot move a battle to another zone');
 }
 assert.equal(reachable.size,5,'Every variant within this location is reachable');
}
for(const location of [undefined,null,'Зона','Припять','Чернобыль','pripyat',0,5,999,-1,{},'__proto__','constructor']){
 assert.equal(environments.select({location,battleToken:'unknown'}).zoneId,1,'An unknown location has a Cordon fallback, never a late-game city');
}
assert.equal(environments.select({zoneLocation:2,location:4,enemy:{zoneLocation:3},battleToken:'priority'}).zoneId,2,'The canonical current zone is authoritative');
for(let i=0;i<200;i++){
 const input={battleToken:'token-'+i,location:{id:'cordon'}};
 assert.equal(environments.select(input),environments.select(input),'Battle background is stable across re-renders');
 assert.equal(environments.select(input),environments.select({enemy:{battleToken:input.battleToken,locationId:'cordon'}}));
}
assert.equal(environments.select({location:'cordon',battleToken:'stable'}).zoneId,1);
assert.equal(environments.select({location:'rostok',battleToken:'stable'}).zoneId,4,'Navigation changes the allowed environment bucket even when a token is reused');
const loads=[],draws=[],delayed=[];
const host={children:[],replaceChildren(...children){this.children=children;},setAttribute(){}};
const ctx={clearRect(){},fillRect(){},save(){},restore(){},translate(){},drawImage(image){draws.push(image.url);}};
const fighters={data:{version:'test'},resolve(gear){return {key:gear?.armorId+':'+gear?.weaponId,ready:!!gear?.armorId};},async load(gear){return gear.ready?gear:null;},draw(){}};
const context={console,setTimeout,clearTimeout,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){return 1;},
 Image:class{set src(url){this.url=url;loads.push(url);delayed.push(()=>this.onload?.());}},
 document:{hidden:false,getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(){}},
 window:{CombatScene:{show(){},hide(){},react(){}},matchMedia:()=>({matches:false}),CombatFighters:fighters,COMBAT_ASSETS:{},CombatEnvironments:environments,
 CombatAssets:{getVisuals:enemy=>enemy.kind==='mutant'?{ready:true,species:'boar',mutant:'images/combat/boar.png',background:'images/combat/old-background.png'}:{ready:false}},CombatLayout:{drawCreature(){}}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/side-scene.js','utf8'),context);
async function flush(promise){delayed.splice(0).forEach(done=>done());return await promise;}
(async()=>{
 const scene=context.window.CombatScene;
 const input={enemy:{name:'NPC',battleToken:'human-1',hp:100},armor:1,weaponId:14,enemyGear:{armorId:2,weaponId:14},location:'cordon'};
 const expected=environments.select(input).path+'?v=test';
 assert.equal(await flush(scene.show(input)),true);
 assert.deepEqual(loads,[expected],'Human battle loads one selected background only');
 assert.equal(draws.at(-1),expected);
 const before=loads.length;
 assert.equal(await flush(scene.show({...input,pending:true})),true);
 assert.equal(loads.length,before,'Repeated state update reuses selected image');
 for(const zoneLocation of [2,3,4,1]){
  const next={...input,zoneLocation};
  const nextPath=environments.select(next).path+'?v=test';
  assert.equal(await flush(scene.show(next)),true);
  assert.equal(draws.at(-1),nextPath,'Transition loads the scenery for the new zone');
 }
 const mutant={...input,enemy:{name:'Кабан',kind:'mutant',battleToken:'mutant-1',hp:60},enemyGear:null};
 assert.equal(await flush(scene.show(mutant)),true);
 assert.equal(draws.at(-1),environments.select(mutant).path+'?v=test','Mutants use the same environment catalog');
 assert.ok(loads.some(url=>url==='images/combat/boar.png?v=test'));
 assert.ok(!loads.some(url=>url.includes('old-background')),'Legacy mutant background does not download');
 const stale={...input,zoneLocation:4,enemy:{...input.enemy,battleToken:'stale-token'}};
 const newest={...input,zoneLocation:2,enemy:{...input.enemy,battleToken:'latest-token'}};
 const oldPromise=scene.show(stale),newPromise=scene.show(newest);
 assert.equal(await flush(newPromise),true);
 assert.equal(await oldPromise,false,'Old asynchronous scene cannot replace the newer battle');
 assert.equal(draws.at(-1),environments.select(newest).path+'?v=test');
 const hidden=scene.show({...input,enemy:{...input.enemy,battleToken:'hidden-token'}});scene.hide();
 assert.equal(await flush(hidden),false);assert.equal(host.hidden,true);
 console.log('PASS: 4 location-specific groups of 5 environments, aliases, Cordon fallback, level independence, human and mutant scenes, navigation, cache and stale-load protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
