const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fighters=require('../images/combat/fighters.js');
const urls=[],transforms=[],host={setAttribute(){},replaceChildren(...children){this.children=children;}};let delayed=[];
const ctx={save(){},restore(){},translate(){},scale(...s){transforms.push(s);},drawImage(){},clearRect(){},fillRect(){}};
const env={setTimeout,clearTimeout,console,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){return 1;},
 document:{getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(){}},
 Image:class{constructor(){this.width=1024;this.height=1536;}set src(url){urls.push(url);delayed.push(()=>this.onload?.());}},
 window:{CombatScene:{show(){return 'legacy';},hide(){},react(){}},matchMedia:()=>({matches:false}),CombatFighters:fighters,COMBAT_ASSETS:{},CombatAssets:{getVisuals:()=>({ready:false})},CombatLayout:{}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../images/combat/side-scene.js','utf8'),env);
async function flush(p){delayed.splice(0).forEach(f=>f());return await p;}
(async()=>{
 const scene=env.window.CombatScene,c={enemy:{name:'NPC',battleToken:'a',hp:100},armor:1,weaponId:86,enemyGear:{armorId:1,weaponId:86}};
 assert.equal(await flush(scene.show(c)),true);assert.equal(urls.length,3,'Player and NPC share cached layers');
 await flush(scene.show({...c,weaponId:2}));assert.equal(urls.length,4,'Changing pistol loads only its image');
 await flush(scene.show({...c,armor:4,weaponId:2}));assert.equal(urls.length,6,'Changing suit reuses pistol');
 assert.ok(transforms.some(x=>x[0]<0),'NPC reflects all layers together');
 scene.react('a',{success:true,enemyHp:80},'attack');assert.match(host.children[1].textContent,/80 HP/);
 await flush(scene.show({...c,enemyGear:{armorId:0,weaponId:0}}));assert.match(host.children[1].textContent,/Облик противника ещё не готов/);
 assert.equal(await scene.show({...c,armor:0,enemyGear:null}),'legacy');
 await flush(scene.show(c));assert.equal(host.children[0].hidden,false);
 const stale=scene.show({...c,weaponId:87});scene.hide();assert.equal(await flush(stale),false);assert.equal(host.hidden,true);
 console.log('PASS: player/NPC layers, equipment changes, shared cache, reflection, HP, missing gear, legacy transition, stale loads');
})().catch(e=>{console.error(e);process.exitCode=1;});
