/* One staged, server-authoritative trading screen for every NPC vendor. */
(() => {
  'use strict';
  if (window.TradeMenu || typeof player !== 'object' || typeof buyFromServer !== 'function') return;
  const MAX_SLOTS = 6;
  const VISIBLE_GRID_SLOTS = 21; // 7 x 3: merchant and player show the same number of visible cells
  const queues = {buy: new Map(), sell: new Map()};
  const native = {
    openScreen: window.openScreen,
    openTechnicianTab: window.openTechnicianTab,
    closeFriendlyTrade: window.closeFriendlyTrade,
    updateUI: window.updateUI
  };
  let vendor = null, busy = false, needsSync = false, editing = null, gesture = null;
  let ghost = null, frame = 0, suppressUntil = 0, returnFocus = null, inertNodes = [];
  let stockSignature = '', bagSignature = '';
  const number = x => Number.isFinite(Number(x)) ? Number(x) : 0;
  const count = name => Math.max(0, Math.floor(number(player.inventory?.[name])));
  const money = n => Math.round(number(n)).toLocaleString('ru-RU');
  const atBase = () => !raidActive && !inventoryOpenedFromRaid && vendor !== 'friendly';
  const ownedNames = () => Object.keys(player.inventory || {}).filter(n => count(n));
  const artifact = name => findArtifactDef(name);
  const vendors = {
    zhuchara: {
      title: () => 'ТОРГОВЕЦ ЖУЧАРА',
      stock: () => getShopCatalog(),
      price: item => getBuyPrice(item.price),
      accepts: name => !artifact(name)?.isNamedArtifact,
      offer: name => ({coins: getSellPrice(name), tokens: 0})
    },
    leonov: {
      title: () => 'ЭКОЛОГ ЛЕОНОВ — ТОРГОВЛЯ',
      stock: () => [
        ...consumables.filter(c => ['medkit', 'antirad'].includes(c.type)).map(c => ({...c, category: 'consumable'})),
        ...armorItems.filter(a => a.isResearchSuit && a.tier <= getResearchSuitUnlockTier(player.level)).map(a => ({...a, category: 'armor'}))
      ],
      price: item => getBuyPrice(item.price),
      accepts: name => !!artifact(name) || mutants.some(m => m.loot === name),
      offer: name => artifact(name)?.isNamedArtifact ? {coins: 0, tokens: 50} :
        {coins: Math.round(getSellPrice(name) * (artifact(name) ? 1.35 : 1.20)), tokens: 0}
    },
    technician: {
      title: () => 'ТЕХНИК ДИЗЕЛЬ — ТОРГОВЛЯ',
      // Detectors are sold by Diesel now; use the same level gate that previously lived at Leonov.
      stock: () => detectors.filter(d => d.tier <= getDetectorUnlockTier(player.level)).map(d => ({...d, category: 'detector'})),
      price: item => getBuyPrice(item.price),
      accepts: name => !!getEquipSlotType(name),
      offer: name => ({coins: Math.round(getSellPrice(name) * (getEquipSlotType(name) === 'detector' ? 1.10 : 1.02)), tokens: 0})
    },
    friendly: {
      title: () => `${currentEnemy?.name || 'СТАЛКЕР'} — ТОРГОВЛЯ`,
      stock: () => consumables.map(c => ({...c, category: 'consumable'})),
      price: item => getFriendlyBuyPrice(item.price),
      accepts: name => !artifact(name)?.isNamedArtifact,
      offer: name => ({coins: getSellPrice(name), tokens: 0})
    }
  };
  const root = document.createElement('section');
  root.id = 'tradeMenu';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'tradeTitle');
  root.innerHTML = `
    <div class="trade-shell">
      <header class="trade-header"><h2 id="tradeTitle"></h2><button type="button" data-trade-action="back">Назад</button></header>
      <div class="trade-vitals"><span id="tradeHealth"></span><span id="tradeHunger"></span><span id="tradeThirst"></span><span id="tradeBalance"></span></div>
      <h3>Товары торговца</h3><p id="tradeStockNote" hidden></p>
      <div id="tradeStockScroll" class="trade-stock-scroll"><div id="tradeStock" class="trade-grid" aria-label="Товары торговца"></div></div>
      <div class="trade-actions"><button type="button" id="tradeBuy" data-trade-action="buy">Купить</button><button type="button" id="tradeSell" data-trade-action="sell">Продать</button></div>
      <div class="trade-deals">
        <section><h3>К покупке</h3><div id="tradeBuySlots" class="trade-staging" data-trade-drop="buy" aria-label="Слоты покупки"></div><p id="tradeBuyTotal"></p></section>
        <section><h3>К продаже</h3><div id="tradeSellSlots" class="trade-staging" data-trade-drop="sell" aria-label="Слоты продажи"></div><p id="tradeSellTotal"></p></section>
      </div>
      <div id="tradeEditor" hidden><span id="tradeItemName"></span><label>Количество <input id="tradeQuantity" type="number" inputmode="numeric" min="1" step="1"></label><button type="button" data-trade-action="remove">Убрать</button></div>
      <p id="tradeStatus" role="status" aria-live="polite"></p><button type="button" id="tradeResync" data-trade-action="sync" hidden>Проверить состояние на сервере</button>
      <h3>Рюкзак игрока</h3><div id="tradeInventory" class="trade-grid" aria-label="Рюкзак игрока"></div>
      <button type="button" id="tradeWarehouse" data-trade-action="warehouse" data-trade-drop="warehouse">На склад — перетащи сюда предмет</button>
      <p id="tradeWarehouseNote" hidden>Склад доступен только на базе.</p>
      <details id="tradeAuto" hidden><summary>Автозакупка расходников</summary><div id="tradeAutoBody"></div></details>
    </div>`;
  document.body.append(root);
  const el = id => root.querySelector('#' + id);
  const message = s => { el('tradeStatus').textContent = s; };
  const stock = () => new Map(vendors[vendor].stock().map(item => [item.name, item]));
  const offerText = value => [value.coins ? `${money(value.coins)} Б` : '', value.tokens ? `${money(value.tokens)} жет.` : ''].filter(Boolean).join(' + ') || '0 Б';
  const labelName = name => stripInvisibleSuffix(name);

  function cell(name, source, detail) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slot trade-cell';
    button.dataset.tradeName = name;
    button.dataset.tradeSource = source;
    button.title = labelName(name) + (detail ? ' · ' + detail : '');
    button.setAttribute('aria-label', button.title);
    button.innerHTML = itemIconHtml(name, 38);
    // Item icons use the existing catalog, while item names never become HTML/handlers.
    const fallback = document.createElement('span');
    fallback.className = 'trade-cell-name'; fallback.textContent = labelName(name);
    fallback.hidden = !!button.querySelector('img'); button.append(fallback);
    button.querySelectorAll('img').forEach(img => {
      img.draggable = false; img.alt = '';
      img.addEventListener('error', () => { fallback.hidden = false; });
    });
    const caption = document.createElement('span');
    caption.className = 'trade-cell-detail'; caption.textContent = detail;
    button.append(caption);
    return button;
  }
  function fillEmpty(grid, minimum, columns) {
    const needed = Math.max(minimum, Math.ceil(grid.childElementCount / columns) * columns);
    while (grid.childElementCount < needed) {
      const empty = document.createElement('div'); empty.className = 'slot trade-empty'; empty.setAttribute('aria-hidden', 'true'); grid.append(empty);
    }
  }
  function limit(side, name) { return side === 'sell' ? count(name) : vendor === 'friendly' ? 1 : 999; }
  function reconcile() {
    const goods = stock();
    for (const [name, qty] of queues.buy) if (!goods.has(name) || qty < 1) queues.buy.delete(name);
    for (const [name, qty] of queues.sell) {
      if (!count(name) || !vendors[vendor].accepts(name)) queues.sell.delete(name);
      else queues.sell.set(name, Math.min(qty, count(name)));
    }
    if (editing && !queues[editing.side].has(editing.name)) editing = null;
  }
  function render() {
    if (!vendor || root.hidden) return;
    reconcile();
    const config = vendors[vendor], goods = stock();
    el('tradeTitle').textContent = config.title();
    el('tradeHealth').textContent = '♥ ' + Math.round(number(player.health));
    el('tradeHunger').textContent = 'Сытость ' + Math.round(number(player.hunger));
    el('tradeThirst').textContent = 'Вода ' + Math.round(number(player.thirst));
    el('tradeBalance').textContent = money(player.coins) + ' Б · ' + money(player.breedCredits) + ' жет.';
    const nextStock = JSON.stringify([vendor, [...goods].map(([name, item]) => [name, config.price(item)])]);
    if (nextStock !== stockSignature) {
      stockSignature = nextStock;
      const grid = el('tradeStock'); grid.replaceChildren();
      for (const [name, item] of goods) grid.append(cell(name, 'stock', money(config.price(item))));
      fillEmpty(grid, VISIBLE_GRID_SLOTS, 7);
    }
    el('tradeStockNote').hidden = goods.size > 0;
    el('tradeStockNote').textContent = 'У этого торговца сейчас нет доступных товаров.';
    const nextBag = JSON.stringify([vendor, ownedNames().map(name => [name, count(name), config.accepts(name)])]);
    if (nextBag !== bagSignature) {
      bagSignature = nextBag;
      const grid = el('tradeInventory'); grid.replaceChildren();
      for (const name of ownedNames()) {
        const button = cell(name, 'inventory', '×' + count(name));
        if (!config.accepts(name)) { button.classList.add('trade-not-accepted'); button.title += ' · Торговец не принимает'; }
        grid.append(button);
      }
      fillEmpty(grid, VISIBLE_GRID_SLOTS, 7);
    }
    for (const side of ['buy', 'sell']) {
      const grid = el(side === 'buy' ? 'tradeBuySlots' : 'tradeSellSlots');
      grid.replaceChildren();
      for (const [name, qty] of queues[side]) grid.append(cell(name, side, '×' + qty));
      fillEmpty(grid, MAX_SLOTS, 3);
    }
    const buySum = [...queues.buy].reduce((sum, [name, qty]) => sum + config.price(goods.get(name)) * qty, 0);
    const sellSum = [...queues.sell].reduce((sum, [name, qty]) => {
      const value = config.offer(name); sum.coins += value.coins * qty; sum.tokens += value.tokens * qty; return sum;
    }, {coins: 0, tokens: 0});
    el('tradeBuyTotal').textContent = 'Итого: ' + money(buySum) + ' Б';
    el('tradeSellTotal').textContent = 'Итого: ' + offerText(sellSum);
    el('tradeBuy').disabled = busy || needsSync || !queues.buy.size || buySum > number(player.coins);
    el('tradeSell').disabled = busy || needsSync || !queues.sell.size;
    el('tradeWarehouse').disabled = busy || needsSync || !atBase();
    el('tradeWarehouseNote').hidden = atBase();
    el('tradeResync').hidden = !needsSync;
    el('tradeResync').disabled = busy;
    el('tradeAuto').hidden = !['zhuchara', 'leonov'].includes(vendor);
    el('tradeEditor').hidden = !editing;
    if (editing) {
      el('tradeItemName').textContent = labelName(editing.name);
      el('tradeQuantity').max = String(limit(editing.side, editing.name));
      el('tradeQuantity').value = String(queues[editing.side].get(editing.name));
    }
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('[data-trade-source],#tradeEditor button,#tradeQuantity,#tradeAutoBody button,#tradeAutoBody input,[data-trade-action="back"]').forEach(node => { node.disabled = busy; });
  }
  function compatible(source, target) {
    return (source === 'stock' && target === 'buy') || (source === 'inventory' && target === 'sell') ||
      (source === 'inventory' && target === 'warehouse' && atBase());
  }
  function stage(source, name, side) {
    if (busy || needsSync || !vendor || !compatible(source, side)) return false;
    if (side === 'buy' && !stock().has(name)) return false;
    if (side === 'sell' && (!count(name) || !vendors[vendor].accepts(name))) {
      message('Этот торговец не принимает этот предмет. Его можно оставить в рюкзаке или убрать на склад.'); return false;
    }
    const q = queues[side];
    const qty = (q.get(name) || 0) + 1;
    if (qty > limit(side, name)) { message('Больше экземпляров добавить нельзя.'); return false; }
    q.set(name, qty); editing = {side, name}; render();
    message('Предмет выбран. Деньги и вещи изменятся только после нажатия «Купить» или «Продать».'); return true;
  }
  async function request(path, payload) {
    const response = await fetch(`${SERVER_URL}/api/${path}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({initData: window.Telegram?.WebApp?.initData, ...payload})
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }
  function apply(result) {
    if (!result.inventory || Array.isArray(result.inventory) || typeof result.inventory !== 'object' || !Number.isFinite(result.coins)) throw new Error('Некорректный ответ сервера');
    // Only confirmed server fields; never decrement inventory or currency in the UI.
    for (const key of ['inventory', 'coins', 'breedCredits', 'intellect', 'quickSlots', 'craftedArtifacts', 'warehouse']) {
      if (Object.prototype.hasOwnProperty.call(result, key)) player[key] = result[key];
    }
    if (result.craftedArtifacts) reinjectCraftedArtifacts();
    native.updateUI();
  }
  async function execute(side) {
    if (busy || needsSync || !vendor || !['buy', 'sell'].includes(side) || !queues[side].size) return;
    cleanup(); busy = true; render();
    const currentVendor = vendor, entries = [...queues[side]];
    let confirmed = 0;
    try {
      await waitForSaveQueue();
      for (const [name, qty] of entries) {
        const goods = stock(), item = goods.get(name);
        if (side === 'buy' && (!item || vendors[vendor].price(item) * qty > number(player.coins))) { message('Недостаточно Байт или товар больше недоступен.'); break; }
        if (side === 'sell' && (count(name) < qty || !vendors[vendor].accepts(name))) { message('Предмет или нужное количество больше недоступны.'); break; }
        let result;
        try {
          if (side === 'buy') result = currentVendor === 'friendly'
            ? await request('friendly/buy', {name})
            : await request('shop/buy', {vendor: currentVendor, category: item.category, name, qty});
          else result = currentVendor === 'leonov'
            ? await request('scientists/sell', {name, qty})
            : await request('shop/sell', {vendor: currentVendor === 'friendly' ? 'zhuchara' : currentVendor, name, qty});
          if (!result || typeof result.success !== 'boolean') throw new Error('Нет подтверждения');
          if (!result.success) { message(`Операция отклонена: ${result.error || 'причина не указана'}. Завершено позиций: ${confirmed}.`); break; }
          apply(result);
        } catch (_) {
          // A lost reply may follow a successful server write. Never automatically retry it.
          queues[side].delete(name); needsSync = true;
          message('Не получено подтверждение сделки. Повторный запрос не отправлен. Проверь состояние на сервере перед следующей сделкой.'); break;
        }
        queues[side].delete(name); confirmed++; render();
      }
      if (!queues[side].size && !needsSync) message(`Сделка завершена. Обработано позиций: ${confirmed}.`);
    } catch (_) { message('Не удалось подготовить сделку. Запрос покупки или продажи не отправлен.'); }
    finally { busy = false; render(); }
  }
  async function resync() {
    if (busy) return;
    busy = true; render();
    try {
      const result = await request('player/private', {});
      apply(result); needsSync = false;
      message('Состояние перечитано с сервера. Проверь рюкзак и баланс. Неподтверждённая позиция не повторяется автоматически.');
    } catch (_) { message('Сервер пока недоступен. Сделки заблокированы до проверки состояния.'); }
    finally { busy = false; render(); }
  }
  async function deposit(name) {
    if (busy || needsSync || !atBase() || !count(name)) return;
    // Do not sell an item that has been moved to the warehouse.
    queues.sell.delete(name); busy = true; render();
    try {
      const ok = await warehouseTransfer('deposit', name, 1);
      message(ok ? 'Предмет перенесён на склад.' : 'Перенос не подтверждён. Проверь состояние на сервере.');
      if (!ok) needsSync = true;
    } finally { busy = false; render(); }
  }
  function hide() {
    cleanup(); root.hidden = true;
    for (const [node, previous] of inertNodes) node.inert = previous;
    inertNodes = []; document.body.classList.remove('trade-menu-visible');
  }
  function open(id) {
    if (!vendors[id] || busy || (id === 'friendly' && !currentEnemy)) return false;
    if (vendor !== id || root.hidden) { queues.buy.clear(); queues.sell.clear(); editing = null; }
    if (root.hidden) {
      returnFocus = document.activeElement;
      inertNodes = [...document.querySelectorAll('#mainMenu,.screen.active')].map(node => [node, node.inert]);
      inertNodes.forEach(([node]) => { node.inert = true; });
    }
    el('tradeAuto').open = false;
    vendor = id; root.dataset.vendor = id; root.hidden = false;
    document.body.classList.add('trade-menu-visible');
    document.getElementById('leonovHubScreen')?.classList.remove('active');
    document.body.classList.remove('leonov-hub-visible');
    render(); root.scrollTop = 0;
    message(needsSync ? 'Сначала проверь состояние незавершённой сделки на сервере.' : 'Удерживай предмет и перетаскивай в слоты сделки. Короткое нажатие тоже добавляет предмет.');
    root.querySelector('[data-trade-action="back"]').focus({preventScroll: true}); return true;
  }
  async function back() {
    if (busy) return;
    const id = vendor; hide();
    if (id === 'leonov' && window.BunkerMenu?.openLeonov) window.BunkerMenu.openLeonov();
    else if (id === 'zhuchara' && window.TraderHubs?.openZhuchara) window.TraderHubs.openZhuchara();
    else if (id === 'friendly') await native.closeFriendlyTrade();
    else if (id === 'technician' && window.TraderHubs?.openDiesel) window.TraderHubs.openDiesel();
    else if (id === 'technician') { technicianTab = 'upgrade'; native.openScreen('technician'); }
    else native.openScreen('main');
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({preventScroll: true});
  }
  root.addEventListener('click', e => {
    if (Date.now() < suppressUntil || busy) return;
    const button = e.target.closest('button'); if (!button) return;
    const {tradeAction: action, tradeName: name, tradeSource: source} = button.dataset;
    if (action === 'back') return void back();
    if (action === 'buy' || action === 'sell') return void execute(action);
    if (action === 'sync') return void resync();
    if (action === 'autofill') {
      if (needsSync) return;
      for (const [name, item] of stock()) {
        if (item.category !== 'consumable') continue;
        const need = Math.max(0, Math.floor(number(player.autoBuyTargets?.[name])) - count(name));
        if (need) queues.buy.set(name, Math.min(999, need));
      }
      render(); message('Товары до выбранной нормы добавлены в слоты покупки. Проверь сумму и нажми «Купить».'); return;
    }
    if (action === 'warehouse') { if (atBase() && !needsSync) { hide(); native.openScreen('warehouse'); } return; }
    if (action === 'info' && editing) return showItemInfoModal(editing.name);
    if (action === 'remove' && editing) { queues[editing.side].delete(editing.name); editing = null; render(); return; }
    if (source === 'buy' || source === 'sell') {
      queues[source].delete(name);
      if (editing?.side === source && editing?.name === name) editing = null;
      render();
      if (typeof showItemInfoModal === 'function') showItemInfoModal(name);
      message(source === 'buy' ? 'Товар возвращён торговцу.' : 'Товар возвращён в рюкзак.');
      return;
    }
    if (source === 'stock' || source === 'inventory') {
      const side = source === 'stock' ? 'buy' : 'sell';
      if (stage(source, name, side) && typeof showItemInfoModal === 'function') showItemInfoModal(name);
      return;
    }
  });
  el('tradeAuto').addEventListener('toggle', () => {
    if (!el('tradeAuto').open || !['zhuchara', 'leonov'].includes(vendor)) return;
    el('tradeAutoBody').innerHTML = vendor === 'leonov' ? renderAutoBuyPanelScientists() : renderAutoBuyPanel();
    const button = el('tradeAutoBody').querySelector('button');
    if (button) { button.removeAttribute('onclick'); button.dataset.tradeAction = 'autofill'; button.textContent = 'Добавить до нормы в слоты покупки'; }
    render();
  });
  el('tradeQuantity').addEventListener('change', e => {
    if (!editing || busy || needsSync) return;
    const max = limit(editing.side, editing.name), n = Number(e.target.value);
    if (!Number.isInteger(n) || n < 1 || n > max) { message(`Количество должно быть целым числом от 1 до ${max}.`); render(); return; }
    queues[editing.side].set(editing.name, n); render();
  });
  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('#tradeMenu [data-trade-drop]');
  function cleanup() {
    if (gesture) clearTimeout(gesture.timer);
    cancelAnimationFrame(frame); ghost?.remove(); ghost = null; gesture = null;
    root.querySelectorAll('.trade-drop-ready,.trade-drop-over').forEach(node => node.classList.remove('trade-drop-ready', 'trade-drop-over'));
  }
  function paint() {
    if (!gesture?.active || root.hidden) return cleanup();
    const g = gesture; ghost.style.transform = `translate(${g.x - 28}px,${g.y - 74}px)`;
    const target = targetAt(g.x, g.y);
    root.querySelectorAll('[data-trade-drop]').forEach(node => {
      const valid = compatible(g.source, node.dataset.tradeDrop);
      node.classList.toggle('trade-drop-ready', valid); node.classList.toggle('trade-drop-over', valid && node === target);
    });
    const box = root.getBoundingClientRect();
    if (g.y < box.top + 55) root.scrollTop -= 10;
    else if (g.y > box.bottom - 55) root.scrollTop += 10;
    frame = requestAnimationFrame(paint);
  }
  function begin() {
    if (!gesture || gesture.scrolling || busy || needsSync) return;
    gesture.active = true; ghost = gesture.node.cloneNode(true); ghost.className = 'trade-drag-ghost';
    ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost); paint();
  }
  root.addEventListener('pointerdown', e => {
    const node = e.target.closest('[data-trade-source="stock"],[data-trade-source="inventory"]');
    if (!node || busy || needsSync || gesture || e.button !== 0 || !e.isPrimary) return;
    gesture = {id: e.pointerId, node, source: node.dataset.tradeSource, name: node.dataset.tradeName, touch: e.pointerType === 'touch', x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, lastY: e.clientY, scroller: node.closest('#tradeStockScroll') || root};
    if (gesture.touch) gesture.timer = setTimeout(begin, 240);
  });
  document.addEventListener('pointermove', e => {
    const g = gesture; if (!g || e.pointerId !== g.id) return;
    g.x = e.clientX; g.y = e.clientY;
    if (!g.active && Math.hypot(g.x - g.startX, g.y - g.startY) > 8) {
      if (g.touch) { clearTimeout(g.timer); g.scrolling = true; } else begin();
    }
    if (g.scrolling) { g.scroller.scrollTop += g.lastY - g.y; suppressUntil = Date.now() + 500; }
    g.lastY = g.y;
    if (g.active || g.scrolling) e.preventDefault();
  }, {passive: false});
  document.addEventListener('pointerup', e => {
    const g = gesture; if (!g || g.id !== e.pointerId) return;
    const target = g.active ? targetAt(e.clientX, e.clientY)?.dataset.tradeDrop : null;
    cleanup();
    if (!g.active) return;
    suppressUntil = Date.now() + 500;
    if (!target || !compatible(g.source, target)) return message('Перетаскивание отменено. Предмет остался на месте.');
    if (target === 'warehouse') void deposit(g.name); else stage(g.source, g.name, target);
  });
  const cancel = () => { if (gesture) suppressUntil = Date.now() + 500; cleanup(); };
  document.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  root.addEventListener('dragstart', e => e.preventDefault());
  root.addEventListener('contextmenu', e => { if (e.target.closest('[data-trade-source]')) e.preventDefault(); });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); if (gesture) cancel(); else void back(); }
    if (e.key === 'Tab') {
      const nodes = [...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(n => n.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  window.openScreen = function(screen) {
    if (busy) return;
    if (screen === 'shop') return open('zhuchara');
    if (!root.hidden) hide();
    return native.openScreen.apply(this, arguments);
  };
  window.openTechnicianTab = function(tab) {
    if (busy) return;
    if (tab === 'sell' || tab === 'trade') return open('technician');
    if (!root.hidden) hide();
    return native.openTechnicianTab.apply(this, arguments);
  };
  window.openScientistsBuyView = window.openScientistsSellView = () => open('leonov');
  window.openFriendlyTrade = () => open('friendly');
  window.openFriendlyTradeTab = () => open('friendly');
  window.updateUI = function() { const result = native.updateUI.apply(this, arguments); if (!root.hidden && !gesture && !busy) render(); return result; };
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-leonov-action="trade"]')) return;
    e.preventDefault(); e.stopImmediatePropagation(); open('leonov');
  }, true);
  const technicianButton = document.querySelector('[onclick="openTechnicianTab(\'sell\')"]');
  if (technicianButton) technicianButton.textContent = 'Торговля';
  window.TradeMenu = Object.freeze({version: '1.2.0', open, refresh: render});
})();
