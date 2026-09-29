'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../audio/combat-audio.js'),'utf8');

function harness(options={}){
 let now=0,nextTimer=1;
 const timers=new Map(),listeners=new Map(),windowListeners=new Map(),contexts=[],fetches=[],sources=[],gains=[],compressors=[],originalCalls=[],storageWrites=[];
 const add=(map,type,callback)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(callback);};
 const document={hidden:false,baseURI:'https://game.test/app/index.html',currentScript:{src:'https://assets.test/game/audio/combat-audio.js?v=7'},addEventListener(type,fn){add(listeners,type,fn);}};
 class FakeAudioContext{
  constructor(){this.state='suspended';this.destination={};this.resumeCalls=0;contexts.push(this);}
  createGain(){const gain={gain:{value:1},connections:[],connect(target){this.connections.push(target);},disconnect(){this.disconnected=true;}};gains.push(gain);return gain;}
  createDynamicsCompressor(){const compressor={threshold:{value:0},knee:{value:0},ratio:{value:1},attack:{value:0},release:{value:0},connections:[],connect(target){this.connections.push(target);}};compressors.push(compressor);return compressor;}
  createBufferSource(){const sound={playbackRate:{value:1},connections:[],connect(target){this.connections.push(target);},disconnect(){this.disconnected=true;},start(){this.startedAt=now;this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(sound);return sound;}
  decodeAudioData(bytes,resolve){const buffer={bytes,duration:.8};resolve(buffer);return Promise.resolve(buffer);}
  resume(){this.resumeCalls++;if(this.state==='closed')return Promise.reject(new Error('Context closed'));this.state='running';return Promise.resolve();}
 }
 const scene={show(next){originalCalls.push(['show',next]);return options.showResult??true;},react(...args){originalCalls.push(['react',...args]);return 'visual';},hide(){originalCalls.push(['hide']);}};
 const window={document,location:{href:document.baseURI},performance:{now:()=>now},URL,console,
  COMBAT_SOUND_BANK:{version:'test-v1',base:'audio/gunshots/',profiles:{pistol:{files:['pistol.mp3'],gain:1},rifle:{files:['rifle.mp3'],gain:.8}},weapons:{1:{name:'pistol',profile:'pistol',rate:1,gain:1},2:{name:'rifle',profile:'rifle',rate:1.1,gain:.9},85:{name:'nonfirearm',profile:null}}},
  CombatScene:scene,AudioContext:options.unsupported?undefined:FakeAudioContext,
  Audio(){throw Error('The soundtrack must not be accessed');},
  localStorage:{getItem(key){return key==='zone.combatSound'?(options.settings?JSON.stringify(options.settings):null):'{"enabled":true,"volume":0.25}';},setItem(key,value){storageWrites.push([key,value]);}},
  fetch(url){fetches.push(url);return options.fetch?options.fetch(url):Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))});},
  setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},
  addEventListener(type,fn){add(windowListeners,type,fn);},dispatchEvent(event){for(const fn of windowListeners.get(event.type)||[])fn(event);},
  CustomEvent:class{constructor(type,details){this.type=type;this.detail=details.detail;}}
 };
 vm.runInNewContext(source,{window,URL,console});
 const tick=ms=>{const target=now+ms;for(;;){let entry;for(const current of timers)if(current[1].at<=target&&(!entry||current[1].at<entry[1].at))entry=current;if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=target;};
 const dispatch=type=>{for(const fn of listeners.get(type)||[])fn({type});};
 const show=(extra={})=>scene.show({enemy:{battleToken:'fight',kind:'npc'},weaponId:1,enemyGear:{weaponId:2},...extra});
 return {window,document,api:window.CombatAudio,scene,show,tick,dispatch,contexts,sources,gains,compressors,fetches,originalCalls,storageWrites,timers};
}
async function settle(){for(let i=0;i<8;i++)await Promise.resolve();}
async function ready(h){h.show();await Promise.all([h.api.preload(1),h.api.preload(2)]);await h.api.unlock();}

test('gesture unlocks effects before an asynchronous combat response; music stays untouched',async()=>{
 const h=harness();h.show();await h.api.preload(1);
 assert.equal(await h.api.play(1),false);
 h.dispatch('pointerdown');await settle();
 assert.equal(h.contexts[0].resumeCalls,1);
 h.scene.react('fight',{success:true,playerDamage:0,enemyTurn:{hit:false,damage:0}},'attack');
 assert.equal(h.sources.length,1);
 h.tick(239);assert.equal(h.sources.length,1);h.tick(1);assert.equal(h.sources.length,2);
 assert.equal(h.sources[1].startedAt,240);
 assert.equal(h.gains[0].gain.value,.65);
 assert.equal(h.gains[0].connections[0],h.compressors[0]);
 assert.equal(h.compressors[0].connections[0],h.contexts[0].destination);
 assert.equal(h.compressors[0].threshold.value,-3);assert.equal(h.compressors[0].ratio.value,20);
 assert.equal(h.fetches[0],'https://assets.test/game/audio/gunshots/pistol.mp3?v=test-v1');
 h.api.setVolume(.4);h.api.setEnabled(false);
 assert(h.storageWrites.every(([key])=>key==='zone.combatSound'));
 assert.equal(h.api.getState().activeVoices,0);
});

test('later gestures recover an interrupted context and gracefully handle a closed context',async()=>{
 const h=harness();await ready(h);
 h.contexts[0].state='interrupted';h.dispatch('keydown');await settle();
 assert.equal(h.contexts[0].state,'running');assert.equal(h.contexts[0].resumeCalls,2);
 assert.equal(await h.api.play(1),true);
 h.contexts[0].state='closed';assert.equal(await h.api.unlock(),false);
 assert.equal(h.api.getState().lastError,'Context closed');
});

