/* Shared NPC trade workspace. Carts never alter inventory; only API responses do. */
(() => {
  'use strict';
  if (window.UniversalTrade || typeof openScreen !== 'function') return;
  const native = {open: window.openScreen, tech: window.openTechnicianTab,
    friendly: window.openFriendlyTrade, friendlyClose: window.closeFriendlyTrade};
  const carts = {buy: new Map(), sell: new Map()};
  let vendor = null, busy = false, uncertain = false, gesture = null, ghost = null, frame = 0, suppress = 0;
  const titles = {zhuchara: 'Торговец Жучара', leonov: 'Эколог Леонов', technician: 'Техник Дизель', friendly: 'Торговля с фракцией'};
  const root = document.createElement('section');
  root.id = 'universalTradeScreen'; root.className = 'screen ut-screen';
  root.setAttribute('aria-label', 'Торговля');
  root.innerHTML = `
    <header class="ut-header"><h3 id="utTitle">Торговля</h3><button type="button" class="back-btn" data-ut-action="back">Назад</button></header>
    <div id="utVitals" class="ut-vitals"></div><div id="utBalance" class="ut-balance"></div>
    <div class="ut-heading"><h4>Товары торговца</h4><label>Поиск <input id="utSearch" type="search" placeholder="Название" autocomplete="off"></label></div>
    <p id="utVendorNote" class="ut-note"></p><div id="utStock" class="ut-grid" aria-label="Товары торговца"></div>
    <div class="ut-deal-bar"><button type="button" id="utBuy" data-ut-action="buy">Купить</button><button type="button" id="utSell" data-ut-action="sell">Продать</button></div>
    <div class="ut-baskets">
      <section class="ut-basket" data-ut-drop="buy" aria-label="Слоты покупки"><h4>К покупке</h4><output id="utBuyTotal"></output><div id="utBuyCart" class="ut-cart-grid"></div></section>
      <section class="ut-basket" data-ut-drop="sell" aria-label="Слоты продажи"><h4>К продаже</h4><output id="utSellTotal"></output><div id="utSellCart" class="ut-cart-grid"></div></section>
    </div>
    <div class="ut-help">Зажми предмет и перетащи в слоты под нужной кнопкой. Касание добавляет 1 шт.; касание предмета в корзине убирает 1 шт.</div>
    <div id="utStatus" class="ut-status" role="status" aria-live="polite"></div>
    <div class="ut-tools"><button type="button" data-ut-action="clear">Очистить выбор</button><button type="button" data-ut-action="info" id="utInfo" disabled>Информация</button><button type="button" data-ut-action="sync" id="utSync" hidden>Проверить состояние</button></div>
    <h4>Рюкзак игрока</h4><div id="utInventory" class="ut-grid" data-ut-drop="inventory" aria-label="Рюкзак игрока"></div>
    <button type="button" id="utDeposit" data-ut-drop="deposit" data-ut-action="deposit">На склад — перетащи сюда предмет</button>
    <div id="utStorageArea"><h4>Склад</h4><p class="ut-note">Перетащи предмет со склада в рюкзак или коснись его, чтобы забрать 1 шт.</p><div id="utWarehouse" class="ut-grid" aria-label="Склад игрока"></div></div>`;
  document.body.append(root);
  const el = id => document.getElementById(id);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const qty = (name, source = player.inventory) => Math.max(0, Math.floor(number(source?.[name])));
  const active = () => !!vendor && root.classList.contains('active');
  const onBase = () => vendor !== 'friendly' && !raidActive && !inventoryOpenedFromRaid;
  const say = value => { el('utStatus').textContent = value; };
  const money = value => Math.max(0, Math.round(number(value))).toLocaleString('ru-RU');
  let selected = null;

  function catalog() {
    if (vendor === 'zhuchara') return getShopCatalog();
    if (vendor === 'friendly') return consumables.map(item => ({...item, category: 'consumable'}));
    if (vendor === 'leonov') return [
      ...consumables.filter(c => ['medkit', 'antirad'].includes(c.type)).map(c => ({...c, category: 'consumable'})),
      ...detectors.filter(d => !d.adminOnly && d.tier <= getDetectorUnlockTier(player.level)).map(d => ({...d, category: 'detector'})),
      ...armorItems.filter(a => !a.adminOnly && a.isResearchSuit && a.tier <= getResearchSuitUnlockTier(player.level)).map(a => ({...a, category: 'armor'}))
    ];
    // The current server only buys gear from players at Diesel. Do not invent stock/endpoints.
    return [];
  }
  function sale(name) {
    const def = findArtifactDef(name);
    const base = parseGearName(name).baseName;
    const gear = weapons.find(x => x.name === base) || armorItems.find(x => x.name === base) || detectors.find(x => x.name === base);
    if (gear?.adminOnly || def?.adminOnly) return null;
    if (vendor === 'leonov') {
      if (def?.isNamedArtifact) return {bytes: 0, tokens: 50};
      if (def) return {bytes: Math.round(getSellPrice(name) * 1.35), tokens: 0};
      if (mutants.some(m => m.loot === name)) return {bytes: Math.round(getSellPrice(name) * 1.20), tokens: 0};
      return null;
    }
    if (def?.isNamedArtifact) return null;
    if (vendor === 'technician') {
      const kind = getEquipSlotType(name);
      return kind ? {bytes: Math.round(getSellPrice(name) * (kind === 'detector' ? 1.10 : 1.02)), tokens: 0} : null;
    }
    return {bytes: getSellPrice(name), tokens: 0};
  }
  const buyPrice = item => vendor === 'friendly' ? getFriendlyBuyPrice(item.price) : getBuyPrice(item.price);
  const priceText = quote => quote ? [quote.bytes ? money(quote.bytes) + ' Байт' : '', quote.tokens ? money(quote.tokens) + ' жет.' : ''].filter(Boolean).join(' + ') || '0 Байт' : 'Не принимает';
  function totals(side) {
    let bytes = 0, tokens = 0, units = 0;
    for (const [name, count] of carts[side]) {
      const item = side === 'buy' && catalog().find(x => x.name === name);
      const quote = side === 'buy' ? item && {bytes: buyPrice(item), tokens: 0} : sale(name);
      if (!quote) continue;
      bytes += quote.bytes * count; tokens += quote.tokens * count; units += count;
    }
    return {bytes, tokens, units};
  }
  function cleanCarts() {
    const goods = new Set(catalog().map(x => x.name));
    for (const [name, count] of carts.buy) if (!goods.has(name) || count < 1) carts.buy.delete(name);
    for (const [name, count] of carts.sell) {
      if (!sale(name) || !qty(name)) carts.sell.delete(name);
      else carts.sell.set(name, Math.min(count, qty(name)));
    }
  }
  function cell(name, source, count, quote) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'slot ut-item';
    button.dataset.utItem = name; button.dataset.utSource = source;
    button.title = name + (count ? ' ×' + count : '') + (quote ? ' — ' + priceText(quote) : '');
    button.setAttribute('aria-label', button.title); button.disabled = busy || uncertain;
    const icon = document.createElement('span'); icon.className = 'ut-icon'; icon.innerHTML = itemIconHtml(name, 38);
    icon.querySelectorAll('img').forEach(img => { img.draggable = false; img.loading = 'lazy'; img.addEventListener('error', () => button.classList.add('ut-image-missing'), {once: true}); });
    if (!icon.querySelector('img')) button.classList.add('ut-image-missing');
    const label = document.createElement('span'); label.className = 'ut-name'; label.textContent = name;
    const amount = document.createElement('span'); amount.className = 'ut-count'; amount.textContent = count ? '×' + count : '';
    const price = document.createElement('small'); price.textContent = quote ? priceText(quote).replace(' Байт', ' б.') : source === 'inventory' ? 'Не принимает' : '';
    if (source === 'inventory' && !quote) button.classList.add('ut-not-accepted');
    button.append(icon, label, amount, price); return button;
  }
  function grid(id, items, minimum, columns = 7) {
    const fragment = document.createDocumentFragment(); items.forEach(item => fragment.append(item));
    const target = Math.max(minimum, Math.ceil(items.length / columns) * columns);
    for (let i = items.length; i < target; i++) { const blank = document.createElement('div'); blank.className = 'slot ut-empty'; blank.setAttribute('aria-hidden', 'true'); fragment.append(blank); }
    el(id).replaceChildren(fragment);
  }
  function refresh() {
    if (!active() || gesture?.active) return;
    cleanCarts();
    el('utTitle').textContent = vendor === 'friendly' ? currentEnemy?.name || titles.friendly : titles[vendor];
    el('utVitals').textContent = `Здоровье: ${Math.round(number(player.health))}   Сытость: ${Math.round(number(player.hunger))}   Жажда: ${Math.round(number(player.thirst))}`;
    el('utBalance').textContent = `Байты: ${money(player.coins)}  ·  Жетоны сталкера: ${money(player.breedCredits)}`;
    const query = el('utSearch').value.trim().toLocaleLowerCase('ru');
    const stock = catalog().filter(item => item.name.toLocaleLowerCase('ru').includes(query));
    grid('utStock', stock.map(item => cell(item.name, 'stock', 0, {bytes: buyPrice(item), tokens: 0})), 35);
    el('utVendorNote').textContent = vendor === 'technician' ? 'Дизель выкупает оружие, броню и детекторы. Товаров на продажу у него пока нет; улучшение снаряжения остаётся отдельным разделом.' : !stock.length ? 'По этому названию товаров не найдено.' : '';
    for (const side of ['buy', 'sell']) {
      const prefix = side === 'buy' ? 'utBuy' : 'utSell';
      grid(prefix + 'Cart', [...carts[side]].map(([name, count]) => cell(name, side, count, side === 'buy' ? {bytes: buyPrice(catalog().find(x => x.name === name)), tokens: 0} : sale(name))), 6, 3);
      const sum = totals(side);
      el(prefix + 'Total').textContent = sum.units + ' шт. · ' + priceText(sum);
      el(prefix).disabled = busy || uncertain || !sum.units || side === 'buy' && sum.bytes > number(player.coins);
    }
    grid('utInventory', Object.keys(player.inventory || {}).filter(name => qty(name)).map(name => cell(name, 'inventory', qty(name), sale(name))), 14);
    el('utStorageArea').hidden = !onBase();
    el('utDeposit').disabled = busy || uncertain || !onBase();
    el('utDeposit').textContent = onBase() ? 'На склад — перетащи сюда предмет' : 'Склад доступен только на базе';
    if (onBase()) grid('utWarehouse', Object.keys(player.warehouse || {}).filter(name => qty(name, player.warehouse)).map(name => cell(name, 'warehouse', qty(name, player.warehouse), null)), 21);
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('[data-ut-action="back"],[data-ut-action="clear"]').forEach(b => { b.disabled = busy; });
    el('utInfo').disabled = busy || !selected;
    el('utSync').hidden = !uncertain; el('utSync').disabled = busy;
  }
  function stage(name, source) {
    if (!active() || busy || uncertain) return;
    selected = {name, source};
    if (source === 'buy' || source === 'sell') {
      const remaining = (carts[source].get(name) || 0) - 1;
      if (remaining > 0) carts[source].set(name, remaining); else carts[source].delete(name);
      say('Убрана 1 шт. из корзины.');
    } else if (source === 'stock') {
      if (!catalog().some(x => x.name === name)) return;
      if ((carts.buy.get(name) || 0) >= 100) { say('В одной покупке можно выбрать до 100 экземпляров предмета.'); return; }
      carts.buy.set(name, (carts.buy.get(name) || 0) + 1); say('Добавлена 1 шт. к покупке. Предмет ещё не куплен.');
    } else if (source === 'inventory') {
      if (!sale(name)) { say('Этот торговец не принимает данный предмет. Его можно перенести на склад.'); refresh(); return; }
      const next = (carts.sell.get(name) || 0) + 1;
      if (next > qty(name)) { say('Все доступные экземпляры уже выбраны.'); return; }
      carts.sell.set(name, next); say('Добавлена 1 шт. к продаже. Предмет ещё не продан.');
    } else if (source === 'warehouse') { transfer('withdraw', name); return; }
    refresh();
  }
  async function request(path, payload) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(SERVER_URL + path, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({initData: window.Telegram?.WebApp?.initData, ...payload}), signal: controller.signal});
      const result = await response.json();
      if (response.status >= 500 || typeof result?.success !== 'boolean') throw new Error('Неопределённый ответ сервера');
      return result;
    } finally { clearTimeout(timer); }
  }
  function apply(result) {
    if (!result.inventory || typeof result.inventory !== 'object' || Array.isArray(result.inventory)) throw new Error('Нет подтверждённого инвентаря');
    player.inventory = result.inventory;
    for (const field of ['coins', 'breedCredits', 'intellect']) if (result[field] !== undefined && Number.isFinite(Number(result[field]))) player[field] = Number(result[field]);
    if (result.warehouse && typeof result.warehouse === 'object') player.warehouse = result.warehouse;
    if (Array.isArray(result.quickSlots)) player.quickSlots = result.quickSlots;
    updateUI();
  }
  async function confirm(side) {
    if (!active() || busy || uncertain || !carts[side].size) return;
    cleanCarts(); if (!carts[side].size) { refresh(); return; }
    if (side === 'buy' && totals(side).bytes > number(player.coins)) { say('Недостаточно Байт для выбранных товаров.'); return; }
    cleanup(); busy = true; refresh(); let completed = 0;
    say('Ожидание подтверждения сервера…');
    try {
      await waitForSaveQueue();
      // Existing endpoints are per item. Apply each confirmed result, stop on the first rejection.
      for (const [name, requested] of [...carts[side]]) {
        const item = side === 'buy' && catalog().find(x => x.name === name);
        if (side === 'buy' && !item || side === 'sell' && (!sale(name) || qty(name) < requested)) throw new Error('Состав предметов изменился');
        const step = vendor === 'friendly' && side === 'buy' ? 1 : requested;
        for (let left = requested; left > 0; left -= step) {
          const path = side === 'buy' ? vendor === 'friendly' ? '/api/friendly/buy' : '/api/shop/buy' : vendor === 'leonov' ? '/api/scientists/sell' : '/api/shop/sell';
          const payload = side === 'buy' ? vendor === 'friendly' ? {name} : {vendor, category: item.category, name, qty: step} : vendor === 'leonov' ? {name, qty: step} : {vendor: vendor === 'friendly' ? 'zhuchara' : vendor, name, qty: step};
          const result = await request(path, payload);
          if (!result.success) { say(`Подтверждено: ${completed} шт. Остановлено: ${result.error || 'сервер отклонил операцию'}`); return; }
          apply(result); completed += step;
          const remaining = (carts[side].get(name) || 0) - step;
          if (remaining > 0) carts[side].set(name, remaining); else carts[side].delete(name);
          refresh();
        }
      }
      say((side === 'buy' ? 'Куплено: ' : 'Продано: ') + completed + ' шт.');
    } catch (error) {
      // A lost response does NOT prove that a write failed. Never retry automatically.
      uncertain = true;
      say(`Подтверждено: ${completed} шт. Ответ потерян или неполон. Нажми «Проверить состояние» перед новой операцией; повторная отправка заблокирована.`);
    } finally { busy = false; refresh(); }
  }
  async function synchronize() {
    if (busy) return;
    busy = true; refresh();
    try {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
      let response;
      try { response = await fetch(SERVER_URL + '/api/player/private', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({initData: window.Telegram?.WebApp?.initData}), signal: controller.signal}); }
      finally { clearTimeout(timer); }
      const state = await response.json();
      if (!response.ok || !state?.inventory || !Number.isFinite(Number(state.coins)) || state.success === false) throw new Error('Не удалось проверить состояние');
      player.inventory = state.inventory; player.warehouse = state.warehouse || player.warehouse;
      for (const field of ['coins', 'breedCredits', 'intellect']) if (state[field] !== undefined) player[field] = number(state[field]);
      if (Array.isArray(state.quickSlots)) player.quickSlots = state.quickSlots;
      if (state._stateVersion !== undefined) playerStateVersion = number(state._stateVersion);
      carts.buy.clear(); carts.sell.clear(); uncertain = false; updateUI();
      say('Состояние получено с сервера. Корзины очищены: проверь вещи и выбери их заново.');
    } catch (error) { say('Не удалось свериться с сервером. Повторная покупка и продажа остаются заблокированы.'); }
    finally { busy = false; refresh(); }
  }
  async function transfer(direction, name) {
    if (!active() || busy || uncertain || !onBase()) return;
    const available = qty(name, direction === 'deposit' ? player.inventory : player.warehouse);
    if (!available) return;
    cleanup(); busy = true; refresh(); say('Перенос предмета…');
    try {
      await waitForSaveQueue();
      const result = await request('/api/warehouse/transfer', {direction, item: name, qty: 1});
      if (!result.success) { say(result.error || 'Перенос отклонён сервером.'); return; }
      apply(result); say(direction === 'deposit' ? '1 шт. перемещена на склад.' : '1 шт. перемещена в рюкзак.');
    } catch (error) { uncertain = true; say('Подтверждение переноса не получено. Нажми «Проверить состояние»; автоматического повтора не будет.'); }
    finally { busy = false; refresh(); }
  }
  function open(next) {
    if (busy || !Object.hasOwn(titles, next)) return;
    if (uncertain && vendor && vendor !== next) { say('Сначала проверь состояние предыдущей операции.'); return; }
    cleanup(); carts.buy.clear(); carts.sell.clear(); selected = null; vendor = next;
    document.getElementById('leonovHubScreen')?.classList.remove('active'); document.body.classList.remove('leonov-hub-visible');
    el('utSearch').value = ''; native.open('universalTrade'); root.scrollTop = 0;
    say(uncertain ? 'Проверь состояние незавершённой операции.' : 'Выбери товары и нажми «Купить» или «Продать».'); refresh();
  }
  async function back() {
    if (busy) return;
    if (uncertain) { say('Сначала проверь состояние операции: оно пока неизвестно.'); return; }
    cleanup(); const previous = vendor; vendor = null; carts.buy.clear(); carts.sell.clear();
    if (previous === 'friendly') { native.open('raid'); await native.friendlyClose(); }
    else if (previous === 'technician') { technicianTab = 'upgrade'; native.open('technician'); }
    else { native.open('main'); if (previous === 'leonov') window.BunkerMenu?.openLeonov?.(); }
  }
  function dropTarget(x, y) { return document.elementFromPoint(x, y)?.closest('#universalTradeScreen [data-ut-drop]'); }
  function compatible(source, target) {
    return source === 'stock' && target === 'buy' || source === 'inventory' && target === 'sell' || source === 'buy' && target === 'buy' || source === 'sell' && target === 'inventory' || onBase() && (source === 'inventory' && target === 'deposit' || source === 'warehouse' && target === 'inventory');
  }
  function cleanup() {
    if (gesture) clearTimeout(gesture.timer);
    cancelAnimationFrame(frame); ghost?.remove(); ghost = null; gesture = null;
    root.querySelectorAll('.ut-over,.ut-ready').forEach(node => node.classList.remove('ut-over', 'ut-ready'));
  }
  function paint() {
    if (!gesture?.active || !active()) return;
    const g = gesture; ghost.style.transform = `translate(${g.x - 28}px,${g.y - 76}px)`;
    const target = dropTarget(g.x, g.y);
    root.querySelectorAll('[data-ut-drop]').forEach(node => { const ok = compatible(g.source, node.dataset.utDrop); node.classList.toggle('ut-ready', ok); node.classList.toggle('ut-over', ok && target === node); });
    const bounds = root.getBoundingClientRect();
    if (g.y < bounds.top + 55) root.scrollTop -= 12; else if (g.y > bounds.bottom - 55) root.scrollTop += 12;
    frame = requestAnimationFrame(paint);
  }
  function startDrag() {
    if (!gesture || gesture.scrolling || !active() || busy || uncertain) return;
    gesture.active = true; ghost = document.createElement('div'); ghost.className = 'ut-ghost'; ghost.innerHTML = gesture.node.innerHTML; ghost.setAttribute('aria-hidden', 'true'); document.body.append(ghost); paint();
  }
  root.addEventListener('pointerdown', event => {
    const node = event.target.closest('[data-ut-item]');
    if (!node || gesture || busy || uncertain || event.button !== 0 || event.isPrimary === false) return;
    selected = {name: node.dataset.utItem, source: node.dataset.utSource}; el('utInfo').disabled = false;
    gesture = {id: event.pointerId, node, name: node.dataset.utItem, source: node.dataset.utSource, x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY, lastY: event.clientY, touch: event.pointerType === 'touch'};
    node.setPointerCapture?.(event.pointerId);
    if (gesture.touch) gesture.timer = setTimeout(startDrag, 230);
  });
  document.addEventListener('pointermove', event => {
    const g = gesture; if (!g || g.id !== event.pointerId) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.active && Math.hypot(g.x - g.sx, g.y - g.sy) > 8) {
      if (g.touch) { clearTimeout(g.timer); g.scrolling = true; } else startDrag();
    }
    if (g.scrolling) { const scroller = g.node.closest('#utStock') || root; scroller.scrollTop += g.lastY - g.y; suppress = Date.now() + 600; }
    g.lastY = g.y; if (g.active || g.scrolling) event.preventDefault();
  }, {passive: false});
  document.addEventListener('pointerup', event => {
    const g = gesture; if (!g || g.id !== event.pointerId) return;
    const target = g.active && dropTarget(event.clientX, event.clientY)?.dataset.utDrop;
    cleanup();
    if (!g.active) return;
    suppress = Date.now() + 600;
    if (!target || !compatible(g.source, target)) { say('Перетаскивание отменено: предмет остался на месте.'); return; }
    if (target === 'deposit') transfer('deposit', g.name);
    else if (g.source === 'warehouse') transfer('withdraw', g.name);
    else stage(g.name, g.source);
  });
  document.addEventListener('pointercancel', () => { if (gesture) { suppress = Date.now() + 600; cleanup(); } });
  window.addEventListener('blur', cleanup);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cleanup(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && gesture) { suppress = Date.now() + 600; cleanup(); } });
  root.addEventListener('dragstart', event => event.preventDefault());
  root.addEventListener('contextmenu', event => { if (event.target.closest('[data-ut-item]')) event.preventDefault(); });
  root.addEventListener('click', event => {
    if (Date.now() < suppress) { event.preventDefault(); return; }
    const action = event.target.closest('[data-ut-action]')?.dataset.utAction;
    if (action === 'back') return void back();
    if (action === 'sync') return void synchronize();
    if (busy || uncertain) return;
    if (action === 'buy' || action === 'sell') return void confirm(action);
    if (action === 'clear') { carts.buy.clear(); carts.sell.clear(); say('Корзины очищены.'); refresh(); return; }
    if (action === 'info' && selected) return showItemInfoModal(selected.name);
    if (action === 'deposit') { if (selected?.source === 'inventory') transfer('deposit', selected.name); else say('Выбери предмет в рюкзаке или перетащи его на эту кнопку.'); return; }
    const item = event.target.closest('[data-ut-item]'); if (item) stage(item.dataset.utItem, item.dataset.utSource);
  });
  el('utSearch').addEventListener('input', refresh);

  // Route existing entry points; selection and technician upgrades keep their own screens.
  window.openScreen = function(screen) {
    if (active() && (busy || uncertain)) { say('Дождись завершения операции или проверь состояние.'); return; }
    if (screen === 'shop') return open('zhuchara');
    cleanup(); return native.open.apply(this, arguments);
  };
  window.openShopTab = () => open('zhuchara');
  window.openTechnicianTab = function(tab) { if (tab === 'sell' || tab === 'trade') return open('technician'); return native.tech.apply(this, arguments); };
  window.openScientistsBuyView = () => open('leonov');
  window.openScientistsSellView = () => open('leonov');
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-leonov-action="trade"]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation(); open('leonov');
  }, true);
  window.openFriendlyTrade = function() {
    if (!currentEnemy || busy) return;
    native.friendly(); document.getElementById('friendlyTradeModal')?.classList.remove('active'); open('friendly');
  };
  const techTrade = document.querySelector('#technicianScreen [onclick="openTechnicianTab(\'sell\')"]');
  if (techTrade) techTrade.textContent = 'Торговля';
  // Refresh state on re-entry and API completion; never poll the live economy for this UI.
  window.UniversalTrade = {version: '1.0.0', open, refresh, snapshot: () => ({vendor, busy, uncertain, buy: [...carts.buy], sell: [...carts.sell]})};
})();
