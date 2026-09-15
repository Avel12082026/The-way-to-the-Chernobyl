const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness({fail=false}={}){
 const urls=[],draws=[],host={hidden:true,setAttribute(){},replaceChildren(...children){this.children=children;}};
 const ctx={clearRect(){},drawImage(){},save(){},restore(){},translate(){}};
 const document={hidden:false,head:{appendChild(){throw Error('renderer should already be present');}},getElementById(){return host;},addEventListener(){},createElement(tag){return {hidden:false,setAttribute(){},getContext(){return ctx;}};}};
 class Image{set src(url){urls.push(url);queueMicrotask(()=>{if(fail&&url.includes('/paired/'))this.onerror();else this.onload();});}}
 const window={matchMedia:()=>({matches:false}),COMBAT_ASSETS:{pistols:[],armorIds:[91,92]},CombatAssets:{getVisuals:()=>({ready:true,species:'zombie',background:'background.png',mutant:'zombie.png'})},CombatLayout:{drawCreature(){}},CombatPairedForeground:{draw(...args){draws.push(args);}},CombatEffects:{},};
 let callback;const context={window,document,Image,setTimeout,clearTimeout,performance:{now:()=>0},cancelAnimationFrame(){},requestAnimationFrame(fn){callback=fn;return 1;},console:{warn(){}}};vm.runInNewContext(fs.readFileSync(require.resolve('../images/combat/scene.js'),'utf8'),context);
 return {window,urls,draws,host,step(ms){callback(ms);}};
}
const next={weaponId:9,armor:91,enemy:{battleToken:'battle1',name:'Зомби',hp:100}};
test('Bizon armor91 loads reviewed sprite without global catalog entry and fires',async()=>{const h=harness();assert.equal(await h.window.CombatScene.show(next),true);assert(h.urls.some(x=>x.startsWith('images/combat/paired/9-91.webp')));assert.equal(h.draws.length,1);assert.equal(h.draws[0][3].shot,false);h.window.CombatScene.react('battle1',{success:true,enemyHp:90},'attack');h.step(40);assert.equal(h.draws.at(-1)[3].shot,true);assert.equal(h.draws.at(-1)[3].elapsed,40);assert.equal(h.draws.at(-1)[2].weaponId,9);});
test('unreviewed armor never borrows armor91 sprite',async()=>{const h=harness();await h.window.CombatScene.show({...next,armor:92});assert.equal(h.draws.length,0);assert(!h.urls.some(x=>x.includes('/paired/')));});
test('paired image load failure exposes retry instead of silent success',async()=>{const h=harness({fail:true});assert.equal(await h.window.CombatScene.show(next),false);assert.equal(h.host.children[2].hidden,false);assert.equal(h.draws.length,0);});