test('single result plays once; stale, rejected and radiation-only death results do not shoot',async()=>{
 const h=harness();await ready(h);
 const hit={success:true,playerDamage:5,victoryReady:true,enemyTurn:{hit:false,damage:0}};
 h.scene.react('fight',hit,'attack');h.scene.react('fight',hit,'attack');
 h.scene.react('old',{success:true,playerDamage:5},'attack');
 h.scene.react('fight',{success:false,playerDamage:5},'attack');
 h.scene.react('fight',{success:true,died:true,radiationDamage:7},'attack');
 h.scene.react('fight',{success:true,died:true,radiationDamage:7,enemyTurn:{hit:false,damage:0}},'consumable');
 h.tick(300);assert.equal(h.sources.length,1);
 assert.equal(h.originalCalls.filter(call=>call[0]==='react').length,6);
});

test('NPC misses fire after all nonattack combat actions, mutants and nonfirearms do not',async()=>{
 const h=harness();await ready(h);
 for(const action of ['medkit','wait','escape','consumable'])h.scene.react('fight',{success:true,enemyTurn:{hit:false,damage:0}},action);
 assert.equal(h.sources.length,4);assert(h.sources.every(sound=>sound.startedAt===0));
 h.show({enemy:{battleToken:'mutant',kind:'mutant'}});
 h.scene.react('mutant',{success:true,enemyTurn:{hit:true,damage:12}},'wait');
 assert.equal(h.sources.length,4);
 h.show({weaponId:85,enemyGear:{weaponId:0}});
 h.scene.react('fight',{success:true,playerDamage:5},'attack');assert.equal(h.sources.length,4);
});

test('hide cancels delayed NPC shots, preserves already playing tails, and allows a lethal reply',async()=>{
 const h=harness();await ready(h);
 h.scene.react('fight',{success:true,playerDamage:5,enemyTurn:{hit:true,damage:3}},'attack');
 assert.equal(h.api.getState().pendingShots,1);h.scene.hide();h.tick(300);
 assert.equal(h.sources.length,1);assert(!h.sources[0].stopped);
 h.show();h.scene.react('fight',{success:true,playerDamage:5,died:true,enemyTurn:{hit:true,damage:99}},'attack');
 h.scene.hide();assert.equal(h.sources.length,3);assert(!h.sources[2].stopped);
});

test('preloads and plays without artwork; repeated show does not cancel current reply',async()=>{
 const h=harness({showResult:false});await ready(h);
 h.window.matchMedia=()=>({matches:true});
 assert.equal(h.show(),false);
 h.scene.react('fight',{success:true,playerDamage:3,enemyTurn:{hit:true,damage:1}},'attack');
 h.show();h.tick(240);assert.equal(h.sources.length,2);
 assert.equal(h.api.attach(h.scene),false);
});

test('pending fetch cannot produce a late shot after hide or a battle change',async()=>{
 let release;const response=new Promise(resolve=>{release=resolve;});
 const h=harness({fetch:()=>response});h.show();await h.api.unlock();
 h.scene.react('fight',{success:true,playerDamage:4},'attack');h.scene.hide();
 release({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))});await settle();
 assert.equal(h.sources.length,0);
 h.show();await h.api.preload(1);
 h.scene.react('fight',{success:true,playerDamage:4,enemyTurn:{hit:true,damage:1}},'attack');
 h.show({enemy:{battleToken:'different'}});h.tick(300);assert.equal(h.sources.length,1);
});

test('hidden pages stop effects and never replay a hidden turn on return',async()=>{
 const h=harness();await ready(h);
 h.scene.react('fight',{success:true,playerDamage:5,enemyTurn:{hit:true,damage:3}},'attack');
 h.document.hidden=true;h.dispatch('visibilitychange');h.tick(300);
 assert.equal(h.api.getState().activeVoices,0);assert.equal(h.api.getState().pendingShots,0);
 const hiddenResult={success:true,playerDamage:5};h.scene.react('fight',hiddenResult,'attack');
 h.document.hidden=false;h.dispatch('visibilitychange');h.scene.react('fight',hiddenResult,'attack');assert.equal(h.sources.length,1);
});

test('overlap and cache have hard bounds; muted settings persist independently',async()=>{
 const h=harness();await ready(h);
 for(let i=0;i<15;i++)await h.api.play(1);
 assert.equal(h.api.getState().activeVoices,10);
 assert.equal(h.sources.filter(sound=>sound.stopped).length,5);
 for(let id=3;id<35;id++){
  h.window.COMBAT_SOUND_BANK.profiles['p'+id]={files:[id+'.mp3']};
  h.window.COMBAT_SOUND_BANK.weapons[id]={profile:'p'+id};
  await h.api.preload(id);
 }
 assert.equal(h.api.getState().cachedBuffers,24);
 h.api.setVolume(0);assert.equal(await h.api.play(1),false);
 assert.equal(h.api.getState().activeVoices,0);
 const muted=harness({settings:{enabled:false,volume:.22}});await ready(muted);
 assert.equal(await muted.api.play(1),false);assert.equal(muted.api.getSettings().volume,.22);
});

test('unsupported browsers and missing files leave visual combat functional',async()=>{
 const h=harness({unsupported:true});h.show();assert.equal(await h.api.unlock(),false);
 assert.equal(h.scene.react('fight',{success:true,playerDamage:5},'attack'),'visual');
 assert.equal(h.api.getState().supported,false);
 const missing=harness({fetch:()=>Promise.resolve({ok:false,status:404})});missing.show();await missing.api.preload(1);
 await missing.api.unlock();assert.equal(await missing.api.play(1),false);assert(missing.api.getState().errors>0);
});
