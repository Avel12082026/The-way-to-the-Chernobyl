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
        openDieselUpgrade();
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
  function openDiesel() {
    document.getElementById('technicianScreen')?.classList.remove('diesel-upgrade-only');
    return showHub(ensureDieselHub(), 'diesel');
  }
  function openDieselUpgrade() {
    hideDiesel();
    nativeOpenScreen('technician');
    const screen = document.getElementById('technicianScreen');
    screen?.classList.add('diesel-upgrade-only');
    if (typeof window.openTechnicianTab === 'function') window.openTechnicianTab('upgrade');
    screen?.scrollTo?.({top:0, behavior:'instant'});
    return screen;
  }

  document.addEventListener('click', event => {
    const back = event.target.closest?.('#technicianScreen.diesel-upgrade-only .back-btn');
    if (!back) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('technicianScreen')?.classList.remove('diesel-upgrade-only');
    openDiesel();
  }, true);

  window.openScreen = function(screen) {
    if (screen === 'shop') return openZhuchara();
    if (screen === 'technician') return openDiesel();
    if (zhucharaHub && !zhucharaHub.hidden) hideZhuchara();
    if (dieselHub && !dieselHub.hidden) hideDiesel();
    return nativeOpenScreen.apply(this, arguments);
  };

  window.TraderHubs = Object.freeze({
    version:'1.3.0',
    openZhuchara, hideZhuchara,
    openDiesel, hideDiesel, openDieselUpgrade,
    decorateLeonov, bindPortrait
  });
})();
