/* Presentation + guarded calls to the original server-authoritative game actions. */
(() => {
  'use strict';

  const main = document.getElementById('mainMenu');
  const scene = document.getElementById('bunkerScene');
  if (!main || !scene) return;
  const art = document.getElementById('bunkerArtwork');

  let enteringRaid = false;
  let readingBook = false;
  let frame = 0;
  let leonovScreen = null;
  let leonovImageLoaded = false;
  let smokerScreen = null;
  let smokerImageLoaded = false;

  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const text = (id, value) => {
    const el = document.getElementById(id);
    const next = String(value);
    if (el && el.textContent !== next) el.textContent = next;
  };

  function meter(id, value, max, label) {
    const el = document.getElementById(id);
    if (!el) return;
    max = Math.max(1, finite(max, 100));
    value = Math.max(0, finite(value));
    const width = clamp(value / max * 100, 0, 100) + '%';
    const fill = el.querySelector('.bunker-vital-fill, .bunker-progress-fill');
    if (fill && fill.style.width !== width) fill.style.width = width;
    el.setAttribute('aria-valuemax', String(max));
    el.setAttribute('aria-valuenow', String(clamp(value, 0, max)));
    el.setAttribute('aria-valuetext', `${label}: ${Math.round(value)} / ${Math.round(max)}`);
    el.title = `${label}: ${Math.round(value)} / ${Math.round(max)}`;
  }

  function refresh() {
    if (typeof player !== 'object' || !player) return;
    for (const [key, label] of [['health', 'Здоровье'], ['hunger', 'Сытость'], ['thirst', 'Жажда']]) {
      const name = key[0].toUpperCase() + key.slice(1);
      const max = Math.max(1, finite(player['max' + name], 100));
      meter('bunker' + name, player[key], max, label);
      text(key, Math.round(Math.max(0, finite(player[key]))));
      text('bunker' + name + 'Max', ' / ' + Math.round(max));
    }
    const need = Math.max(1, finite(expNeededForLevel(player.level), 1));
    const exp = Math.max(0, Math.floor(finite(player.exp)));
    const radiation = clamp(finite(player.radiation), 0, 100);
    meter('bunkerExperience', exp, need, 'Опыт');
    meter('bunkerRadiation', radiation, 100, 'Радиация');
    text('bunkerExperienceText', `Опыт: ${exp} / ${need}`);
    text('bunkerRadiationText', `Радиация: ${Math.round(radiation)} / 100`);
    text('coins', Math.max(0, finite(player.coins)));
    text('breedCreditsHeader', Math.max(0, finite(player.breedCredits)));
    const books = Math.max(0, finite(player.inventory?.['Книга знаний']));
    text('knowledgeBooksHeader', books);
    const bookBtn = document.getElementById('bunkerReadBook');
    if (bookBtn) bookBtn.title = books ? `Использовать Опыт+ (осталось ${books})` : 'Опыт+ отсутствует';
    for (const el of main.querySelectorAll('.bunker-resource > span[id]')) {
      const size = Math.max(11, 21 - Math.max(0, el.textContent.length - 6) * 1.5);
      el.style.fontSize = `calc(${size} * var(--bunker-unit))`;
    }
  }

  function layout() {
    frame = 0;
    const visible = main.style.display !== 'none';
    document.body.classList.toggle('bunker-menu-visible', visible);
    if (!visible) return;
    const viewport = window.visualViewport;
    const w = viewport ? viewport.width : window.innerWidth;
    const h = viewport ? viewport.height : window.innerHeight;
    const ratio = 941 / 1672;
    const width = w <= h ? w : h * ratio;
    scene.style.width = width + 'px';
    scene.style.height = h + 'px';
    scene.style.setProperty('--bunker-unit', width / 941 + 'px');
    scene.style.setProperty('--bunker-vunit', h / 1672 + 'px');
    refresh();
  }

  function scheduleLayout() {
    if (!frame) frame = requestAnimationFrame(layout);
  }

  async function enterRaid() {
    if (enteringRaid || readingBook) return;
    enteringRaid = true;
    const btn = document.getElementById('bunkerRaid');
    if (btn) btn.disabled = true;
    try {
      await startRaid();
    } finally {
      enteringRaid = false;
      if (btn) btn.disabled = false;
      scheduleLayout();
    }
  }

  async function readBook() {
    if (readingBook || enteringRaid) return;
    readingBook = true;
    const btn = document.getElementById('bunkerReadBook');
    if (btn) btn.disabled = true;
    try {
      await useKnowledgeBookFromHeader();
    } finally {
      readingBook = false;
      if (btn) btn.disabled = false;
      refresh();
    }
  }

  function ensureSmokerScreen() {
    if (smokerScreen) return smokerScreen;
    const el = document.createElement('section');
    el.id = 'smokerHubScreen';
    el.className = 'smoker-hub-screen';
    el.setAttribute('aria-label', 'Сталкер за столом');
    el.innerHTML = `
      <img id="smokerHubBackdrop" class="smoker-hub-backdrop" alt="" aria-hidden="true" draggable="false">
      <img id="smokerHubArtwork" class="smoker-hub-artwork" alt="Сталкер сидит за столом и курит" draggable="false">
      <p id="smokerTalkBubble" class="smoker-talk-bubble" role="status" hidden></p>
      <nav class="smoker-actions" aria-label="Действия со сталкером">
        <button type="button" data-smoker-action="talk">Говорить</button>
        <button type="button" data-smoker-action="back">Назад</button>
      </nav>`;
    document.body.appendChild(el);
    smokerScreen = el;
    el.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-smoker-action]');
      if (!btn) return;
      if (btn.dataset.smokerAction === 'back') return closeSmoker();
      if (btn.dataset.smokerAction === 'talk') talkSmoker();
    });
    if (!smokerImageLoaded) {
      smokerImageLoaded = true;
      fetch('ui/smoker-portrait.webp.b64?v=0325614230e4')
        .then(response => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        })
        .then(b64 => {
          const src = 'data:image/webp;base64,' + b64.trim();
          const image = document.getElementById('smokerHubArtwork');
          const backdrop = document.getElementById('smokerHubBackdrop');
          if (image) image.src = src;
          if (backdrop) backdrop.src = src;
        })
        .catch(() => {
          const image = document.getElementById('smokerHubArtwork');
          if (image) image.alt = 'Не удалось загрузить изображение сталкера';
        });
    }
    return el;
  }

  function openSmoker() {
    const el = ensureSmokerScreen();
    const bubble = document.getElementById('smokerTalkBubble');
    if (bubble) bubble.hidden = true;
    el.classList.add('active');
    document.body.classList.add('smoker-hub-visible');
  }

  function closeSmoker() {
    if (smokerScreen) smokerScreen.classList.remove('active');
    document.body.classList.remove('smoker-hub-visible');
    const bubble = document.getElementById('smokerTalkBubble');
    if (bubble) bubble.hidden = true;
    if (typeof openScreen === 'function') openScreen('main');
  }

  function talkSmoker() {
    const bubble = document.getElementById('smokerTalkBubble');
    if (!bubble) return;
    bubble.textContent = 'Сталкер затягивается сигаретой: «Ну, говори. Я слушаю.»';
    bubble.hidden = false;
  }

  function ensureLeonovScreen() {
    if (leonovScreen) return leonovScreen;
    const el = document.createElement('section');
    el.id = 'leonovHubScreen';
    el.className = 'leonov-hub-screen';
    el.setAttribute('aria-label', 'Эколог Леонов');
    el.innerHTML = `
      <img id="leonovHubArtwork" class="leonov-hub-artwork" alt="Эколог Леонов за прилавком" draggable="false">
      <button class="leonov-back" type="button" data-leonov-action="back" aria-label="Назад">← Назад</button>
      <nav class="leonov-actions" aria-label="Действия у Леонова">
        <button type="button" data-leonov-action="selection">Селекция</button>
        <button type="button" data-leonov-action="trade">Торговля</button>
      </nav>`;
    document.body.appendChild(el);
    leonovScreen = el;
    el.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-leonov-action]');
      if (!btn) return;
      const action = btn.dataset.leonovAction;
      if (action === 'back') return closeLeonov();
      if (action === 'selection' || action === 'trade') openScientistAction(action);
    });
    if (!leonovImageLoaded) {
      leonovImageLoaded = true;
      fetch('ui/leonov-portrait.webp.b64?v=20260918')
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(b64 => {
          const image = document.getElementById('leonovHubArtwork');
          if (image) image.src = 'data:image/webp;base64,' + b64.trim();
        })
        .catch(() => {
          const image = document.getElementById('leonovHubArtwork');
          if (image) image.alt = 'Не удалось загрузить изображение Леонова';
        });
    }
    return el;
  }

  function openLeonov() {
    const el = ensureLeonovScreen();
    el.classList.add('active');
    document.body.classList.add('leonov-hub-visible');
  }

  function closeLeonov() {
    if (leonovScreen) leonovScreen.classList.remove('active');
    document.body.classList.remove('leonov-hub-visible');
    if (typeof openScreen === 'function') openScreen('main');
  }

  function openScientistAction(mode) {
    if (!scientistWorkspace) return;
    if (leonovScreen) leonovScreen.classList.remove('active');
    document.body.classList.remove('leonov-hub-visible');
    scientistWorkspace.open(mode);
  }

  // Leonov has two exclusive workspaces. Original nodes and handlers are moved,
  // not cloned, so all inventory/trading/breeding transactions remain server-authoritative.
  function createLeonovWorkspace() {
    const root = document.getElementById('scientistsScreen');
    const actions = root?.querySelector('.zr-breed-actions');
    const breed = actions?.querySelector('[onclick="doBreedArtifacts()"]');
    const buy = actions?.querySelector('[onclick="openScientistsBuyView()"]');
    const sell = actions?.querySelector('[onclick="openScientistsSellView()"]');
    const first = document.getElementById('breedSlot1Label')?.closest('.slot');
    const second = document.getElementById('breedSlot2Label')?.closest('.slot');
    if (!root || !actions || !breed || !buy || !sell || !first || !second) return null;

    const nativeOpen = window.openScreen;
    const nativeRender = window.renderScientists;
    const nativeBreed = window.doBreedArtifacts;
    const nativeExit = window.exitScientists;
    const nativeBuy = window.openScientistsBuyView;
    const nativeSell = window.openScientistsSellView;
    if (![nativeOpen, nativeRender, nativeBreed, nativeExit, nativeBuy, nativeSell].every(fn => typeof fn === 'function')) return null;

    let mode = 'hub';
    let activeSlot = 1;
    let busy = false;
    let gesture = null;
    let ghost = null;
    let dragFrame = 0;
    let suppressUntil = 0;

    const selection = document.createElement('section');
    selection.id = 'leonovSelectionPanel';
    selection.setAttribute('aria-label', 'Селекция артефактов');
    const trade = document.createElement('section');
    trade.id = 'leonovTradePanel';
    trade.setAttribute('aria-label', 'Торговля у Леонова');

    const slots = first.parentElement;
    const description = slots.previousElementSibling;
    const resultInfo = document.getElementById('breedResultInfo');
    if (!description || !resultInfo) return null;
    const placeTitle = document.createElement('h3');
    placeTitle.className = 'leonov-place-title';
    placeTitle.textContent = 'ПОЛОЖИТЬ';
    description.classList.add('leonov-selection-description');
    description.textContent = '2 артефакта превращаются в 1, который объединяет их свойства';

    root.insertBefore(selection, description);
    selection.append(placeTitle, slots, description, resultInfo, actions);

    const tradeActions = document.createElement('div');
    tradeActions.className = 'leonov-trade-actions';
    tradeActions.append(buy, sell);
    const buyList = document.getElementById('scientistsBuyList');
    const sellList = document.getElementById('scientistsSellList');
    if (!buyList || !sellList) return null;
    trade.append(tradeActions, buyList, sellList);
    selection.after(trade);

    breed.id = 'leonovBreedButton';
    buy.id = 'leonovBuyButton';
    sell.id = 'leonovSellButton';
    breed.textContent = 'Селекционировать';
    buy.textContent = 'Купить';
    sell.textContent = 'Продать';

    const hint = document.createElement('p');
    hint.id = 'leonovDragHint';
    hint.setAttribute('role', 'status');
    const inventoryTitle = document.createElement('h4');
    inventoryTitle.textContent = 'Инвентарь — артефакты';
    const inventory = document.createElement('div');
    inventory.id = 'leonovArtifactInventory';
    inventory.setAttribute('aria-label', 'Артефакты из рюкзака для селекции');
    selection.append(inventoryTitle, hint, inventory);

    const backButtons = [...root.querySelectorAll('.back-btn')];
    backButtons.forEach((button, i) => {
      button.hidden = i > 0;
      button.textContent = 'Назад';
    });
    const heading = root.querySelector('.zr-title');
    const hero = root.querySelector('.zr-hero');
    if (hero) hero.hidden = true;

    [first, second].forEach((slot, i) => {
      slot.dataset.leonovDrop = String(i + 1);
      slot.tabIndex = 0;
      slot.setAttribute('role', 'button');
      slot.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBreedSlotPicker(i + 1);
        }
      };
    });

    const style = document.createElement('style');
    style.id = 'leonovModesStyle';
    style.textContent = `
      #scientistsScreen [hidden]{display:none!important}
      #scientistsScreen .zr-topbar{display:flex;align-items:center;gap:8px}
      #scientistsScreen .zr-title{font-size:15px!important;white-space:normal;line-height:1.3;background:none!important}
      #scientistsScreen .zr-topbar .back-btn{width:auto;flex:0 0 auto;margin:0 0 10px!important}
      #scientistsScreen .zr-breed-actions{grid-template-columns:minmax(0,1fr)!important}
      #scientistsScreen #leonovBreedButton{width:100%;min-height:46px;font-size:13px!important}
      #scientistsScreen .leonov-place-title{margin:2px 0 8px;text-align:center;color:#e1c777;font:700 15px/1.2 'Russo One',Arial,sans-serif;letter-spacing:.7px}
      #scientistsScreen .leonov-selection-description{margin:8px 0 10px;text-align:center;color:#c7bea8;font-size:12px;line-height:1.35}
      #scientistsScreen .leonov-trade-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
      #scientistsScreen .leonov-trade-actions button{min-height:44px}
      #scientistsScreen .leonov-trade-actions [aria-pressed=true]{outline:1px solid #d3ba78}
      #leonovSelectionPanel>h4{margin-top:14px;color:#cdbd8f;font-size:13px}
      #leonovDragHint{min-height:32px;margin:6px 0;font-size:11px;color:#bbb29e}
      #leonovArtifactInventory{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
      #leonovArtifactInventory .leonov-artifact-cell{min-width:0;min-height:82px;aspect-ratio:auto;padding:4px!important;display:flex;flex-direction:column;gap:3px;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;letter-spacing:0;text-transform:none}
      #leonovArtifactInventory .leonov-artifact-cell>span{font:10px/1.15 'Segoe UI',sans-serif;overflow-wrap:anywhere}
      #leonovArtifactInventory .leonov-artifact-cell small{font-size:10px;color:#d3ba78}
      #leonovArtifactInventory .leonov-artifact-cell img{pointer-events:none;max-width:100%}
      #leonovArtifactInventory .leonov-named-artifact{box-shadow:inset 0 0 0 1px #d3ba78,0 0 8px #d3ba7833}
      #leonovArtifactInventory .leonov-empty{grid-column:1/-1;font-size:12px;color:#aaa}
      #scientistsScreen [data-leonov-drop]{min-height:90px;touch-action:manipulation}
      #scientistsScreen [data-leonov-drop]:focus-visible{outline:2px solid #e0c78d}
      #scientistsScreen .leonov-drop-ready{outline:1px dashed #bfa46a}
      #scientistsScreen .leonov-drop-over{outline:2px solid #e0c78d;background:#343526}
      .leonov-drag-ghost{position:fixed;left:0;top:0;width:66px;min-height:70px;z-index:3000;pointer-events:none;background:#171810;border:1px solid #d3ba78;border-radius:5px;padding:5px;display:flex;flex-direction:column;align-items:center;font:10px/1.1 'Segoe UI',sans-serif;opacity:.94}
      .leonov-drag-ghost img{max-width:45px;max-height:40px;object-fit:contain}
    `;
    document.head.append(style);

    const say = message => {
      hint.textContent = message || 'Удерживай артефакт и перетащи в слот 1 или 2. Нажатие на заполненный слот — убрать.';
    };
    const quantity = name => Math.max(0, Number(player.inventory?.[name]) || 0);
    const definition = name => typeof findArtifactDef === 'function' ? findArtifactDef(name) : null;
    const eligible = name => quantity(name) > 0 && !!definition(name);
    const canPlace = (name, slot) => eligible(name) && quantity(name) > ((slot === 1 ? breedSlot2 : breedSlot1) === name ? 1 : 0);
    const isSelection = () => mode === 'selection' && root.classList.contains('active');
    const hasValidPair = () => !!breedSlot1 && !!breedSlot2 && eligible(breedSlot1) && eligible(breedSlot2) && (breedSlot1 !== breedSlot2 || quantity(breedSlot1) >= 2);

    function syncBreedButton() {
      const ready = hasValidPair();
      breed.hidden = !ready && !busy;
      breed.disabled = busy || !ready;
      breed.textContent = busy ? 'Селекция…' : 'Селекционировать';
      breed.setAttribute('aria-hidden', String(!ready && !busy));
    }

    function setBusy(value) {
      busy = value;
      selection.setAttribute('aria-busy', String(value));
      backButtons.forEach(button => { button.disabled = value; });
      syncBreedButton();
    }

    function artifactNames() {
      return Object.keys(player.inventory || {}).filter(eligible).sort((a, b) => {
        const aNamed = !!definition(a)?.isNamedArtifact;
        const bNamed = !!definition(b)?.isNamedArtifact;
        if (aNamed !== bNamed) return aNamed ? -1 : 1;
        return a.localeCompare(b, 'ru');
      });
    }

    function refreshInventory() {
      if (breedSlot1 && !eligible(breedSlot1)) breedSlot1 = null;
      if (breedSlot2 && (!eligible(breedSlot2) || (breedSlot2 === breedSlot1 && quantity(breedSlot2) < 2))) breedSlot2 = null;
      nativeRender();
      const fragment = document.createDocumentFragment();
      for (const name of artifactNames()) {
        const def = definition(name);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'slot leonov-artifact-cell' + (def?.isNamedArtifact ? ' leonov-named-artifact' : '');
        cell.dataset.leonovItem = name;
        cell.innerHTML = itemIconHtml(name, 34);
        cell.querySelectorAll('img').forEach(img => { img.draggable = false; });
        const label = document.createElement('span');
        label.textContent = name;
        const count = document.createElement('small');
        const selected = Number(breedSlot1 === name) + Number(breedSlot2 === name);
        count.textContent = '×' + quantity(name) + (selected ? ' · в слотах: ' + selected : '');
        cell.setAttribute('aria-label', name + ', в рюкзаке ' + quantity(name) + (def?.isNamedArtifact ? ', именной артефакт' : ''));
        cell.append(label, count);
        fragment.append(cell);
      }
      if (!fragment.childNodes.length) {
        const empty = document.createElement('p');
        empty.className = 'leonov-empty';
        empty.textContent = 'В рюкзаке нет артефактов, доступных для селекции.';
        fragment.append(empty);
      }
      inventory.replaceChildren(fragment);
      first.setAttribute('aria-label', 'Слот 1: ' + (breedSlot1 || 'Пусто'));
      second.setAttribute('aria-label', 'Слот 2: ' + (breedSlot2 || 'Пусто'));
      syncBreedButton();
    }

    function place(name, slot) {
      if (!isSelection() || busy) return;
      if (!canPlace(name, slot)) {
        say('Для двух одинаковых артефактов нужны два экземпляра в рюкзаке.');
        return;
      }
      if (slot === 1) breedSlot1 = name;
      else breedSlot2 = name;
      activeSlot = slot === 1 ? 2 : 1;
      refreshInventory();
      say('Артефакт помещён в слот ' + slot + '.');
    }

    function cleanup() {
      if (gesture) clearTimeout(gesture.timer);
      cancelAnimationFrame(dragFrame);
      ghost?.remove();
      ghost = null;
      gesture = null;
      [first, second].forEach(slot => slot.classList.remove('leonov-drop-ready', 'leonov-drop-over'));
    }

    const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('#leonovSelectionPanel [data-leonov-drop]');

    function paint() {
      if (!gesture?.active) return;
      if (!isSelection()) {
        cleanup();
        return;
      }
      const g = gesture;
      ghost.style.transform = `translate(${g.x - 33}px,${g.y - 85}px)`;
      const target = targetAt(g.x, g.y);
      [first, second].forEach(slot => {
        const allowed = canPlace(g.name, Number(slot.dataset.leonovDrop));
        slot.classList.toggle('leonov-drop-ready', !!allowed);
        slot.classList.toggle('leonov-drop-over', !!allowed && slot === target);
      });
      const box = root.getBoundingClientRect();
      if (g.y < box.top + 45) root.scrollTop -= 9;
      else if (g.y > box.bottom - 45) root.scrollTop += 9;
      dragFrame = requestAnimationFrame(paint);
    }

    function beginDrag() {
      if (!gesture || gesture.scrolling || busy || !isSelection()) return;
      gesture.active = true;
      ghost = document.createElement('div');
      ghost.className = 'leonov-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.innerHTML = gesture.source.innerHTML;
      document.body.append(ghost);
      paint();
    }

    inventory.addEventListener('pointerdown', e => {
      const source = e.target.closest('[data-leonov-item]');
      if (!source || busy || gesture || !isSelection() || e.button !== 0 || e.isPrimary === false) return;
      gesture = {
        id: e.pointerId,
        source,
        name: source.dataset.leonovItem,
        touch: e.pointerType === 'touch',
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        active: false
      };
      if (gesture.touch) gesture.timer = setTimeout(beginDrag, 220);
    });

    document.addEventListener('pointermove', e => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      g.x = e.clientX;
      g.y = e.clientY;
      if (!g.active && Math.hypot(g.x - g.startX, g.y - g.startY) > 8) {
        if (g.touch) {
          clearTimeout(g.timer);
          g.scrolling = true;
        } else {
          beginDrag();
        }
      }
      if (g.scrolling) {
        root.scrollTop += g.lastY - g.y;
        suppressUntil = Date.now() + 500;
      }
      g.lastY = g.y;
      if (g.active || g.scrolling) e.preventDefault();
    }, {passive: false});

    document.addEventListener('pointerup', e => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      const target = g.active ? targetAt(e.clientX, e.clientY) : null;
      cleanup();
      if (g.active) {
        suppressUntil = Date.now() + 500;
        if (target) place(g.name, Number(target.dataset.leonovDrop));
        else say('Перетаскивание отменено.');
      }
    });

    document.addEventListener('pointercancel', cleanup);
    window.addEventListener('blur', cleanup);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cleanup(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(); });
    document.addEventListener('click', e => {
      if (root.contains(e.target) && (busy || Date.now() < suppressUntil)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    inventory.addEventListener('click', e => {
      const item = e.target.closest('[data-leonov-item]');
      if (!item) return;
      place(item.dataset.leonovItem, activeSlot);
    });
    inventory.addEventListener('dragstart', e => e.preventDefault());
    inventory.addEventListener('contextmenu', e => e.preventDefault());

    new MutationObserver(() => {
      if (!root.classList.contains('active')) cleanup();
    }).observe(root, {attributes: true, attributeFilter: ['class']});

    window.renderScientists = function() {
      if (mode === 'selection') refreshInventory();
      else nativeRender();
    };

    window.openBreedSlotPicker = function(slot) {
      if (!isSelection() || busy || (slot !== 1 && slot !== 2)) return;
      activeSlot = slot;
      if (slot === 1) breedSlot1 = null;
      else breedSlot2 = null;
      refreshInventory();
      say('Перетащи артефакт в слот ' + slot + ' или нажми на него в инвентаре.');
    };

    window.doBreedArtifacts = async function() {
      if (!isSelection() || busy || !hasValidPair()) return;
      cleanup();
      setBusy(true);
      try {
        await nativeBreed();
      } finally {
        setBusy(false);
        if (mode === 'selection') refreshInventory();
      }
    };

    window.openScientistsBuyView = function() {
      if (mode !== 'trade') return;
      buy.setAttribute('aria-pressed', 'true');
      sell.setAttribute('aria-pressed', 'false');
      return nativeBuy();
    };

    window.openScientistsSellView = function() {
      if (mode !== 'trade') return;
      buy.setAttribute('aria-pressed', 'false');
      sell.setAttribute('aria-pressed', 'true');
      return nativeSell();
    };

    window.exitScientists = function() {
      if (busy) return;
      cleanup();
      mode = 'hub';
      nativeExit();
      openLeonov();
    };

    // Any legacy entry to the scientist screen now lands on the two-choice Leonov hub.
    window.openScreen = function(screen) {
      if (screen === 'scientists') {
        if (busy) return;
        cleanup();
        nativeOpen('main');
        return openLeonov();
      }
      cleanup();
      return nativeOpen.apply(this, arguments);
    };

    selection.hidden = true;
    trade.hidden = true;
    say();
    syncBreedButton();

    return {
      open(nextMode) {
        if (busy || !['selection', 'trade'].includes(nextMode)) return;
        cleanup();
        mode = nextMode;
        root.dataset.leonovMode = mode;
        selection.hidden = mode !== 'selection';
        trade.hidden = mode !== 'trade';
        if (heading) heading.textContent = mode === 'selection' ? 'СЕЛЕКЦИЯ АРТЕФАКТОВ' : 'ТОРГОВЛЯ У ЛЕОНОВА';
        buyList.replaceChildren();
        sellList.replaceChildren();
        buy.setAttribute('aria-pressed', 'false');
        sell.setAttribute('aria-pressed', 'false');
        activeSlot = !breedSlot1 ? 1 : !breedSlot2 ? 2 : 1;
        nativeOpen('scientists');
        root.scrollTop = 0;
        if (mode === 'selection') refreshInventory();
        say();
      }
    };
  }

  const scientistWorkspace = createLeonovWorkspace();
  const leonovHotspot = document.getElementById('bunkerLeonov');
  if (leonovHotspot) {
    leonovHotspot.onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openLeonov();
    };
  }

  new MutationObserver(scheduleLayout).observe(main, {attributes: true, attributeFilter: ['style']});
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', scheduleLayout);
  art.addEventListener('load', scheduleLayout);
  art.addEventListener('error', () => {
    const el = document.getElementById('bunkerMessage');
    if (el) {
      el.textContent = 'Не удалось загрузить фон. Проверьте соединение и откройте игру заново.';
      el.hidden = false;
    }
  });

  window.BunkerMenu = {version: '1.4.0', refresh, enterRaid, readBook, openLeonov, closeLeonov, openSmoker, closeSmoker, talkSmoker};
  layout();
})();
