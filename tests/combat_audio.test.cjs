'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../audio/combat-audio.js'),'utf8');
function harness(options={}){
 let now=0,nextTimer=1;
 const timers=new Map(),listeners=new Map(),windowListeners=new Map(),contexts=[],fetches=[],sources=[],gains=[],compressors=[],originalCalls=[],pulses=[],mutantAttacks=[],storageWrites=[];
 const add=(map,type,callback)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(callback);};
 const document={hidden:false,baseURI:options.documentBase??'https://game.test/app/index.html',currentScript:{src:options.scriptSrc??'https://assets.test/game/audio/combat-audio.js?v=7'},addEventListener(type,fn){add(listeners,type,fn);}};
 class FakeAudioContext{
  constructor(){this.state='suspended';this.destination={};this.resumeCalls=0;contexts.push(this);}
  createGain(){const gain={gain:{value:1},connections:[],connect(target){this.connections.push(target);},disconnect(){this.disconnected=true;}};gains.push(gain);return gain;}
  createDynamicsCompressor(){const node={threshold:{value:0},knee:{value:0},ratio:{value:1},attack:{value:0},release:{value:0},connections:[],connect(target){this.connections.push(target);}};compressors.push(node);return node;}
  createBufferSource(){const sound={playbackRate:{value:1},connections:[],connect(target){this.connections.push(target);},disconnect(){this.disconnected=true;},start(){this.startedAt=now;this.started=true;this.timer=window.setTimeout(()=>this.onended?.(),this.buffer.duration/this.playbackRate.value*1000);},stop(){this.stopped=true;window.clearTimeout(this.timer);this.onended?.();}};sources.push(sound);return sound;}
  decodeAudioData(bytes,resolve){const url=bytes.url||'',buffer={bytes,url,duration:url.includes('/mutants/')?(options.mutantDuration??.8):url.includes('/reactions/')?(options.reactionDuration??.8):(options.duration??.8)};resolve(buffer);return Promise.resolve(buffer);}
  resume(){this.resumeCalls++;if(this.state==='closed')return Promise.reject(new Error('Context closed'));this.state='running';return Promise.resolve();}
 }
 const scene={show(next){originalCalls.push(['show',next]);return options.showResult??true;},react(...args){originalCalls.push(['react',...args,now]);return 'visual';},pulse(token,side){pulses.push({token,side,at:now});return true;},mutantAttack(token){mutantAttacks.push({token,at:now});return options.mutantVisual!==false;},hide(){originalCalls.push(['hide']);}};
 const specs={1:[3,180],2:[3,100],3:[6,100],4:[2,350],5:[2,260],6:[3,260]};
 const weapons=Object.fromEntries(Object.entries(specs).map(([id,[shots,intervalMs]])=>[id,{name:'weapon-'+id,profile:Number(id)===1?'pistol':'rifle',rate:1,gain:1,burst:{shots,intervalMs}}]));
 weapons[85]={name:'nonfirearm',profile:null};
 const window={document,location:{href:options.locationHref??document.baseURI},performance:{now:()=>now},URL,console,
  COMBAT_SOUND_BANK:{version:'test-v1',base:'audio/gunshots/',profiles:{pistol:{files:['pistol.mp3'],gain:1},rifle:{files:['rifle.mp3'],gain:.8}},weapons},
  COMBAT_REACTION_BANK:options.reactions?{version:'hurt-v1',base:'audio/reactions/',reactions:{player:{files:['player-hurt-1.mp3','player-hurt-2.mp3'],gain:.85},enemy:{files:Array.from({length:8},(_,i)=>'enemy-hurt-'+(i+1)+'.mp3'),gain:.85}}}:undefined,
  COMBAT_MUTANT_SOUND_BANK:options.mutants?{version:'mutant-v1',base:'audio/mutants/',species:Object.fromEntries(['dog','bloodsucker'].map(id=>[id,Object.fromEntries(['hurt','attack'].map(action=>[action,{files:Array.from({length:3},(_,i)=>id+'-'+action+'-'+(i+1)+'.mp3'),gain:.85,impactMs:120}]))])),resolve(enemy){return enemy?.kind==='npc'?null:/Dog/i.test(enemy?.name)?'dog':/Blood/i.test(enemy?.name)?'bloodsucker':null;}}:undefined,
  CombatScene:scene,AudioContext:options.unsupported?undefined:FakeAudioContext,
  Audio(){throw Error('The soundtrack must not be accessed');},
  localStorage:{getItem(key){return key==='zone.combatSound'?(options.settings?JSON.stringify(options.settings):null):'{"enabled":true,"volume":0.25}';},setItem(key,value){storageWrites.push([key,value]);}},
  fetch(url){fetches.push(url);return options.fetch?options.fetch(url):Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Object.assign(new ArrayBuffer(8),{url}))});},
  setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},
  addEventListener(type,fn){add(windowListeners,type,fn);},dispatchEvent(event){for(const fn of windowListeners.get(event.type)||[])fn(event);},
  CustomEvent:class{constructor(type,details){this.type=type;this.detail=details.detail;}}
 };
 vm.runInNewContext(source,{window,URL,console,Math:Object.assign(Object.create(Math),{random:options.random||Math.random})});
 const tick=ms=>{const target=now+ms;for(;;){let entry;for(const candidate of timers)if(candidate[1].at<=target&&(!entry||candidate[1].at<entry[1].at))entry=candidate;if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=target;};
 const advance=async ms=>{await settle();const target=now+ms;for(;;){const times=Array.from(timers.values()).map(timer=>timer.at).filter(at=>at<=target);if(!times.length)break;tick(Math.min(...times)-now);await settle();}tick(target-now);await settle();};
 const dispatch=type=>{for(const fn of listeners.get(type)||[])fn({type});};
 const show=(extra={})=>scene.show({enemy:{battleToken:'fight',kind:'npc'},weaponId:1,enemyGear:{weaponId:2},...extra});
 return {window,document,api:window.CombatAudio,scene,show,tick,advance,dispatch,contexts,sources,gains,compressors,fetches,originalCalls,pulses,mutantAttacks,storageWrites,timers,now:()=>now};
}
async function settle(){for(let i=0;i<16;i++)await Promise.resolve();}
async function ready(h,scene={}){h.show(scene);await Promise.all([h.api.preload(scene.weaponId||1),h.api.preload(scene.enemyGear?.weaponId||2),h.api.preloadReactions()]);await h.api.unlock();}
const applied=h=>h.originalCalls.filter(call=>call[0]==='react');
const won={success:true,playerDamage:0,victoryReady:true,enemyTurn:{hit:false,damage:0}};

