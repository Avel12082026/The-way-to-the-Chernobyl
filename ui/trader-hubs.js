/* Portrait entry screens for NPC traders. Keep trading itself in TradeMenu. */
(() => {
  'use strict';
  if (window.TraderHubs || !window.TradeMenu || typeof window.openScreen !== 'function') return;

  const nativeOpenScreen = window.openScreen;
  let zhucharaHub = null;
  let zhucharaImagePromise = null;

  const say = text => {
    if (typeof showGameAlert === 'function') showGameAlert(text);
  };

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

  function loadZhucharaImage(img) {
    if (img.src) return Promise.resolve();
    if (!zhucharaImagePromise) {
      zhucharaImagePromise = fetch('ui/zhuchara-portrait.webp.b64?v=20260918').then(r => {
        if (!r.ok) throw new Error('Zhuchara portrait HTTP ' + r.status);
        return r.text();
      }).then(b64 => b64.replace(/\s+/g, ''));
    }
    return zhucharaImagePromise.then(b64 => {
      img.src = 'data:image/webp;base64,' + b64;
    }).catch(err => {
      console.error('[Zhuchara portrait]', err);
      img.alt = 'Изображение Жучары не загрузилось';
    });
  }

  function ensureZhucharaHub() {
    if (zhucharaHub) return zhucharaHub;
    const hub = document.createElement('section');
    hub.id = 'zhucharaHubScreen';
    hub.className = 'trader-portrait-screen';
    hub.hidden = true;
    hub.setAttribute('aria-label', 'Торговец Жучара');
    hub.innerHTML = `
      <img id="zhucharaHubArtwork" class="trader-portrait-artwork" alt="Торговец Жучара за прилавком" draggable="false">
      <nav class="trader-portrait-actions" aria-label="Действия у Жучары">
        <button type="button" data-zhuchara-action="trade">Торговля</button>
        <button type="button" data-zhuchara-action="talk">Говорить</button>
        <button type="button" data-zhuchara-action="back">Назад</button>
      </nav>`;
    document.body.append(hub);
    zhucharaHub = hub;
    hub.addEventListener('click', event => {
      const button = event.target.closest('[data-zhuchara-action]');
      if (!button) return;
      const action = button.dataset.zhucharaAction;
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
    loadZhucharaImage(hub.querySelector('#zhucharaHubArtwork'));
    return hub;
  }

  function hideZhuchara() {
    if (!zhucharaHub) return;
    zhucharaHub.hidden = true;
    zhucharaHub.classList.remove('active');
    document.body.classList.remove('trader-portrait-visible');
  }

  function openZhuchara() {
    const hub = ensureZhucharaHub();
    // Keep the regular main menu underneath the fixed portrait screen.
    nativeOpenScreen('main');
    hub.hidden = false;
    hub.classList.add('active');
    document.body.classList.add('trader-portrait-visible');
    loadZhucharaImage(hub.querySelector('#zhucharaHubArtwork'));
    return hub;
  }

  window.openScreen = function(screen) {
    if (screen === 'shop') return openZhuchara();
    if (zhucharaHub && !zhucharaHub.hidden) hideZhuchara();
    return nativeOpenScreen.apply(this, arguments);
  };

  window.TraderHubs = Object.freeze({
    version: '1.0.1',
    openZhuchara,
    hideZhuchara,
    decorateLeonov
  });
})();
