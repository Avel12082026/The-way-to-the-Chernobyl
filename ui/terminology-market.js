/* Terminology cleanup + two-currency player market. Internal save keys stay unchanged. */
(() => {
  'use strict';
  if (window.TerminologyMarketPatch) return;

  const replacements = [
    ['Магазин Байт', 'Магазин Сталбайтов'],
    ['магазин Байт', 'магазин Сталбайтов'],
    ['Жетонов сталкера', 'Сталкоинов'],
    ['жетонов сталкера', 'сталкоинов'],
    ['Жетона сталкера', 'Сталкоина'],
    ['жетона сталкера', 'сталкоина'],
    ['Жетоны сталкера', 'Сталкоины'],
    ['жетоны сталкера', 'сталкоины'],
    ['Жетон сталкера', 'Сталкоин'],
    ['жетон сталкера', 'сталкоин'],
    ['Книги знаний', 'Опыт+'],
    ['книги знаний', 'Опыт+'],
    ['Книга знаний', 'Опыт+'],
    ['книга знаний', 'Опыт+'],
    ['книгу знаний', 'Опыт+'],
    ['книг знаний', 'Опыт+'],
    ['Байтов', 'Сталбайтов'],
    ['байтов', 'сталбайтов'],
    ['Байта', 'Сталбайта'],
    ['байта', 'сталбайта'],
    ['Байты', 'Сталбайты'],
    ['байты', 'сталбайты'],
    ['Байт', 'Сталбайт'],
    ['байт', 'сталбайт'],
    ['Назат', 'Назад'],
    ['Тушенка', 'Тушёнка'],
    ['Псевдо собака', 'Псевдособака'],
    ['Пси собака', 'Пси-собака'],
    ['Электро химера', 'Электрохимера'],
    ['Рука покрытая перьями', 'Рука, покрытая перьями']
  ];

  function rewriteText(value) {
    let text = String(value ?? '');
    for (const [from, to] of replacements) text = text.split(from).join(to);
    return text;
  }

  function rewriteTree(root) {
    if (!root) return;
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(parent.tagName)) return;
        const next = rewriteText(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(node.tagName)) return;
      for (const attr of ['aria-label', 'title', 'placeholder']) {
        if (!node.hasAttribute(attr)) continue;
        const value = node.getAttribute(attr);
        const next = rewriteText(value);
        if (next !== value) node.setAttribute(attr, next);
      }
      for (const child of node.childNodes) visit(child);
    };
    visit(root);
  }

  function installTerminologyObserver() {
    if (!document.body) return;
    rewriteTree(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') rewriteTree(record.target);
        else if (record.type === 'attributes') rewriteTree(record.target);
        else for (const node of record.addedNodes) rewriteTree(node);
      }
    });
    observer.observe(document.body, {
      subtree:true,
      childList:true,
      characterData:true,
      attributes:true,
      attributeFilter:['aria-label','title','placeholder']
    });
  }

  const currencyOf = lot => lot?.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes';
  const currencyLabel = currency => currency === 'stalkcoins' ? 'сталкоинов' : 'сталбайтов';
  const balanceFor = currency => currency === 'stalkcoins'
    ? Math.max(0, Number(player?.breedCredits) || 0)
    : Math.max(0, Number(player?.coins) || 0);
  const money = value => Math.max(0, Number(value) || 0).toLocaleString('ru-RU');

  function renderMarketPatched() {
    const content = document.getElementById('marketContent');
    if (!content || typeof marketTab === 'undefined') return;
    content.innerHTML = '';

    if (marketTab === 'my') {
      content.innerHTML = '<p style="padding:10px; color:#888;">Загрузка...</p>';
      fetch(`${SERVER_URL}/api/market`)
        .then(res => res.json())
        .then(lots => {
          const myLots = lots.filter(l => String(l.seller_id) === String(getPlayerId()));
          if (myLots.length === 0) {
            content.innerHTML = '<p style="padding:10px; color:#888;">Вы ничего не продаёте</p>';
            return;
          }
          content.innerHTML = myLots.map(lot => {
            const currency = currencyOf(lot);
            return shopCardHtml(lot.item, `
              <p><strong>${lot.item}</strong></p>
              <p>Цена: ${money(lot.price)} ${currencyLabel(currency)} всего (${money(Math.round(lot.price / lot.quantity))} за шт.)</p>
              <p>Количество: ${lot.quantity}</p>
              <div style="display:flex; gap:6px; justify-content:flex-end;">
                ${typeof infoButtonHtml === 'function' ? infoButtonHtml(lot.item) : ''}
                <button onclick="cancelMarketLot(${lot.id})" style="background:#c0392b;">Снять с продажи</button>
              </div>`);
          }).join('');
          rewriteTree(content);
        })
        .catch(() => { content.innerHTML = '<p style="padding:10px; color:#888;">Не удалось загрузить рынок</p>'; });
      return;
    }

    if (marketTab === 'buy') {
      if (!marketCategory) {
        content.innerHTML = MARKET_CATEGORIES.map(cat => `
          <button onclick="openMarketCategory('${cat}')" style="width:100%; margin-bottom:8px; padding:14px; background:#1a1a1a; border:2px solid #333; color:#ddd; border-radius:8px; font-weight:bold;">${cat}</button>
        `).join('');
        rewriteTree(content);
        return;
      }
      content.innerHTML = `<p style="padding:6px 0; color:#8a7a4a; font-weight:bold;">${marketCategory}</p>
        <button onclick="openMarketCategory(null)" style="margin-bottom:8px;">← Все категории</button>
        <div id="marketBuyList"><p style="padding:10px; color:#888;">Загрузка...</p></div>`;

      const isHybridCategory = marketCategory === 'Гибриды артефактов';
      const showStatsInList = marketCategory !== 'Части тел мутантов';
      const registryPromise = isHybridCategory
        ? fetch(`${SERVER_URL}/api/artifacts`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]);

      Promise.all([fetch(`${SERVER_URL}/api/market`).then(r => r.json()), registryPromise])
        .then(([lots, registry]) => {
          const list = document.getElementById('marketBuyList');
          if (!list) return;
          if (isHybridCategory) {
            registry.forEach(def => { if (!artifacts.some(a => a.name === def.name)) artifacts.push(def); });
          }
          const buyableLots = lots.filter(l => categorizeMarketItem(l.item) === marketCategory);
          if (buyableLots.length === 0) {
            list.innerHTML = '<p style="padding:10px; color:#888;">Пока никто не продаёт</p>';
            return;
          }
          list.innerHTML = buyableLots.map(lot => {
            const isMine = String(lot.seller_id) === String(getPlayerId());
            const currency = currencyOf(lot);
            const enough = balanceFor(currency) >= Number(lot.price || 0);
            const actionHtml = isMine
              ? '<span style="display:inline-block; padding:8px 14px; background:#3a3424; color:#a89a72; border-radius:6px; font-weight:bold;">Мой товар</span>'
              : `<button onclick="buyMarketItem(${lot.id}, '${lot.item.replace(/'/g, "\\'")}')" ${enough ? '' : 'disabled'}>Купить</button>`;
            return shopCardHtml(lot.item, `
              <p><strong>${lot.item}</strong> ×${lot.quantity}</p>
              <p style="color:#aaa; font-size:12px;">Продавец: ${escapeHtml(lot.seller_username || lot.seller_id)}</p>
              <p>Цена: ${money(lot.price)} ${currencyLabel(currency)} всего (${money(Math.round(lot.price / lot.quantity))} за шт.)</p>
              <div style="display:flex; gap:6px; justify-content:flex-end;">
                ${showStatsInList && typeof infoButtonHtml === 'function' ? infoButtonHtml(lot.item) : ''}
                ${actionHtml}
              </div>`);
          }).join('');
          rewriteTree(list);
        })
        .catch(() => {
          const list = document.getElementById('marketBuyList');
          if (list) list.innerHTML = '<p style="padding:10px; color:#888;">Не удалось загрузить рынок</p>';
        });
      return;
    }

    if (marketTab === 'sell') {
      const items = Object.keys(player.inventory || {}).filter(name => player.inventory[name] > 0);
      if (items.length === 0) {
        content.innerHTML = '<p style="padding:10px; color:#888;">Нечего выставить на продажу</p>';
        return;
      }
      content.innerHTML = items.map(name => shopCardHtml(name, `
        <p><strong>${name}</strong> ×${player.inventory[name]}</p>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          ${typeof infoButtonHtml === 'function' ? infoButtonHtml(name) : ''}
          <button onclick="listItemForSale('${name.replace(/'/g, "\\'")}')">Продать</button>
        </div>`)).join('');
      rewriteTree(content);
    }
  }

  function listItemForSalePatched(itemName) {
    if (!player.inventory?.[itemName] || player.inventory[itemName] <= 0) return;
    const def = typeof findArtifactDef === 'function' ? findArtifactDef(itemName) : null;
    const parsed = typeof parseGearName === 'function' ? parseGearName(itemName) : {baseName:itemName};
    const w = typeof weapons !== 'undefined' ? weapons.find(x => x.name === parsed.baseName) : null;
    const a = typeof armorItems !== 'undefined' ? armorItems.find(x => x.name === parsed.baseName) : null;
    if ((def && def.isNamedArtifact) || (def && def.adminOnly) || (w && w.adminOnly) || (a && a.adminOnly)) {
      showGameAlert('Этот уникальный/административный предмет нельзя выставлять на рынок.');
      return;
    }

    const choice = prompt('За какую валюту выставить лот?\n1 — Сталбайты\n2 — Сталкоины', '1');
    if (choice === null) return;
    const normalized = choice.trim();
    if (normalized !== '1' && normalized !== '2') {
      showGameAlert('Выберите валюту: 1 — сталбайты, 2 — сталкоины.');
      return;
    }
    const currency = normalized === '2' ? 'stalkcoins' : 'bytes';
    const maxQty = player.inventory[itemName];
    const qtyStr = prompt(`Сколько шт. "${itemName}" продать? (доступно: ${maxQty})`, String(maxQty));
    if (qtyStr === null) return;
    const qty = Number.parseInt(qtyStr, 10);
    if (!Number.isInteger(qty) || qty <= 0) { showGameAlert('Введите корректное количество: целое число больше нуля.'); return; }
    if (qty > maxQty) { showGameAlert(`У вас есть только ${maxQty} шт. Введите число не больше доступного.`); return; }

    const unitLabel = currency === 'stalkcoins' ? 'сталкоинах' : 'сталбайтах';
    const priceStr = prompt(`Цена за ОДНУ единицу (в ${unitLabel}):`, currency === 'stalkcoins' ? '1' : '100');
    if (priceStr === null) return;
    const pricePerUnit = Number.parseInt(priceStr, 10);
    if (!Number.isInteger(pricePerUnit) || pricePerUnit <= 0) { showGameAlert('Введите корректную цену: целое число больше нуля.'); return; }
    const price = pricePerUnit * qty;
    if (!Number.isSafeInteger(price) || price <= 0) { showGameAlert('Цена лота слишком большая.'); return; }

    fetch(`${SERVER_URL}/api/market/sell`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        initData:window.Telegram?.WebApp?.initData,
        item:itemName,
        quantity:qty,
        price,
        currency
      })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) { showGameAlert('Ошибка: ' + (data.error || 'не удалось выставить лот')); return; }
        showGameAlert(`Выставлено на продажу за ${currencyLabel(currency)}.`);
        loadGame();
        openMarketTab('my');
      })
      .catch(() => showGameAlert('Ошибка соединения с сервером'));
  }

  function installMarketPatch() {
    if (typeof window.renderMarket === 'function') window.renderMarket = renderMarketPatched;
    if (typeof window.listItemForSale === 'function') window.listItemForSale = listItemForSalePatched;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installMarketPatch();
      installTerminologyObserver();
    }, {once:true});
  } else {
    installMarketPatch();
    installTerminologyObserver();
  }

  window.TerminologyMarketPatch = Object.freeze({
    version:'1.0.0',
    rewriteText,
    renderMarket:renderMarketPatched,
    listItemForSale:listItemForSalePatched
  });
})();