const mutantVoices=(h,event)=>h.sources.filter(sound=>sound.buffer.url.includes('/mutants/')&&(!event||sound.buffer.url.includes('-'+event+'-')));
async function readyMutant(h,extra={}){
 h.show({enemy:{battleToken:'fight',kind:'mutant',name:'Dog'},weaponId:1,enemyGear:{weaponId:2},...extra});
 await Promise.all([h.api.preload(extra.weaponId??1),h.api.preloadMutant('dog')]);await settle();await h.api.unlock();
}
test('mutant encounters preload only current six variants and player pain; sexes share their species profile',async()=>{
 const h=harness({mutants:true,reactions:true,showResult:false});await readyMutant(h);
 assert.equal(h.fetches.filter(url=>url.includes('/mutants/')).length,6);assert.equal(h.fetches.filter(url=>url.includes('/reactions/player-')).length,2);
 assert.equal(h.fetches.filter(url=>url.includes('/reactions/enemy-')).length,0);assert.equal(h.fetches.filter(url=>url.includes('/mutants/bloodsucker-')).length,0);
 h.show({enemy:{battleToken:'female',kind:'mutant',name:'Female Dog'},weaponId:1,enemyGear:{weaponId:0}});await settle();
 assert.equal(h.fetches.filter(url=>url.includes('/mutants/')).length,6);
 assert.equal(h.api.getState().cachedBuffers,9);
});
test('a mutant exchange has one species hurt, one attack and one player hurt, synchronized with attack impact and all tails',async()=>{
 const h=harness({mutants:true,reactions:true});await readyMutant(h);
 const result={success:true,playerDamage:7,enemyTurn:{hit:true,damage:4}},presentation=h.scene.react('fight',result,'attack');
 assert.equal(h.scene.react('fight',result,'attack'),presentation);await h.advance(1519);assert.equal(applied(h).length,0);
 assert.equal(h.sources.length,6);assert.equal(h.pulses.length,3);
 assert.equal(mutantVoices(h,'hurt')[0].startedAt,440);assert.equal(mutantVoices(h,'attack')[0].startedAt,600);assert.equal(hurts(h,'player')[0].startedAt,720);
 assert.deepEqual(h.mutantAttacks,[{token:'fight',at:600}]);assert.equal(hurts(h,'enemy').length,0);
 await h.advance(1);assert.equal((await presentation).cancelled,false);assert.equal(applied(h)[0][4].externalMutantAttack,true);assert.equal(applied(h)[0][5],1520);
 assert.equal(h.api.getState().played,3);assert.equal(h.api.getState().hurtPlayed,2);assert.equal(h.api.getState().mutantHurtPlayed,1);assert.equal(h.api.getState().mutantAttackPlayed,1);
});
test('mutant attack attempts sound on misses and absorbed hits, but not after victory or radiation-only death',async()=>{
 for(const enemyTurn of [{hit:false,damage:0},{hit:true,damage:0}]){
  const h=harness({mutants:true,reactions:true});await readyMutant(h);const presentation=h.scene.react('fight',{success:true,enemyTurn},'wait');
  await h.advance(800);await presentation;assert.equal(mutantVoices(h,'attack').length,1);assert.equal(hurts(h,'player').length,0);assert.equal(h.pulses.length,0);
 }
 for(const result of [{success:true,victoryReady:true,enemyTurn:{hit:false,damage:0}},{success:true,died:true,radiationDamage:99},{success:true,died:true,radiationDamage:99,enemyTurn:{hit:false,damage:0}}]){
  const h=harness({mutants:true,reactions:true});await readyMutant(h);await h.scene.react('fight',result,'wait');
  assert.equal(h.sources.length,0);assert.equal(h.mutantAttacks.length,0);
 }
});
test('a killing player hit keeps mutant hurt without a reply, and a fatal mutant hit completes before death',async()=>{
 const killed=harness({mutants:true,reactions:true});await readyMutant(killed);const victory=killed.scene.react('fight',{success:true,playerDamage:99,victoryReady:true,enemyTurn:{hit:false,damage:0}},'attack');
 await killed.advance(1239);assert.equal(applied(killed).length,0);await killed.advance(1);await victory;
 assert.equal(mutantVoices(killed,'hurt').length,1);assert.equal(mutantVoices(killed,'attack').length,0);assert.equal(killed.mutantAttacks.length,0);
 const dead=harness({mutants:true,reactions:true});await readyMutant(dead);const death=dead.scene.react('fight',{success:true,playerDamage:3,died:true,enemyTurn:{hit:true,damage:999}},'attack');
 await dead.advance(1519);assert.equal(applied(dead).length,0);await dead.advance(1);await death;
 assert.equal(mutantVoices(dead,'attack').length,1);assert.equal(hurts(dead,'player').length,1);assert.equal(applied(dead)[0][5],1520);
});
test('all mutant variants are selectable and consecutive hurt/attack choices never repeat',async()=>{
 for(const action of ['hurt','attack'])for(let i=0;i<3;i++){
  const h=harness({mutants:true,random:()=>i/3});await readyMutant(h,{weaponId:0});
  const result=action==='hurt'?{success:true,playerDamage:2,victoryReady:true}:{success:true,enemyTurn:{hit:false,damage:0}};
  const presentation=h.scene.react('fight',result,action==='hurt'?'attack':'wait');await h.advance(1200);await presentation;
  assert.match(mutantVoices(h,action)[0].buffer.url,new RegExp('/dog-'+action+'-'+(i+1)+'\\.mp3\\?'));
 }
 const h=harness({mutants:true,random:()=>0});await readyMutant(h,{weaponId:0});const previous={};
 for(let i=0;i<4;i++){
  const presentation=h.scene.react('fight',{success:true,playerDamage:3,enemyTurn:{hit:false,damage:0}},'attack');await h.advance(1200);await presentation;
  for(const action of ['hurt','attack']){const url=mutantVoices(h,action).at(-1).buffer.url;if(previous[action])assert.notEqual(url,previous[action]);previous[action]=url;}
 }
 assert.equal(h.pulses.length,0);assert.equal(h.api.getState().mutantHurtPlayed,4);assert.equal(h.api.getState().mutantAttackPlayed,4);
});
test('muted mutant attack retains a 360ms visual window, with no artificial delay when animation is unavailable',async()=>{
 const h=harness({mutants:true,settings:{enabled:false,volume:.65}});await readyMutant(h);const presentation=h.scene.react('fight',{success:true,enemyTurn:{hit:false,damage:0}},'wait');
 await h.advance(359);assert.equal(applied(h).length,0);assert.equal(h.sources.length,0);assert.deepEqual(h.mutantAttacks,[{token:'fight',at:0}]);
 await h.advance(1);await presentation;assert.equal(applied(h)[0][4].externalMutantAttack,true);assert.equal(applied(h)[0][5],360);
 const reduced=harness({mutants:true,mutantVisual:false,settings:{enabled:false,volume:.65}});await readyMutant(reduced);
 await reduced.scene.react('fight',{success:true,enemyTurn:{hit:false,damage:0}},'wait');assert.equal(applied(reduced)[0][5],0);assert.equal(applied(reduced)[0][4].externalMutantAttack,true);
});
test('mutant sounds require explicit identity, support flag aliases and never affect NPC fallback',async()=>{
 for(const enemy of [{battleToken:'fight',kind:'npc',name:'Dog'},{battleToken:'fight',name:'Dog'},{battleToken:'fight',kind:'mutant',name:'Unknown'}]){
  const h=harness({mutants:true});await readyMutant(h,{enemy,weaponId:0,enemyGear:{weaponId:0}});
  await h.scene.react('fight',{success:true,playerDamage:3,victoryReady:true},'attack');assert.equal(mutantVoices(h).length,0);
 }
 for(const flag of ['mutant','isMutant']){
  const h=harness({mutants:true});await readyMutant(h,{enemy:{battleToken:'fight',name:'Dog',[flag]:true},weaponId:0});
  const presentation=h.scene.react('fight',{success:true,enemyTurn:{hit:false,damage:0}},'wait');await h.advance(800);await presentation;assert.equal(mutantVoices(h,'attack').length,1);
 }
});
test('mutant attack cancellation suppresses future audio and onset hooks, including cancellation during its tail',async()=>{
 for(const cancelAt of [500,650]){
  const h=harness({mutants:true,reactions:true});await readyMutant(h);
  const presentation=h.scene.react('fight',{success:true,playerDamage:3,enemyTurn:{hit:true,damage:2}},'attack');await h.advance(cancelAt);h.scene.hide();
  assert.equal((await presentation).cancelled,true);await h.advance(2500);assert.equal(applied(h).length,0);assert.equal(h.mutantAttacks.length,cancelAt<600?0:1);assert.equal(h.api.getState().activeVoices,0);
 }
});

