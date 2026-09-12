(function(root){
'use strict';
const base='images/anomaly/';
let host=null,signature='',foundKey='',frame=0,lastFrame=0,animationState=null;
const reducedMotion=root.matchMedia('(prefers-reduced-motion: reduce)');
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
 const field=document.createElement('canvas'),screen=document.createElement('canvas');field.className='anomaly-field';screen.className='detector-display';field.setAttribute('aria-hidden','true');screen.setAttribute('aria-hidden','true');host.replaceChildren(effect,field,right,detector,screen,grip,found,caption);host.parts={effect,field,screen,right,detector,grip,found,left,artifact,caption};return host;
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
 host.hidden=false;host.dataset.searching=String(config.searching!==false&&!item);host.dataset.pending=String(!!config.pending);
 animationState={id:Number(config.anomaly.id)||4,detector:config.detector,searching:config.searching!==false&&!item,pending:!!config.pending,found:!!item};
 p.artifact.dataset.energy=/shar|plamya|iskra|molniya|zvezda|yadro|serdce|antimateriya|bezdny|pustoty/.test(item?.file||'')?'strong':'soft';
 startAnimation();
}
function hide(){cancelAnimationFrame(frame);frame=0;animationState=null;if(mount()){host.hidden=true;host.parts.found.hidden=true;}foundKey='';signature='';}

// Screen corners follow the actual perspective of each inventory detector.
const screens={
 'riper.jpg':[[.25,.44],[.67,.51],[.62,.63],[.20,.56]],
 'polyarnaya_zvezda.jpg':[[.28,.40],[.69,.45],[.62,.61],[.20,.56]],
 'sverchok.jpg':[[.24,.44],[.61,.49],[.54,.68],[.17,.63]],
 'hameleon.jpg':[[.34,.33],[.72,.37],[.65,.61],[.25,.56]],
 'buran.jpg':[[.36,.15],[.66,.17],[.65,.36],[.36,.36]],
 'grom.jpg':[[.34,.16],[.73,.21],[.66,.43],[.27,.38]],
 'vedmak.jpg':[[.32,.16],[.80,.24],[.72,.47],[.23,.39]],
 'svetlyak.jpg':[[.35,.12],[.82,.19],[.75,.43],[.27,.36]],
 'vizir.jpg':[[.33,.18],[.78,.25],[.70,.46],[.25,.39]]
};
function startAnimation(){if(!frame&&animationState&&!document.hidden){lastFrame=0;frame=requestAnimationFrame(animate)}}
function animate(ms){frame=0;if(!animationState||host.hidden||document.hidden)return;if(ms-lastFrame>=33||reducedMotion.matches){lastFrame=ms;paintAnimation(reducedMotion.matches?1000:ms)}if(!reducedMotion.matches)frame=requestAnimationFrame(animate)}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else startAnimation()});
reducedMotion.addEventListener('change',()=>{cancelAnimationFrame(frame);frame=0;startAnimation()});
function context(canvas){if(canvas.width!==1536){canvas.width=1536;canvas.height=1024}const c=canvas.getContext('2d');c.clearRect(0,0,1536,1024);return c}
function paintAnimation(ms){
 const state=animationState,p=host.parts,t=ms/1000,c=context(p.field),kind=(effects[state.id]||effects[4])[0],color=(effects[state.id]||effects[4])[1];
 c.save();c.translate(768,560);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=3;c.shadowColor=color;c.shadowBlur=16;
 if(['vortex','orb','void','spring'].includes(kind)){
  for(let ring=0;ring<5;ring++){c.save();c.rotate(t*(ring%2?-.3:.4)+ring);c.scale(1,kind==='vortex'||kind==='spring'?.28:1);c.globalAlpha=.18+ring*.08;c.beginPath();c.ellipse(0,0,65+ring*24,65+ring*24,0,t+ring,t+ring+4.8);c.stroke();c.restore()}
  if(kind==='void'){const g=c.createRadialGradient(0,0,15,0,0,110);g.addColorStop(0,'#050309');g.addColorStop(.6,'#080611dd');g.addColorStop(1,'#170e3000');c.fillStyle=g;c.fillRect(-110,-110,220,220)}
 }else if(kind==='electric'||kind==='rift'){
  c.globalAlpha=.45+.15*Math.sin(t*4);for(let bolt=0;bolt<3;bolt++){c.beginPath();for(let j=0;j<12;j++){const x=kind==='rift'?Math.sin(j*3+t*5)*15+bolt*8-20:(j-6)*28;const y=kind==='rift'?(j-6)*29:(Math.sin(j*12.989+t*6+bolt*4)*22+Math.sin(j*7.13-t*9)*15)+(bolt-1)*60;j?c.lineTo(x,y):c.moveTo(x,y)}c.stroke()}
 }else if(kind==='mirror'){c.save();c.rotate(Math.sin(t*.8)*.08);for(let j=0;j<5;j++){c.globalAlpha=.12+j*.05;c.strokeRect(-95+j*12,-145+j*18,190-j*24,290-j*36)}c.restore()}
 for(let i=0;i<38;i++){
  const phase=(t*(kind==='fire'?.32:.12)+i*.137)%1,angle=i*2.399+t*.25;
  let x=Math.sin(angle)*(60+i%9*15),y=100-phase*250,r=2+i%4;
  if(kind==='mist'){x=Math.sin(angle)*230;y=65+Math.cos(angle)*30;r=32+i%5*9}
  else if(kind==='column'){x=Math.sin(angle)*35;y=140-phase*400;r=3}
  else if(kind==='vortex'||kind==='orb'||kind==='void'){x=Math.cos(angle)*155;y=Math.sin(angle)*(kind==='vortex'?48:155);r=2}
  c.globalAlpha=(kind==='mist'?.018:.55)*Math.sin(phase*Math.PI);c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
 }
 c.restore();
 const d=context(p.screen);if(!state.searching||p.detector.hidden||!p.detector.complete||!p.detector.naturalWidth)return;
 const corners=screens[state.detector];if(!corners)return;
 const box=p.detector.getBoundingClientRect(),area=host.getBoundingClientRect();if(!area.width||!box.width)return;
 d.save();d.translate((box.left-area.left)*1536/area.width,(box.top-area.top)*1024/area.height);d.scale(box.width*1536/area.width,box.height*1024/area.height);
 d.beginPath();corners.forEach(([x,y],i)=>i?d.lineTo(x,y):d.moveTo(x,y));d.closePath();d.clip();
 const cx=corners.reduce((a,v)=>a+v[0],0)/4,cy=corners.reduce((a,v)=>a+v[1],0)/4;
 d.fillStyle='#06281755';d.fillRect(0,0,1,1);d.strokeStyle='#a8ffb8';d.fillStyle='#b8ffd0';d.lineWidth=.007;d.shadowColor='#61ff90';d.shadowBlur=5;
 if(state.detector==='riper.jpg'||state.detector==='buran.jpg'){
  const angle=-2.4+(Math.sin(t*(state.pending?8:3))*.5+.5)*1.6;d.beginPath();d.moveTo(cx,cy+.05);d.lineTo(cx+Math.cos(angle)*.16,cy+.05+Math.sin(angle)*.13);d.stroke();
 }else if(['hameleon.jpg','polyarnaya_zvezda.jpg'].includes(state.detector)){
  for(let row=0;row<5;row++){d.globalAlpha=.35+.45*(.5+.5*Math.sin(t*3+row));d.fillRect(cx-.17,cy-.06+row*.03,.11+((Math.floor(t*2)+row*7)%5)*.035,.009)}
 }else{
  d.translate(cx,cy);d.scale(1,.72);d.rotate(t*(state.pending?3:1.8));d.globalAlpha=.3;d.beginPath();d.moveTo(0,0);d.arc(0,0,.24,-.6,0);d.closePath();d.fill();d.globalAlpha=.85;d.beginPath();d.moveTo(0,0);d.lineTo(.25,0);d.stroke();
 }
 d.restore();
}

root.AnomalyScene={show,hide};
})(window);
