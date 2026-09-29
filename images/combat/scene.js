(function(root){
'use strict';
const cache=new Map();let host,canvas,caption,retry,config,pictures,signature='',ticket=0,frame=0,reaction,playerPulse=null;
const pulseDuration=70,mutantAttackDuration=360;
let mutantAttackStart=null;
const reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
function variant(token){let h=0;for(const c of String(token))h=(h*31+c.charCodeAt(0))>>>0;return h%3;}
function load(url){
 if(cache.has(url))return cache.get(url);
 const p=new Promise((resolve,reject)=>{
  const im=new Image();let finished=false;
  const timer=setTimeout(()=>finish(new Error('Image load timed out: '+url)),20000);
  function finish(error){if(finished)return;finished=true;clearTimeout(timer);im.onload=im.onerror=null;if(error){cache.delete(url);reject(error);}else resolve(im);}
  im.onload=()=>finish();im.onerror=()=>finish(new Error(url));im.src=url+'?v='+encodeURIComponent(root.CombatFighters?.data.version||root.CombatEnvironments?.version||'20260914-combat4');
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
function hide(){ticket++;signature='';config=pictures=reaction=null;playerPulse=mutantAttackStart=null;cancelAnimationFrame(frame);frame=0;if(host)host.hidden=true;}
function mutantLunge(now){
 if(mutantAttackStart===null||reduced.matches)return 0;
 const age=now-mutantAttackStart;
 if(age<0||age>=mutantAttackDuration)return 0;
 return 32*(age<=120?Math.sin(Math.PI*age/240):Math.cos(Math.PI*(age-120)/480));
}
function draw(now=0){
 if(!config||!pictures||host.hidden)return;
 const ctx=canvas.getContext('2d'),elapsed=reaction?now-reaction.start:Infinity,active=elapsed>=0&&elapsed<870&&!reduced.matches;
 const pulseAge=playerPulse===null?Infinity:now-playerPulse;
 const recoil=playerPulse!==null?(!reduced.matches&&pulseAge>=0&&pulseAge<pulseDuration?Math.sin(Math.PI*pulseAge/pulseDuration)*12:0):(active&&reaction.shot?Math.sin(Math.PI*Math.min(1,elapsed/220))*12:0);
 ctx.clearRect(0,0,1536,1024);ctx.drawImage(pictures[0],0,0,1536,1024);
 const lunge=mutantAttackStart!==null?mutantLunge(now):(active&&reaction.enemyAttack&&elapsed>=(reaction.shot?220:0)?Math.sin(Math.PI*Math.min(1,(elapsed-(reaction.shot?220:0))/650))*32:0);
 root.CombatLayout.drawCreature(ctx,pictures[1],config.species,lunge);
 ctx.save();if(recoil)ctx.translate(0,recoil);
 if(pictures[2]&&pictures[3])root.CombatLayout.drawForeground(ctx,pictures[2],pictures[3],config.weaponId);
 ctx.restore();
 caption.textContent=`${config.enemy.name} · ${Math.max(0,Number(config.enemy.hp)||0)} HP${config.pending?' · Ход выполняется…':''}`;
 host.setAttribute('aria-label','Бой: '+caption.textContent);
}
async function show(next){if(!mount())return false;if(!root.CombatAssets||!root.COMBAT_ASSETS||!root.CombatLayout){hide();status('Не удалось загрузить интерфейс боя. Перезапусти игру.');return false;}const token=next.enemy?.battleToken,visual=root.CombatAssets.getVisuals(next.enemy,variant(token)),weapon=root.COMBAT_ASSETS.pistols.find(w=>w.id===Number(next.weaponId)),armor=Number(next.armor);if(!token){hide();return false;}if(!visual.ready){config={...next};signature='';ticket++;pictures=reaction=null;playerPulse=mutantAttackStart=null;cancelAnimationFrame(frame);frame=0;status('Для этого противника изображение пока недоступно.');return false;}const environment=root.CombatEnvironments?.select(next);config={...next,weaponId:weapon?.id,species:visual.species,environment,enemy:{...next.enemy}};const key=[token,visual.species,environment?.id,weapon?.id,armor].join('|');if(signature===key){draw(performance.now());return true;}cancelAnimationFrame(frame);frame=0;playerPulse=mutantAttackStart=null;signature=key;pictures=reaction=null;status('Загрузка сцены боя…');const request=++ticket;try{const foreground=weapon?.ready&&root.COMBAT_ASSETS.armorIds.includes(armor)?Promise.all(['images/combat/'+weapon.image,`images/anomaly/hands/${armor}_right.webp`].map(load)).catch(()=>[null,null]):Promise.resolve([null,null]);const [background,mutant,hands]=await Promise.all([load(environment?.path||visual.background),load(visual.mutant),foreground]);const loaded=[background,mutant,...hands];if(request!==ticket)return false;pictures=loaded;host.hidden=false;canvas.hidden=false;retry.hidden=true;draw(performance.now());return true;}catch(e){if(request===ticket){signature='';pictures=null;status('Не удалось загрузить сцену боя. Можно повторить загрузку.',true);console.warn('[combat scene]',e);}return false;}}
function animate(now){
 frame=0;if(!config||!pictures||document.hidden)return;
 if(playerPulse!==null&&now-playerPulse>=pulseDuration)playerPulse=null;
 if(mutantAttackStart!==null&&now-mutantAttackStart>=mutantAttackDuration)mutantAttackStart=null;
 if(reaction&&now-reaction.start>=(reaction.shot?870:650))reaction=null;
 draw(now);
 if(!reduced.matches&&(reaction||playerPulse!==null||mutantAttackStart!==null))frame=requestAnimationFrame(animate);
}
function startAnimation(){if(!frame&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(animate);}
function pulse(token,side){
 if(!config||token!==config.enemy.battleToken||side!=='player'||!pictures?.[2]||!pictures?.[3]||document.hidden||reduced.matches||host.hidden)return false;
 // Legacy art has no reviewed muzzle anchor. Keep its existing foreground
 // recoil in time with each shot instead of inventing a flame position.
 const now=performance.now();playerPulse=now;draw(now);startAnimation();return true;
}
function mutantAttack(token){
 if(!config||token!==config.enemy.battleToken||!pictures?.[1]||document.hidden||reduced.matches||host.hidden)return false;
 const now=performance.now();mutantAttackStart=now;
 if(reaction)reaction.enemyAttack=false;
 draw(now);startAnimation();return true;
}
function react(token,result,action,options={}){
 if(!config||token!==config.enemy.battleToken||!result?.success)return;
 if(action==='attack'&&Number.isFinite(result.enemyHp))config.enemy.hp=result.enemyHp;
 const now=performance.now();reaction={start:now,shot:action==='attack'&&!options.externalShots,enemyAttack:!!result.enemyTurn&&!result.victoryReady&&!result.died&&!options.externalMutantAttack};
 draw(now);startAnimation();
}
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);frame=0;reaction=null;playerPulse=mutantAttackStart=null;if(!document.hidden)draw(performance.now());});
root.CombatScene={show,hide,react,pulse,mutantAttack};
})(window);
