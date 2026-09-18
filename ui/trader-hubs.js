/* Full-resolution portrait entry screens for NPC traders. Trading stays in TradeMenu. */
(() => {
  'use strict';
  if (window.TraderHubs || !window.TradeMenu || typeof window.openScreen !== 'function') return;

  const nativeOpenScreen = window.openScreen;
  const portraitLocks = new WeakMap();
  let zhucharaHub = null;
  let dieselHub = null;

  const say = text => {
    if (typeof showGameAlert === 'function') showGameAlert(text);
  };

  function portraitSource(key) {
    const b64 = window.TRADER_PORTRAIT_DATA?.[key];
    return b64 ? 'data:image/webp;base64,' + b64 : '';
  }

  function bindPortrait(key, img) {
    if (!img) return Promise.resolve(false);
    const src = portraitSource(key);
    if (!src) {
      img.alt = 'Изображение торговца не загрузилось';
      return Promise.resolve(false);
    }
    const current = portraitLocks.get(img);
    if (current?.key === key && img.getAttribute('src') === src) return current.promise;

    let restoring = false;
    const keepSharp = () => {
      if (restoring || img.getAttribute('src') === src) return;
      restoring = true;
      img.setAttribute('src', src);
      restoring = false;
    };
    const observer = new MutationObserver(keepSharp);
    observer.observe(img, {attributes: true, attributeFilter: ['src']});
    img.decoding = 'async';
    img.setAttribute('src', src);
    img.dataset.portraitQuality = 'hq-864x1536-q88';
    const promise = (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => {
      if (img.naturalWidth !== 864 || img.naturalHeight !== 1536) {
        console.error('[Trader portrait size]', key, img.naturalWidth, img.naturalHeight);
        return false;
      }
      return true;
    });
    portraitLocks.set(img, {key, promise, observer});
    return promise;
  }

  function decorateLeonov() {
    const hub = document.getElementById('leonovHubScreen');
    if (!hub) return false;
    const nav = hub.querySelector('.leonov-actions');
    if (!nav) return false;

    hub.querySelector('.leonov-back')?.remove();
    if (!nav.querySelector('[data-leonov-action="talk"]')) {
      const talk = document.createElement('button');
      talk.type = 'button';
      talk.dataset.leonovAction = 'talk';
      talk.textContent = 'Говорить';
      nav.append(talk);
    }
    if (!nav.querySelector('[data-leonov-action="back"]')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.dataset.leonovAction = 'back';
      back.textContent = 'Назад';
      nav.append(back);
    }
    hub.dataset.bottomActions = 'ready';
    bindPortrait('leonov', hub.querySelector('#leonovHubArtwork'));
    return true;
  }

  document.addEventListener('click', event => {
    const talk = event.target.closest?.('#leonovHubScreen [data-leonov-action="talk"]');
    if (!talk) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    say('Леонов: Артефакты — это язык Зоны. Главное — уметь слушать.');
  }, true);

  new MutationObserver(() => decorateLeonov()).observe(document.body, {childList:true, subtree:true});
  decorateLeonov();

  function createPortraitHub({id, label, key, actions}) {
    const hub = document.createElement('section');
    hub.id = id;
    hub.className = 'trader-portrait-screen';
    hub.hidden = true;
    hub.dataset.actionCount = String(actions.length);
    hub.setAttribute('aria-label', label);

    const img = document.createElement('img');
    img.id = id.replace('Screen', 'Artwork');
    img.className = 'trader-portrait-artwork';
    img.alt = label + ' за прилавком';
    img.draggable = false;

    const nav = document.createElement('nav');
    nav.className = 'trader-portrait-actions';
    nav.setAttribute('aria-label', 'Действия: ' + label);
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.traderAction = action.id;
      button.textContent = action.label;
      nav.append(button);
    }
    hub.append(img, nav);
    document.body.append(hub);
    bindPortrait(key, img);
    return hub;
  }

  function hideHub(hub) {
    if (!hub) return;
    hub.hidden = true;
    hub.classList.remove('active');
    if (![zhucharaHub, dieselHub].some(item => item && !item.hidden)) {
      document.body.classList.remove('trader-portrait-visible');
    }
  }

  function showHub(hub, key) {
    nativeOpenScreen('main');
    hub.hidden = false;
    hub.classList.add('active');
    document.body.classList.add('trader-portrait-visible');
    bindPortrait(key, hub.querySelector('.trader-portrait-artwork'));
    return hub;
  }

  function ensureZhucharaHub() {
    if (zhucharaHub) return zhucharaHub;
    zhucharaHub = createPortraitHub({
      id:'zhucharaHubScreen',
      label:'Торговец Жучара',
      key:'zhuchara',
      actions:[
        {id:'trade', label:'Торговля'},
        {id:'talk', label:'Говорить'},
        {id:'back', label:'Назад'}
      ]
    });
    zhucharaHub.addEventListener('click', event => {
      const button = event.target.closest('[data-trader-action]');
      if (!button) return;
      const action = button.dataset.traderAction;
      if (action === 'trade') {
        hideZhuchara();
        window.TradeMenu.open('zhuchara');
      } else if (action === 'talk') {
        say('Жучара: В Зоне нет ненужного хлама. Есть лишь не та цена…');
      } else if (action === 'back') {
        hideZhuchara();
        nativeOpenScreen('main');
      }
    });
    return zhucharaHub;
  }

  function ensureDieselHub() {
    if (dieselHub) return dieselHub;
    dieselHub = createPortraitHub({
      id:'dieselHubScreen',
      label:'Техник Дизель',
      key:'diesel',
      actions:[
        {id:'trade', label:'Торговля'},
        {id:'upgrade', label:'Улучшить'},
        {id:'talk', label:'Говорить'},
        {id:'back', label:'Назад'}
      ]
    });
    dieselHub.addEventListener('click', event => {
      const button = event.target.closest('[data-trader-action]');
      if (!button) return;
      const action = button.dataset.traderAction;
      if (action === 'trade') {
        hideDiesel();
        window.TradeMenu.open('technician');
      } else if (action === 'upgrade') {
        hideDiesel();
        const screen = document.getElementById('technicianScreen');
        if (screen) screen.dataset.dieselUpgradeOnly = 'true';
        if (window.TradeMenu?.openTechnicianUpgrade) window.TradeMenu.openTechnicianUpgrade();
        else {
          nativeOpenScreen('technician');
          if (typeof window.openTechnicianTab === 'function') window.openTechnicianTab('upgrade');
        }
      } else if (action === 'talk') {
        say('Дизель: Железо не врёт. Приноси — посмотрим, что из него ещё можно выжать.');
      } else if (action === 'back') {
        hideDiesel();
        nativeOpenScreen('main');
      }
    });
    return dieselHub;
  }

  function hideZhuchara() { hideHub(zhucharaHub); }
  function hideDiesel() { hideHub(dieselHub); }
  function openZhuchara() { return showHub(ensureZhucharaHub(), 'zhuchara'); }
  function openDiesel() { return showHub(ensureDieselHub(), 'diesel'); }

  window.openScreen = function(screen) {
    if (screen === 'shop') return openZhuchara();
    if (screen === 'technician') return openDiesel();
    if (zhucharaHub && !zhucharaHub.hidden) hideZhuchara();
    if (dieselHub && !dieselHub.hidden) hideDiesel();
    return nativeOpenScreen.apply(this, arguments);
  };

  window.TraderHubs = Object.freeze({
    version:'1.2.0',
    openZhuchara, hideZhuchara,
    openDiesel, hideDiesel,
    decorateLeonov, bindPortrait
  });
})();


