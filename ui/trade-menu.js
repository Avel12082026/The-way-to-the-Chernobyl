/* Shared slot-based NPC trading. All item/coin changes remain server-authoritative. */
(() => {
  'use strict';

  const STAGE_SIZE = 3;
  const GRID_MIN = 35;
  let root = null;
  let vendor = null;
  let buyQueue = [];
  let sellQueue = [];
  let busy = false;
  let drag = null;
  let ghost = null;
  let dragFrame = 0;
  let baseOpenScreen = typeof window.openScreen === 'function' ? window.openScreen : null;

  const byId = id => document.getElementById(id);
  const owned = name => Math.max(0, Number(player?.inventory?.[name]) || 0);
  const warehouseQty = name => Math.max(0, Number(player?.warehouse?.[name]) || 0);
  const safeText = value => String(value ?? '');

  function gameAlert(message) {
    if (typeof showGameAlert === 'function') showGameAlert(message);
    else console.warn('[SharedTrade]', message);
  }

  function setStatus(message) {
    const el = byId('sharedTradeStatus');
    if (el) el.textContent = message || 'Перетащи товар торговца в покупку, свой предмет — в продажу.';
  }

  function applyServerState(res) {
    if (!res || !res.success) return false;
    for (const key of ['coins', 'intellect', 'inventory', 'breedCredits', 'warehouse']) {
      if (Object.prototype.hasOwnProperty.call(res, key)) player[key] = res[key];
    }
    if (res.state && typeof res.state === 'object') {
      for (const key of ['coins', 'intellect', 'inventory', 'breedCredits', 'warehouse']) {
        if (Object.prototype.hasOwnProperty.call(res.state, key)) player[key] = res.state[key];
      }
    }
    if (typeof updateUI === 'function') updateUI();
    return true;
  }

  function priceLabel(item, direction) {
    if (!item) return '';
    if (typeof item.priceLabel === 'string') return item.priceLabel;
    if (Number.isFinite(Number(item.price))) return '🪙 ' + Math.max(0, Math.round(Number(item.price)));
    if (direction === 'sell' && typeof getSellPrice === 'function') return '🪙 ' + Math.max(0, Math.round(getSellPrice(item.name)));
    return '';
  }

  function iconHtml(name, qty) {
    try {
      if (typeof itemSlotFillHtml === 'function') {
        const html = itemSlotFillHtml(name, qty || 1);
        if (html) return html;
      }
      if (typeof itemIconHtml === 'function') return itemIconHtml(name, 42);
    } catch (_) {}
    return '';
  }

  function makeSlot(item, origin, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trade-slot';
    if (!item) {
      button.disabled = true;
      button.setAttribute('aria-hidden', 'true');
      return button;
    }
    button.dataset.tradeOrigin = origin;
    button.dataset.tradeIndex = String(index);
    button.dataset.tradeName = item.name;
    button.title = item.name;
    const html = iconHtml(item.name, item.qty || 1);
    if (html) button.innerHTML = html;
    else {
      const label = document.createElement('span');
      label.textContent = item.name;
      label.style.cssText = 'font-size:8px;line-height:1.1;overflow-wrap:anywhere;';
      button.append(label);
    }
    const qty = Number(item.qty) || 0;
    if (qty > 1) {
      const q = document.createElement('span');
      q.className = 'trade-qty';
      q.textContent = '×' + qty;
      button.append(q);
    }
    const price = priceLabel(item, origin === 'vendor' || origin === 'buy' ? 'buy' : 'sell');
    if (price) {
      const p = document.createElement('span');
      p.className = 'trade-price';
      p.textContent = price;
      button.append(p);
    }
    button.setAttribute('aria-label', `${item.name}${qty > 1 ? ', количество ' + qty : ''}${price ? ', ' + price : ''}`);
    return button;
  }

  function fillGrid(el, items, min = GRID_MIN, origin = 'empty') {
    if (!el) return;
    const fragment = document.createDocumentFragment();
    items.forEach((item, i) => fragment.append(makeSlot(item, origin, i)));
    for (let i = items.length; i < Math.max(min, items.length); i++) fragment.append(makeSlot(null, 'empty', i));
    el.replaceChildren(fragment);
  }

  function queueItems(queue, direction) {
    return queue.map(entry => ({...entry, price: entry.price ?? displayPrice(entry, direction), qty: 1}));
  }

  function displayPrice(item, direction) {
    if (item.priceLabel) return undefined;
    try {
      if (direction === 'buy') {
        if (vendor?.id === 'friendly') return getFriendlyBuyPrice(item.basePrice ?? item.price ?? 0);
        return typeof getBuyPrice === 'function' ? getBuyPrice(item.basePrice ?? item.price ?? 0) : (item.basePrice ?? item.price);
      }
      if (vendor?.id === 'diesel') {
        const multiplier = typeof getEquipSlotType === 'function' && getEquipSlotType(item.name) === 'detector' ? 1.10 : 1.02;
        return Math.round((typeof getSellPrice === 'function' ? getSellPrice(item.name) : 0) * multiplier);
      }
      return typeof getSellPrice === 'function' ? getSellPrice(item.name) : item.price;
    } catch (_) { return item.price; }
  }

  function playerItems() {
    return Object.keys(player?.inventory || {})
      .filter(name => owned(name) > 0 && (!vendor?.canSell || vendor.canSell(name)))
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map(name => ({name, qty: owned(name), price: displayPrice({name}, 'sell')}));
  }

  function warehouseItems() {
    return Object.keys(player?.warehouse || {})
      .filter(name => warehouseQty(name) > 0)
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map(name => ({name, qty: warehouseQty(name)}));
  }

  function currentStock() {
    const items = vendor?.stock ? vendor.stock() : [];
    return (Array.isArray(items) ? items : []).map(item => ({...item, qty: item.qty || 1, price: displayPrice(item, 'buy')}));
  }

  function render() {
    if (!root || !vendor) return;
    byId('sharedTradeTitle').textContent = vendor.title;
    byId('sharedTradeCoins').textContent = Math.max(0, Number(player?.coins) || 0).toLocaleString('ru-RU');
    fillGrid(byId('sharedTradeVendorGrid'), currentStock(), GRID_MIN, 'vendor');
    fillGrid(byId('sharedTradeBuyStage'), queueItems(buyQueue, 'buy'), STAGE_SIZE, 'buy');
    fillGrid(byId('sharedTradeSellStage'), queueItems(sellQueue, 'sell'), STAGE_SIZE, 'sell');
    fillGrid(byId('sharedTradePlayerGrid'), playerItems(), GRID_MIN, 'player');
    fillGrid(byId('sharedTradeWarehouseGrid'), warehouseItems(), GRID_MIN, 'warehouse');
    const buy = byId('sharedTradeBuy');
    const sell = byId('sharedTradeSell');
    buy.disabled = busy || !vendor.buy || buyQueue.length === 0;
    sell.disabled = busy || !vendor.sell || sellQueue.length === 0;
    buy.textContent = busy ? 'ПОДОЖДИ…' : 'КУПИТЬ';
    sell.textContent = busy ? 'ПОДОЖДИ…' : 'ПРОДАТЬ';
    byId('sharedTradeVendorLabel').textContent = vendor.buy ? 'Лут торговца' : 'Торговец сейчас ничего не продаёт';
  }

  function addToQueue(direction, item) {
    if (busy || !item) return;
    const queue = direction === 'buy' ? buyQueue : sellQueue;
    if (queue.length >= STAGE_SIZE) {
      setStatus('В этой зоне уже заполнены все слоты. Проведи сделку или убери предмет.');
      return;
    }
    if (direction === 'sell') {
      const staged = queue.filter(x => x.name === item.name).length;
      if (staged >= owned(item.name)) {
        setStatus('Больше экземпляров этого предмета в инвентаре нет.');
        return;
      }
    }
    queue.push({...item, qty: 1});
    render();
    setStatus(direction === 'buy' ? 'Предмет добавлен в покупку.' : 'Предмет добавлен в продажу.');
  }

  function removeFromQueue(direction, index) {
    if (busy) return;
    const queue = direction === 'buy' ? buyQueue : sellQueue;
    if (index >= 0 && index < queue.length) queue.splice(index, 1);
    render();
  }

  async function transact(direction) {
    if (busy || !vendor) return;
    const queue = direction === 'buy' ? buyQueue : sellQueue;
    const action = direction === 'buy' ? vendor.buy : vendor.sell;
    if (!action || queue.length === 0) return;
    busy = true;
    render();
    try {
      while (queue.length) {
        const item = queue[0];
        let res;
        try { res = await action(item); }
        catch (e) { res = {success:false,error:'Ошибка соединения с сервером'}; }
        if (!res || !res.success) {
          const message = res?.error || (direction === 'buy' ? 'Покупка не выполнена' : 'Продажа не выполнена');
          gameAlert(message);
          setStatus(message);
          break;
        }
        applyServerState(res);
        queue.shift();
      }
    } finally {
      busy = false;
      render();
    }
  }

  async function warehouseMove(name, direction) {
    if (busy || typeof warehouseTransfer !== 'function') return;
    busy = true;
    render();
    try {
      await warehouseTransfer(direction, name, 1);
      setStatus(direction === 'deposit' ? 'Предмет отправлен на склад.' : 'Предмет забран со склада.');
    } catch (_) {
      gameAlert('Не удалось выполнить перенос со складом.');
    } finally {
      busy = false;
      render();
    }
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('section');
    root.id = 'sharedTradeScreen';
    root.setAttribute('aria-label', 'Торговля');
    root.innerHTML = `
      <div class="trade-shell">
        <header class="trade-topbar"><h2 id="sharedTradeTitle" class="trade-title">Торговля</h2><button id="sharedTradeBack" class="trade-back" type="button">Назад</button></header>
        <div class="trade-balance"><span>❤️ <span id="sharedTradeHealth">0</span> &nbsp; 🍖 <span id="sharedTradeHunger">0</span> &nbsp; 💧 <span id="sharedTradeThirst">0</span></span><span>🪙 <span id="sharedTradeCoins">0</span></span></div>
        <div id="sharedTradeVendorLabel" class="trade-section-label">Лут торговца</div>
        <div id="sharedTradeVendorGrid" class="trade-grid" aria-label="Товары торговца"></div>
        <div class="trade-actions"><button id="sharedTradeBuy" class="trade-action" type="button">Купить</button><button id="sharedTradeSell" class="trade-action" type="button">Продать</button></div>
        <div class="trade-staging">
          <section class="trade-stage" data-trade-drop="buy"><p class="trade-stage-title">Сюда для покупки</p><div id="sharedTradeBuyStage" class="trade-stage-grid"></div></section>
          <section class="trade-stage" data-trade-drop="sell"><p class="trade-stage-title">Сюда для продажи</p><div id="sharedTradeSellStage" class="trade-stage-grid"></div></section>
        </div>
        <div class="trade-section-label">Лут игрока</div>
        <div id="sharedTradePlayerGrid" class="trade-grid trade-player-wrap" aria-label="Инвентарь игрока"></div>
        <button id="sharedTradeWarehouseDrop" class="trade-warehouse-drop" type="button">📦 На склад — перетащи сюда предмет</button>
        <div class="trade-section-label">На складе</div>
        <div id="sharedTradeWarehouseGrid" class="trade-grid trade-warehouse-grid" aria-label="Склад игрока"></div>
        <p id="sharedTradeStatus" class="trade-status" role="status"></p>
      </div>`;
    document.body.append(root);
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, {passive:false});
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
    byId('sharedTradeBack').addEventListener('click', close);
    byId('sharedTradeBuy').addEventListener('click', () => transact('buy'));
    byId('sharedTradeSell').addEventListener('click', () => transact('sell'));
    return root;
  }

  function onClick(e) {
    const slot = e.target.closest('.trade-slot[data-trade-origin]');
    if (!slot || Date.now() < (onClick.suppressUntil || 0)) return;
    const origin = slot.dataset.tradeOrigin;
    const index = Number(slot.dataset.tradeIndex);
    const name = slot.dataset.tradeName;
    if (origin === 'vendor') {
      const item = currentStock()[index];
      if (item) addToQueue('buy', item);
    } else if (origin === 'player') {
      addToQueue('sell', {name, price: displayPrice({name}, 'sell')});
    } else if (origin === 'buy') removeFromQueue('buy', index);
    else if (origin === 'sell') removeFromQueue('sell', index);
    else if (origin === 'warehouse') warehouseMove(name, 'withdraw');
  }

  function onPointerDown(e) {
    if (busy || e.isPrimary === false || e.button !== 0) return;
    const slot = e.target.closest('.trade-slot[data-trade-origin="vendor"],.trade-slot[data-trade-origin="player"]');
    if (!slot || !root?.contains(slot)) return;
    drag = {id:e.pointerId, origin:slot.dataset.tradeOrigin, index:Number(slot.dataset.tradeIndex), name:slot.dataset.tradeName, x:e.clientX, y:e.clientY, startX:e.clientX, startY:e.clientY, active:false, touch:e.pointerType === 'touch'};
    if (drag.touch) drag.timer = setTimeout(beginDrag, 180);
  }

  function beginDrag() {
    if (!drag || drag.active || busy) return;
    drag.active = true;
    ghost = document.createElement('div');
    ghost.className = 'trade-drag-ghost';
    const html = iconHtml(drag.name, 1);
    if (html) ghost.innerHTML = html;
    else ghost.textContent = drag.name;
    document.body.append(ghost);
    paintDrag();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 8) {
      clearTimeout(drag.timer);
      beginDrag();
    }
    if (drag.active) e.preventDefault();
  }

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    if (el.closest('[data-trade-drop="buy"]')) return 'buy';
    if (el.closest('[data-trade-drop="sell"]')) return 'sell';
    if (el.closest('#sharedTradeWarehouseDrop')) return 'warehouse';
    return null;
  }

  function paintDrag() {
    if (!drag?.active || !ghost) return;
    ghost.style.transform = `translate(${drag.x - 29}px,${drag.y - 70}px)`;
    const target = dropTargetAt(drag.x, drag.y);
    root.querySelectorAll('[data-trade-drop],#sharedTradeWarehouseDrop').forEach(el => {
      let allowed = false;
      if (el.dataset.tradeDrop === 'buy') allowed = drag.origin === 'vendor' && !!vendor?.buy;
      if (el.dataset.tradeDrop === 'sell') allowed = drag.origin === 'player' && !!vendor?.sell;
      if (el.id === 'sharedTradeWarehouseDrop') allowed = drag.origin === 'player' && typeof warehouseTransfer === 'function';
      el.classList.toggle('drop-ready', allowed);
      el.classList.toggle('drop-over', allowed && ((el.dataset.tradeDrop || 'warehouse') === target));
    });
    dragFrame = requestAnimationFrame(paintDrag);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const current = drag;
    const target = current.active ? dropTargetAt(e.clientX, e.clientY) : null;
    cancelDrag();
    if (!current.active) return;
    onClick.suppressUntil = Date.now() + 450;
    if (target === 'buy' && current.origin === 'vendor') {
      const item = currentStock()[current.index];
      if (item) addToQueue('buy', item);
    } else if (target === 'sell' && current.origin === 'player') {
      addToQueue('sell', {name:current.name, price:displayPrice({name:current.name}, 'sell')});
    } else if (target === 'warehouse' && current.origin === 'player') {
      warehouseMove(current.name, 'deposit');
    } else setStatus('Перетаскивание отменено.');
  }

  function cancelDrag() {
    if (drag?.timer) clearTimeout(drag.timer);
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    drag = null;
    ghost?.remove(); ghost = null;
    root?.querySelectorAll('.drop-ready,.drop-over').forEach(el => el.classList.remove('drop-ready','drop-over'));
  }

  async function shopBuy(item) {
    if (typeof buyFromServer !== 'function') return {success:false,error:'Покупка у торговца недоступна'};
    const res = await buyFromServer('zhuchara', item.category, item.name, 1);
    if (res?.success) applyServerState(res);
    return res;
  }

  async function shopSell(item) {
    if (typeof sellToServer !== 'function') return {success:false,error:'Продажа торговцу недоступна'};
    const res = await sellToServer('zhuchara', item.name, 1);
    if (res?.success) applyServerState(res);
    return res;
  }

  function leonovStock() {
    const result = [];
    const med = (typeof consumables !== 'undefined' ? consumables : []).filter(x => x.type === 'medkit' || x.type === 'antirad');
    med.forEach(x => result.push({...x, category:'consumable', basePrice:x.price}));
    const detectorTier = typeof getDetectorUnlockTier === 'function' ? getDetectorUnlockTier(player.level) : Infinity;
    (typeof detectors !== 'undefined' ? detectors : []).filter(x => !x.adminOnly && (x.tier ?? 0) <= detectorTier).forEach(x => result.push({...x, category:'detector', basePrice:x.price}));
    const suitTier = typeof getResearchSuitUnlockTier === 'function' ? getResearchSuitUnlockTier(player.level) : Infinity;
    (typeof armorItems !== 'undefined' ? armorItems : []).filter(x => x.isResearchSuit && !x.adminOnly && (x.tier ?? 0) <= suitTier).forEach(x => result.push({...x, category:'armor', basePrice:x.price}));
    return result;
  }

  async function leonovBuy(item) {
    if (typeof buyFromServer !== 'function') return {success:false,error:'Покупка у Леонова недоступна'};
    const res = await buyFromServer('leonov', item.category, item.name, 1);
    if (res?.success) applyServerState(res);
    return res;
  }

  function leonovCanSell(name) {
    try {
      return !!(typeof findArtifactDef === 'function' && findArtifactDef(name)) || !!((typeof mutants !== 'undefined' ? mutants : []).some(m => m.loot === name));
    } catch (_) { return false; }
  }

  async function leonovSell(item) {
    if (typeof sellToScientistsServer !== 'function') return {success:false,error:'Продажа Леонову недоступна'};
    const res = await sellToScientistsServer(item.name, 1);
    if (res?.success) applyServerState(res);
    return res;
  }

  async function dieselSell(item) {
    if (typeof sellToServer !== 'function') return {success:false,error:'Продажа Дизелю недоступна'};
    const res = await sellToServer('technician', item.name, 1);
    if (res?.success) applyServerState(res);
    return res;
  }

  async function friendlyBuy(item) {
    try {
      if (typeof waitForSaveQueue === 'function') await waitForSaveQueue();
      const r = await fetch(`${SERVER_URL}/api/friendly/buy`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:window.Telegram?.WebApp?.initData,name:item.name})});
      const res = await r.json();
      if (res?.success) applyServerState(res);
      return res;
    } catch (_) { return {success:false,error:'Ошибка соединения при покупке'}; }
  }

  async function friendlySell(item) {
    if (typeof sellToServer !== 'function') return {success:false,error:'Продажа недоступна'};
    const res = await sellToServer('zhuchara', item.name, 1);
    if (res?.success) applyServerState(res);
    return res;
  }

  function configs() {
    return {
      zhuchara: {
        id:'zhuchara', title:'💰 Торговец Жучара',
        stock:() => (typeof getShopCatalog === 'function' ? getShopCatalog() : []).map(x => ({...x,basePrice:x.price})),
        canSell:() => true, buy:shopBuy, sell:shopSell, back:'main'
      },
      leonov: {
        id:'leonov', title:'🧪 Эколог Леонов — торговля', stock:leonovStock,
        canSell:leonovCanSell, buy:leonovBuy, sell:leonovSell, back:'leonov'
      },
      diesel: {
        id:'diesel', title:'🔧 Техник Дизель — торговля', stock:() => [],
        canSell:name => typeof getEquipSlotType === 'function' && !!getEquipSlotType(name), buy:null, sell:dieselSell, back:'diesel'
      },
      friendly: {
        id:'friendly', title:'🤝 Торговля с дружественным сталкером',
        stock:() => (typeof consumables !== 'undefined' ? consumables : []).map(x => ({...x,basePrice:x.price,price:getFriendlyBuyPrice(x.price)})),
        canSell:() => true, buy:friendlyBuy, sell:friendlySell, back:'friendly'
      }
    };
  }

  function syncVitals() {
    if (!root) return;
    byId('sharedTradeHealth').textContent = Math.round(Math.max(0, Number(player?.health) || 0));
    byId('sharedTradeHunger').textContent = Math.round(Math.max(0, Number(player?.hunger) || 0));
    byId('sharedTradeThirst').textContent = Math.round(Math.max(0, Number(player?.thirst) || 0));
  }

  function open(id) {
    const config = configs()[id];
    if (!config || busy) return;
    ensureRoot();
    cancelDrag();
    vendor = config;
    buyQueue = [];
    sellQueue = [];
    if (id === 'zhuchara' && baseOpenScreen) baseOpenScreen('main');
    if (id === 'friendly') {
      try {
        if (typeof currentEnemy !== 'undefined' && currentEnemy) config.title = `🤝 ${currentEnemy.name} — ${currentEnemy.faction?.name || 'сталкер'}`;
      } catch (_) {}
      const oldModal = byId('friendlyTradeModal');
      if (oldModal) oldModal.classList.remove('active');
    }
    root.classList.add('active');
    document.body.classList.add('shared-trade-visible');
    syncVitals();
    setStatus();
    render();
    root.scrollTop = 0;
  }

  async function close() {
    if (busy) return;
    cancelDrag();
    const back = vendor?.back;
    root?.classList.remove('active');
    document.body.classList.remove('shared-trade-visible');
    vendor = null; buyQueue = []; sellQueue = [];
    if (back === 'leonov') return window.BunkerMenu?.openLeonov?.();
    if (back === 'friendly') {
      if (typeof leaveFriendlyPeacefully === 'function') await leaveFriendlyPeacefully();
      return;
    }
    if (back === 'diesel') return;
    if (back === 'main' && baseOpenScreen) baseOpenScreen('main');
  }

  function patchEntryPoints() {
    if (baseOpenScreen) {
      window.openScreen = function(screen) {
        if (screen === 'shop') return open('zhuchara');
        return baseOpenScreen.apply(this, arguments);
      };
    }
    const dieselButton = [...document.querySelectorAll('#technicianScreen button')].find(b => (b.getAttribute('onclick') || '').includes("openTechnicianTab('sell')"));
    if (dieselButton) {
      dieselButton.textContent = '💰 Торговля';
      dieselButton.removeAttribute('onclick');
      dieselButton.addEventListener('click', () => open('diesel'));
    }
    if (typeof window.openFriendlyTrade === 'function') window.openFriendlyTrade = () => open('friendly');
  }

  ensureRoot();
  patchEntryPoints();
  window.SharedTrade = {version:'1.0.0',open,close,render};
})();
