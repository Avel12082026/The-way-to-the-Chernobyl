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

const RAID_BUTTON_CHROME_PROPS=[
  'background-color','background-image','background-position','background-size','background-repeat',
  'border-top-width','border-top-style','border-top-color',
  'border-right-width','border-right-style','border-right-color',
  'border-bottom-width','border-bottom-style','border-bottom-color',
  'border-left-width','border-left-style','border-left-color',
  'border-image-source','border-image-slice','border-image-width','border-image-outset','border-image-repeat',
  'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius',
  'box-shadow','color','font-family','font-size','font-weight','line-height','letter-spacing','text-shadow','text-transform',
  'padding-top','padding-right','padding-bottom','padding-left','min-height','text-align'
];

function raidActionStyleSource(raid){
  const encounterButtons=Array.from(raid.querySelectorAll('#battleButtonsContainer button'));
  const preferred=encounterButtons.find(button=>/Обойти\s+аномалию|Сбежать/i.test(button.textContent||''));
  return preferred||encounterButtons[0]||raid.querySelector('#raidNavButtons button');
}

function syncRaidUtilityChrome(raid,row){
  const source=raidActionStyleSource(raid);
  if(!source||!row)return;
  const computed=getComputedStyle(source);
  for(const target of Array.from(row.children)){
    if(!(target instanceof HTMLButtonElement))continue;
    target.style.setProperty('--raid-utility-text-color',computed.color||'#fff');
    target.style.setProperty('--raid-utility-font-family',computed.fontFamily||'inherit');
    target.style.setProperty('--raid-utility-font-size',computed.fontSize||'12px');
    target.style.setProperty('--raid-utility-font-weight',computed.fontWeight||'700');
    target.style.setProperty('--raid-utility-line-height',computed.lineHeight||'normal');
    target.style.setProperty('--raid-utility-letter-spacing',computed.letterSpacing||'normal');
    target.style.setProperty('--raid-utility-text-shadow',computed.textShadow||'none');
    target.style.setProperty('--raid-utility-text-transform',computed.textTransform||'uppercase');
    for(const prop of RAID_BUTTON_CHROME_PROPS){
      target.style.setProperty(prop,computed.getPropertyValue(prop),'important');
    }
  }
}

function setRaidUtilityLabel(button,label){
  if(!button)return;
  button.dataset.raidLabel=label;
  button.setAttribute('aria-label',label);
  for(const node of Array.from(button.childNodes)){
    if(node.nodeType===Node.TEXT_NODE && node.textContent.trim())node.remove();
    if(node.nodeType===Node.ELEMENT_NODE && node.classList?.contains('raid-utility-label'))node.remove();
  }
}

function syncRaidVitalBars(head){
  const defs=[
    ['raidHealthMini','health','maxHealth','health'],
    ['raidHungerMini','hunger','maxHunger','hunger'],
    ['raidThirstMini','thirst','maxThirst','thirst']
  ];
  for(const [id,key,maxKey,kind] of defs){
    const value=document.getElementById(id);
    const chip=value?.parentElement;
    if(!chip)continue;
    chip.classList.add('raid-vital-chip','raid-vital-'+kind);
    let current=Number(window.player?.[key]);
    if(!Number.isFinite(current))current=Number(value.textContent)||0;
    let max=Number(window.player?.[maxKey]);
    if(!Number.isFinite(max)||max<=0)max=100;
    const pct=Math.max(0,Math.min(100,current/max*100));
    chip.style.setProperty('--raid-vital-fill',pct.toFixed(2)+'%');
    chip.setAttribute('role','progressbar');
    chip.setAttribute('aria-valuemin','0');
    chip.setAttribute('aria-valuemax',String(max));
    chip.setAttribute('aria-valuenow',String(Math.max(0,current)));
  }
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
  setRaidUtilityLabel(backpack,'Рюкзак');
  setRaidUtilityLabel(telegram,'Телеграммка');
  syncRaidUtilityChrome(raid,row);
  return row;
}

let raidBalanceFrame=0;
function visibleRaidScene(visual){
  return Array.from(visual.querySelectorAll('#combatScene,#anomalyScene')).find(el=>{
    if(el.hidden||el.offsetHeight<=0)return false;
    return getComputedStyle(el).display!=='none';
  })||null;
}
function scheduleRaidHistoryBalance(raid,visual,log){
  if(!raid||!visual||!log)return;
  if(raidBalanceFrame)cancelAnimationFrame(raidBalanceFrame);
  raidBalanceFrame=requestAnimationFrame(()=>{
    raidBalanceFrame=0;
    log.style.setProperty('--raid-log-extra','0px');
  });
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
    syncRaidVitalBars(head);
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
  scheduleRaidHistoryBalance(raid,visual,log);
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
  window.addEventListener('resize',applyRaidLayout,{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

window.RaidKpkPolish=Object.freeze({version:'1.3.2',apply,applyRaidLayout,applyPdaLayout});
})();
