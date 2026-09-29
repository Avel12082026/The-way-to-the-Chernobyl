(function(root){
'use strict';
let state=null,busy=false,history=[],combatHome=null;
const qs=id=>document.getElementById(id);
const esc=value=>{
 const div=document.createElement('div');div.textContent=String(value??'');return div.innerHTML;
};
async function post(path,body={}){
 const res=await fetch(SERVER_URL+path,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({initData:root.Telegram?.WebApp?.initData,...body})});
 return await res.json();
}
function ensurePanel(){
 let panel=qs('arenaBattlePanel');if(panel)return panel;
 panel=document.createElement('section');panel.id='arenaBattlePanel';panel.hidden=true;
 panel.innerHTML=
  '<div class="arena-tactical-head"><div><strong id="arenaBattleRound">АРЕНА</strong>'+
  '<div id="arenaBattleHint">Пошаговый бой</div></div><button type="button" id="arenaBattleListBtn">К списку</button></div>'+
  '<div class="arena-fighter-bars"><div><div class="arena-fighter-name" id="arenaPlayerName"></div>'+
  '<div class="arena-hp-track"><span id="arenaPlayerHpFill"></span></div><small id="arenaPlayerHpText"></small></div>'+
  '<div><div class="arena-fighter-name" id="arenaEnemyName"></div><div class="arena-hp-track"><span id="arenaEnemyHpFill"></span></div>'+
  '<small id="arenaEnemyHpText"></small></div></div><div id="arenaBattleVisual"></div><div id="arenaBattleEffects"></div>'+
  '<div id="arenaBattleLog" aria-live="polite"></div><div id="arenaBattleActions"></div>'+
  '<div class="arena-tactical-note">Атака — обычный выстрел. Прицел усиливает следующий выстрел. Защита уменьшает входящий урон. '+
  'Смена позиции снижает шанс попадания и сбрасывает прицел. Аптечка арены лечит постепенно 3 хода и доступна один раз за бой.</div>';
 qs('arenaContent').after(panel);qs('arenaBattleListBtn').onclick=closeView;
 if(!qs('arenaTacticalStyle')){
  const style=document.createElement('style');style.id='arenaTacticalStyle';
  style.textContent=
   '#arenaBattlePanel{padding:8px 0 14px}.arena-tactical-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}'+
   '.arena-tactical-head strong{color:#d9cfaa;font-size:15px}#arenaBattleHint{color:#8f8a76;font-size:11px}'+
   '.arena-fighter-bars{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 8px}.arena-fighter-bars>div:last-child{text-align:right}'+
   '.arena-fighter-name{font-size:12px;font-weight:700;color:#e3dcc1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
   '.arena-hp-track{height:9px;background:#1c1b17;border:1px solid #665b3b;overflow:hidden;margin:4px 0}.arena-hp-track span{display:block;height:100%;background:#75884d;transition:width .2s ease}'+
   '#arenaEnemyHpFill{margin-left:auto}#arenaBattleVisual #combatScene{margin:6px 0}#arenaBattleEffects{min-height:24px;color:#c3b98e;font-size:11px;line-height:1.4;margin:4px 0}'+
   '#arenaBattleLog{max-height:112px;overflow:auto;background:#10110d;border:1px solid #3e3a2d;padding:7px;margin:7px 0;font-size:11px;line-height:1.45;color:#ccc4a6}'+
   '#arenaBattleActions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#arenaBattleActions button{min-height:44px;padding:8px 5px;font-size:12px}'+
   '#arenaBattleActions button:last-child:nth-child(odd){grid-column:1/-1}.arena-tactical-note{font-size:10px;line-height:1.4;color:#77715f;margin-top:8px}'+
   '.arena-result{padding:11px;border:1px solid #665b3b;background:#15160f;text-align:center;color:#e8dfb9;font-weight:700}';
  document.head.append(style);
 }
 return panel;
}
function mountCombat(){
 const host=qs('combatScene'),target=qs('arenaBattleVisual');if(!host||!target)return;
 if(!combatHome)combatHome={parent:host.parentNode,next:host.nextSibling};
 if(host.parentNode!==target)target.append(host);
}
function restoreCombat(){
 const host=qs('combatScene');root.CombatScene?.hide();
 if(host&&combatHome?.parent&&host.parentNode!==combatHome.parent){
  if(combatHome.next&&combatHome.next.parentNode===combatHome.parent)combatHome.parent.insertBefore(host,combatHome.next);
  else combatHome.parent.append(host);
 }
}
function actionLabel(action){
 return({attack:'Атака',aim:'Прицеливание',defend:'Защита',reposition:'Смена позиции',medkit:'Аптечка'})[action]||action;
}
function eventText(side,event){
 if(!event)return'';let text=(side==='player'?'Вы':'Противник')+': '+actionLabel(event.action)+'.';
 if(event.attack)text+=' '+(event.attack.hit?('Попадание '+event.attack.damage+' HP'+(event.attack.crit?' (крит)':'')):'Промах')+'.';
 if(Number(event.healed)>0)text+=' Лечение +'+Number(event.healed).toFixed(1)+' HP.';return text;
}
function actorView(a){return{name:a.name,hp:a.hp,weaponName:a.weaponName,armorName:a.armorName};}
function updateScene(){
 if(!state)return;mountCombat();
 const p=state.player,e=state.enemy;
 const gearFn=typeof combatEquipmentIds==='function'?combatEquipmentIds:null;
 if(!gearFn)return;
 const pg=gearFn(actorView(p)),eg=gearFn(actorView(e));
 root.CombatScene?.show({enemy:{...actorView(e),battleToken:state.token,kind:'arena-player',zoneLocation:4},
  armor:pg.armorId,weaponId:pg.weaponId,enemyGear:eg,zoneLocation:4,environmentId:18,pending:busy});
}
function renderBattle(){
 if(!state)return;const panel=ensurePanel(),content=qs('arenaContent');content.hidden=true;panel.hidden=false;
 const p=state.player,e=state.enemy;
 qs('arenaBattleRound').textContent='РАУНД '+Math.min(state.round,state.maxRounds)+' / '+state.maxRounds;
 qs('arenaBattleHint').textContent=(p.weaponName||'')+' · T'+p.weaponTier+' против '+(e.weaponName||'')+' · T'+e.weaponTier;
 qs('arenaPlayerName').textContent=p.name;qs('arenaEnemyName').textContent=e.name;
 const pp=Math.max(0,Math.min(100,p.hp/Math.max(1,p.maxHp)*100)),ep=Math.max(0,Math.min(100,e.hp/Math.max(1,e.maxHp)*100));
 qs('arenaPlayerHpFill').style.width=pp+'%';qs('arenaEnemyHpFill').style.width=ep+'%';
 qs('arenaPlayerHpText').textContent=Math.max(0,p.hp).toFixed(1)+' / '+p.maxHp+' HP';
 qs('arenaEnemyHpText').textContent=Math.max(0,e.hp).toFixed(1)+' / '+e.maxHp+' HP';
 const effects=[];
 if(p.aimed)effects.push('🎯 Вы прицелились');if(p.defending)effects.push('🛡️ Вы в защите');if(p.evasive)effects.push('↔️ Вы сменили позицию');
 if(p.healTicks)effects.push('🩹 Лечение: ещё '+p.healTicks+' ход.');if(e.aimed)effects.push('⚠️ Противник прицелился');
 if(e.defending)effects.push('🛡️ Противник защищается');if(e.evasive)effects.push('↔️ Противник сменил позицию');
 qs('arenaBattleEffects').textContent=effects.join(' · ')||'Оба бойца готовы к следующему действию.';
 const log=qs('arenaBattleLog');log.innerHTML=history.length?history.map(x=>'<div>'+esc(x)+'</div>').join(''):'<div>Бой начался. Вы слева, противник справа.</div>';log.scrollTop=log.scrollHeight;
 const actions=qs('arenaBattleActions');
 if(state.finished){
  const result=state.winner==='a'?'🏆 Победа':state.winner==='b'?'💀 Поражение':'🤝 Ничья';
  actions.innerHTML='<div class="arena-result">'+result+'</div><button type="button" onclick="ArenaTactical.finish()">Вернуться к списку арены</button>';
 }else{
  const dis=busy?' disabled':'',med=(busy||p.medkitUsed)?' disabled':'';
  actions.innerHTML='<button'+dis+' onclick="ArenaTactical.action(\'attack\')">⚔️ Атака</button>'+
   '<button'+dis+' onclick="ArenaTactical.action(\'aim\')">🎯 Прицелиться</button>'+
   '<button'+dis+' onclick="ArenaTactical.action(\'defend\')">🛡️ Защита</button>'+
   '<button'+dis+' onclick="ArenaTactical.action(\'reposition\')">↔️ Сменить позицию</button>'+
   '<button'+med+' onclick="ArenaTactical.action(\'medkit\')">🩹 Аптечка'+(p.medkitUsed?' использована':'')+'</button>';
 }
 updateScene();
}
async function openBattle(next,resumed=false){
 state=next;history=[];if(resumed)history.push('Продолжаем незавершённый бой.');renderBattle();
}
async function doAction(action){
 if(!state||busy||state.finished)return;busy=true;renderBattle();
 try{
  const data=await post('/api/arena/battle/action',{battleToken:state.token,action});
  if(!data.success){showGameAlert(data.error||'Ход не выполнен');return;}
  state=data.state;const a=eventText('player',data.events?.player),b=eventText('enemy',data.events?.enemy);
  if(a)history.push(a);if(b)history.push(b);
  root.CombatScene?.react(state.token,{success:true,enemyHp:state.enemy.hp,
   enemyTurn:data.events?.enemy?.action==='attack'?{damage:data.events.enemy.attack?.damage||0}:null,
   victoryReady:!!data.finished,died:state.player.hp<=0},action==='attack'?'attack':'wait');
  if(data.finished){
   if(data.winner==='a')history.push('🏆 Победа! +250 Байт, рейтинг +25.');
   else if(data.winner==='b')history.push('💀 Поражение. Рейтинг -10.');
   else history.push('🤝 Ничья. Рейтинг не изменён.');
   if(data.premiumArmorDrop)history.push('🎁 Премиальная броня: '+data.premiumArmorDrop);
   try{loadGame();}catch(_){}
  }
 }catch(e){console.error('[arena action]',e);showGameAlert('Ошибка соединения с сервером');}
 finally{busy=false;renderBattle();}
}
async function start(targetId){
 if(busy)return;busy=true;
 try{
  const data=await post('/api/arena/battle/start',{targetId});
  if(!data.success){showGameAlert(data.error||'Не удалось начать бой');return;}
  await openBattle(data.state,!!data.resumed);
 }catch(e){console.error('[arena start]',e);showGameAlert('Ошибка соединения с сервером');}
 finally{busy=false;if(state)renderBattle();}
}
async function render(){
 const content=qs('arenaContent'),panel=ensurePanel();content.hidden=false;panel.hidden=true;
 try{
  const status=await post('/api/arena/battle/status');
  if(status?.success&&status.active&&status.state){await openBattle(status.state,true);return;}
 }catch(_){}
 restoreCombat();content.innerHTML='<p style="padding:10px;color:#888;">Загрузка...</p>';
 try{
  const arena=await fetch(SERVER_URL+'/api/arena').then(r=>r.json()),myId=String(getPlayerId());
  if(!arena||!arena.length){content.innerHTML='<p style="padding:10px;color:#888;">На арене пока никого нет</p>';return;}
  content.innerHTML=arena.map((p,index)=>{
   const self=String(p.player_id)===myId;
   const info='<div><p><strong style="color:'+getNicknameColor(p.player_id,p.arenaKillMilestone)+';">'+(index+1)+'. '+esc(p.username||p.player_id)+'</strong>'+legendArenaBadgeHtml(p.arenaKillMilestone)+'</p>'+
    '<p style="font-size:11px;color:#fff;">🚩 '+esc(factionLabel(p.factionName,p.player_id))+(p.factionName?' — '+esc(p.factionPosition||'Рядовой'):'')+'</p>'+
    '<p style="font-size:11px;color:#fff;">Ур. '+(p.level||1)+' | 🏅 '+esc(getRankTitle(p.level||1))+'</p>'+
    '<p style="font-size:12px;color:#aaa;">Рейтинг: '+p.rating+' | Победы: '+p.wins+' | Убийства: '+p.arenaKills+'</p></div>';
   const button=self?'<span style="color:#666;font-size:11px;">Это вы</span>':
    '<button id="arenaAttackBtn_'+p.player_id+'" onpointerdown="startHoldToConfirm(this,()=>attackArenaPlayer(\''+p.player_id+'\'))" '+
    'onpointerup="cancelHoldToConfirm(this)" onpointerleave="cancelHoldToConfirm(this)" onpointercancel="cancelHoldToConfirm(this)" '+
    'style="background:#c0392b;position:relative;overflow:hidden;user-select:none;"><span style="position:relative;z-index:1;">⚔️ В бой (удержите)</span>'+
    '<div id="arenaAttackBtn_'+p.player_id+'Fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:rgba(255,255,255,.35);transition:width .05s linear;pointer-events:none;"></div></button>';
   return '<div class="zr-card zr-arena-row" style="background:#1a1a1a;padding:10px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">'+info+button+'</div>';
  }).join('');
 }catch(e){content.innerHTML='<p style="padding:10px;color:#888;">Не удалось загрузить арену</p>';}
}
function closeView(){
 if(state&&!state.finished)showGameAlert('Бой ещё не завершён. При возвращении на арену он продолжится.');
 restoreCombat();const panel=qs('arenaBattlePanel'),content=qs('arenaContent');if(panel)panel.hidden=true;if(content)content.hidden=false;
 if(state?.finished){state=null;history=[];render();}
}
async function finish(){
 restoreCombat();state=null;history=[];const panel=qs('arenaBattlePanel');if(panel)panel.hidden=true;qs('arenaContent').hidden=false;
 try{await reloadPrivatePlayerState();}catch(_){}render();
}
function leave(){restoreCombat();}
root.ArenaTactical=Object.freeze({render,start,action:doAction,finish,leave});
})(window);
