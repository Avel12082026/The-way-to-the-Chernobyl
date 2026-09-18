(() => {
'use strict';
if (window.QuestSystem) return;

const API = '/api/quests';
const vendorMeta = {
  leonov:{name:'Леонов', title:'Эколог Леонов', kind:'артефакты и части мутантов'},
  zhuchara:{name:'Жучара', title:'Торговец Жучара', kind:'броню'},
  diesel:{name:'Дизель', title:'Техник Дизель', kind:'оружие'}
};
let state={accepted:[],activeId:null,completed:[],completedCount:0,completedNextCursor:null};
let offers={};
let syncPromise=null, mutationPending=false, dialogueMode='root', viewEpoch=0, stateEpoch=0;
let selectedDetails=null, pdaSignature='', trackerSignature='', dialogueSignature='';
let activeTab='accepted';
let dialogueVendor=null;

function esc(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function baseName(name){
  const raw=typeof stripInvisibleSuffix==='function'?stripInvisibleSuffix(name):String(name||'').replace(/[\u200B-\u200D\u2060\uFEFF].*$/,'');
  if(typeof parseGearName==='function'){
    try{return parseGearName(raw)?.baseName||raw;}catch(_){}
  }
  return raw.replace(/\s+\+\d+$/,'');
}
function haveQty(itemName, baseOnly=false){
  const inv=(typeof player==='object'&&player?.inventory)||{};
  const target=baseName(itemName);
  return Object.entries(inv).reduce((sum,[name,qty])=>{
    const parsed=typeof parseGearName==='function'?parseGearName(name):{level:0};
    const stable=String(name).replace(/ \+\d+(?=[\u200B\u200C]*$)/,'');
    const upgraded=Number(parsed.level)>0||Object.values(player.armorUpgradeData?.[stable]||{}).some(x=>Number(x)>0);
    const amount=Number(qty);
    return sum+(baseName(name)===target&&(!baseOnly||!upgraded)&&Number.isSafeInteger(amount)&&amount>0?amount:0);
  },0);
}
function completeNow(q){return haveQty(q.itemName,q.baseOnly)>=Number(q.qty||1);}
function activeQuest(){return state.accepted.find(q=>q.id===state.activeId)||null;}
function vendorName(id){return vendorMeta[id]?.name||id;}
function objective(q){
  const have=haveQty(q.itemName,q.baseOnly),qty=Number(q.qty||1);
  return `Принести: ${q.itemName} — ${Math.min(have,qty)} / ${qty}`;
}
function rewardText(q){return `Награда: ${Math.round(Number(q.reward)||0).toLocaleString('ru-RU')} сталбайтов`;}

const notify=text=>{if(typeof window.showGameAlert==='function')window.showGameAlert(text);};
async function api(path,body={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(SERVER_URL+API+path,{
      method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({initData:window.Telegram?.WebApp?.initData,...body})
    });
    let data;try{data=await response.json();}catch(_){throw new Error('Сервер вернул неполный ответ. Повтори проверку.');}
    if(!response.ok||data?.success!==true)throw new Error(data?.error||'Сервер заданий временно недоступен.');
    return data;
  }finally{clearTimeout(timer);}
}
function applyState(data){
  if(!Array.isArray(data.accepted)||!Array.isArray(data.completed))throw new Error('Ответ сервера заданий неполон. Обнови список.');
  state={accepted:data.accepted,activeId:data.activeId||null,completed:data.completed,
    completedCount:Math.max(0,Number(data.completedCount)||0),completedNextCursor:data.completedNextCursor??null};
}
function sync(){
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
    const epoch=stateEpoch;const data=await api('/state');
    if(epoch===stateEpoch){applyState(data);renderAll();}return state;
  })().finally(()=>{syncPromise=null;});
  return syncPromise;
}
function lockActions(){
  [pda,dialogue].forEach(root=>{
    root.setAttribute('aria-busy',String(mutationPending));
    root.querySelectorAll('[data-write-action]').forEach(b=>{b.disabled=mutationPending;});
  });
}
async function write(path,body,after){
  if(mutationPending)return;
  mutationPending=true;lockActions();
  try{
    if(syncPromise)await syncPromise.catch(()=>{});
    ++stateEpoch;const data=await api(path,body);++stateEpoch;applyState(data);
    if(data.inventory&&typeof player==='object'){
      player.inventory=data.inventory;
      if(Number.isFinite(data.coins))player.coins=data.coins;
      if(Array.isArray(data.quickSlots))player.quickSlots=data.quickSlots;
      if(typeof renderInventory==='function')renderInventory();
      if(typeof renderQuickSlots==='function')renderQuickSlots();
      if(typeof updateUI==='function')updateUI();
    }
    if(after)after(data);renderAll();
  }catch(e){
    // A reply can be lost after the server commits. Re-read; never replay a payout blindly.
    try{++stateEpoch;await sync();if(path==='/turn-in'&&typeof reloadPrivatePlayerState==='function')await reloadPrivatePlayerState();}catch(_){}
    notify(e.name==='AbortError'?'Ответ задержался. Проверь состояние задания перед повторной попыткой.':e.message);
  }finally{mutationPending=false;lockActions();}
}

const style=document.createElement('link');
style.rel='stylesheet';style.href='ui/quests.css?v=20260919-2';document.head.append(style);

const pda=document.createElement('section');
pda.id='questPdaScreen';pda.hidden=true;pda.innerHTML=`
 <div class="quest-pda-shell">
  <header class="quest-pda-head">
   <h2>КПК — Задания</h2>
   <button type="button" data-quest-action="pda-back">Назад</button>
  </header>
  <nav class="quest-tabs" aria-label="Разделы заданий">
   <button type="button" data-quest-tab="accepted">Взятые</button>
   <button type="button" data-quest-tab="active">Активные</button>
   <button type="button" data-quest-tab="completed">Выполненные <span id="questCompletedCount">0</span></button>
  </nav>
  <div id="questPdaList" class="quest-list"></div>
  <div id="questPdaDetails" class="quest-details" hidden></div>
 </div>`;
document.body.append(pda);

const dialogue=document.createElement('section');
dialogue.id='traderQuestDialogue';dialogue.hidden=true;dialogue.innerHTML=`
 <div class="trader-dialogue-shell" role="dialog" aria-modal="true" aria-labelledby="traderDialogueName">
  <header><h2 id="traderDialogueName"></h2><button type="button" data-dialogue-action="close">Закрыть</button></header>
  <div class="trader-dialogue-body">
   <div class="trader-dialogue-copy">
    <p id="traderDialogueLine"></p>
    <div id="traderDialogueContent"></div>
   </div>
   <div class="trader-dialogue-portrait"><img id="traderDialoguePortrait" alt="" draggable="false"></div>
  </div>
  <nav id="traderDialogueResponses" class="trader-dialogue-responses" aria-label="Ответы сталкера"></nav>
 </div>`;
document.body.append(dialogue);

const tracker=document.createElement('section');
tracker.id='activeQuestRaidTracker';tracker.hidden=true;tracker.setAttribute('aria-live','polite');

function ensurePdaButton(){
  const screen=document.getElementById('kpkScreen');
  if(!screen||document.getElementById('kpkQuestsBtn'))return;
  const button=document.createElement('button');
  button.id='kpkQuestsBtn';button.type='button';button.textContent='Задания';
  button.addEventListener('click',openPda);
  const chat=document.getElementById('kpkChatBtn');
  if(chat?.parentElement)chat.insertAdjacentElement('afterend',button);
  else{
    const host=screen.querySelector('nav, .tabs, .kpk-tabs, .zr-actions')||screen;
    host.append(button);
  }
}
function ensureTracker(){
  const battle=document.getElementById('battleButtonsContainer');
  if(!battle)return;
  if(!tracker.isConnected)battle.insertAdjacentElement('afterend',tracker);
  else if(tracker.previousElementSibling!==battle)battle.insertAdjacentElement('afterend',tracker);
}

function questCard(q,mode){
  const ready=mode==='completed'||completeNow(q);
  const el=document.createElement('article');
  el.className='quest-card'+(ready?' quest-ready':'');
  el.dataset.questId=q.id;
  const h=document.createElement('button');
  h.type='button';h.className='quest-card-open';
  h.innerHTML=`<strong>${esc(q.title||'Задание')}</strong><span>${esc(vendorName(q.vendor))}</span><span class="quest-objective">${esc(mode==='completed'?'Передано: '+q.itemName+' × '+q.qty:objective(q))}</span>`;
  h.addEventListener('click',()=>showQuestDetails(q,mode));
  el.append(h);
  return el;
}
function showQuestDetails(q,mode){
  selectedDetails={id:q.id,mode};
  const box=document.getElementById('questPdaDetails');
  box.hidden=false;
  box.classList.toggle('quest-ready',mode==='completed'||completeNow(q));
  box.innerHTML=`
   <button type="button" class="quest-details-close" data-quest-action="details-close">×</button>
   <h3>${esc(q.title||'Задание')}</h3>
   <p>Заказчик: ${esc(vendorMeta[q.vendor]?.title||vendorName(q.vendor))}</p>
   <p class="quest-objective">${esc(mode==='completed'?'Передано: '+q.itemName+' × '+q.qty:objective(q))}</p>
   <p>${esc(rewardText(q))}</p>
   ${mode==='completed'?'<p>Выполнено: '+esc(new Date(q.completedAt||0).toLocaleString('ru-RU'))+'</p>':'<p class="quest-note">Вернись из рейда и передай предмет заказчику в разговоре. '+(q.baseOnly?'По этому заказу принимаются вещи без улучшений.':'')+'</p>'}
   ${mode==='accepted'&&q.id!==state.activeId?'<button type="button" data-write-action="activate" data-quest-action="activate" data-quest-id="'+esc(q.id)+'">Активировать</button>':''}
   ${mode!=='completed'&&q.id===state.activeId?'<p class="quest-priority">Приоритетное задание</p>':''}
  `;
}
function renderPda(){
  if(pda.hidden)return;
  const signature=JSON.stringify([activeTab,state,state.accepted.map(q=>haveQty(q.itemName,q.baseOnly))]);
  if(signature===pdaSignature)return;pdaSignature=signature;
  document.querySelectorAll('[data-quest-tab]').forEach(b=>b.classList.toggle('active',b.dataset.questTab===activeTab));
  const count=document.getElementById('questCompletedCount');if(count)count.textContent=String(state.completedCount);
  const list=document.getElementById('questPdaList');if(!list)return;
  list.replaceChildren();
  const details=document.getElementById('questPdaDetails');
  let rows=[];
  if(activeTab==='accepted')rows=state.accepted.filter(q=>q.id!==state.activeId);
  else if(activeTab==='active'){const q=activeQuest();rows=q?[q]:[];}
  else rows=state.completed;
  if(!rows.length){
    const empty=document.createElement('p');empty.className='quest-empty';
    empty.textContent=activeTab==='accepted'?'Взятых заданий нет.':activeTab==='active'?'Приоритетное задание не выбрано.':'Выполненных заданий пока нет.';
    list.append(empty);selectedDetails=null;details.hidden=true;lockActions();return;
  }
  rows.forEach(q=>list.append(questCard(q,activeTab)));
  if(activeTab==='completed'&&state.completedNextCursor){
    const more=document.createElement('button');more.type='button';more.textContent='Показать ещё';
    more.dataset.writeAction='history';more.onclick=()=>loadHistory();list.append(more);
  }
  if(selectedDetails){
    const q=[...state.accepted,...state.completed].find(x=>x.id===selectedDetails.id);
    if(q)showQuestDetails(q,selectedDetails.mode);else{selectedDetails=null;details.hidden=true;}
  }
  lockActions();
}
function renderTracker(){
  ensureTracker();
  const q=activeQuest();
  if(!q||!tracker.isConnected){tracker.hidden=true;return;}
  const ready=completeNow(q);
  const signature=JSON.stringify([q,haveQty(q.itemName,q.baseOnly)]);
  if(signature===trackerSignature&&!tracker.hidden)return;trackerSignature=signature;
  tracker.hidden=false;tracker.className=ready?'quest-ready':'';
  tracker.innerHTML=`<strong>Задание: ${esc(q.title||q.itemName)}</strong><span class="quest-objective">${esc(objective(q))}</span><span>Отнести: ${esc(vendorName(q.vendor))}</span>`;
}
function renderAll(){renderPda();renderTracker();if(!dialogue.hidden&&dialogueVendor)renderDialogue(dialogueVendor,dialogueMode);}

function openPda(){
  ensurePdaButton();activeTab='accepted';selectedDetails=null;pdaSignature='';pda.hidden=false;document.body.classList.add('quest-pda-visible');renderPda();
  sync().catch(e=>notify(e.message));
}
function closePda(){selectedDetails=null;document.getElementById('questPdaDetails').hidden=true;pda.hidden=true;document.body.classList.remove('quest-pda-visible');}

async function activate(id){return write('/activate',{questId:id},()=>{activeTab='active';selectedDetails=null;document.getElementById('questPdaDetails').hidden=true;});}
async function fetchOffers(vendor){
  const epoch=viewEpoch;
  try{
    const data=await api('/offers',{vendor});
    if(epoch!==viewEpoch||dialogue.hidden||dialogueVendor!==vendor)return;
    offers[vendor]=Array.isArray(data.offers)?data.offers:[];dialogueSignature='';renderDialogue(vendor,'offers');
  }catch(e){if(epoch===viewEpoch)notify(e.message);}
}
async function accept(vendor,id){
  return write('/accept',{vendor,questId:id},()=>{offers[vendor]=(offers[vendor]||[]).filter(q=>q.id!==id);});
}
async function turnIn(vendor,id){
  return write('/turn-in',{vendor,questId:id},data=>{
    notify(`Задание выполнено. Получено ${Math.round(Number(data.reward)||0).toLocaleString('ru-RU')} сталбайтов.`);
  });
}
async function abandon(vendor,id){
  if(mutationPending)return;
  if(!confirm('Отказаться от задания? Этот заказ сегодня больше не появится.'))return;
  return write('/abandon',{vendor,questId:id});
}
async function loadHistory(){
  if(mutationPending||!state.completedNextCursor)return;
  mutationPending=true;lockActions();
  try{
    const data=await api('/history',{before:state.completedNextCursor});
    const seen=new Set(state.completed.map(q=>q.id));
    if(!Array.isArray(data.completed))throw new Error('Сервер не вернул историю заданий');
    state.completed.push(...data.completed.filter(q=>!seen.has(q.id)));
    state.completedNextCursor=data.completedNextCursor??null;renderPda();
  }catch(e){notify(e.message);}finally{mutationPending=false;lockActions();}
}

function portraitFor(vendor){
  if(vendor==='leonov')return document.querySelector('#leonovHubScreen img')?.src||'';
  if(vendor==='zhuchara')return document.querySelector('#zhucharaHubScreen img')?.src||'';
  if(vendor==='diesel')return document.querySelector('#dieselHubScreen img')?.src||'';
  return '';
}
function response(label,action){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.dialogueAction=action;return b;
}
function renderDialogue(vendor,mode='root'){
  const signature=JSON.stringify([vendor,mode,state.accepted,state.accepted.map(q=>haveQty(q.itemName,q.baseOnly)),offers[vendor]]);
  dialogueVendor=vendor;dialogueMode=mode;
  if(signature===dialogueSignature&&!dialogue.hidden)return;dialogueSignature=signature;
  const meta=vendorMeta[vendor];if(!meta)return;
  dialogue.hidden=false;document.body.classList.add('trader-dialogue-visible');
  document.getElementById('traderDialogueName').textContent=meta.title;
  const img=document.getElementById('traderDialoguePortrait');img.src=portraitFor(vendor);img.alt=meta.title;
  const line=document.getElementById('traderDialogueLine');
  const content=document.getElementById('traderDialogueContent');content.replaceChildren();
  const responses=document.getElementById('traderDialogueResponses');responses.replaceChildren();

  const mine=state.accepted.filter(q=>q.vendor===vendor);
  const ready=mine.filter(completeNow);
  if(mode==='offers'){
    line.textContent=vendor==='leonov'?'Зона много чего выбрасывает наружу. Мне нужны образцы и трофеи.':vendor==='zhuchara'?'Иногда нужен не хабар, а конкретная броня. Есть работа.':'Нужны рабочие стволы. Чем дальше ходишь — тем интереснее заказ.';
    const list=document.createElement('div');list.className='dialogue-quest-list';
    const rows=offers[vendor]||[];
    if(!rows.length){const p=document.createElement('p');p.textContent='Новых заказов сейчас нет.';list.append(p);}
    rows.forEach(q=>{
      const row=document.createElement('article');row.className='dialogue-quest-offer';
      row.innerHTML=`<strong>${esc(q.title)}</strong><span>${esc(q.itemName)} × ${Number(q.qty)||1}</span><span>${esc(rewardText(q))}</span>`;
      const take=document.createElement('button');take.type='button';take.dataset.writeAction='accept';take.textContent='Взять задание';take.onclick=()=>accept(vendor,q.id);row.append(take);list.append(row);
    });
    content.append(list);responses.append(response('Назад','root'));
  }else if(mode==='turnin'){
    line.textContent='Есть что по моему заказу?';
    if(!ready.length){const p=document.createElement('p');p.textContent='Сейчас у тебя нет полного комплекта предметов для сдачи.';content.append(p);}
    ready.forEach(q=>{
      const row=document.createElement('article');row.className='dialogue-turnin quest-ready';
      row.innerHTML=`<strong>${esc(q.title)}</strong><span>${esc(objective(q))}</span><span>${esc(rewardText(q))}</span>`;
      const give=document.createElement('button');give.type='button';give.dataset.writeAction='turn-in';give.textContent='Отдать и получить награду';give.onclick=()=>turnIn(vendor,q.id);row.append(give);content.append(row);
    });
    responses.append(response('Назад','root'));
  }else if(mode==='abandon'){
    line.textContent='Передумал? Назови заказ, от которого отказываешься.';
    if(!mine.length){const p=document.createElement('p');p.textContent='У тебя нет моих незавершённых заданий.';content.append(p);}
    mine.forEach(q=>{
      const row=document.createElement('article');row.className='dialogue-abandon';
      row.innerHTML=`<strong>${esc(q.title)}</strong><span>${esc(objective(q))}</span>`;
      const cancel=document.createElement('button');cancel.type='button';cancel.dataset.writeAction='abandon';cancel.textContent='Отказаться';cancel.onclick=()=>abandon(vendor,q.id);row.append(cancel);content.append(row);
    });
    responses.append(response('Назад','root'));
  }else{
    line.textContent=vendor==='leonov'?'Артефакты — это язык Зоны. Но иногда мне нужны и образцы мутантов. Что хотел?':vendor==='zhuchara'?'В Зоне нет ненужного хлама. Есть лишь не та цена. Что принёс?':'Железо не врёт. Говори, зачем пришёл.';
    responses.append(response('Какая у тебя есть работа?','offers'));
    if(ready.length)responses.append(response('Я принёс то, что ты просил.','turnin'));
    if(mine.length)responses.append(response('Хочу отказаться от задания.','abandon'));
    responses.append(response('Торговля','trade'));
    responses.append(response('Поговорим в другой раз.','close'));
  }
  lockActions();
}
async function openTraderDialogue(vendor){
  if(!vendorMeta[vendor])return false;
  const epoch=++viewEpoch;dialogueSignature='';renderDialogue(vendor,'root');
  try{await sync();}catch(e){if(epoch===viewEpoch)notify(e.message);}
  return epoch===viewEpoch;
}
function closeDialogue(){++viewEpoch;dialogueSignature='';dialogue.hidden=true;dialogueVendor=null;document.body.classList.remove('trader-dialogue-visible');}

pda.addEventListener('click',e=>{
  const tab=e.target.closest('[data-quest-tab]');if(tab){activeTab=tab.dataset.questTab;selectedDetails=null;document.getElementById('questPdaDetails').hidden=true;renderPda();return;}
  const b=e.target.closest('[data-quest-action]');if(!b)return;
  if(b.dataset.questAction==='pda-back')closePda();
  else if(b.dataset.questAction==='details-close'){selectedDetails=null;document.getElementById('questPdaDetails').hidden=true;}
  else if(b.dataset.questAction==='activate')activate(b.dataset.questId);
});
dialogue.addEventListener('click',e=>{
  const b=e.target.closest('[data-dialogue-action]');if(!b)return;
  const action=b.dataset.dialogueAction;
  if(action==='close')closeDialogue();
  else if(action==='trade'){
    const vendor=dialogueVendor;
    closeDialogue();
    const id=vendor==='diesel'?'technician':vendor;
    if(window.TradeMenu?.open)window.TradeMenu.open(id);
  }
  else if(action==='root'){++viewEpoch;renderDialogue(dialogueVendor,'root');}
  else if(action==='offers')fetchOffers(dialogueVendor);
  else if(action==='turnin')renderDialogue(dialogueVendor,'turnin');
  else if(action==='abandon')renderDialogue(dialogueVendor,'abandon');
});

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!dialogue.hidden){closeDialogue();e.preventDefault();return;}
  if(!pda.hidden){closePda();e.preventDefault();}
});

// A native Android Back action calls openScreen('main'). Close overlays too.
const oldOpenScreen=window.openScreen;
if(typeof oldOpenScreen==='function')window.openScreen=function(){closePda();closeDialogue();return oldOpenScreen.apply(this,arguments);};

const oldUpdate=window.updateUI;
if(typeof oldUpdate==='function')window.updateUI=function(){const r=oldUpdate.apply(this,arguments);queueMicrotask(renderAll);return r;};
const oldBattle=window.renderBattleButtons;
if(typeof oldBattle==='function')window.renderBattleButtons=function(){const r=oldBattle.apply(this,arguments);queueMicrotask(renderTracker);return r;};

new MutationObserver(()=>{ensurePdaButton();ensureTracker();}).observe(document.body,{childList:true,subtree:true});
ensurePdaButton();ensureTracker();
setInterval(()=>{if(!pda.hidden||!dialogue.hidden||!tracker.hidden)renderAll();},1500);

window.QuestSystem=Object.freeze({
  version:'1.1.0',openPda,closePda,openTraderDialogue,closeDialogue,sync,
  get state(){return state;},hasRequired:completeNow
});
sync().catch(()=>{});
})();
