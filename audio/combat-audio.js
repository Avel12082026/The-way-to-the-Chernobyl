(function(root){
'use strict';
// A separate effects bus: the soundtrack owns its own Audio element and settings.
const doc=root.document,STORE='zone.combatSound',MAX_BUFFERS=24,MAX_VOICES=10,MAX_LATE_MS=400;
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
let context=null,bus=null,limiter=null,active=null,epoch=0,unsupported=false;
const buffers=new Map(),voices=new Set(),pending=new Map(),seen=new WeakSet(),attached=new WeakSet();
const stats={played:0,dropped:0,errors:0,lastError:'',lastWeaponId:0};
const clock=()=>root.performance?.now?.()??Date.now();
const levelOrOne=value=>value==null||!Number.isFinite(Number(value))?1:Number(value);
function bank(){return root.COMBAT_SOUND_BANK;}
function describe(weaponId){
 const catalog=bank(),weapon=catalog?.weapons?.[Number(weaponId)],profile=catalog?.profiles?.[weapon?.profile];
 if(!weapon||!profile||!Array.isArray(profile.files)||!profile.files.length)return null;
 return {catalog,weapon,profile,weaponId:Number(weaponId)};
}
function sourceUrl(description,file){
 const url=new URL(file,new URL(description.catalog.base||'audio/gunshots/',siteRoot));
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
  if(!response.ok)throw new Error('Gunshot HTTP '+response.status);
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
function preload(weaponId){
 const description=describe(weaponId);
 if(!description||!ensureContext())return Promise.resolve(false);
 return Promise.all(description.profile.files.slice(0,4).map(file=>loadBuffer(sourceUrl(description,file)).promise)).then(loaded=>loaded.some(Boolean));
}
function cancelPending(){
 epoch++;
 for(const [timer,resolve] of pending){root.clearTimeout(timer);resolve(false);}
 pending.clear();
}
function removeVoice(voice){
 voices.delete(voice);
 try{voice.source.disconnect();voice.gain.disconnect();}catch(_){}
}
function stop(){
 cancelPending();
 for(const voice of Array.from(voices)){try{voice.source.stop();}catch(_){}removeVoice(voice);}
}
function persist(){
 try{root.localStorage?.setItem(STORE,JSON.stringify(settings));}catch(_){}
 if(bus)bus.gain.value=settings.enabled?settings.volume:0;
 if(root.CustomEvent)root.dispatchEvent?.(new root.CustomEvent('combat-audio-settings',{detail:getSettings()}));
}
function getSettings(){return {...settings};}
function setEnabled(enabled){settings.enabled=!!enabled;if(!settings.enabled)stop();persist();return getSettings();}
function setVolume(volume){const next=Number(volume);if(Number.isFinite(next)){settings.volume=Math.max(0,Math.min(1,next));if(!settings.volume)stop();persist();}return getSettings();}
function unlock(){
 const audioContext=ensureContext();if(!audioContext)return Promise.resolve(false);
 try{return Promise.resolve(audioContext.state!=='running'?audioContext.resume():undefined).then(()=>audioContext.state==='running').catch(error=>{recordError(error);return false;});}catch(error){recordError(error);return Promise.resolve(false);}
}
function startVoice(description,buffer,options,requestEpoch,requestedAt){
 if(!buffer||requestEpoch!==epoch||doc?.hidden||!settings.enabled||settings.volume<=0||context?.state!=='running'||clock()-requestedAt>MAX_LATE_MS){stats.dropped++;return false;}
 try{
  while(voices.size>=MAX_VOICES){const oldest=voices.values().next().value;try{oldest.source.stop();}catch(_){}removeVoice(oldest);}
  const source=context.createBufferSource(),gain=context.createGain();
  source.buffer=buffer;
  const rate=Number(description.weapon.rate)||1;
  source.playbackRate.value=Math.max(.5,Math.min(2,rate));
  const level=levelOrOne(description.profile.gain)*levelOrOne(description.weapon.gain)*levelOrOne(options.gain);
  gain.gain.value=Math.max(0,Math.min(2,level));
  source.connect(gain);gain.connect(bus);
  const voice={source,gain};voices.add(voice);source.onended=()=>removeVoice(voice);
  source.start();stats.played++;stats.lastWeaponId=description.weaponId;return true;
 }catch(error){recordError(error);return false;}
}
function play(weaponId,options={}){
 const description=describe(weaponId),requestEpoch=epoch;
 if(!description||doc?.hidden||!settings.enabled||settings.volume<=0||!ensureContext()||context.state!=='running'){stats.dropped++;return Promise.resolve(false);}
 function fire(){
  if(requestEpoch!==epoch||doc?.hidden){stats.dropped++;return Promise.resolve(false);}
  const file=description.profile.files[Math.floor(Math.random()*description.profile.files.length)],entry=loadBuffer(sourceUrl(description,file)),requestedAt=clock();
  // Cached shots start synchronously, before a fatal combat result closes the scene.
  if(entry.buffer)return Promise.resolve(startVoice(description,entry.buffer,options,requestEpoch,requestedAt));
  return entry.promise.then(buffer=>startVoice(description,buffer,options,requestEpoch,requestedAt));
 }
 const delay=Math.max(0,Math.min(1000,Number(options.delayMs)||0));
 if(!delay)return fire();
 return new Promise(resolve=>{
  const timer=root.setTimeout(()=>{pending.delete(timer);fire().then(resolve);},delay);pending.set(timer,resolve);
 });
}
function rememberScene(next){
 const token=next?.enemy?.battleToken||null;
 if(token!==active?.token)cancelPending();
 active=token?{token,weaponId:Number(next.weaponId)||0,enemyWeaponId:next.enemy?.kind==='mutant'?0:Number(next.enemyGear?.weaponId)||0}:null;
 if(active){preload(active.weaponId);preload(active.enemyWeaponId);}
}
function react(token,result,action){
 if(!active||token!==active.token||!result?.success||typeof result!=='object'||seen.has(result))return;
 seen.add(result);
 if(doc?.hidden)return;
 const playerShot=action==='attack'&&Object.prototype.hasOwnProperty.call(result,'playerDamage');
 if(playerShot)play(active.weaponId);
 // Damage-zero misses still fire. A radiation-only death has no enemy attack.
 const enemyShot=active.enemyWeaponId>0&&!!result.enemyTurn&&!result.victoryReady&&(!result.died||Number(result.enemyTurn.damage)>0);
 if(enemyShot)play(active.enemyWeaponId,{gain:.78,delayMs:playerShot&&!result.died?240:0});
}
function attach(scene=root.CombatScene){
 if(!scene||attached.has(scene)||typeof scene.show!=='function'||typeof scene.react!=='function')return false;
 attached.add(scene);
 const originalShow=scene.show,originalReact=scene.react,originalHide=scene.hide;
 scene.show=function(next){rememberScene(next);return originalShow.apply(this,arguments);};
 scene.react=function(token,result,action){react(token,result,action);return originalReact.apply(this,arguments);};
 scene.hide=function(){active=null;cancelPending();return originalHide?.apply(this,arguments);};
 return true;
}
function getState(){return {supported:!unsupported,contextState:context?.state||'uninitialized',limiterEnabled:!!limiter,settings:getSettings(),activeToken:active?.token||null,cachedBuffers:buffers.size,activeVoices:voices.size,pendingShots:pending.size,...stats};}
root.CombatAudio={getSettings,setEnabled,setVolume,unlock,stop,preload,play,getState,attach};
doc?.addEventListener('pointerdown',unlock,{passive:true,capture:true});
doc?.addEventListener('keydown',unlock,{capture:true});
doc?.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});
root.addEventListener?.('pagehide',stop);
attach();
})(typeof window!=='undefined'?window:globalThis);
