/* Presentation + guarded calls to the original server-authoritative game actions. */
(() => {
  'use strict';
  const main = document.getElementById('mainMenu');
  const scene = document.getElementById('bunkerScene');
  if (!main || !scene) return;
  const art = document.getElementById('bunkerArtwork');
  let enteringRaid = false, readingBook = false, frame = 0;
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const text = (id, value) => {
    const el = document.getElementById(id), next = String(value);
    if (el && el.textContent !== next) el.textContent = next;
  };
  function meter(id, value, max, label) {
    const el = document.getElementById(id);
    max = Math.max(1, finite(max, 100)); value = Math.max(0, finite(value));
    const width = clamp(value / max * 100, 0, 100) + '%';
    const fill = el.querySelector('.bunker-vital-fill, .bunker-progress-fill');
    if (fill.style.width !== width) fill.style.width = width;
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
    document.getElementById('bunkerReadBook').title = books ? `Прочитать книгу знаний (осталось ${books})` : 'Нет книг знаний';
    // Keep large balances in their own cells without covering labels or the backpack.
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
    // Portrait fills the whole phone without cropping doors/HUD; landscape keeps a portrait canvas.
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
    const btn = document.getElementById('bunkerRaid'); btn.disabled = true;
    try { await startRaid(); }
    finally { enteringRaid = false; btn.disabled = false; scheduleLayout(); }
  }
  async function readBook() {
    if (readingBook || enteringRaid) return;
    readingBook = true;
    const btn = document.getElementById('bunkerReadBook'); btn.disabled = true;
    try { await useKnowledgeBookFromHeader(); }
    finally { readingBook = false; btn.disabled = false; refresh(); }
  }
  // No polling, no extra saves/API calls. Original updateUI invokes refresh.
  new MutationObserver(scheduleLayout).observe(main, {attributes:true, attributeFilter:['style']});
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', scheduleLayout);
  art.addEventListener('load', scheduleLayout);
  art.addEventListener('error', () => {
    const el = document.getElementById('bunkerMessage');
    el.textContent = 'Не удалось загрузить фон. Проверьте соединение и откройте игру заново.'; el.hidden = false;
  });
  window.BunkerMenu = {version:'1.0.0', refresh, enterRaid, readBook};
  layout();
})();
