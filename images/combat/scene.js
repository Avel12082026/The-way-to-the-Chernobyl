(function(root){
'use strict';
const cache=new Map();let host,canvas,caption,retry,config,pictures,signature='',ticket=0,frame=0,reaction;
// Only these exact weapon/armor/species combinations have reviewed paired sprites.
const reviewedPairs=[{name:'ПП-19 «Бизон»',weaponId:9,armor:91,species:'zombie',image:'images/combat/paired/9-91.webp',x:430,y:480,scale:.53,muzzle:[660,110],angle:-2.47,suppressed:false},{name:'ПП «Кедр»',weaponId:8,armor:91,species:'zombie',image:'images/combat/paired/8-91.webp',x:400,y:500,scale:.53,muzzle:[690,115],angle:-2.58,suppressed:false},{name:'Обрез охотничьего ружья',weaponId:4,armor:91,species:'zombie',image:'images/combat/paired/4-91.webp',x:460,y:560,scale:.53,muzzle:[545,125],angle:-2.1,suppressed:false},{"name": "ПП-19 «Бизон»", "weaponId": 9, "armor": 92, "species": "zombie", "image": "images/combat/paired/9-92.webp", "x": 430, "y": 480, "scale": 0.53, "muzzle": [654, 112], "angle": -2.47, "suppressed": false},{"name": "ПП «Кедр»", "weaponId": 8, "armor": 92, "species": "zombie", "image": "images/combat/paired/8-92.webp", "x": 400, "y": 500, "scale": 0.53, "muzzle": [666, 115], "angle": -2.58, "suppressed": false},{"name": "Обрез охотничьего ружья", "weaponId": 4, "armor": 92, "species": "zombie", "image": "images/combat/paired/4-92.webp", "x": 460, "y": 590, "scale": 0.53, "muzzle": [549, 68], "angle": -2.1, "suppressed": false}];
let pairedLoader;
function ensurePairedRenderer(){
 if(root.CombatPairedForeground)return Promise.resolve();
 if(!pairedLoader)pairedLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='images/combat/paired-foreground.js?v=20260915-forward1';
  let finished=false;
  const timer=setTimeout(()=>finish(new Error('Paired renderer load timed out')),20000);
  function finish(error){if(finished)return;finished=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){pairedLoader=null;script.remove();reject(error);}else resolve();}
  script.onload=()=>finish(root.CombatPairedForeground?null:new Error('Paired renderer unavailable'));
  script.onerror=()=>finish(new Error('Paired renderer failed to load'));
  document.head.appendChild(script);
 });
 return pairedLoader;
}
const reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
function variant(token){let h=0;for(const c of String(token))h=(h*31+c.charCodeAt(0))>>>0;return h%3;}
function load(url){
 if(cache.has(url))return cache.get(url);
 const p=new Promise((resolve,reject)=>{
  const im=new Image();let finished=false;
  const timer=setTimeout(()=>finish(new Error('Image load timed out: '+url)),20000);
  function finish(error){if(finished)return;finished=true;clearTimeout(timer);im.onload=im.onerror=null;if(error){cache.delete(url);reject(error);}else resolve(im);}
  im.onload=()=>finish();im.onerror=()=>finish(new Error(url));im.src=url+'?v=20260915-hands7576';
 });cache.set(url,p);if(cache.size>12)cache.delete(cache.keys().next().value);return p;
}
function mount(){
 if(host)return true;host=document.getElementById('combatScene');if(!host)return false;
 canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;canvas.setAttribute('aria-hidden','true');
 caption=document.createElement('div');caption.className='combat-caption';caption.setAttribute('aria-live','polite');
 retry=document.createElement('button');retry.type='button';retry.className='combat-retry';retry.textContent='Повторить загрузку';retry.hidden=true;
 retry.onclick=()=>{if(config){const next=config;signature='';show(next);}};
 host.replaceChildren(canvas,caption,retry);return true;
}
function status(message,canRetry=false){host.hidden=false;canvas.hidden=true;caption.textContent=message;retry.hidden=!canRetry;host.setAttribute('aria-label',message);}
function hide(){root.CombatAudio?.stop();ticket++;signature='';config=pictures=reaction=null;cancelAnimationFrame(frame);frame=0;if(host)host.hidden=true;}
function draw(now=0){
 if(!config||!pictures||host.hidden)return;
 const ctx=canvas.getContext('2d'),elapsed=reaction?now-reaction.start:Infinity;
 const active=elapsed>=0&&elapsed<870&&!reduced.matches;
 ctx.clearRect(0,0,1536,1024);ctx.drawImage(pictures[0],0,0,1536,1024);
 root.CombatLayout.drawCreature(ctx,pictures[1],config.species,active&&reaction.enemyAttack&&elapsed>=(reaction.shot?220:0)?Math.sin(Math.PI*Math.min(1,(elapsed-(reaction.shot?220:0))/650))*32:0);
 ctx.save();
 if(!config.paired&&active&&reaction.shot)ctx.translate(0,Math.sin(Math.PI*Math.min(1,elapsed/220))*12);
 if(config.paired&&pictures[2]){
  root.CombatPairedForeground.draw(ctx,pictures[2],config.paired,{shot:!!reaction?.shot,elapsed,reducedMotion:reduced.matches},root.CombatEffects);
 }else if(pictures[2]&&pictures[3]){
  const drawn=config.modular?root.CombatModular.drawForeground(ctx,pictures[2],pictures[3],config.modular):root.CombatLayout.drawForeground(ctx,pictures[2],pictures[3],config.weaponId);
  // Barrel and effect share the recoil transform; missing foreground cannot fire.
  if(drawn&&!reduced.matches)root.CombatEffects?.drawShot(ctx,reaction,elapsed,config.weaponId,root.COMBAT_ASSETS.pistols.find(w=>w.id===config.weaponId),config.modular?.muzzle);
 }
 ctx.restore();
 caption.textContent=`${config.enemy.name} · ${Math.max(0,Number(config.enemy.hp)||0)} HP${config.pending?' · Ход выполняется…':''}`;
 host.setAttribute('aria-label','Бой: '+caption.textContent);
}
async function show(next){if(!mount())return false;if(!root.CombatAssets||!root.COMBAT_ASSETS||!root.CombatLayout){hide();status('Не удалось загрузить интерфейс боя. Перезапусти игру.');return false;}const token=next.enemy?.battleToken,visual=root.CombatAssets.getVisuals(next.enemy,variant(token)),catalogWeapon=root.COMBAT_ASSETS.pistols.find(w=>w.id===Number(next.weaponId)),armor=Number(next.armor),paired=reviewedPairs.find(p=>Number(next.weaponId)===p.weaponId&&armor===p.armor&&visual.species===p.species)||null,weapon=catalogWeapon||(paired?{id:paired.weaponId,name:paired.name,suppressed:false}:null);if(!token){hide();return false;}if(!visual.ready){config={...next};signature='';ticket++;pictures=null;status('Для этого противника изображение пока недоступно.');return false;}if(catalogWeapon)root.CombatAudio?.prepare(catalogWeapon.id);const modular=root.CombatModular?.resolve(weapon?.id,armor,visual.species);config={...next,modular,paired,weaponId:weapon?.id,species:visual.species,enemy:{...next.enemy}};const key=[token,visual.species,weapon?.id,armor].join('|');if(signature===key){draw(performance.now());return true;}cancelAnimationFrame(frame);signature=key;pictures=reaction=null;status('Загрузка сцены боя…');const request=++ticket;try{if(paired)await ensurePairedRenderer();const foreground=paired?load(paired.image).then(image=>[image,null]):weapon?.ready&&root.COMBAT_ASSETS.armorIds.includes(armor)?Promise.all([modular?.weapon||'images/combat/'+weapon.image,modular?.hand||`images/anomaly/hands/${armor}_right.webp`].map(load)).catch(()=>[null,null]):Promise.resolve([null,null]);const [background,mutant,hands]=await Promise.all([load(visual.background),load(visual.mutant),foreground]);const loaded=[background,mutant,...hands];if(request!==ticket)return false;pictures=loaded;host.hidden=false;canvas.hidden=false;retry.hidden=true;draw(performance.now());return true;}catch(e){if(request===ticket){signature='';pictures=null;status('Не удалось загрузить сцену боя. Можно повторить загрузку.',true);console.warn('[combat scene]',e);}return false;}}
function react(token,result,action){if(!config||token!==config.enemy.battleToken||!result?.success)return;if(action==='attack'&&Number.isFinite(result.enemyHp))config.enemy.hp=result.enemyHp;if(action==='attack'){const audioWeapon=root.COMBAT_ASSETS.pistols.find(w=>w.id===config.weaponId);if(audioWeapon)root.CombatAudio?.playShot(config.weaponId,audioWeapon);}reaction={start:performance.now(),shot:action==='attack',enemyAttack:!!result.enemyTurn&&!result.victoryReady&&!result.died};cancelAnimationFrame(frame);function animate(now){frame=0;draw(now);if(config&&reaction&&!document.hidden&&!reduced.matches&&now-reaction.start<(reaction.shot?870:650))frame=requestAnimationFrame(animate);}if(!document.hidden)frame=requestAnimationFrame(animate);}
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);frame=0;reaction=null;if(!document.hidden)draw(performance.now());});
root.CombatScene={show,hide,react};
})(window);

