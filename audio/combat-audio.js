(function(root){
'use strict';
// A separate effects bus: the soundtrack owns its own Audio element and settings.
const doc=root.document,STORE='zone.combatSound',MAX_BUFFERS=24,MAX_VOICES=16,MAX_LATE_MS=400,MAX_PRESENTATION_MS=5000,FLASH_MS=130;
// Inline previews can use about:blank, which cannot resolve relative URLs.
// A real script URL remains authoritative for production assets/CDN paths.
const siteRoot=(()=>{
 for(const [source,relative] of [[doc?.currentScript?.src,'../'],[doc?.baseURI,'./'],[root.location?.href,'./']]){
  if(!source)continue;
  try{return new URL(relative,source);}catch(_){}
 }
 return new URL('http://localhost/');
})();
let settings={enabled:true,volume:.65};
try{const saved=JSON.parse(root.localStorage?.getItem(STORE)||'null');if(saved){settings.enabled=saved.enabled!==false;const volume=Number(saved.volume);if(Number.isFinite(volume))settings.volume=Math.max(0,Math.min(1,volume));}}catch(_){}
let context=null,bus=null,limiter=null,active=null,epoch=0,audioEpoch=0,unsupported=false;
const buffers=new Map(),voices=new Set(),pending=new Map(),seen=new WeakMap(),attached=new WeakSet(),presentations=new Set(),lastReactionFiles=new Map();
const stats={played:0,hurtPlayed:0,lastReaction:'',dropped:0,errors:0,lastError:'',lastWeaponId:0,completedPresentations:0,cancelledPresentations:0};
const clock=()=>root.performance?.now?.()??Date.now();
const levelOrOne=value=>value==null||!Number.isFinite(Number(value))?1:Number(value);
function bank(){return root.COMBAT_SOUND_BANK;}
function describe(weaponId){
 const catalog=bank(),weapon=catalog?.weapons?.[Number(weaponId)],profile=catalog?.profiles?.[weapon?.profile];
 if(!weapon||!profile||!Array.isArray(profile.files)||!profile.files.length)return null;
 return {catalog,weapon,profile,weaponId:Number(weaponId)};
}
function describeReaction(side){
 const catalog=root.COMBAT_REACTION_BANK,profile=catalog?.reactions?.[side];
 if(!profile||!Array.isArray(profile.files)||!profile.files.length)return null;
 return {catalog,profile,reaction:side};
}
function sourceUrl(description,file){
 const url=new URL(file,new URL(description.catalog.base||(description.reaction?'audio/reactions/':'audio/gunshots/'),siteRoot));
 if(description.catalog.version)url.searchParams.set('v',description.catalog.version);
 return url.href;
}
function recordError(error){stats.errors++;stats.lastError=String(error?.message||error||'Audio unavailable');}
function ensureContext(){
 if(context||unsupported)return context;
 const AudioContext=root.AudioContext||root.webkitAudioContext;
 if(!AudioContext){unsupported=true;return null;}
 try{
  context=new AudioContext();bus=context.createGain();bus.gain.value=settings.enabled?settings.volume:0;
  if(typeof context.createDynamicsCompressor==='function'){
   limiter=context.createDynamicsCompressor();
   limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;
   limiter.attack.value=.001;limiter.release.value=.12;
   bus.connect(limiter);limiter.connect(context.destination);
  }else bus.connect(context.destination);
  return context;
 }catch(error){unsupported=true;recordError(error);return null;}
}
function loadBuffer(url){
 if(buffers.has(url)){const entry=buffers.get(url);buffers.delete(url);buffers.set(url,entry);return entry;}
 const audioContext=ensureContext();if(!audioContext)return {buffer:null,promise:Promise.resolve(null)};
 const entry={buffer:null,promise:null};
 entry.promise=Promise.resolve().then(()=>root.fetch(url)).then(response=>{
  if(!response.ok)throw new Error('Combat sound HTTP '+response.status);
  return response.arrayBuffer();
 }).then(bytes=>new Promise((resolve,reject)=>{
  // Both promise and callback decodeAudioData are supported by mobile WebViews.
  const result=audioContext.decodeAudioData(bytes,resolve,reject);
  if(result?.then)result.then(resolve,reject);
 })).then(buffer=>{entry.buffer=buffer;return buffer;}).catch(error=>{
  if(buffers.get(url)===entry)buffers.delete(url);recordError(error);return null;
 });
 buffers.set(url,entry);
 while(buffers.size>MAX_BUFFERS)buffers.delete(buffers.keys().next().value);
 return entry;
}
function preloadDescription(description){
 if(!description||!ensureContext())return Promise.resolve(false);
 const files=description.reaction?description.profile.files:description.profile.files.slice(0,4);
 return Promise.all(files.map(file=>loadBuffer(sourceUrl(description,file)).promise)).then(loaded=>loaded.some(Boolean));
}
function preload(weaponId){return preloadDescription(describe(weaponId));}
function preloadReactions(){return Promise.all(['player','enemy'].map(side=>preloadDescription(describeReaction(side)))).then(loaded=>loaded.some(Boolean));}
function schedule(callback,delay,presentation,onCancel=()=>{}){
 const timer=root.setTimeout(()=>{pending.delete(timer);presentation?.timers.delete(timer);callback();},Math.max(0,delay));
 pending.set(timer,()=>{root.clearTimeout(timer);pending.delete(timer);presentation?.timers.delete(timer);onCancel();});
 presentation?.timers.add(timer);return timer;
}
function wait(delay,presentation){return new Promise(resolve=>schedule(()=>resolve(true),delay,presentation,()=>resolve(false)));}
function cancelPending(){epoch++;for(const presentation of Array.from(presentations))finishPresentation(presentation,true);for(const cancel of Array.from(pending.values()))cancel();}
function removeVoice(voice){
 if(voice.ended)return;voice.ended=true;
 voices.delete(voice);
 try{voice.source.disconnect();voice.gain.disconnect();}catch(_){}
 voice.resolveEnd();
}
function stopVoice(voice){if(voice.ended)return;try{voice.source.stop();}catch(_){}removeVoice(voice);}
function silence(){audioEpoch++;for(const voice of Array.from(voices))stopVoice(voice);}
function stop(){cancelPending();silence();}
function persist(){
 try{root.localStorage?.setItem(STORE,JSON.stringify(settings));}catch(_){}
 if(bus)bus.gain.value=settings.enabled?settings.volume:0;
 if(root.CustomEvent)root.dispatchEvent?.(new root.CustomEvent('combat-audio-settings',{detail:getSettings()}));
}
function getSettings(){return {...settings};}
function setEnabled(enabled){settings.enabled=!!enabled;if(!settings.enabled)silence();persist();return getSettings();}
function setVolume(volume){const next=Number(volume);if(Number.isFinite(next)){settings.volume=Math.max(0,Math.min(1,next));if(!settings.volume)silence();persist();}return getSettings();}
function unlock(){
 const audioContext=ensureContext();if(!audioContext)return Promise.resolve(false);
 try{return Promise.resolve(audioContext.state!=='running'?audioContext.resume():undefined).then(()=>audioContext.state==='running').catch(error=>{recordError(error);return false;});}catch(error){recordError(error);return Promise.resolve(false);}
}
function startVoice(description,buffer,options,requestEpoch,requestedAt){
 if(!buffer||requestEpoch!==epoch||doc?.hidden||!settings.enabled||settings.volume<=0||context?.state!=='running'||clock()-requestedAt>MAX_LATE_MS){stats.dropped++;return false;}
 try{
  while(voices.size>=MAX_VOICES)stopVoice(voices.values().next().value);
  const source=context.createBufferSource(),gain=context.createGain();
  source.buffer=buffer;
  const rate=Number(description.weapon?.rate)||1;
  source.playbackRate.value=Math.max(.5,Math.min(2,rate));
  const level=levelOrOne(description.profile.gain)*levelOrOne(description.weapon?.gain)*levelOrOne(options.gain);
  gain.gain.value=Math.max(0,Math.min(2,level));
  source.connect(gain);gain.connect(bus);
  let resolveEnd;const finished=new Promise(resolve=>{resolveEnd=resolve;});
  const voice={source,gain,finished,resolveEnd,ended:false,durationMs:buffer.duration/source.playbackRate.value*1000};
  voices.add(voice);source.onended=()=>removeVoice(voice);
  try{source.start();}catch(error){removeVoice(voice);throw error;}
  if(description.reaction){stats.hurtPlayed++;stats.lastReaction=description.reaction;}
  else{stats.played++;stats.lastWeaponId=description.weaponId;}
  return voice;
 }catch(error){recordError(error);return false;}
}
function play(weaponId,options={}){
 const description=describe(weaponId),requestEpoch=epoch,requestAudioEpoch=audioEpoch;
 if(!description||doc?.hidden||!settings.enabled||settings.volume<=0||!ensureContext()||context.state!=='running'){stats.dropped++;return Promise.resolve(false);}
 function fire(){
  if(requestEpoch!==epoch||requestAudioEpoch!==audioEpoch||doc?.hidden){stats.dropped++;return Promise.resolve(false);}
  const file=description.profile.files[Math.floor(Math.random()*description.profile.files.length)],entry=loadBuffer(sourceUrl(description,file)),requestedAt=clock();
  if(entry.buffer)return Promise.resolve(!!startVoice(description,entry.buffer,options,requestEpoch,requestedAt));
  return entry.promise.then(buffer=>requestAudioEpoch===audioEpoch&&!!startVoice(description,buffer,options,requestEpoch,requestedAt));
 }
 const delay=Math.max(0,Math.min(1000,Number(options.delayMs)||0));
 if(!delay)return fire();
 return new Promise(resolve=>{
  schedule(()=>fire().then(resolve),delay,null,()=>resolve(false));
 });
}
function rememberScene(next){
 const token=next?.enemy?.battleToken||null;
 if(token!==active?.token)cancelPending();
 const enemy=next?.enemy,mutant=enemy?.kind==='mutant'||enemy?.mutant===true||enemy?.isMutant===true,enemyWeaponId=mutant?0:Number(next?.enemyGear?.weaponId)||0;
 active=token?{token,weaponId:Number(next.weaponId)||0,enemyWeaponId,enemyIsNpc:!mutant&&enemy?.kind==='npc'}:null;
 if(active){preload(active.weaponId);preload(active.enemyWeaponId);preloadReactions();}
}
function current(presentation){return !presentation.settled&&presentation.epoch===epoch&&active?.token===presentation.token&&!doc?.hidden;}
function finishPresentation(presentation,cancelled){
 if(presentation.settled)return;
 cancelled=!!cancelled||!current(presentation);presentation.settled=true;
 for(const timer of Array.from(presentation.timers))pending.get(timer)?.();
 presentations.delete(presentation);
 if(cancelled){for(const voice of presentation.voices)stopVoice(voice);stats.cancelledPresentations++;}
 else{
  stats.completedPresentations++;
  try{presentation.originalReact.call(presentation.scene,presentation.token,presentation.result,presentation.action,{externalShots:true});}catch(error){recordError(error);}
 }
 presentation.resolve({cancelled});
}
function burst(weaponId){
 const description=describe(weaponId);if(!description)return null;
 const sequence=description.weapon.burst||{};
 return {description,shots:Math.max(1,Math.min(8,Math.floor(Number(sequence.shots)||1))),intervalMs:Math.max(60,Math.min(1000,Number(sequence.intervalMs)||180))};
}
function readyChoices(description){return description.profile.files.map(file=>({file,buffer:buffers.get(sourceUrl(description,file))?.buffer})).filter(choice=>choice.buffer);}
function readyBuffers(description){return readyChoices(description).map(choice=>choice.buffer);}
function prepare(presentation,series){
 if(!settings.enabled||settings.volume<=0||context?.state!=='running')return Promise.resolve();
 const loads=series.filter(Boolean).filter(item=>!readyBuffers(item.description).length).map(item=>preload(item.description.weaponId));
 if(!loads.length)return Promise.resolve();
 return new Promise(resolve=>{
  const timer=schedule(resolve,MAX_LATE_MS,presentation,resolve);
  Promise.all(loads).then(()=>{pending.get(timer)?.();resolve();});
 });
}
function sound(presentation,description,gain=1){
 if(!current(presentation))return;
 let choices=readyChoices(description);
 if(description.reaction&&description.profile.files.length>1)choices=choices.filter(choice=>choice.file!==lastReactionFiles.get(description.reaction));
 const choice=choices[Math.floor(Math.random()*choices.length)];
 const voice=startVoice(description,choice?.buffer,{gain},presentation.epoch,clock());
 if(voice){
  presentation.voices.add(voice);presentation.ends.push(voice.finished);
  if(description.reaction)lastReactionFiles.set(description.reaction,choice.file);
 }
}
function pulse(presentation,series,side){
 if(!current(presentation))return;
 sound(presentation,series.description,side==='enemy'?.78:1);
 // This is the single timing source for a muzzle flash and its audible impulse.
 try{presentation.scene.pulse?.(presentation.token,side);}catch(error){recordError(error);}
 presentation.flashUntil=clock()+FLASH_MS;
}
async function runPresentation(presentation,playerSeries,enemySeries,reactions){
 await prepare(presentation,[playerSeries,enemySeries]);
 if(!current(presentation))return;
 const events=[];
 if(playerSeries)for(let i=0;i<playerSeries.shots;i++)events.push({at:i*playerSeries.intervalMs,series:playerSeries,side:'player'});
 const playerLast=playerSeries?(playerSeries.shots-1)*playerSeries.intervalMs:0;
 const enemyDelay=playerSeries?playerLast+240:0;
 if(enemySeries)for(let i=0;i<enemySeries.shots;i++)events.push({at:enemyDelay+i*enemySeries.intervalMs,series:enemySeries,side:'enemy'});
 // Wounds are once per accepted hit, never once per muzzle flash in a burst.
 if(reactions.enemy)events.push({at:playerLast+80,reaction:reactions.enemy});
 const enemyLast=enemySeries?enemyDelay+(enemySeries.shots-1)*enemySeries.intervalMs:(presentation.action==='attack'?playerLast+240:0);
 if(reactions.player)events.push({at:enemyLast+80,reaction:reactions.player});
 if(!events.length){finishPresentation(presentation,false);return;}
 let remaining=events.length;
 function fire(event){
  if(!current(presentation))return;
  if(event.reaction)sound(presentation,event.reaction);else pulse(presentation,event.series,event.side);
  if(--remaining===0)Promise.all(presentation.ends).then(async()=>{
   if(!current(presentation))return;
   const delay=Math.max(0,presentation.flashUntil-clock());
   if(delay&&!await wait(delay,presentation))return;
   finishPresentation(presentation,false);
  });
 }
 for(const event of events){if(event.at===0)fire(event);else schedule(()=>fire(event),event.at,presentation);}
}
function present(scene,originalReact,token,result,action){
 if(result&&typeof result==='object'&&seen.has(result))return seen.get(result);
 if(!active||token!==active.token||!result?.success||typeof result!=='object'||doc?.hidden){
  const skipped=Promise.resolve({cancelled:true});if(result&&typeof result==='object')seen.set(result,skipped);return skipped;
 }
 let resolve;const promise=new Promise(done=>{resolve=done;});seen.set(result,promise);
 const presentation={scene,originalReact,token,result,action,resolve,epoch,timers:new Set(),voices:new Set(),ends:[],flashUntil:0,settled:false};
 presentations.add(presentation);
 const playerSeries=action==='attack'&&Object.prototype.hasOwnProperty.call(result,'playerDamage')?burst(active.weaponId):null;
 // Misses still fire; radiation-only deaths contain no actual enemy attack.
 const enemySeries=active.enemyWeaponId>0&&!!result.enemyTurn&&!result.victoryReady&&(!result.died||Number(result.enemyTurn.damage)>0)?burst(active.enemyWeaponId):null;
 const playerDamage=Number(result.playerDamage),enemyDamage=Number(result.enemyTurn?.damage);
 const reactions={
  enemy:action==='attack'&&Number.isFinite(playerDamage)&&playerDamage>0&&active.enemyIsNpc?describeReaction('enemy'):null,
  player:result.enemyTurn?.hit===true&&Number.isFinite(enemyDamage)&&enemyDamage>0?describeReaction('player'):null
 };
 // Keep optional reaction variants warm without holding up weapon presentation.
 if(reactions.player||reactions.enemy)preloadReactions();
 schedule(()=>{for(const voice of presentation.voices)stopVoice(voice);finishPresentation(presentation,false);},MAX_PRESENTATION_MS,presentation);
 runPresentation(presentation,playerSeries,enemySeries,reactions).catch(error=>{recordError(error);finishPresentation(presentation,false);});
 return promise;
}
function attach(scene=root.CombatScene){
 if(!scene||attached.has(scene)||typeof scene.show!=='function'||typeof scene.react!=='function')return false;
 attached.add(scene);
 const originalShow=scene.show,originalReact=scene.react,originalHide=scene.hide;
 scene.show=function(next){rememberScene(next);return originalShow.apply(this,arguments);};
 scene.react=function(token,result,action){return present(this,originalReact,token,result,action);};
 scene.hide=function(){active=null;cancelPending();return originalHide?.apply(this,arguments);};
 return true;
}
function getState(){return {supported:!unsupported,contextState:context?.state||'uninitialized',limiterEnabled:!!limiter,settings:getSettings(),activeToken:active?.token||null,cachedBuffers:buffers.size,activeVoices:voices.size,pendingShots:pending.size,activePresentations:presentations.size,lastReactionFiles:Object.fromEntries(lastReactionFiles),...stats};}
root.CombatAudio={getSettings,setEnabled,setVolume,unlock,stop,preload,preloadReactions,play,getState,attach};
doc?.addEventListener('pointerdown',unlock,{passive:true,capture:true});
doc?.addEventListener('keydown',unlock,{capture:true});
doc?.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});
root.addEventListener?.('pagehide',stop);
attach();
})(typeof window!=='undefined'?window:globalThis);
