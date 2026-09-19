/* Item information: actual use restrictions, catalogue reference, per-currency market mean. */
(() => {
'use strict';
if(window.ItemReference)return;
const RESEARCH_LEVELS=[[4,135],[5,175],[6,220],[7,265],[8,305],[9,350],[10,395],[11,440],[12,480],[13,525],[14,570]];
const clean=n=>String(n||'').replace(/[\u200B\u200C\u200D\u2060\uFEFF]+$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
function describe(name){
  const raw=String(name||''),parsed=typeof parseGearName==='function'?parseGearName(raw):{baseName:clean(raw).replace(/ \+\d+$/,''),level:0};
  const catalogs=[['weapon',typeof weapons!=='undefined'?weapons:[]],['armor',typeof armorItems!=='undefined'?armorItems:[]],['detector',typeof detectors!=='undefined'?detectors:[]],['consumable',typeof consumables!=='undefined'?consumables:[]]];
  let def=null,kind='other';
  for(const [k,rows] of catalogs){def=rows.find(x=>x.name===parsed.baseName);if(def){kind=k;break;}}
  if(!def&&typeof findArtifactDef==='function'){def=findArtifactDef(raw);if(def)kind='artifact';}
  if(!def&&typeof mutants!=='undefined'){const m=mutants.find(x=>x.loot===raw);if(m){def={name:raw,price:m.lootPrice};kind='loot';}}
  let level=1;
  if(kind==='weapon'||kind==='armor')level=def?.starterGear?1:Math.max(1,Number(def?.unlockLevel)||1);
  if(def?.isResearchSuit)level=RESEARCH_LEVELS.find(([tier])=>tier===Number(def.tier))?.[1]??null;
  const requirement=def?.adminOnly?'Только для администратора':level===null?'Уровень использования: не задан':'Уровень использования: '+level;
  const purchase=kind==='detector'&&Number(def.tier)<=8?'Покупка у торговца: с '+Math.max(1,(Number(def.tier)-1)*20)+' уровня':null;
  const price=Number(def?.price);
  const reference=def?.adminOnly?'Особый предмет — обычная стоимость не применяется':def?.isNamedArtifact?'Цена сдачи Леонову: 50 сталкоинов':Number.isFinite(price)&&price>0?'Ориентировочная стоимость: '+money(price)+' сталбайтов (каталог'+(Number(parsed.level)>0?', без оценки улучшений':'')+')':'Ориентировочная стоимость: нет данных';
  // Only gear copies are merged by visible name/+level. Distinct crafted artifacts
  // retain their full identity, including invisible suffixes.
  const key=['weapon','armor','detector'].includes(kind)?kind+'|'+parsed.baseName+'|'+(Number(parsed.level)||0):kind+'|'+raw;
  return {name:raw,kind,def,level,requirement,purchase,reference,key};
}
function meanFor(name,lots){
  const wanted=describe(name).key,groups=new Map();
  for(const lot of lots){
    if(!lot||typeof lot.item!=='string'||describe(lot.item).key!==wanted)continue;
    const price=Number(lot.price),qty=Number(lot.quantity),currency=lot.currency||'bytes';
    if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(qty)||qty<=0||!['bytes','stalkcoins'].includes(currency))continue;
    const g=groups.get(currency)||{total:0,qty:0,lots:0};g.total+=price;g.qty+=qty;g.lots++;groups.set(currency,g);
  }
  return [...groups].map(([currency,g])=>({currency,value:g.total/g.qty,lots:g.lots,qty:g.qty}));
}
let cached=null,cachedAt=0,pending=null;
function market(){
  if(cached&&Date.now()-cachedAt<30000)return Promise.resolve(cached);
  if(pending)return pending;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  pending=(async()=>{
    const r=await fetch(SERVER_URL+'/api/market',{cache:'no-store',signal:controller.signal});
    if(!r.ok)throw new Error('market read failed');
    const rows=await r.json();if(!Array.isArray(rows))throw new Error('invalid market read');
    cached=rows;cachedAt=Date.now();return rows;
  })().finally(()=>{clearTimeout(timer);pending=null;});
  return pending;
}
function block(name){
  const d=describe(name);
  return `<section class="item-reference" data-reference-item="${esc(d.name)}"><div class="item-reference-level">${esc(d.requirement)}</div>${d.purchase?'<div>'+esc(d.purchase)+'</div>':''}<div>${esc(d.reference)}</div><div class="item-reference-market">Средняя цена рынка: проверка…</div></section>`;
}
let scheduled=false;
function hydrate(){
  scheduled=false;
  const nodes=[...document.querySelectorAll('.item-reference:not([data-quote-started])')];
  if(!nodes.length)return;
  nodes.forEach(el=>{el.dataset.quoteStarted='1';});
  market().then(lots=>nodes.forEach(el=>{
    if(!el.isConnected)return;
    const quotes=meanFor(el.dataset.referenceItem,lots);
    el.querySelector('.item-reference-market').textContent=quotes.length?
      'Средняя цена рынка за 1 шт.: '+quotes.map(q=>money(q.value)+' '+(q.currency==='stalkcoins'?'сталкоинов':'сталбайтов')+' ('+q.lots+' лот.)').join('; ')+'. По текущим предложениям, не по завершённым сделкам.':
      'Средняя цена рынка: подходящих предложений нет.';
  })).catch(()=>nodes.forEach(el=>{if(el.isConnected)el.querySelector('.item-reference-market').textContent='Средняя цена рынка: временно нет данных.';}));
}
let infoDepth=0;
for(const name of ['showItemInfoModal','openItemActions','openEquippedItemActions','showProfileItemInfo']){
  const native=window[name];if(typeof native!=='function')continue;
  window[name]=function(){infoDepth++;try{return native.apply(this,arguments);}finally{infoDepth--;}};
}
const nativeInfo=window.getItemInfoHtml;
if(typeof nativeInfo==='function')window.getItemInfoHtml=function(name){
  const html=nativeInfo.apply(this,arguments);
  return infoDepth>0?String(html||'')+block(name):html;
};
new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(hydrate);}}).observe(document.body,{subtree:true,childList:true});
window.ItemReference=Object.freeze({version:'1.0.0',describe,meanFor});
})();
