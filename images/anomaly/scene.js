(function(root){
'use strict';
const base='images/anomaly/';
let host=null,signature='',foundKey='';
const effects={1:['fire','#f17b28'],2:['electric','#75cfff'],3:['vortex','#b6bfb1'],4:['mist','#a6cf5b'],5:['vortex','#aaaf80'],6:['vortex','#bf7364'],7:['fire','#e7a353'],8:['orb','#bc9dff'],9:['column','#b7b9a5'],10:['mist','#c6e8ff'],11:['orb','#bdcbb7'],12:['spring','#b53530'],13:['void','#22212c'],14:['rift','#ba9dff'],15:['void','#474a73'],16:['mirror','#b2d1d5'],17:['orb','#eccb86'],18:['column','#a6d5ca']};
function image(className,alt){const el=document.createElement('img');el.className=className;el.alt=alt;el.draggable=false;return el;}
function mount(){
 if(host)return host;
 host=document.getElementById('anomalyScene');if(!host)return null;
 const effect=document.createElement('div');effect.className='anomaly-effect';effect.setAttribute('aria-hidden','true');
 for(let i=0;i<14;i++){const dot=document.createElement('i');dot.style.cssText=`left:${(i*37)%100}%;top:${(i*23)%100}%;animation-delay:-${i*.27}s;`;effect.appendChild(dot);}
 const right=image('anomaly-hand anomaly-right','Правая рука'),detector=image('anomaly-detector','Детектор'),grip=image('anomaly-hand anomaly-grip','');
 const found=document.createElement('div');found.className='anomaly-found';found.hidden=true;
 const left=image('anomaly-hand','Левая рука'),artifact=image('anomaly-artifact','Найденный артефакт');found.append(left,artifact);
 const caption=document.createElement('div');caption.className='anomaly-caption';caption.setAttribute('aria-live','polite');
 host.replaceChildren(effect,right,detector,grip,found,caption);host.parts={effect,right,detector,grip,found,left,artifact,caption};return host;
}
function source(el,url){if(el.getAttribute('src')!==url){el.style.visibility='hidden';el.onload=()=>{el.style.visibility='visible'};el.onerror=()=>{el.style.visibility='hidden'};el.src=url;}}
function show(config){
 if(!mount())return;
 const p=host.parts,data=root.ANOMALY_ASSETS;
 if(!data)return;
 const armor=Number(config.armor)||1;
 const safeArmor=data.armors.includes(armor)?armor:1;
 source(p.right,base+'hands/'+safeArmor+'_right.webp');source(p.left,base+'hands/'+safeArmor+'_left.webp');source(p.grip,base+'hands/'+safeArmor+'_grip.webp');
 const detector=data.detectors[config.detector];p.detector.hidden=p.grip.hidden=!detector;
 if(detector)source(p.detector,base+'items/'+detector);
 const found=Array.isArray(config.artifacts)?config.artifacts:[];
 const item=found.map(v=>({name:v.name,file:data.artifacts[v.icon]||data.artifactNames[v.name]})).find(v=>v.file);
 p.found.hidden=!item;
 if(item){source(p.artifact,base+'items/'+item.file);p.artifact.alt=item.name;const key=item.name+'|'+safeArmor;if(key!==foundKey){p.found.classList.remove('arrives');void p.found.offsetWidth;p.found.classList.add('arrives')}foundKey=key;}else foundKey='';
 const next=String(config.anomaly.id||config.anomaly.name||'');
 if(signature!==next){signature=next;const [kind,color]=effects[config.anomaly.id]||['mist','#afc5af'];p.effect.dataset.kind=kind;p.effect.style.setProperty('--anomaly-color',color);host.style.backgroundImage='url("'+base+data.backgrounds[0]+'")';}
 p.caption.textContent='☢ '+config.anomaly.name+(found.length?' · Найдено: '+found.map(v=>v.name).join(', '):'');
 host.hidden=false;
}
function hide(){if(mount()){host.hidden=true;host.parts.found.hidden=true;}foundKey='';signature='';}
root.AnomalyScene={show,hide};
})(window);
