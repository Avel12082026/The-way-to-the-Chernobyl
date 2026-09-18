/* 2026-09-18 UX corrections: item info, notifications, modal stacking and raid utilities. */
(() => {
  'use strict';
  if (window.GameUxFixes) return;

  const types = ['personal','parcel','system'];
  const state = {personal:false, parcel:false, system:false};
  let latestSystemAt = 0;
  let parcelBaseline = null;
  let dmInitialized = false;
  let dmLastNotifiedAt = 0;
  let systemInitialized = false;
  let parcelInitialized = false;
  let chatOpenedFromRaid = false;
  let audio = null;
  let audioPromise = null;

  const getId = () => {
    try { return String(typeof getPlayerId === 'function' ? getPlayerId() : (window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '')); }
    catch (_) { return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || ''); }
  };
  const seenDm = () => {
    try { return JSON.parse(localStorage.getItem('dmSeenTimes') || '{}'); } catch (_) { return {}; }
  };
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;

  function ensureBadgeHost(el) {
    if (!el) return;
    el.classList.add('pda-notify-host');
    let box = el.querySelector(':scope > .pda-notify-badges');
    if (!box) {
      box = document.createElement('span');
      box.className = 'pda-notify-badges';
      box.setAttribute('aria-hidden','true');
      for (const type of types) {
        const dot = document.createElement('i');
        dot.className = 'pda-notify-dot pda-notify-' + type;
        dot.dataset.notifyType = type;
        dot.hidden = true;
        box.append(dot);
      }
      el.append(box);
    }
  }

  function hosts() {
    return [
      document.getElementById('bunkerPda'),
      document.getElementById('kpkChatBtn'),
      document.getElementById('raidTelegramBtn')
    ].filter(Boolean);
  }

  function renderBadges() {
    for (const host of hosts()) {
      ensureBadgeHost(host);
      for (const type of types) {
        const dot = host.querySelector('[data-notify-type="'+type+'"]');
        if (dot) dot.hidden = !state[type];
      }
      const active = types.filter(t => state[t]);
      const base = host.dataset.baseAriaLabel || host.getAttribute('aria-label') || host.textContent.trim();
      if (!host.dataset.baseAriaLabel) host.dataset.baseAriaLabel = base;
      host.setAttribute('aria-label', active.length ? base + '. Есть новые уведомления: ' + active.join(', ') : base);
    }
  }

  function getAudio() {
    if (audio) return Promise.resolve(audio);
    if (audioPromise) return audioPromise;
    audioPromise = fetch('audio/pda-notification.mp3.b64?v=20260918')
      .then(r => { if (!r.ok) throw new Error('PDA sound HTTP '+r.status); return r.text(); })
      .then(b64 => {
        audio = new Audio('data:audio/mpeg;base64,' + b64.replace(/\s+/g,''));
        audio.preload = 'auto';
        audio.volume = 0.8;
        return audio;
      })
      .catch(err => { console.warn('[PDA notification sound]', err); return null; });
    return audioPromise;
  }

  function playNotification() {
    getAudio().then(a => {
      if (!a) return;
      try { a.currentTime = 0; a.play().catch(() => {}); } catch (_) {}
    });
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch (_) {}
  }

  function setFlag(type, value, play = false) {
    if (!types.includes(type)) return;
    const before = state[type];
    state[type] = !!value;
    renderBadges();
    if (play && !before && state[type]) playNotification();
  }

  function newestUnreadDm(list) {
    const myId = getId();
    const map = seenDm();
    let newest = 0;
    for (const c of list || []) {
      const when = Number(c.lastMessageAt) || Date.parse(c.lastMessageAt) || 0;
      const seen = Number(map[String(c.playerId)]) || 0;
      if (when > seen && String(c.lastSenderId) !== myId) newest = Math.max(newest, when);
    }
    return newest;
  }

  async function pollDm() {
    if (!window.SERVER_URL && typeof SERVER_URL === 'undefined') return;
    if (!window.Telegram?.WebApp?.initData) return;
    try {
      const base = typeof SERVER_URL !== 'undefined' ? SERVER_URL : window.SERVER_URL;
      const r = await fetch(base + '/api/chat/dm/conversations', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({initData:window.Telegram.WebApp.initData})
      });
      const list = await r.json();
      const newest = newestUnreadDm(list);
      if (!dmInitialized) {
        dmInitialized = true;
        dmLastNotifiedAt = newest;
        setFlag('personal', newest > 0, false);
        return;
      }
      if (newest > dmLastNotifiedAt) {
        dmLastNotifiedAt = newest;
        setFlag('personal', true, false);
        playNotification();
      } else {
        setFlag('personal', newest > 0, false);
      }
    } catch (_) {}
  }

  async function pollSystem() {
    try {
      const base = typeof SERVER_URL !== 'undefined' ? SERVER_URL : window.SERVER_URL;
      if (!base) return;
      const r = await fetch(base + '/api/chat/general?_=' + Date.now(), {cache:'no-store'});
      const list = await r.json();
      const systems = (Array.isArray(list) ? list : []).filter(m => m && m.isSystem);
      const newest = systems.reduce((v,m) => Math.max(v, Number(m.createdAt)||Date.parse(m.createdAt)||0), 0);
      if (!systemInitialized) {
        systemInitialized = true;
        latestSystemAt = newest;
        const seen = Number(localStorage.getItem('pdaSystemSeenAt')||0);
        setFlag('system', newest > seen && seen > 0, false);
        if (!seen && newest) localStorage.setItem('pdaSystemSeenAt', String(newest));
        return;
      }
      const seen = Number(localStorage.getItem('pdaSystemSeenAt')||0);
      if (newest > latestSystemAt) {
        latestSystemAt = newest;
        setFlag('system', newest > seen, false);
        playNotification();
      } else {
        setFlag('system', newest > seen, false);
      }
    } catch (_) {}
  }

  function snapPlayer(p) {
    const inventory = {};
    for (const [k,v] of Object.entries(p?.inventory || {})) inventory[k] = num(v);
    return {coins:num(p?.coins), breedCredits:num(p?.breedCredits), inventory};
  }
  function hasPositiveDelta(next, prev) {
    if (!prev) return false;
    if (next.coins > prev.coins || next.breedCredits > prev.breedCredits) return true;
    return Object.keys(next.inventory).some(k => next.inventory[k] > num(prev.inventory[k]));
  }
  function hasRemoteAhead(next) {
    const local = snapPlayer(window.player || (typeof player !== 'undefined' ? player : {}));
    return hasPositiveDelta(next, local);
  }

  async function pollParcel() {
    try {
      const base = typeof SERVER_URL !== 'undefined' ? SERVER_URL : window.SERVER_URL;
      const initData = window.Telegram?.WebApp?.initData;
      if (!base || !initData) return;
      const r = await fetch(base + '/api/player/private', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({initData})
      });
      const data = await r.json();
      if (!data || typeof data !== 'object') return;
      const next = snapPlayer(data);
      if (!parcelInitialized) {
        parcelInitialized = true;
        parcelBaseline = next;
        return;
      }
      if (hasPositiveDelta(next, parcelBaseline) && hasRemoteAhead(next)) {
        setFlag('parcel', true, false);
        playNotification();
      }
      parcelBaseline = next;
    } catch (_) {}
  }

  function markSystemSeen() {
    if (latestSystemAt) {
      try { localStorage.setItem('pdaSystemSeenAt', String(latestSystemAt)); } catch (_) {}
      setFlag('system', false, false);
    }
  }
  function markParcelSeen() { setFlag('parcel', false, false); }

  function openRaidTelegram() {
    chatOpenedFromRaid = !!(typeof raidActive !== 'undefined' && raidActive);
    if (typeof openScreen === 'function') openScreen('chat');
    markSystemSeen();
    markParcelSeen();
  }

  function installRaidTools() {
    const raid = document.getElementById('raidScreen');
    const battle = document.getElementById('battleButtonsContainer');
    if (!raid || !battle || document.getElementById('raidUtilityButtons')) return;
    const backpack = [...raid.querySelectorAll('button')].find(b => (b.getAttribute('onclick')||'').includes('openBackpackFromRaid'));
    if (!backpack) return;
    const row = document.createElement('div');
    row.id = 'raidUtilityButtons';
    row.className = 'raid-utility-buttons';
    backpack.removeAttribute('style');
    backpack.classList.add('raid-utility-button');
    const telegram = document.createElement('button');
    telegram.id = 'raidTelegramBtn';
    telegram.type = 'button';
    telegram.className = 'raid-utility-button';
    telegram.textContent = '📱 Телеграммка';
    telegram.onclick = openRaidTelegram;
    row.append(backpack, telegram);
    battle.after(row);
    ensureBadgeHost(telegram);
    renderBadges();
  }

  function itemNameFromClick(target) {
    const drag = target.closest?.('[data-drag-item]');
    if (drag?.dataset.dragItem) return drag.dataset.dragItem;

    const card = target.closest?.('.shop-item[data-item-info-name]');
    if (card && !target.closest('button,input,select,textarea')) return card.dataset.itemInfoName;

    const artGrid = target.closest?.('#artifactSlotsGrid');
    if (artGrid) {
      const cell = target.closest('.slot');
      const idx = cell ? [...artGrid.children].indexOf(cell) : -1;
      if (idx >= 0) return (window.player || player)?.artifactSlots?.[idx] || null;
    }

    const qGrid = target.closest?.('#quickSlotsGrid');
    if (qGrid) {
      const cell = target.closest('.belt-slot,.quick-slot,.slot');
      const idx = cell ? [...qGrid.children].indexOf(cell) : -1;
      const p = window.player || player;
      if (idx === 0) return p?.weapon?.name;
      if (idx === 1) return p?.armor?.name;
      if (idx === 2) return p?.detector?.name;
      if (idx >= 3) return p?.quickSlots?.[idx-3] || null;
    }
    return null;
  }

  function decorateLegacyInfoButtons(root = document) {
    root.querySelectorAll?.('button[onclick*="showItemInfoModal("]').forEach(btn => {
      const code = btn.getAttribute('onclick') || '';
      const m = code.match(/showItemInfoModal\('((?:\\'|[^'])*)'\)/);
      if (!m) return;
      const name = m[1].replace(/\\'/g, "'");
      const card = btn.closest('.shop-item');
      if (card) card.dataset.itemInfoName = name;
      btn.classList.add('legacy-item-info-button');
    });
  }

  function installInfoClicks() {
    decorateLegacyInfoButtons();
    new MutationObserver(muts => {
      for (const m of muts) for (const node of m.addedNodes) if (node.nodeType === 1) decorateLegacyInfoButtons(node);
    }).observe(document.body,{childList:true,subtree:true});

    document.addEventListener('click', e => {
      if (e.target.closest('#tradeMenu')) return;
      const name = itemNameFromClick(e.target);
      if (!name || typeof showItemInfoModal !== 'function') return;
      if (e.target.closest('#raidScreen #quickSlots')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      showItemInfoModal(name);
    }, true);
  }

  function installModalTopLayer() {
    const lift = el => { if (el?.classList?.contains('active')) el.style.zIndex = '12000'; };
    new MutationObserver(muts => {
      for (const m of muts) if (m.target.classList?.contains('modal')) lift(m.target);
    }).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
  }

  function installBadgeTargets() {
    ensureBadgeHost(document.getElementById('bunkerPda'));
    ensureBadgeHost(document.getElementById('kpkChatBtn'));
    renderBadges();

    const dmDot = document.getElementById('dmUnreadDot');
    if (dmDot) new MutationObserver(() => setFlag('personal', getComputedStyle(dmDot).display !== 'none', false))
      .observe(dmDot,{attributes:true,attributeFilter:['style','class']});

    document.addEventListener('click', e => {
      if (e.target.closest('#kpkChatBtn,#raidTelegramBtn')) {
        markSystemSeen();
        markParcelSeen();
      }
    }, true);
  }

  function installRaidChatBack() {
    document.addEventListener('click', e => {
      const back = e.target.closest?.('#chatBackToKpkBtn');
      if (!back || !chatOpenedFromRaid || !(typeof raidActive !== 'undefined' && raidActive)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      chatOpenedFromRaid = false;
      openScreen('raid');
    }, true);
  }

  function init() {
    installModalTopLayer();
    installInfoClicks();
    installRaidTools();
    installBadgeTargets();
    installRaidChatBack();
    getAudio();
    pollDm(); pollSystem(); pollParcel();
    setInterval(pollDm, 10000);
    setInterval(pollSystem, 15000);
    setInterval(pollParcel, 15000);
  }

  window.GameUxFixes = Object.freeze({
    version:'1.0.0',
    refreshBadges:renderBadges,
    openRaidTelegram,
    pollDm, pollSystem, pollParcel
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();