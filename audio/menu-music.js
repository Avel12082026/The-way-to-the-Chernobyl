(()=>{
'use strict';
function init(){
 const menu=document.getElementById('mainMenu');if(!menu)return;
 let settings={enabled:true,volume:.25};try{const saved=JSON.parse(localStorage.getItem('zone.menuMusic')||'null');if(saved){settings.enabled=saved.enabled!==false;const v=Number(saved.volume);if(Number.isFinite(v))settings.volume=Math.max(0,Math.min(1,v))}}catch{}
 const audio=new Audio('audio/menu-ambient.mp3');audio.loop=true;audio.preload='none';audio.volume=0;
 let unlocked=false,fade=0,epoch=0,playing=false;
 const button=document.createElement('button');button.id='menuMusicButton';button.type='button';button.textContent='♫';button.setAttribute('aria-label','Настройки музыки');button.title='Музыка главного меню';
 const panel=document.createElement('dialog');panel.id='menuMusicPanel';panel.setAttribute('aria-labelledby','menuMusicTitle');panel.innerHTML='<h3 id="menuMusicTitle">Музыка главного меню</h3><p>MoozE — Radwind Pt.2</p><label><input id="menuMusicEnabled" type="checkbox"> Включить музыку</label><label for="menuMusicVolume">Громкость <output id="menuMusicValue"></output></label><input id="menuMusicVolume" type="range" min="0" max="100" step="1"><p id="menuMusicStatus" role="status"></p><button type="button" id="menuMusicClose">Закрыть</button>';
 menu.querySelector('header').append(button);document.body.append(panel);
 const enabled=panel.querySelector('#menuMusicEnabled'),volume=panel.querySelector('#menuMusicVolume'),value=panel.querySelector('output'),status=panel.querySelector('#menuMusicStatus');enabled.checked=settings.enabled;volume.value=Math.round(settings.volume*100);value.value=volume.value+'%';
 function wanted(){return settings.enabled&&settings.volume>0&&!document.hidden&&menu.style.display!=='none'&&!menu.hidden}
 function save(){try{localStorage.setItem('zone.menuMusic',JSON.stringify(settings))}catch{}}
 function stop(){epoch++;clearInterval(fade);fade=0;audio.pause();audio.volume=0;playing=false}
 function ramp(target){clearInterval(fade);const from=audio.volume,start=performance.now();fade=setInterval(()=>{const fraction=Math.min(1,(performance.now()-start)/500);audio.volume=Math.max(0,Math.min(1,from+(target-from)*fraction));if(fraction===1){clearInterval(fade);fade=0;if(!target){audio.pause();playing=false}}},40)}
 function sync(){
  button.dataset.enabled=String(settings.enabled);
  if(!wanted()){if(document.hidden||!settings.enabled||!settings.volume)stop();else{epoch++;ramp(0)}return}
  if(!unlocked)return;
  if(playing){ramp(settings.volume);return}
  const token=++epoch;playing=true;
  Promise.resolve(audio.play()).then(()=>{if(token!==epoch){if(!wanted())audio.pause();return}if(!wanted()){stop();return}status.textContent='';ramp(settings.volume)}).catch(error=>{if(token!==epoch)return;playing=false;if(error.name!=='AbortError')status.textContent='Нажми ещё раз, чтобы включить музыку.'});
 }
 document.addEventListener('pointerdown',()=>{unlocked=true;sync()},{passive:true});document.addEventListener('keydown',()=>{unlocked=true;sync()});
 button.onclick=()=>panel.showModal();panel.querySelector('#menuMusicClose').onclick=()=>{panel.close();button.focus()};
 enabled.onchange=()=>{settings.enabled=enabled.checked;unlocked=true;save();sync()};volume.oninput=()=>{settings.volume=Number(volume.value)/100;value.value=volume.value+'%';save();sync()};
 new MutationObserver(()=>{if(menu.style.display==='none'&&panel.open)panel.close();sync()}).observe(menu,{attributes:true,attributeFilter:['style','hidden','class']});
 document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',sync);
 audio.addEventListener('error',()=>{stop();status.textContent='Не удалось загрузить музыку. Попробуй включить её снова.'});
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