/* INTERACTION_POLISH_V1: item info, topmost alerts, PDA badges/sound, raid utility row. */
(() => {
  'use strict';
  const POLL_MS = 15000;
  let notificationReady = false;
  let previousState = {dm:false, parcel:false, system:false, friend:false, latestDm:0, latestParcel:0, latestSystem:0, friendIds:[]};
  let audioUnlocked = false;
  const notificationAudio = new Audio();
  notificationAudio.preload = 'auto';
  notificationAudio.volume = 0.9;
  let notificationAudioPromise = null;

  function ensureNotificationAudio() {
    if (notificationAudio.src) return Promise.resolve(notificationAudio);
    if (!notificationAudioPromise) {
      notificationAudioPromise = fetch('ui/pda-notification.mp3.b64?v=20260918-a1', {cache:'force-cache'})
        .then(r => { if (!r.ok) throw new Error('PDA sound HTTP '+r.status); return r.text(); })
        .then(b64 => {
          notificationAudio.src = 'data:audio/mpeg;base64,' + b64.replace(/\s+/g,'');
          return notificationAudio;
        })
        .catch(err => { notificationAudioPromise = null; console.error('[PDA notification sound]',err); throw err; });
    }
    return notificationAudioPromise;
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    ensureNotificationAudio().then(() => {
      const old = notificationAudio.volume;
      notificationAudio.volume = 0.001;
      const p = notificationAudio.play();
      if (p?.then) p.then(() => { notificationAudio.pause(); notificationAudio.currentTime = 0; notificationAudio.volume = old; }).catch(() => { notificationAudio.volume = old; });
    }).catch(() => {});
  }
  document.addEventListener('pointerdown', unlockAudio, {once:true, passive:true});

  function playPdaSound() {
    ensureNotificationAudio().then(() => {
      try {
        notificationAudio.currentTime = 0;
        const p = notificationAudio.play();
        if (p?.catch) p.catch(() => {});
      } catch (_) {}
    }).catch(() => {});
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch (_) {}
  }

  function ensureBadges(host, prefix) {
    if (!host) return null;
    host.classList.add('pda-notification-host');
    const kinds = [['dm','Личное сообщение'],['parcel','Посылка'],['system','Системное сообщение'],['friend','Заявка в друзья']];
    const result = {};
    for (const [kind,label] of kinds) {
      let dot = host.querySelector('[data-pda-indicator="'+kind+'"]');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'pda-notification-dot pda-notification-'+kind;
        dot.dataset.pdaIndicator = kind;
        dot.setAttribute('aria-label', label);
        dot.setAttribute('aria-hidden','true');
        host.append(dot);
      }
      result[kind] = dot;
    }
    return result;
  }

  function renderBadges(state) {
    const hosts = [
      ensureBadges(document.getElementById('bunkerPda'),'main'),
      ensureBadges(document.getElementById('kpkChatBtn'),'kpk'),
      ensureBadges(document.getElementById('raidTelegramBtn'),'raid')
    ].filter(Boolean);
    for (const dots of hosts) for (const kind of ['dm','parcel','system','friend']) {
      dots[kind].classList.toggle('active', !!state[kind]);
      dots[kind].setAttribute('aria-hidden', String(!state[kind]));
    }
    const legacy = document.getElementById('kpkChatUnreadDot');
    if (legacy) legacy.style.display = 'none';
    for (const id of ['friendReqUnreadDot','friendReqKpkDot','friendReqDmDot']) {
      const dot=document.getElementById(id);
      if (dot) dot.style.display = state.friend ? 'block' : 'none';
    }
  }

  function unreadGeneric(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.some(x => x && x.read !== true && x.seen !== true && x.claimed !== true);
    if (typeof value === 'object') return Object.values(value).some(x => x && x.read !== true && x.seen !== true && x.claimed !== true);
    return !!value;
  }

  function playerParcelUnread() {
    if (typeof player !== 'object' || !player) return false;
    return ['pendingParcels','parcels','pendingGifts','gifts','mailbox'].some(k => unreadGeneric(player[k]));
  }
  function playerSystemUnread() {
    if (typeof player !== 'object' || !player) return false;
    return ['systemMessages','notifications'].some(k => unreadGeneric(player[k]));
  }

  async function checkPdaNotifications() {
    if (typeof player !== 'object' || !player?.nickname) return;
    if (window.__pdaNotificationPollBusy) return;
    window.__pdaNotificationPollBusy = true;
    let dm=previousState.dm, parcel=playerParcelUnread(), system=playerSystemUnread(), friend=previousState.friend;
    let latestDm=previousState.latestDm, latestParcel=previousState.latestParcel, latestSystem=previousState.latestSystem;
    let friendIds=Array.isArray(previousState.friendIds) ? previousState.friendIds : [];
    let newFriendRequest=false;
    try {
      const r = await fetch(`${SERVER_URL}/api/chat/dm/conversations`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({initData:window.Telegram?.WebApp?.initData})
      });
      if (!r.ok) throw new Error('DM poll HTTP ' + r.status);
      const list = await r.json();
      if (!Array.isArray(list)) throw new Error('Invalid DM conversations');
      const myId = String(typeof getPlayerId === 'function' ? getPlayerId() : '');
      const incoming = (list || []).filter(c => String(c.lastSenderId)!==myId);
      dm = incoming.some(c => typeof isDmConvUnread === 'function' ? isDmConvUnread(c,myId) :
        Number(c.lastMessageAt||0) > Number(localStorage.getItem('pdaDmSeenAt')||0));
      latestDm = Math.max(previousState.latestDm,...incoming.map(c=>Number(new Date(c.lastMessageAt).getTime())||Number(c.lastMessageAt)||0));
    } catch (_) {}

    try {
      const r = await fetch(`${SERVER_URL}/api/chat/general?_=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error('System poll HTTP ' + r.status);
      const messages = await r.json();
      if (!Array.isArray(messages)) throw new Error('Invalid system messages');
      const sys = (messages || []).filter(m => m?.isSystem);
      const parcelRx = /подар|посыл|достав|получил.+(?:предмет|байт|жетон)/i;
      const pMsgs = sys.filter(m => parcelRx.test(String(m.text||'')));
      const sMsgs = sys.filter(m => !parcelRx.test(String(m.text||'')));
      const latestP = Math.max(0,...pMsgs.map(m=>Number(new Date(m.createdAt).getTime())||0));
      const latestS = Math.max(0,...sMsgs.map(m=>Number(new Date(m.createdAt).getTime())||0));
      latestParcel = latestP;
      latestSystem = latestS;
      const chatOpen = document.getElementById('chatScreen')?.classList.contains('active');
      const generalOpen = chatOpen && typeof chatTab !== 'undefined' && chatTab === 'general';
      if (generalOpen) {
        if (latestP) localStorage.setItem('pdaParcelSeenAt',String(latestP));
        if (latestS) localStorage.setItem('pdaSystemSeenAt',String(latestS));
      } else {
        parcel ||= latestP > Number(localStorage.getItem('pdaParcelSeenAt')||0);
        system ||= latestS > Number(localStorage.getItem('pdaSystemSeenAt')||0);
      }
    } catch (_) {}

    try {
      const r = await fetch(`${SERVER_URL}/api/friends/pending`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({initData:window.Telegram?.WebApp?.initData})
      });
      if (!r.ok) throw new Error('Friend request poll HTTP ' + r.status);
      const list = await r.json();
      if (!Array.isArray(list)) throw new Error('Invalid pending friend requests');
      const nextIds = list.map(p => String(p?.id ?? p?.player_id ?? p?.fromId ?? '')).filter(Boolean).sort();
      const previousIds = new Set(friendIds);
      newFriendRequest = notificationReady && nextIds.some(id => !previousIds.has(id));
      friendIds = nextIds;
      friend = nextIds.length > 0;
    } catch (_) {}

    const next={dm,parcel,system,friend,latestDm,latestParcel,latestSystem,friendIds};
    renderBadges(next);
    const hasNewEvent = notificationReady && (
      (latestDm && latestDm > previousState.latestDm) ||
      (latestParcel && latestParcel > previousState.latestParcel) ||
      (latestSystem && latestSystem > previousState.latestSystem) ||
      (parcel && !previousState.parcel && !latestParcel) ||
      (system && !previousState.system && !latestSystem) ||
      newFriendRequest
    );
    if (hasNewEvent) playPdaSound();
    previousState=next;
    notificationReady=true;
    window.__pdaNotificationPollBusy = false;
  }

  function itemNameFromIcon(img) {
    if (img.dataset.itemInfo) return img.dataset.itemInfo;
    const cell = img.closest('[data-trade-name],.slot,.belt-slot,.quick-slot,.shop-item');
    if (!cell) return '';
    if (cell.dataset?.tradeName) return cell.dataset.tradeName;
    const title = cell.getAttribute('title') || '';
    if (/^(?:Забрать|Положить):\s*/.test(title)) return title.replace(/^(?:Забрать|Положить):\s*/,'');
    if (title) return title.replace(/\s+x\d+$/i,'').trim();
    const onclick = cell.getAttribute('onclick') || '';
    let m = onclick.match(/openItemActions\((['"])(.*?)\1/);
    if (m) return m[2].replace(/\\'/g,"'");
    const artGrid = cell.closest('#artifactSlotsGrid');
    if (artGrid && typeof player === 'object') {
      const idx=[...artGrid.children].indexOf(cell); return player.artifactSlots?.[idx] || '';
    }
    const quickGrid = cell.closest('#quickSlotsGrid');
    if (quickGrid && typeof player === 'object') {
      const idx=[...quickGrid.children].indexOf(cell);
      if (idx===0) return player.weapon?.name || '';
      if (idx===1) return player.armor?.name || '';
      if (idx===2) return player.detector?.name || '';
      return player.quickSlots?.[idx-3] || '';
    }
    if (cell.id==='raidEquipWeapon') return player.weapon?.name || '';
    if (cell.id==='raidEquipArmor') return player.armor?.name || '';
    if (cell.id==='raidEquipDetector') return player.detector?.name || '';
    const src = decodeURIComponent(String(img.currentSrc || img.src || ''));
    const candidates = new Set([
      ...Object.keys(typeof player==='object' && player?.inventory || {}),
      ...(typeof weapons!=='undefined' ? weapons.map(x=>x.name) : []),
      ...(typeof armorItems!=='undefined' ? armorItems.map(x=>x.name) : []),
      ...(typeof detectors!=='undefined' ? detectors.map(x=>x.name) : []),
      ...(typeof consumables!=='undefined' ? consumables.map(x=>x.name) : []),
      ...(typeof artifacts!=='undefined' ? artifacts.map(x=>x.name) : []),
      ...(typeof mutants!=='undefined' ? mutants.map(x=>x.loot).filter(Boolean) : [])
    ]);
    for (const candidate of candidates) {
      try {
        const icon = typeof getItemIcon==='function' ? getItemIcon(candidate) : null;
        if (icon && (src.includes(icon) || src.includes(encodeURIComponent(icon)))) return candidate;
      } catch (_) {}
    }
    return '';
  }

  document.addEventListener('click', event => {
    // Tap the actual item icon for information; tapping the surrounding trade cell keeps stage/remove behavior.
    const img = event.target.closest?.('img');
    if (img && !img.closest('#tradeMenu,.trader-portrait-screen,.bunker-menu')) {
      const name = itemNameFromIcon(img);
      if (name && typeof showItemInfoModal === 'function') {
        event.preventDefault(); event.stopImmediatePropagation();
        showItemInfoModal(name);
        return;
      }
    }

    // Back from Diesel's upgrade-only screen returns to Diesel portrait.
    const techBack = event.target.closest?.('#technicianScreen[data-diesel-upgrade-only="true"] .back-btn');
    if (techBack) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.getElementById('technicianScreen')?.removeAttribute('data-diesel-upgrade-only');
      window.TraderHubs?.openDiesel?.();
      return;
    }

    // Chat opened from a raid returns to that raid.
    const chatBack = event.target.closest?.('#chatBackToKpkBtn');
    if (chatBack && window.__chatOpenedFromRaid && typeof raidActive !== 'undefined' && raidActive) {
      event.preventDefault(); event.stopImmediatePropagation();
      window.__chatOpenedFromRaid=false;
      if (typeof returnToRaid === 'function') returnToRaid();
    }
  }, true);

  function installRaidUtilityRow() {
    const raid = document.getElementById('raidScreen');
    if (!raid || document.getElementById('raidUtilityButtons')) return;
    const backpack = raid.querySelector('button[onclick="openBackpackFromRaid()"]');
    if (!backpack) return;
    const row=document.createElement('div'); row.id='raidUtilityButtons';
    backpack.parentNode.insertBefore(row,backpack);
    row.append(backpack);
    const telegram=document.createElement('button');
    telegram.type='button'; telegram.id='raidTelegramBtn'; telegram.textContent='Телеграммка';
    telegram.className=backpack.className;
    telegram.style.cssText=backpack.style.cssText;
    telegram.addEventListener('click',()=>{ window.__chatOpenedFromRaid=true; if(typeof openScreen==='function') openScreen('chat'); });
    row.append(telegram);
  }

  function install() {
    installRaidUtilityRow();
    renderBadges(previousState);
    checkPdaNotifications();
    setInterval(checkPdaNotifications,POLL_MS);
    const tech=document.getElementById('technicianScreen');
    if (tech) new MutationObserver(()=>{ if(!tech.classList.contains('active')) tech.removeAttribute('data-diesel-upgrade-only'); }).observe(tech,{attributes:true,attributeFilter:['class']});
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.PdaNotifications = Object.freeze({check:checkPdaNotifications,play:playPdaSound});
})();
