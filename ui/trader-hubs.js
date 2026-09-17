/* Full-resolution portrait entry screens for NPC traders. Trading stays in TradeMenu. */
(() => {
  'use strict';
  if (window.TraderHubs || !window.TradeMenu || typeof window.openScreen !== 'function') return;

  const nativeOpenScreen = window.openScreen;
  // Full 864x1536 WebP portraits, split only to keep repository text uploads reliable.
  const portraitParts = Object.freeze({zhuchara: 3, leonov: 4, diesel: 4});
  const portraitPromises = new Map();
  const portraitLocks = new WeakMap();
  let zhucharaHub = null;
  let dieselHub = null;

  const say = text => {
    if (typeof showGameAlert === 'function') showGameAlert(text);
  };

  function portraitData(key) {
    if (portraitPromises.has(key)) return portraitPromises.get(key);
    const total = portraitParts[key];
    if (!total) return Promise.reject(new Error('Unknown portrait: ' + key));
    const promise = Promise.all(Array.from({length: total}, (_, i) => {
      const part = String(i).padStart(2, '0');
      return fetch(`ui/portraits/${key}-${part}.b64?v=20260918-hd2`, {cache: 'force-cache'}).then(r => {
        if (!r.ok) throw new Error(`${key} portrait chunk ${part}: HTTP ${r.status}`);
        return r.text();
      });
    })).then(parts => 'data:image/webp;base64,' + parts.join('').replace(/\s+/g, ''))
      .catch(err => {
        // A temporary network/cache failure must not permanently poison this portrait.
        portraitPromises.delete(key);
        throw err;
      });
    portraitPromises.set(key, promise);
    return promise;
  }

  function bindPortrait(key, img) {
    if (!img) return Promise.resolve(false);
    const current = portraitLocks.get(img);
    if (current?.key === key) return current.promise;
    const promise = portraitData(key).then(src => {
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
      img.dataset.portraitQuality = 'hd-864x1536-q90';
      return img.decode?.().catch(() => {})?.then(() => true) ?? true;
    }).catch(err => {
      portraitLocks.delete(img);
      console.error(`[${key} portrait]`, err);
      img.alt = 'Изображение торговца не загрузилось';
      return false;
    });
    portraitLocks.set(img, {key, promise});
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
      id: 'zhucharaHubScreen', label: 'Торговец Жучара', key: 'zhuchara',
      actions: [
        {id:'trade', label:'Торговля'},
        {id:'talk', label:'Говорить'},
        {id:'back', label:'Назад'}
      ]
    });
    zhucharaHub.addEventListener('click', event => {
      const button = event.target.closest('[data-trader-action]');
      if (!button) return;
      const action = button.dataset.traderAction;
      if (action === 'trade') { hideZhuchara(); window.TradeMenu.open('zhuchara'); }
      else if (action === 'talk') say('Жучара: В Зоне нет ненужного хлама. Есть лишь не та цена…');
      else if (action === 'back') { hideZhuchara(); nativeOpenScreen('main'); }
    });
    return zhucharaHub;
  }

  function ensureDieselHub() {
    if (dieselHub) return dieselHub;
    dieselHub = createPortraitHub({
      id: 'dieselHubScreen', label: 'Техник Дизель', key: 'diesel',
      actions: [
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
        nativeOpenScreen('technician');
        if (typeof window.openTechnicianTab === 'function') window.openTechnicianTab('upgrade');
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
    version: '1.1.1',
    openZhuchara, hideZhuchara,
    openDiesel, hideDiesel,
    decorateLeonov,
    bindPortrait
  });
})();