const hurts=(h,role)=>h.sources.filter(sound=>sound.buffer.url.includes('/reactions/'+(role?role+'-hurt-':'')));
test('all ten reaction variants preload and each role avoids repeating its previous audible file',async()=>{
 const h=harness({reactions:true,random:()=>0});await ready(h,{weaponId:85,enemyGear:{weaponId:0}});
 const urls=h.fetches.filter(url=>url.includes('/reactions/'));
 assert.equal(new Set(urls).size,10);assert.equal(urls.filter(url=>url.includes('/player-')).length,2);assert.equal(urls.filter(url=>url.includes('/enemy-')).length,8);
 const enemyFiles=[],playerFiles=[];
 for(let i=0;i<5;i++){
  const presentation=h.scene.react('fight',{success:true,playerDamage:5,enemyTurn:{hit:true,damage:2}},'attack');
  await h.advance(1120);assert.equal((await presentation).cancelled,false);
  enemyFiles.push(hurts(h,'enemy').at(-1).buffer.url);playerFiles.push(hurts(h,'player').at(-1).buffer.url);
 }
 for(let i=1;i<5;i++){assert.notEqual(enemyFiles[i],enemyFiles[i-1]);assert.notEqual(playerFiles[i],playerFiles[i-1]);}
 assert.equal(h.api.getState().hurtPlayed,10);assert.equal(h.api.getState().played,0);assert.equal(h.pulses.length,0);
 assert.match(h.api.getState().lastReactionFiles.player,/^player-hurt-[12]\.mp3$/);
 for(let i=0;i<8;i++){
  const choice=harness({reactions:true,random:()=>i/8});await ready(choice,{weaponId:85,enemyGear:{weaponId:0}});
  const presentation=choice.scene.react('fight',{success:true,playerDamage:1,victoryReady:true},'attack');await choice.advance(880);await presentation;
  assert.match(hurts(choice,'enemy')[0].buffer.url,new RegExp('/enemy-hurt-'+(i+1)+'\\.mp3\\?'));
 }
});
test('six-shot exchanges produce exactly one distinct wound per damaged actor and await both reaction tails',async()=>{
 const h=harness({reactions:true});await ready(h,{weaponId:3,enemyGear:{weaponId:3}});
 const result={success:true,playerDamage:9,died:true,enemyTurn:{hit:true,damage:999}};
 const presentation=h.scene.react('fight',result,'attack');assert.equal(presentation,h.scene.react('fight',result,'attack'));
 await h.advance(2119);assert.equal(applied(h).length,0);
 assert.equal(h.sources.length,14);assert.equal(h.pulses.length,12);assert.equal(hurts(h,'enemy').length,1);assert.equal(hurts(h,'player').length,1);
 assert.equal(hurts(h,'enemy')[0].startedAt,580);assert.equal(hurts(h,'player')[0].startedAt,1320);
 assert.notEqual(hurts(h,'enemy')[0].buffer.url,hurts(h,'player')[0].buffer.url);assert(!h.sources.some(sound=>sound.stopped));
 assert.equal(h.api.getState().played,12);assert.equal(h.api.getState().hurtPlayed,2);
 await h.advance(1);assert.equal((await presentation).cancelled,false);assert.equal(applied(h)[0][5],2120);
});
test('a fatal NPC hit reacts once and its wound tail finishes before victory presentation',async()=>{
 const h=harness({reactions:true,duration:.05});await ready(h);
 const presentation=h.scene.react('fight',{success:true,playerDamage:5,victoryReady:true,enemyTurn:{hit:false,damage:0}},'attack');
 await h.advance(1239);assert.equal(applied(h).length,0);assert.equal(h.sources.length,4);assert.equal(h.pulses.length,3);
 assert.equal(hurts(h,'enemy')[0].startedAt,440);assert.equal(hurts(h,'player').length,0);
 await h.advance(1);await presentation;assert.equal(applied(h)[0][5],1240);
});
test('strict damage and NPC identity gates exclude misses, radiation, unknown enemies and mutant human voices',async()=>{
 const h=harness({reactions:true});await ready(h,{weaponId:85,enemyGear:{weaponId:0}});
 for(const playerDamage of [0,-1,NaN,Infinity,undefined])await h.scene.react('fight',{success:true,playerDamage},'attack');
 for(const enemyTurn of [{hit:false,damage:10},{damage:10},{hit:true,damage:0},{hit:true,damage:-2},{hit:true,damage:Infinity}])await h.scene.react('fight',{success:true,enemyTurn},'wait');
 await h.scene.react('fight',{success:true,died:true,radiationDamage:20},'attack');
 await h.scene.react('fight',{success:true,playerDamage:8},'consumable');
 for(const enemy of [{battleToken:'fight',kind:'mutant'},{battleToken:'fight',kind:'npc',mutant:true},{battleToken:'fight',kind:'npc',isMutant:true},{battleToken:'fight',faction:'stalker'}]){
  h.show({enemy,weaponId:85,enemyGear:{weaponId:0}});await h.scene.react('fight',{success:true,playerDamage:5,victoryReady:true},'attack');
 }
 assert.equal(h.sources.length,0);assert.equal(h.api.getState().hurtPlayed,0);assert.equal(h.pulses.length,0);
});
test('mutant and unarmed attacks hurt the player at the conceptual attack time, including nonattack actions',async()=>{
 for(const action of ['wait','medkit','escape','consumable']){
  const h=harness({reactions:true});await ready(h,{enemy:{battleToken:'fight',kind:'mutant'}});
  const presentation=h.scene.react('fight',{success:true,enemyTurn:{hit:true,damage:4}},action);await h.advance(880);await presentation;
  assert.equal(hurts(h,'player').length,1);assert.equal(hurts(h,'player')[0].startedAt,80);assert.equal(h.pulses.length,0);
 }
 const h=harness({reactions:true});await ready(h,{enemy:{battleToken:'fight',kind:'mutant'}});
 const presentation=h.scene.react('fight',{success:true,playerDamage:5,enemyTurn:{hit:true,damage:4}},'attack');await h.advance(1480);await presentation;
 assert.equal(hurts(h,'player')[0].startedAt,680);assert.equal(hurts(h,'enemy').length,0);assert.equal(h.pulses.length,3);
 const unarmed=harness({reactions:true});await ready(unarmed,{enemyGear:{weaponId:0}});
 const reply=unarmed.scene.react('fight',{success:true,enemyTurn:{hit:true,damage:4}},'wait');await unarmed.advance(880);await reply;assert.equal(hurts(unarmed,'player')[0].startedAt,80);
});
test('reaction cancellation and mute cannot add late voices or extra muzzle flashes',async()=>{
 for(const cancelAt of [40,100]){
  const h=harness({reactions:true});await ready(h,{enemy:{battleToken:'fight',kind:'mutant'}});
  const presentation=h.scene.react('fight',{success:true,enemyTurn:{hit:true,damage:1}},'wait');await h.advance(cancelAt);h.scene.hide();assert.equal((await presentation).cancelled,true);
  await h.advance(2000);assert.equal(hurts(h).length,cancelAt<80?0:1);assert.equal(applied(h).length,0);assert.equal(h.pulses.length,0);assert.equal(h.api.getState().activeVoices,0);
 }
 const muted=harness({reactions:true,settings:{enabled:false,volume:.65}});await ready(muted);
 const presentation=muted.scene.react('fight',{success:true,playerDamage:5,victoryReady:true},'attack');await muted.advance(490);await presentation;
 assert.equal(muted.sources.length,0);assert.equal(muted.pulses.length,3);assert.equal(muted.api.getState().hurtPlayed,0);
});
test('missing or slow optional reaction assets never hold up valid gunfire or replay a wound later',async()=>{
 const delays=[];
 const h=harness({reactions:true,fetch:url=>url.includes('/reactions/')?new Promise(resolve=>delays.push([url,resolve])):Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Object.assign(new ArrayBuffer(8),{url}))})});
 h.show();await h.api.preload(1);await h.api.unlock();const presentation=h.scene.react('fight',{success:true,playerDamage:4,victoryReady:true},'attack');
 await h.advance(1160);assert.equal((await presentation).cancelled,false);assert.equal(h.sources.length,3);assert.equal(hurts(h).length,0);
 for(const [url,resolve] of delays)resolve({ok:true,arrayBuffer:()=>Promise.resolve(Object.assign(new ArrayBuffer(8),{url}))});await h.advance(2000);assert.equal(h.sources.length,3);
 const missing=harness({reactions:true,fetch:url=>Promise.resolve(url.includes('/reactions/')?{ok:false,status:404}:{ok:true,arrayBuffer:()=>Promise.resolve(Object.assign(new ArrayBuffer(8),{url}))})});
 await ready(missing);const accepted=missing.scene.react('fight',{success:true,playerDamage:4,victoryReady:true},'attack');await missing.advance(1160);assert.equal((await accepted).cancelled,false);assert.equal(missing.sources.length,3);
});

