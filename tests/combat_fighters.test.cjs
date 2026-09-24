const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fighters=require('../images/combat/fighters.js');
assert.equal(fighters.resolve({armorId:1,weaponId:86}).ready,true);
for(const gear of [{armorId:2,weaponId:86},{armorId:1,weaponId:13},{},null])assert.equal(fighters.resolve(gear).ready,false);
const transforms=[];
const ctx={save(){},restore(){},translate(...x){transforms.push(['translate',...x]);},scale(...x){transforms.push(['scale',...x]);},drawImage(...x){transforms.push(['image',...x.slice(1)]);},clearRect(){},fillRect(){}};
const sprite={width:1024,height:1536};
fighters.draw(ctx,sprite,'player');fighters.draw(ctx,sprite,'enemy');
assert.deepEqual(transforms.filter(x=>x[0]==='translate'),[['translate',340,940],['translate',1196,940]]);
assert.deepEqual(transforms.filter(x=>x[0]==='scale'),[['scale',1,1],['scale',-1,1]]);
assert.deepEqual(transforms[2],transforms[5],'Entire character including gun has identical dimensions');
const urls=[],host={setAttribute(){},replaceChildren(...children){this.children=children;}};
let delayed=[];
const env={setTimeout,clearTimeout,console,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(){return 1;},
 document:{getElementById:()=>host,createElement:t=>t==='canvas'?{setAttribute(){},getContext:()=>ctx}:{setAttribute(){}},addEventListener(){}},
 Image:class{constructor(){this.width=1024;this.height=1536;}set src(url){urls.push(url);delayed.push(()=>this.onload());}},
 window:{CombatScene:{show(){return 'legacy';},hide(){},react(){}},matchMedia:()=>({matches:false}),CombatFighters:fighters,COMBAT_ASSETS:{},CombatAssets:{getVisuals:()=>({ready:false})},CombatLayout:{}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../images/combat/side-scene.js'),'utf8'),env);
async function flush(p){delayed.splice(0).forEach(f=>f());return await p;}
(async()=>{
 const scene=env.window.CombatScene,c={enemy:{name:'Боец',battleToken:'a',hp:100},armor:1,weaponId:86,enemyGear:{armorId:1,weaponId:86}};
 assert.equal(await flush(scene.show(c)),true);assert.equal(urls.length,1);assert.equal(host.children[0].hidden,false);
 assert.ok(urls.some(x=>x.includes('/1-86.png')));assert.ok(urls.some(x=>x.includes('/1-86.png')));
 await flush(scene.show({...c,enemyGear:{armorId:2,weaponId:86}}));assert.match(host.children[1].textContent,/Облик противника ещё не готов/);
 await flush(scene.show({...c,armor:2}));assert.match(host.children[1].textContent,/Облик игрока ещё не готов/);
 assert.equal(await scene.show({...c,armor:2,enemyGear:{armorId:3,weaponId:86}}),'legacy');
 await flush(scene.show(c));assert.equal(host.children[0].hidden,false);
 scene.react('a',{success:true,enemyHp:80},'attack');assert.match(host.children[1].textContent,/80 HP/);
 assert.ok(!urls.some(x=>/hands|pistols/.test(x)),'No modular limb resources');
 scene.hide();assert.equal(host.hidden,true);
 console.log('PASS: exact gear, missing assets, left/right whole-sprite reflection, common scale, equipment changes, no hand layers');
})().catch(e=>{console.error(e);process.exitCode=1;});
