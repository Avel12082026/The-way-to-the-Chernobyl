(()=>{
'use strict';
function init(){
 const menu=document.getElementById('mainMenu');if(!menu)return;
 let settings={enabled:true,volume:.25};try{const saved=JSON.parse(localStorage.getItem('zone.menuMusic')||'null');if(saved){settings.enabled=saved.enabled!==false;const v=Number(saved.volume);if(Number.isFinite(v))settings.volume=Math.max(0,Math.min(1,v))}}catch{}
 const tracks=[
  ['zone-ambient-01.mp3','The way to the Chernobyl — 01'],
  ['zone-ambient-02.mp3','The way to the Chernobyl — 02'],
  ['zone-ambient-03.mp3','The way to the Chernobyl — 03'],
  ['zone-ambient-04.mp3','The way to the Chernobyl — 04'],
  ['zone-ambient-05.mp3','The way to the Chernobyl — 05'],
  ['zone-ambient-06.mp3','The way to the Chernobyl — 06']
 ];
 const FADE_MS=4000,FADE_OUT_WINDOW=4.25;
 const audioRoot=typeof SERVER_URL==='string'&&SERVER_URL?SERVER_URL.replace(/\/+$/,'')+'/audio/':'audio/';
 let track=-1;
 function pickTrack(){if(tracks.length<2)return 0;let next=Math.floor(Math.random()*tracks.length);if(next===track)next=(next+1+Math.floor(Math.random()*(tracks.length-1)))%tracks.length;return next}
 track=pickTrack();
 const audio=new Audio(audioRoot+tracks[track][0]);audio.loop=false;audio.preload='metadata';audio.volume=0;
 let unlocked=true,fade=0,epoch=0,playing=false,naturalFade=false;
 const button=document.createElement('button');button.id='menuMusicButton';button.type='button';button.textContent='♫';button.setAttribute('aria-label','Настройки звука');button.title='Звук';
 const panel=document.createElement('dialog');panel.id='menuMusicPanel';panel.setAttribute('aria-labelledby','menuMusicTitle');panel.innerHTML='<h3 id="menuMusicTitle">Фоновая музыка</h3><p id="musicTrackTitle"></p><button type="button" id="musicNext">Следующий трек</button><label><input id="menuMusicEnabled" type="checkbox"> Включить музыку</label><label for="menuMusicVolume">Громкость музыки <output id="menuMusicValue"></output></label><input id="menuMusicVolume" type="range" min="0" max="100" step="1"><p id="menuMusicStatus" role="status"></p><button type="button" id="menuMusicClose">Закрыть</button>';
 document.body.append(button,panel);
 const enabled=panel.querySelector('#menuMusicEnabled'),volume=panel.querySelector('#menuMusicVolume'),value=panel.querySelector('output'),status=panel.querySelector('#menuMusicStatus'),title=panel.querySelector('#musicTrackTitle');enabled.checked=settings.enabled;volume.value=Math.round(settings.volume*100);value.value=volume.value+'%';title.textContent=tracks[track][1];
 if(window.CombatAudio){
  panel.querySelector('#menuMusicTitle').textContent='Звук';
  const effects=document.createElement('section');effects.className='combat-sound-settings';
  effects.innerHTML='<label><input id="combatSoundEnabled" type="checkbox"> Звуки боя</label><label for="combatSoundVolume">Громкость боя <output id="combatSoundValue"></output></label><input id="combatSoundVolume" type="range" min="0" max="100" step="1">';
  panel.insertBefore(effects,panel.querySelector('#menuMusicClose'));
  const soundEnabled=effects.querySelector('#combatSoundEnabled'),soundVolume=effects.querySelector('#combatSoundVolume'),soundValue=effects.querySelector('output');
  function syncEffects(){const s=window.CombatAudio.getSettings();soundEnabled.checked=s.enabled;soundVolume.value=Math.round(s.volume*100);soundValue.value=soundVolume.value+'%';button.dataset.enabled=String(settings.enabled||s.enabled);}
  soundEnabled.onchange=()=>{window.CombatAudio.setEnabled(soundEnabled.checked);window.CombatAudio.unlock();syncEffects();};
  soundVolume.oninput=()=>{window.CombatAudio.setVolume(Number(soundVolume.value)/100);syncEffects();};
  window.addEventListener('combat-audio-settings',syncEffects);syncEffects();
 }
 function wanted(){return settings.enabled&&settings.volume>0&&!document.hidden}
 function save(){try{localStorage.setItem('zone.menuMusic',JSON.stringify(settings))}catch{}}
 function clearFade(){if(fade){clearInterval(fade);fade=0}}
 function stop(){epoch++;clearFade();audio.pause();audio.volume=0;playing=false;naturalFade=false}
 function ramp(target,duration=FADE_MS,pauseAtZero=false){clearFade();const from=audio.volume,start=performance.now(),span=Math.max(1,duration);fade=setInterval(()=>{const fraction=Math.min(1,(performance.now()-start)/span);audio.volume=Math.max(0,Math.min(1,from+(target-from)*fraction));if(fraction===1){clearFade();if(!target&&pauseAtZero){audio.pause();playing=false}}},40)}
 function sync(){
  button.dataset.enabled=String(settings.enabled||window.CombatAudio?.getSettings().enabled);
  if(!wanted()){stop();return}
  if(!unlocked)return;
  if(playing){if(!naturalFade)ramp(settings.volume);return}
  const token=++epoch;playing=true;audio.volume=0;
  Promise.resolve(audio.play()).then(()=>{if(token!==epoch){if(!wanted())audio.pause();return}if(!wanted()){stop();return}status.textContent='';naturalFade=false;ramp(settings.volume)}).catch(error=>{if(token!==epoch)return;playing=false;if(error.name!=='AbortError')status.textContent='Коснись экрана, чтобы браузер разрешил звук.'});
 }
 function next(){
  epoch++;clearFade();audio.pause();audio.volume=0;playing=false;naturalFade=false;
  track=pickTrack();audio.src=audioRoot+tracks[track][0];title.textContent=tracks[track][1];sync();
 }
 function fadeNearEnd(){if(!playing||naturalFade||!Number.isFinite(audio.duration)||audio.duration<=0)return;const left=audio.duration-audio.currentTime;if(left>0&&left<=FADE_OUT_WINDOW){naturalFade=true;ramp(0,Math.max(300,left*1000),false)}}
 document.addEventListener('pointerdown',()=>{unlocked=true;sync()},{passive:true});document.addEventListener('keydown',()=>{unlocked=true;sync()});
 button.onclick=()=>panel.showModal();panel.querySelector('#menuMusicClose').onclick=()=>{panel.close();button.focus()};
 enabled.onchange=()=>{settings.enabled=enabled.checked;unlocked=true;save();sync()};volume.oninput=()=>{settings.volume=Number(volume.value)/100;value.value=volume.value+'%';save();sync()};
 audio.addEventListener('timeupdate',fadeNearEnd);audio.addEventListener('ended',next);panel.querySelector('#musicNext').onclick=next;
 document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',sync);
 audio.addEventListener('error',()=>{stop();status.textContent='Не удалось загрузить музыку. Попробуй включить её снова.'});
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
