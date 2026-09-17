/* Presentation + guarded calls to the original server-authoritative game actions. */
(() => {
  'use strict';
  const main = document.getElementById('mainMenu');
  const scene = document.getElementById('bunkerScene');
  if (!main || !scene) return;
  const art = document.getElementById('bunkerArtwork');
  let enteringRaid = false, readingBook = false, frame = 0;
  let leonovScreen = null, leonovImageLoaded = false;
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const text = (id, value) => {
    const el = document.getElementById(id), next = String(value);
    if (el && el.textContent !== next) el.textContent = next;
  };
  function meter(id, value, max, label) {
    const el = document.getElementById(id);
    if (!el) return;
    max = Math.max(1, finite(max, 100)); value = Math.max(0, finite(value));
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
    for (const [key, label] of [['health','Здоровье'],['hunger','Сытость'],['thirst','Жажда']]) {
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
    if (bookBtn) bookBtn.title = books ? `Прочитать книгу знаний (осталось ${books})` : 'Нет книг знаний';
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
    const width = w <= h ? w : h * ratio, height = h;
    scene.style.width = width + 'px'; scene.style.height = height + 'px';
    scene.style.setProperty('--bunker-unit', width / 941 + 'px');
    scene.style.setProperty('--bunker-vunit', height / 1672 + 'px');
    refresh();
  }
  function scheduleLayout() { if (!frame) frame = requestAnimationFrame(layout); }
  async function enterRaid() {
    if (enteringRaid || readingBook) return;
    enteringRaid = true;
    const btn = document.getElementById('bunkerRaid'); if (btn) btn.disabled = true;
    try { await startRaid(); }
    finally { enteringRaid = false; if (btn) btn.disabled = false; scheduleLayout(); }
  }
  async function readBook() {
    if (readingBook || enteringRaid) return;
    readingBook = true;
    const btn = document.getElementById('bunkerReadBook'); if (btn) btn.disabled = true;
    try { await useKnowledgeBookFromHeader(); }
    finally { readingBook = false; if (btn) btn.disabled = false; refresh(); }
  }
  function ensureLeonovScreen() {
    if (leonovScreen) return leonovScreen;
    const el = document.createElement('section');
    el.id = 'leonovHubScreen';
    el.className = 'leonov-hub-screen';
    el.setAttribute('aria-label', 'Эколог Леонов');
    el.innerHTML = `
      <img id="leonovHubArtwork" class="leonov-hub-artwork" alt="Эколог Леонов за прилавком" draggable="false">
      <div id="leonovTalkBubble" class="leonov-talk-bubble" hidden>Артефакты — это язык Зоны. Главное — уметь слушать.</div>
      <nav class="leonov-actions" aria-label="Действия у Леонова">
        <button type="button" data-leonov-action="selection">Селекция</button>
        <button type="button" data-leonov-action="trade">Торговля</button>
        <button type="button" data-leonov-action="talk">Говорить</button>
        <button type="button" data-leonov-action="back">Назад</button>
      </nav>`;
    document.body.appendChild(el);
    leonovScreen = el;
    el.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-leonov-action]');
      if (!btn) return;
      const action = btn.dataset.leonovAction;
      if (action === 'back') return closeLeonov();
      if (action === 'talk') {
        const bubble = document.getElementById('leonovTalkBubble');
        bubble.hidden = !bubble.hidden;
        return;
      }
      openScientistAction(action === 'selection' ? ['селек', 'артефакт'] : ['торгов', 'куп', 'прод']);
    });
    if (!leonovImageLoaded) {
      leonovImageLoaded = true;
      fetch('ui/leonov-portrait.webp.b64?v=20260918')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(b64 => { document.getElementById('leonovHubArtwork').src = 'data:image/webp;base64,' + b64.trim(); })
        .catch(() => { document.getElementById('leonovHubArtwork').alt = 'Не удалось загрузить изображение Леонова'; });
    }
    return el;
  }
  function openLeonov() {
    const el = ensureLeonovScreen();
    el.classList.add('active');
    document.body.classList.add('leonov-hub-visible');
    const bubble = document.getElementById('leonovTalkBubble'); if (bubble) bubble.hidden = true;
  }
  function closeLeonov() {
    if (leonovScreen) leonovScreen.classList.remove('active');
    document.body.classList.remove('leonov-hub-visible');
    if (typeof openScreen === 'function') openScreen('main');
  }
  function openScientistAction(words) {
    if (leonovScreen) leonovScreen.classList.remove('active');
    document.body.classList.remove('leonov-hub-visible');
    if (typeof openScreen !== 'function') return;
    openScreen('scientists');
    requestAnimationFrame(() => {
      const root = document.getElementById('scientistsScreen');
      if (!root) return;
      const buttons = [...root.querySelectorAll('button')];
      const hit = buttons.find(b => {
        const t = (b.textContent || '').toLowerCase();
        return words.some(w => t.includes(w));
      });
      if (hit && hit.offsetParent !== null) hit.click();
    });
  }
  const leonovHotspot = document.getElementById('bunkerLeonov');
  if (leonovHotspot) leonovHotspot.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); openLeonov(); };
  new MutationObserver(scheduleLayout).observe(main, {attributes:true, attributeFilter:['style']});
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', scheduleLayout);
  art.addEventListener('load', scheduleLayout);
  art.addEventListener('error', () => {
    const el = document.getElementById('bunkerMessage');
    if (el) { el.textContent = 'Не удалось загрузить фон. Проверьте соединение и откройте игру заново.'; el.hidden = false; }
  });
  window.BunkerMenu = {version:'1.1.0', refresh, enterRaid, readBook, openLeonov, closeLeonov};
  layout();
})();