test('weapon series have exact pulse/start timing and apply damage after the final decoded tail',async()=>{
 for(const [weaponId,shots,intervalMs] of [[1,3,180],[2,3,100],[3,6,100],[4,2,350],[5,2,260],[6,3,260]]){
  const h=harness();await ready(h,{weaponId});
  const result={...won},presentation=h.scene.react('fight',result,'attack');
  assert.equal(presentation,h.scene.react('fight',result,'attack'));
  const end=(shots-1)*intervalMs+800;
  await h.advance(end-1);assert.equal(applied(h).length,0,'HP must wait for the last audio tail');
  assert.equal(h.sources.length,shots);assert.equal(h.pulses.length,shots);
  assert.deepEqual(h.sources.map(sound=>sound.startedAt),Array.from({length:shots},(_,i)=>i*intervalMs));
  assert.deepEqual(h.pulses.map(pulse=>pulse.at),h.sources.map(sound=>sound.startedAt));
  await h.advance(1);assert.equal((await presentation).cancelled,false);
  assert.equal(applied(h).length,1);assert.equal(applied(h)[0][4].externalShots,true);assert.equal(applied(h)[0][5],end);
 }
});
test('fatal NPC response fires its whole series after the last player shot before applying death',async()=>{
 const h=harness();await ready(h,{enemyGear:{weaponId:3}});
 const presentation=h.scene.react('fight',{success:true,playerDamage:0,died:true,enemyTurn:{hit:true,damage:999}},'attack');
 await h.advance(1899);assert.equal(applied(h).length,0);assert.equal(h.sources.length,9);
 assert.deepEqual(h.pulses.map(pulse=>[pulse.side,pulse.at]),[['player',0],['player',180],['player',360],['enemy',600],['enemy',700],['enemy',800],['enemy',900],['enemy',1000],['enemy',1100]]);
 assert.deepEqual(h.sources.map(sound=>sound.startedAt),h.pulses.map(pulse=>pulse.at));
 await h.advance(1);assert.equal((await presentation).cancelled,false);assert.equal(applied(h).length,1);
});
test('six player plus six NPC shots retain all twelve decoded tails without forced stops',async()=>{
 const h=harness({duration:1.7});await ready(h,{weaponId:3,enemyGear:{weaponId:3}});
 const presentation=h.scene.react('fight',{success:true,playerDamage:5,enemyTurn:{hit:true,damage:3}},'attack');
 await h.advance(1240);assert.equal(h.sources.length,12);assert.equal(h.api.getState().activeVoices,12);assert(!h.sources.some(sound=>sound.stopped));
 await h.advance(1699);assert.equal(applied(h).length,0);await h.advance(1);await presentation;
 assert.equal(applied(h)[0][5],2940);assert(!h.sources.some(sound=>sound.stopped));
});
test('nonattack NPC misses shoot; mutants, nonfirearms and radiation-only deaths do not',async()=>{
 for(const action of ['medkit','wait','escape','consumable']){
  const h=harness();await ready(h);const presentation=h.scene.react('fight',{success:true,enemyTurn:{hit:false,damage:0}},action);
  await h.advance(1000);await presentation;assert.deepEqual(h.pulses.map(pulse=>pulse.at),[0,100,200]);assert(h.pulses.every(pulse=>pulse.side==='enemy'));
 }
 const h=harness();await ready(h,{enemy:{battleToken:'fight',kind:'mutant'}});
 await h.scene.react('fight',{success:true,enemyTurn:{hit:true,damage:12}},'wait');assert.equal(h.pulses.length,0);
 h.show({weaponId:85,enemyGear:{weaponId:0}});await h.scene.react('fight',{...won},'attack');assert.equal(h.pulses.length,0);
 h.show();await h.scene.react('fight',{success:true,died:true,radiationDamage:7},'attack');
 await h.scene.react('fight',{success:true,died:true,radiationDamage:7,enemyTurn:{hit:false,damage:0}},'consumable');assert.equal(h.pulses.length,0);
});
test('hide, new battle, visibility and stop settle promptly and cancel future pulses and result application',async()=>{
 for(const cancel of [h=>h.scene.hide(),h=>h.show({enemy:{battleToken:'new'}}),h=>{h.document.hidden=true;h.dispatch('visibilitychange');},h=>h.api.stop()]){
  const h=harness();await ready(h);const presentation=h.scene.react('fight',{success:true,playerDamage:3,enemyTurn:{hit:true,damage:4}},'attack');
  await h.advance(50);assert.equal(h.pulses.length,1);cancel(h);assert.equal((await presentation).cancelled,true);
  await h.advance(5500);assert.equal(h.pulses.length,1);assert.equal(applied(h).length,0);assert.equal(h.api.getState().activePresentations,0);assert.equal(h.api.getState().pendingShots,0);
 }
});
test('muting stops audio only while preserving the visual series and final flash',async()=>{
 const h=harness();await ready(h);const presentation=h.scene.react('fight',{success:true,playerDamage:3,enemyTurn:{hit:false,damage:0}},'attack');
 await h.advance(50);h.api.setEnabled(false);assert.equal(h.api.getState().activeVoices,0);assert.equal(h.api.getState().activePresentations,1);
 await h.advance(879);assert.equal(h.pulses.length,6);assert.equal(h.sources.length,1);assert.equal(applied(h).length,0);
 await h.advance(1);assert.equal((await presentation).cancelled,false);assert.equal(applied(h).length,1);
 assert(h.storageWrites.every(([key])=>key==='zone.combatSound'));
});
test('unsupported, suspended and muted audio still presents every visual pulse',async()=>{
 for(const options of [{unsupported:true},{settings:{enabled:false,volume:.22}},{suspended:true}]){
  const h=harness(options);h.show();await h.api.preload(1);if(!options.suspended)await h.api.unlock();
  const presentation=h.scene.react('fight',{...won},'attack');await h.advance(489);
  assert.equal(h.sources.length,0);assert.equal(h.pulses.length,3);assert.equal(applied(h).length,0);
  await h.advance(1);assert.equal((await presentation).cancelled,false);
 }
});
test('cold audio defers the series coherently and never replays a fetch completed after hide',async()=>{
 let release;const response=new Promise(resolve=>{release=resolve;});
 const h=harness({fetch:()=>response});h.show();await h.api.unlock();const presentation=h.scene.react('fight',{...won},'attack');
 await h.advance(200);assert.equal(h.pulses.length,0);release({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))});await settle();
 assert.equal(h.pulses[0].at,200);assert.equal(h.sources[0].startedAt,200);
 await h.advance(1160);assert.equal((await presentation).cancelled,false);
 const releases=[];const blocked=harness({fetch:()=>new Promise(resolve=>{releases.push(resolve);})});blocked.show();await blocked.api.unlock();
 const cancelled=blocked.scene.react('fight',{...won},'attack');await settle();blocked.scene.hide();assert.equal((await cancelled).cancelled,true);
 for(const done of releases)done({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))});await blocked.advance(6000);assert.equal(blocked.pulses.length,0);assert.equal(blocked.sources.length,0);
});
test('stale, rejected and hidden results do not replay; same scene metadata preserves ongoing series',async()=>{
 const h=harness({showResult:false});await ready(h);h.window.matchMedia=()=>({matches:true});
 assert.equal((await h.scene.react('old',{...won},'attack')).cancelled,true);
 assert.equal((await h.scene.react('fight',{success:false,playerDamage:1},'attack')).cancelled,true);
 h.document.hidden=true;const hidden={...won},skipped=h.scene.react('fight',hidden,'attack');h.document.hidden=false;
 assert.equal(h.scene.react('fight',hidden,'attack'),skipped);assert.equal((await skipped).cancelled,true);
 const presentation=h.scene.react('fight',{...won},'attack');await h.advance(50);h.show();await h.advance(1110);await presentation;
 assert.equal(h.sources.length,3);assert.equal(applied(h).length,1);assert.equal(h.api.attach(h.scene),false);
});
test('play is one impulse and trusted unlock, limiter and settings remain independent from music',async()=>{
 const h=harness();h.show();await h.api.preload(1);assert.equal(await h.api.play(1),false);
 h.dispatch('pointerdown');await settle();assert.equal(h.contexts[0].resumeCalls,1);
 assert.equal(await h.api.play(1),true);assert.equal(h.sources.length,1);assert.equal(h.pulses.length,0);
 assert.equal(h.gains[0].connections[0],h.compressors[0]);assert.equal(h.compressors[0].connections[0],h.contexts[0].destination);
 assert.equal(h.compressors[0].threshold.value,-3);assert.equal(h.compressors[0].ratio.value,20);
 assert.equal(h.fetches[0],'https://assets.test/game/audio/gunshots/pistol.mp3?v=test-v1');
 h.api.setVolume(.4);h.api.setEnabled(false);assert(h.storageWrites.every(([key])=>key==='zone.combatSound'));
 h.contexts[0].state='interrupted';h.dispatch('keydown');await settle();assert.equal(h.contexts[0].state,'running');
 h.contexts[0].state='closed';assert.equal(await h.api.unlock(),false);assert.equal(h.api.getState().lastError,'Context closed');
});
test('decoded playback rate extends tail wait, with a five-second safety bound',async()=>{
 const h=harness();h.window.COMBAT_SOUND_BANK.weapons[1].rate=.5;await ready(h);
 const presentation=h.scene.react('fight',{...won},'attack');await h.advance(1959);assert.equal(applied(h).length,0);
 await h.advance(1);await presentation;assert.equal(applied(h)[0][5],1960);
 const long=harness({duration:10});await ready(long);const bounded=long.scene.react('fight',{...won},'attack');
 await long.advance(4999);assert.equal(applied(long).length,0);await long.advance(1);assert.equal((await bounded).cancelled,false);
 assert.equal(applied(long).length,1);assert.equal(long.api.getState().activeVoices,0);
});
test('voice overlap and buffer caches are bounded, including independent delayed shot cancellation',async()=>{
 const h=harness();await ready(h);for(let i=0;i<20;i++)await h.api.play(1);
 assert.equal(h.api.getState().activeVoices,16);assert.equal(h.sources.filter(sound=>sound.stopped).length,4);
 for(let id=7;id<39;id++){h.window.COMBAT_SOUND_BANK.profiles['p'+id]={files:[id+'.mp3']};h.window.COMBAT_SOUND_BANK.weapons[id]={profile:'p'+id};await h.api.preload(id);}
 assert.equal(h.api.getState().cachedBuffers,24);
 const delayed=h.api.play(2,{delayMs:200});h.api.setVolume(0);h.api.setVolume(.5);await h.advance(200);assert.equal(await delayed,false);
});
test('inline about:blank bootstrap and failed fetches leave combat presentation functional',async()=>{
 const h=harness({documentBase:'about:blank',scriptSrc:''});await ready(h);assert.equal(h.fetches[0],'http://localhost/audio/gunshots/pistol.mp3?v=test-v1');
 const hosted=harness({documentBase:'about:blank',scriptSrc:'',locationHref:'https://game.test/app/index.html'});await hosted.api.preload(1);assert.equal(hosted.fetches[0],'https://game.test/app/audio/gunshots/pistol.mp3?v=test-v1');
 const missing=harness({fetch:()=>Promise.resolve({ok:false,status:404})});await ready(missing);const presentation=missing.scene.react('fight',{...won},'attack');
 await missing.advance(900);assert.equal((await presentation).cancelled,false);assert.equal(missing.pulses.length,3);assert.equal(missing.sources.length,0);assert(missing.api.getState().errors>0);
});
