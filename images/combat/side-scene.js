(function(root){
'use strict';
const legacy=root.CombatScene;let legacyActive=false,legacyChildren=null;
const cache=new Map();let host,canvas,caption,retry,config,pictures,signature='',ticket=0,frame=0,reaction;
const reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
function variant(token){let h=0;for(const c of String(token))h=(h*31+c.charCodeAt(0))>>>0;return h%3;}
function load(url){
 if(cache.has(url)){const cached=cache.get(url);cache.delete(url);cache.set(url,cached);return cached;}
 const p=new Promise((resolve,reject)=>{
  const im=new Image();let finished=false;
  const timer=setTimeout(()=>finish(new Error('Image load timed out: '+url)),20000);
  function finish(error){if(finished)return;finished=true;clearTimeout(timer);im.onload=im.onerror=null;if(error){cache.delete(url);reject(error);}else resolve(im);}
  im.onload=()=>finish();im.onerror=()=>finish(new Error(url));im.src=url+'?v='+encodeURIComponent(root.CombatFighters?.data.version||'modular-shotguns-v1');
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
function hide(){if(legacyActive)legacy?.hide();legacyActive=false;ticket++;signature='';config=pictures=reaction=null;cancelAnimationFrame(frame);frame=0;if(host)host.hidden=true;}
function draw(now=0){
 if(!config||!pictures||host.hidden)return;
 const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,1536,1024);
 if(pictures.background)ctx.drawImage(pictures.background,0,0,1536,1024);
 else {ctx.fillStyle='#242922';ctx.fillRect(0,0,1536,1024);}
 root.CombatFighters?.draw(ctx,pictures.player,'player');
 if(pictures.enemy)root.CombatFighters.draw(ctx,pictures.enemy,'enemy');
 else if(pictures.mutant){ctx.save();ctx.translate(496,0);root.CombatLayout.drawCreature(ctx,pictures.mutant,config.species,0);ctx.restore();}
 const missing=[];
 if(!pictures.player)missing.push('Облик игрока ещё не готов');
 if(!pictures.enemy&&!pictures.mutant)missing.push('Облик противника ещё не готов');
 caption.textContent=`${config.enemy.name} · ${Math.max(0,Number(config.enemy.hp)||0)} HP${config.pending?' · Ход выполняется…':''}${missing.length?' · '+missing.join(' · '):''}`;
 host.setAttribute('aria-label','Игрок слева, противник справа. Бой: '+caption.textContent);
}
async function show(next){
 const readyPlayer=root.CombatFighters?.resolve({armorId:next.armor,weaponId:next.weaponId}).ready;
 const readyEnemy=root.CombatFighters?.resolve(next.enemyGear).ready;
 if(!readyPlayer&&!readyEnemy){hide();host=canvas=caption=retry=null;if(legacyChildren)document.getElementById('combatScene')?.replaceChildren(...legacyChildren);legacyActive=true;const pending=legacy.show(next);legacyChildren=Array.from(document.getElementById('combatScene')?.children||[]);return await pending;}
 if(legacyActive){legacy.hide();legacyActive=false;host=canvas=caption=retry=null;}
 if(!mount())return false;
 if(!root.CombatAssets||!root.COMBAT_ASSETS||!root.CombatLayout||!root.CombatFighters){hide();status('Не удалось загрузить интерфейс боя. Перезапусти игру.');return false;}
 const token=next.enemy?.battleToken;
 if(!token){hide();return false;}
 const visual=root.CombatAssets.getVisuals(next.enemy,variant(token));
 const player=root.CombatFighters.resolve({armorId:next.armor,weaponId:next.weaponId});
 const enemy=root.CombatFighters.resolve(next.enemyGear);
 config={...next,species:visual.species,enemy:{...next.enemy}};
 const key=[token,visual.species,player.key,enemy.key].join('|');
 if(signature===key){draw(performance.now());return true;}
 cancelAnimationFrame(frame);signature=key;pictures=reaction=null;status('Загрузка сцены боя…');
 const request=++ticket;
 try{
  const [background,mutant,playerImage,enemyImage]=await Promise.all([
   visual.ready?load(visual.background):null,
   visual.ready?load(visual.mutant):null,
   root.CombatFighters.load(player,load),
   !visual.ready?root.CombatFighters.load(enemy,load):null
  ]);
  if(request!==ticket)return false;
  pictures={background,mutant,player:playerImage,enemy:enemyImage};
  host.hidden=false;canvas.hidden=false;retry.hidden=true;draw(performance.now());return true;
 }catch(e){if(request===ticket){signature='';pictures=null;status('Не удалось загрузить сцену боя. Можно повторить загрузку.',true);console.warn('[combat scene]',e);}return false;}
}
function react(token,result,action){
 if(legacyActive)return legacy.react(token,result,action);
 if(!config||token!==config.enemy.battleToken||!result?.success)return;
 if(action==='attack'&&Number.isFinite(result.enemyHp))config.enemy.hp=result.enemyHp;
 draw();
}
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);frame=0;reaction=null;if(!document.hidden)draw(performance.now());});
root.CombatScene={show,hide,react};
})(window);

