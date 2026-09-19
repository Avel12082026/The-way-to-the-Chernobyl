(() => {
'use strict';
if (window.RaidKpkPolish) return;

const nativeScrollIntoView=Element.prototype.scrollIntoView;
if(!Element.prototype.__raidNoScrollV1){
  Object.defineProperty(Element.prototype,'__raidNoScrollV1',{value:true,configurable:true});
  Element.prototype.scrollIntoView=function(){
    if(this.closest?.('#raidScreen'))return;
    return nativeScrollIntoView.apply(this,arguments);
  };
}

function ensureRaidUtilityRow(raid) {
  let row=document.getElementById('raidUtilityButtons');
  const backpack=raid.querySelector('button[onclick="openBackpackFromRaid()"]');
  if(!backpack)return null;
  if(!row){
    row=document.createElement('div');
    row.id='raidUtilityButtons';
    backpack.parentNode.insertBefore(row,backpack);
    row.append(backpack);
  }else if(backpack.parentElement!==row){
    row.prepend(backpack);
  }
  let telegram=document.getElementById('raidTelegramBtn');
  if(!telegram){
    telegram=document.createElement('button');
    telegram.type='button';
    telegram.id='raidTelegramBtn';
    telegram.textContent='Телеграммка';
    telegram.addEventListener('click',()=>{
      window.__chatOpenedFromRaid=true;
      if(typeof openScreen==='function')openScreen('chat');
    });
    row.append(telegram);
  }
  if((backpack.textContent||'').trim()!=='🎒 Рюкзак')backpack.textContent='🎒 Рюкзак';
  return row;
}

function applyRaidLayout(){
  const raid=document.getElementById('raidScreen');
  if(!raid)return;
  const shell=raid.firstElementChild;
  if(!shell)return;
  raid.scrollTop=0;
  shell.scrollTop=0;

  const head=raid.querySelector('.zr-raid-head');
  if(head){
    head.classList.add('raid-vitals-row');
    const title=head.querySelector('h3');
    if(title)title.hidden=true;
  }

  let visual=document.getElementById('raidVisualStage');
  if(!visual){
    visual=document.createElement('section');
    visual.id='raidVisualStage';
    visual.setAttribute('aria-label','Визуализация рейда');
    shell.insertBefore(visual,head||shell.firstChild);
  }
  for(const id of ['combatScene','anomalyScene']){
    const el=document.getElementById(id);
    if(el&&el.parentElement!==visual)visual.append(el);
  }

  let meters=document.getElementById('raidMetersRow');
  if(!meters){
    meters=document.createElement('div');
    meters.id='raidMetersRow';
  }
  const exp=document.getElementById('raidExpTrack');
  const radiation=document.getElementById('raidRadiationTrack')?.parentElement;
  if(exp&&exp.parentElement!==meters)meters.append(exp);
  if(radiation&&radiation.parentElement!==meters)meters.append(radiation);
  if(head&&meters.parentElement!==shell)head.insertAdjacentElement('afterend',meters);
  else if(head&&meters.previousElementSibling!==head)head.insertAdjacentElement('afterend',meters);

  const detector=raid.querySelector('.detector');
  if(detector)detector.classList.add('raid-detector-hidden');

  const nav=document.getElementById('raidNavButtons');
  if(nav&&meters.nextElementSibling!==nav)meters.insertAdjacentElement('afterend',nav);

  const battle=document.getElementById('battleButtonsContainer');
  if(battle&&nav&&nav.nextElementSibling!==battle)nav.insertAdjacentElement('afterend',battle);

  const utility=ensureRaidUtilityRow(raid);
  if(utility&&battle&&battle.nextElementSibling!==utility)battle.insertAdjacentElement('afterend',utility);

  const quick=document.getElementById('quickSlots');
  if(quick&&utility&&utility.nextElementSibling!==quick)utility.insertAdjacentElement('afterend',quick);

  const tracker=document.getElementById('activeQuestRaidTracker');
  if(tracker&&quick&&quick.nextElementSibling!==tracker)quick.insertAdjacentElement('afterend',tracker);
  const log=document.getElementById('raidLog');
  const anchor=(tracker&&tracker.isConnected)?tracker:quick;
  if(log&&anchor&&anchor.nextElementSibling!==log)anchor.insertAdjacentElement('afterend',log);
}

function applyPdaLayout(){
  const screen=document.getElementById('kpkScreen');
  if(!screen)return;
  screen.querySelector('.zr-pda-banner')?.remove();
  const tabs=screen.querySelector('.zr-pda-tabs');
  if(tabs)tabs.classList.add('kpk-two-column-tabs');
}

function apply(){
  applyRaidLayout();
  applyPdaLayout();
}

let applyQueued=false;
const observer=new MutationObserver(()=>{
  if(applyQueued)return;
  applyQueued=true;
  queueMicrotask(()=>{applyQueued=false;apply();});
});
function init(){
  apply();
  observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

window.RaidKpkPolish=Object.freeze({version:'1.1.0',apply,applyRaidLayout,applyPdaLayout});
})();
