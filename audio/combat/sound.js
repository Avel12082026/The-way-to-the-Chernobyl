(function(root){
'use strict';
const recordings={98:'audio/combat/1911-shot.ogg'},buffers=new Map(),pending=new Map(),voices=new Set();
let context,settings={enabled:true,volume:.55};
try{const saved=JSON.parse(root.localStorage.getItem('zone.combatSound'));if(saved){settings.enabled=saved.enabled!==false;if(Number.isFinite(saved.volume))settings.volume=Math.max(0,Math.min(1,saved.volume));}}catch{}
function getContext(){const AudioContext=root.AudioContext||root.webkitAudioContext;if(!context&&AudioContext)context=new AudioContext();return context;}
function stop(){for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
function getSettings(){return {...settings};}
function setSettings(next){
 if(typeof next.enabled==='boolean')settings.enabled=next.enabled;
 if(Number.isFinite(next.volume))settings.volume=Math.max(0,Math.min(1,next.volume));
 try{root.localStorage.setItem('zone.combatSound',JSON.stringify(settings));}catch{}
 // Apply mute/volume immediately, including any tail already playing.
 stop();return getSettings();
}
function prepare(weaponId){
 const url=recordings[weaponId];if(!url||buffers.has(weaponId))return Promise.resolve();
 if(pending.has(weaponId))return pending.get(weaponId);
 const ctx=getContext();if(!ctx)return Promise.resolve();
 const task=root.fetch(url).then(r=>{if(!r.ok)throw new Error('Audio unavailable');return r.arrayBuffer();}).then(bytes=>ctx.decodeAudioData(bytes)).then(buffer=>buffers.set(weaponId,buffer)).catch(()=>{}).finally(()=>pending.delete(weaponId));
 pending.set(weaponId,task);return task;
}
function playShot(weaponId,weapon){
 if(!settings.enabled||settings.volume<=0||root.document.hidden||weapon?.suppressed!==false)return false;
 const buffer=buffers.get(weaponId),ctx=context;
 // Never replay a shot late when an audio download or resume finishes.
 if(!buffer||!ctx||ctx.state!=='running')return false;
 if(voices.size>=4){const oldest=voices.values().next().value;oldest.stop();voices.delete(oldest);}
 const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=settings.volume;
 source.connect(gain);gain.connect(ctx.destination);voices.add(source);
 source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};source.start();return true;
}
function unlock(){const ctx=getContext();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});}
root.document.addEventListener('pointerdown',unlock,{passive:true});
root.document.addEventListener('keydown',unlock);
root.document.addEventListener('visibilitychange',()=>{if(root.document.hidden)stop();});
root.addEventListener('pagehide',stop);
root.CombatAudio={prepare,playShot,stop,getSettings,setSettings};
})(window);
