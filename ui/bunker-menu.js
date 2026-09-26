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
  let rostokCampScreen = null;
  let barmanHubScreen = null;
  let rostokReturnPending = false;
  let zoneMapScreen = null;
  let zoneMapOrigin = 'camp';
  let zoneMapLoadSeq = 0;
  let zoneMapTravelling = false;
  let worldPositionRestored = false;
  let worldPositionRestoring = false;
  let worldPositionTimer = 0;
  let worldPositionLast = '';
  const ZONE_TRAVEL_MS = 4500;
  const ZONE_MAP_NAMES = Object.freeze({1:'Кордон',2:'Свалка',3:'НИИ Агропром',4:'Россток'});
  const ZONE_ROUTE_STORAGE = 'pocketzone.zoneRoute.v2';
  const ZONE_LOCATION_STORAGE = 'pocketzone.zoneLocation.v1';
  const zoneRouteKinds = new Set(['enemy', 'mutant', 'anomaly']);
  const ZONE_MAP_ASSETS = Object.freeze({
    1: {path:'/api/zone-map/1', width:890, height:1536},
    2: {path:'/api/zone-map/2', width:864, height:1536},
    3: {path:'/api/zone-map/3', width:863, height:1536},
    4: {path:'/api/zone-map/4', width:865, height:1536}
  });
  const ZONE_TRAVEL_CACHE = '20260926-agroprom-original1';
  const ZONE_TRAVEL_ASSETS = Object.freeze({
    // Kordon uses the exact 864x1536 artwork supplied by the owner, served byte-for-byte by the game server.
    1:'/images/zone-travel/kordon-original.jpg',
    // Svalka uses the approved people-free loading artwork served byte-for-byte by the game server.
    2:'/images/zone-travel/svalka-loading.png',
    // NII Agroprom uses the approved people-free loading artwork served byte-for-byte by the game server.
    3:'/images/zone-travel/agroprom-loading.png',
    4:'images/combat/environments/16.webp'
  });
  const ZONE_TRAVEL_SCENES = Object.freeze({
    // Kordon: quiet Rookie Village at night. No anomaly and no mutants.
    1:{kind:'camp'},
    // Svalka: authored scrapyard loading artwork only. No people, anomaly overlays or mutants.
    2:{kind:'location'},
    // Agroprom and Rostok: real game armor + weapons fitted by CombatFighters.
    3:{kind:'location'},
    4:{kind:'mutant',fighters:[{armorId:45,weaponId:15},{armorId:31,weaponId:11}],mutant:'images/combat/mutants/bloodsucker.png'}
  });
  const ZONE_MAP_POINTS = Object.freeze({
    1: [
      {id:'transition-to-2',kind:'transition',label:'Переход на Свалку',x:44.28,y:4.07,targetLocation:2,unlock:'first-location-gear'},
      {id:'anomaly-1-1',kind:'anomaly',label:'Аномалия',x:90.88,y:5.24},
      {id:'mutant-1-1',kind:'mutant',label:'Мутанты',x:20.97,y:13.14},
      {id:'enemy-1-1',kind:'enemy',label:'NPC',x:60.50,y:27.78},
      {id:'mutant-1-2',kind:'mutant',label:'Мутанты',x:39.14,y:33.41},
      {id:'mutant-1-3',kind:'mutant',label:'Мутанты',x:93.86,y:31.25},
      {id:'enemy-1-2',kind:'enemy',label:'NPC',x:56.56,y:58.74},
      {id:'enemy-1-3',kind:'enemy',label:'NPC',x:91.70,y:58.36},
      {id:'camp-1',kind:'camp',label:'Лагерь сталкеров',x:8.17,y:69.91},
      {id:'anomaly-1-2',kind:'anomaly',label:'Аномалия',x:74.88,y:82.55},
      {id:'enemy-1-4',kind:'enemy',label:'NPC',x:18.30,y:90.71}
    ],
    2: [
      {id:'transition-to-4',kind:'transition',label:'Переход на Россток',x:68.26,y:24.48,targetLocation:4,unlock:'second-pistol-decade'},
      {id:'mutant-2-1',kind:'mutant',label:'Мутанты',x:18.70,y:28.69},
      {id:'mutant-2-2',kind:'mutant',label:'Мутанты',x:87.03,y:25.38},
      {id:'anomaly-2-1',kind:'anomaly',label:'Аномалия',x:81.06,y:42.12},
      {id:'enemy-2-1',kind:'enemy',label:'Бандиты',x:25.24,y:45.01},
      {id:'enemy-2-2',kind:'enemy',label:'Бандиты',x:46.25,y:45.00},
      {id:'transition-to-3',kind:'transition',label:'Переход на НИИ Агропром',x:10.50,y:47.49,targetLocation:3,unlock:'last-nine-pistols'},
      {id:'mutant-2-3',kind:'mutant',label:'Мутанты',x:87.11,y:58.30},
      {id:'anomaly-2-2',kind:'anomaly',label:'Аномалия',x:10.58,y:63.39},
      {id:'enemy-2-3',kind:'enemy',label:'Бандиты',x:45.43,y:68.65},
      {id:'transition-to-1',kind:'transition',label:'Переход на Кордон',x:62.82,y:71.62,targetLocation:1,unlock:'none'}
    ],
    3: [
      {id:'anomaly-3-1',kind:'anomaly',label:'Аномалия',x:9.85,y:34.57},
      {id:'anomaly-3-2',kind:'anomaly',label:'Аномалия',x:82.27,y:36.95},
      {id:'enemy-3-1',kind:'enemy',label:'Военные',x:48.15,y:40.82},
      {id:'transition-to-2',kind:'transition',label:'Переход на Свалку',x:93.51,y:42.28,targetLocation:2,unlock:'none'},
      {id:'mutant-3-1',kind:'mutant',label:'Мутанты',x:42.41,y:52.57},
      {id:'enemy-3-2',kind:'enemy',label:'Военные',x:16.86,y:59.57},
      {id:'mutant-3-2',kind:'mutant',label:'Мутанты',x:83.95,y:60.64}
    ],
    4: [
      {id:'transition-4-future-top',kind:'transition',label:'Переход на будущую локацию',x:38.61,y:5.21,future:true},
      {id:'anomaly-4-1',kind:'anomaly',label:'Аномалия',x:25.90,y:13.35},
      {id:'anomaly-4-2',kind:'anomaly',label:'Аномалия',x:72.72,y:18.49},
      {id:'enemy-4-1',kind:'enemy',label:'Наёмники',x:20.46,y:30.86},
      {id:'enemy-4-2',kind:'enemy',label:'Наёмники',x:41.04,y:32.62},
      {id:'camp-4',kind:'camp',label:'Бар «100 RADS»',x:65.32,y:37.76},
      {id:'enemy-4-3',kind:'enemy',label:'Наёмники',x:20.81,y:41.28},
      {id:'mutant-4-1',kind:'mutant',label:'Мутанты',x:35.38,y:69.99},
      {id:'transition-4-future-left',kind:'transition',label:'Переход на будущую локацию',x:6.94,y:78.78,future:true},
      {id:'anomaly-4-3',kind:'anomaly',label:'Аномалия',x:71.91,y:82.36},
      {id:'mutant-4-2',kind:'mutant',label:'Мутанты',x:20.92,y:86.13},
      {id:'mutant-4-3',kind:'mutant',label:'Мутанты',x:45.66,y:88.80},
      {id:'transition-to-2',kind:'transition',label:'Переход на Свалку',x:93.76,y:89.32,targetLocation:2,unlock:'none'}
    ]
  });

  let zoneRaidKind = '';
  let zoneLocation = 1;
  try {
    const savedKind = localStorage.getItem(ZONE_ROUTE_STORAGE) || '';
    zoneRaidKind = zoneRouteKinds.has(savedKind) ? savedKind : '';
    const savedLocation = Number(localStorage.getItem(ZONE_LOCATION_STORAGE) || 1);
    zoneLocation = ZONE_MAP_ASSETS[savedLocation] ? savedLocation : 1;
  } catch (_) {}
  let zoneMapPoints = ZONE_MAP_POINTS[zoneLocation].map(point => ({...point}));

  function setZoneRaidKind(kind) {
    zoneRaidKind = zoneRouteKinds.has(kind) ? kind : '';
    window.__zoneRaidKind = zoneRaidKind;
    try {
      if (zoneRaidKind) localStorage.setItem(ZONE_ROUTE_STORAGE, zoneRaidKind);
      else localStorage.removeItem(ZONE_ROUTE_STORAGE);
    } catch (_) {}
  }

  function setZoneLocation(location, persist = true) {
    const next = ZONE_MAP_ASSETS[Number(location)] ? Number(location) : 1;
    zoneLocation = next;
    zoneMapPoints = ZONE_MAP_POINTS[next].map(point => ({...point}));
    window.__zoneLocation = zoneLocation;
    if (persist) {
      try { localStorage.setItem(ZONE_LOCATION_STORAGE, String(zoneLocation)); } catch (_) {}
    }
    if (zoneMapScreen) {
      const title = document.getElementById('zoneMapTitle');
      if (title) title.textContent = ZONE_MAP_NAMES[zoneLocation] || ('Локация ' + zoneLocation);
      renderZoneMapPoints();
      loadZoneMapArtwork(zoneLocation);
    }
    return zoneLocation;
  }

  const WORLD_POSITION_PLACES = new Set([
    'cordon-camp','zone-map','rostok-bar','barman','inventory','kpk',
    'warehouse','arena','market','chat','zhuchara','diesel','leonov','smoker'
  ]);

  function normalizeWorldPosition(raw) {
    let location = ZONE_MAP_ASSETS[Number(raw?.zoneLocation)] ? Number(raw.zoneLocation) : 1;
    let place = WORLD_POSITION_PLACES.has(String(raw?.place||'')) ? String(raw.place) : 'cordon-camp';
    let origin = ['cordon-camp','zone-map','rostok-bar'].includes(String(raw?.origin||'')) ? String(raw.origin) : 'cordon-camp';

    if (['rostok-bar','barman'].includes(place)) {
      location = 4;
      origin = 'rostok-bar';
    } else if (['cordon-camp','zhuchara','diesel','leonov','smoker','arena','market','chat'].includes(place)) {
      location = 1;
      origin = 'cordon-camp';
    } else if (['inventory','kpk','warehouse'].includes(place)) {
      if (origin === 'rostok-bar') location = 4;
      else { location = 1; origin = 'cordon-camp'; }
    } else if (place === 'zone-map') {
      origin = 'zone-map';
    }
    return {zoneLocation:location,place,origin};
  }

  function sendWorldPosition(payload, keepalive = false) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData || typeof fetch !== 'function') return Promise.resolve(false);
    const body = JSON.stringify({initData,...payload});
    return fetch(`${SERVER_URL}/api/player/position`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body,
      keepalive:!!keepalive
    }).then(r=>r.ok?r.json():null).then(result=>{
      if (result?.success && typeof player === 'object' && player) player.worldPosition = result.worldPosition;
      return !!result?.success;
    }).catch(()=>false);
  }

  function saveWorldPosition(place, origin = 'zone-map', immediate = false) {
    // If the player has already navigated somewhere during startup, that new
    // action wins over any still-pending restore from the previous session.
    if (!worldPositionRestoring && !worldPositionRestored) worldPositionRestored = true;
    const payload = normalizeWorldPosition({zoneLocation,place,origin});
    const signature = JSON.stringify(payload);
    if (!worldPositionRestoring && signature === worldPositionLast && !immediate) return;
    worldPositionLast = signature;
    if (typeof player === 'object' && player) {
      player.worldPosition = {...payload,updatedAt:Date.now()};
    }
    clearTimeout(worldPositionTimer);
    if (worldPositionRestoring) return;
    const write = () => sendWorldPosition(payload,false);
    if (immediate) void write();
    else worldPositionTimer = setTimeout(write,120);
  }

  function saveCurrentWorldPositionOnExit() {
    if (worldPositionRestoring || !worldPositionLast) return;
    let payload;
    try { payload = JSON.parse(worldPositionLast); } catch (_) { return; }
    clearTimeout(worldPositionTimer);
    void sendWorldPosition(payload,true);
  }

  function restorePlayerWorldPosition() {
    if (worldPositionRestored || typeof player !== 'object' || !player?.worldPosition) return false;
    const saved = normalizeWorldPosition(player.worldPosition);
    worldPositionRestored = true;
    worldPositionRestoring = true;
    setZoneLocation(saved.zoneLocation,true);
    if (saved.origin === 'rostok-bar' && saved.zoneLocation === 4 && ['inventory','kpk','warehouse'].includes(saved.place)) {
      rostokReturnPending = true;
    }
    const finish = () => {
      worldPositionRestoring = false;
      worldPositionLast = JSON.stringify(saved);
    };
    const openSaved = (attempt = 0) => {
      try {
        if (saved.place === 'rostok-bar') openRostokCamp();
        else if (saved.place === 'barman') openBarmanHub();
        else if (saved.place === 'zone-map') openZoneMap('camp');
        else if (saved.place === 'zhuchara') {
          if (window.TraderHubs?.openZhuchara) window.TraderHubs.openZhuchara();
          else if (attempt < 20) return setTimeout(()=>openSaved(attempt+1),50);
          else openScreen('main');
        } else if (saved.place === 'diesel') {
          if (window.TraderHubs?.openDiesel) window.TraderHubs.openDiesel();
          else if (attempt < 20) return setTimeout(()=>openSaved(attempt+1),50);
          else openScreen('main');
        } else if (saved.place === 'leonov') {
          if (window.BunkerMenu?.openLeonov) window.BunkerMenu.openLeonov();
          else if (typeof openLeonov === 'function') openLeonov();
          else openScreen('main');
        } else if (saved.place === 'smoker') {
          if (window.BunkerMenu?.openSmoker) window.BunkerMenu.openSmoker();
          else openScreen('main');
        } else if (['inventory','kpk','warehouse','arena','market','chat'].includes(saved.place)) {
          openScreen(saved.place);
        } else {
          openScreen('main');
        }
      } finally {
        if (!(saved.place === 'zhuchara' && !window.TraderHubs?.openZhuchara && attempt < 20) &&
            !(saved.place === 'diesel' && !window.TraderHubs?.openDiesel && attempt < 20)) finish();
      }
    };
    requestAnimationFrame(()=>openSaved(0));
    return true;
  }

  function restorePlayerWorldPositionWhenReady(attempt = 0) {
    if (worldPositionRestored) return;
    if (typeof player === 'object' && player?.worldPosition) {
      restorePlayerWorldPosition();
      return;
    }
    const loading = document.getElementById('loading');
    const app = document.getElementById('app');
    const profileLoaded = loading && loading.style.display === 'none' && app && app.style.display !== 'none';
    if (profileLoaded) {
      worldPositionRestored = true;
      worldPositionRestoring = false;
      setZoneLocation(1,true);
      saveWorldPosition('cordon-camp','cordon-camp',true);
      return;
    }
    if (attempt < 120) setTimeout(()=>restorePlayerWorldPositionWhenReady(attempt+1),50);
  }

  window.addEventListener('pagehide', saveCurrentWorldPositionOnExit);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveCurrentWorldPositionOnExit();
  });

  function pistolWeaponList() {
    if (typeof weapons === 'undefined' || !Array.isArray(weapons)) return [];
    const start = weapons.findIndex(item => item && item.starterGear);
    const end = start >= 0
      ? weapons.findIndex((item, index) => index > start && /^Дробовик(?:\s|$)/i.test(String(item?.name || '')))
      : -1;
    const group = start >= 0 ? weapons.slice(start, end > start ? end : weapons.length) : weapons;
    return group.filter(item => item && !item.adminOnly);
  }

  function firstLocationWeaponList() {
    return pistolWeaponList().slice(0, 10);
  }

  function secondPistolDecade() {
    return pistolWeaponList().slice(10, 20);
  }

  function lastNinePistols() {
    return pistolWeaponList().slice(-9);
  }

  function firstLocationArmorList() {
    if (typeof armorItems === 'undefined' || !Array.isArray(armorItems)) return [];
    return armorItems.filter(item => item && !item.adminOnly && !item.isResearchSuit && !item.isPremiumArmor).slice(0, 10);
  }

  function gearUnlocked(list, expectedCount) {
    if (typeof player !== 'object' || !player || list.length < expectedCount) return false;
    return list.every(item => Number(player.level) >= Number(item.unlockLevel || 0));
  }

  function firstLocationToSecondReady() {
    return gearUnlocked(firstLocationWeaponList(), 10) && gearUnlocked(firstLocationArmorList(), 10);
  }

  function secondPistolDecadeReady() {
    return gearUnlocked(secondPistolDecade(), 10);
  }

  function lastNinePistolsReady() {
    return gearUnlocked(lastNinePistols(), 9);
  }

  function patchLocationOneShopCatalog() {
    const native = window.getShopCatalog;
    if (typeof native !== 'function' || native.__zoneLocationOneLimited) return;
    const armorNames = new Set(firstLocationArmorList().map(item => item.name));
    const limited = function() {
      return native().filter(item => {
        // Оружие больше не режем первыми 10 пистолетами: торговец открывает
        // весь оружейный ряд по общей прогрессии раз в 3 уровня.
        if (item?.category === 'armor') return armorNames.has(item.name);
        return true;
      });
    };
    limited.__zoneLocationOneLimited = true;
    limited.__zoneLocationOneNative = native;
    window.getShopCatalog = limited;
  }

  function patchZoneRaidFetch() {
    if (window.__zoneRaidFetchPatched || typeof window.fetch !== 'function') return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (zoneRaidKind && /\/api\/raid\/step(?:\?|$)/.test(url) && (!input || typeof input === 'string')) {
        const nextUrl = url.replace('/api/raid/step', '/api/raid/zone-step');
        let body = {};
        try { body = JSON.parse(init?.body || '{}'); } catch (_) {}
        return nativeFetch(nextUrl, {
          ...(init || {}),
          headers: {...(init?.headers || {}), 'Content-Type':'application/json'},
          body: JSON.stringify({...body, zoneKind: zoneRaidKind, zoneLocation})
        });
      }
      return nativeFetch(input, init);
    };
    window.__zoneRaidFetchPatched = true;
  }

  patchLocationOneShopCatalog();
  patchZoneRaidFetch();
  window.__zoneRaidKind = zoneRaidKind;
  window.__zoneLocation = zoneLocation;

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
    refreshRostokCamp();
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

  function layoutCampScene(target) {
    // One coordinate system for both camps, including Telegram viewport resizes.
    const viewport = window.visualViewport;
    const w = Math.max(1, viewport ? viewport.width : window.innerWidth);
    const h = Math.max(1, viewport ? viewport.height : window.innerHeight);
    const width = w <= h ? w : h * 941 / 1672;
    target.style.width = width + 'px';
    target.style.height = h + 'px';
    target.style.setProperty('--bunker-unit', width / 941 + 'px');
    target.style.setProperty('--bunker-vunit', h / 1672 + 'px');
    // The original Cordon scene stretches vertically; its crop must do the same.
    target.style.setProperty('--rostok-hud-height', h * 182 / 1672 + 'px');
  }

  function layout() {
    frame = 0;
    const visible = main.style.display !== 'none';
    document.body.classList.toggle('bunker-menu-visible', visible);
    if (!visible) return;
    layoutCampScene(scene);
    refresh();
  }

  function scheduleLayout() {
    if (!frame) frame = requestAnimationFrame(layout);
  }

  function refreshRostokCamp() {
    if (!rostokCampScreen || typeof player !== 'object' || !player) return;
    for (const [key, label] of [['health', 'Здоровье'], ['hunger', 'Сытость'], ['thirst', 'Жажда']]) {
      const name = key[0].toUpperCase() + key.slice(1);
      const max = Math.max(1, finite(player['max' + name], 100));
      const value = Math.max(0, finite(player[key]));
      meter('rostok' + name, value, max, label);
      text('rostok' + name + 'Text', Math.round(value) + ' / ' + Math.round(max));
    }
    const need = Math.max(1, finite(expNeededForLevel(player.level), 1));
    const exp = Math.max(0, Math.floor(finite(player.exp)));
    const radiation = clamp(finite(player.radiation), 0, 100);
    meter('rostokExperience', exp, need, 'Опыт');
    meter('rostokRadiation', radiation, 100, 'Радиация');
    text('rostokExperienceText', `Опыт: ${exp} / ${need}`);
    text('rostokRadiationText', `Радиация: ${Math.round(radiation)} / 100`);
    text('rostokCoins', Math.max(0, finite(player.coins)));
    text('rostokBreedCredits', Math.max(0, finite(player.breedCredits)));
    const books = Math.max(0, finite(player.inventory?.['Книга знаний']));
    text('rostokKnowledgeBooks', books);
    for (const el of rostokCampScreen.querySelectorAll('.bunker-resource > span[id]')) {
      const size = Math.max(11, 21 - Math.max(0, el.textContent.length - 6) * 1.5);
      el.style.fontSize = `calc(${size} * var(--bunker-unit))`;
    }
    const bookBtn = document.getElementById('rostokReadBook');
    if (bookBtn) {
      bookBtn.disabled = readingBook;
      bookBtn.title = books ? `Прочитать Опыт+ (осталось ${books})` : 'Опыт+ отсутствует';
    }
  }

  function layoutRostokCamp() {
    if (!rostokCampScreen || !rostokCampScreen.classList.contains('active')) return;
    const campScene = document.getElementById('rostokCampScene');
    if (!campScene) return;
    layoutCampScene(campScene);
    refreshRostokCamp();
  }

  function ensureRostokCampScreen() {
    if (rostokCampScreen) return rostokCampScreen;
    const el = document.createElement('section');
    el.id = 'rostokCampScreen';
    el.className = 'rostok-camp-screen screen';
    el.setAttribute('aria-label', 'Россток — бар 100 RADS');
    el.innerHTML = `
      <div id="rostokCampScene" class="rostok-camp-scene">
        <img id="rostokCampArtwork" class="rostok-camp-artwork" src="${SERVER_URL}/api/zone-camp/4?v=20260922-position3" width="941" height="1672" alt="Бар 100 RADS в Росстоке" draggable="false">
        <button class="rostok-camp-back" type="button" data-rostok-action="map">← Карта</button>
        <button id="rostokBarmanHotspot" class="rostok-barman-hotspot" type="button" data-rostok-action="barman" aria-label="Бармен"></button>
        <button id="rostokWarehouseHotspot" class="rostok-warehouse-hotspot" type="button" data-rostok-action="warehouse" aria-label="Склад"></button>
        <!-- Clean lower menu only: exact crop of the Cordon lower panel (y=1490..1672).
             It contains no experience/radiation bars and no Cordon floor/stools. -->
        <div id="rostokLowerHud" class="rostok-lower-hud">
          <img id="rostokLowerHudArtwork" class="rostok-lower-hud-artwork" src="ui/rostok-lower-hud.png?v=09db18421007" width="941" height="182" alt="" aria-hidden="true" draggable="false">
          <div id="rostokHunger" class="rostok-vital rostok-hunger bunker-vital bunker-hunger" role="progressbar" aria-label="Сытость" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bunker-vital-fill"></div><span id="rostokHungerText" class="rostok-vital-text bunker-vital-text">0 / 100</span></div>
          <div id="rostokThirst" class="rostok-vital rostok-thirst bunker-vital bunker-thirst" role="progressbar" aria-label="Жажда" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bunker-vital-fill"></div><span id="rostokThirstText" class="rostok-vital-text bunker-vital-text">0 / 100</span></div>
          <div id="rostokHealth" class="rostok-vital rostok-health bunker-vital bunker-health" role="progressbar" aria-label="Здоровье" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bunker-vital-fill"></div><span id="rostokHealthText" class="rostok-vital-text bunker-vital-text">0 / 100</span></div>
          <section class="rostok-resources bunker-resources" aria-label="Ресурсы персонажа">
            <div class="rostok-resource bunker-resource"><span>Сталбайты</span><span id="rostokCoins">0</span></div>
            <div class="rostok-resource bunker-resource"><span>Сталкоины</span><span id="rostokBreedCredits">0</span></div>
            <div class="rostok-resource bunker-resource"><span>Опыт+</span><span id="rostokKnowledgeBooks">0</span></div>
          </section>
          <button id="rostokReadBook" class="rostok-read-book bunker-read-book" type="button" data-rostok-action="read" aria-label="Прочитать Опыт+">Прочитать</button>
          <button id="rostokInventory" class="rostok-quick rostok-inventory bunker-hotspot" style="left:70%;top:90.4%;width:13.9%;height:7.8%" type="button" data-rostok-action="inventory" aria-label="Рюкзак"></button>
          <button id="rostokPda" class="rostok-quick rostok-pda bunker-hotspot" style="left:84.1%;top:90.4%;width:13.7%;height:7.8%" type="button" data-rostok-action="kpk" aria-label="КПК"></button>
        </div>
        <!-- Experience and radiation are independent working overlays placed
             only after the clean lower menu has been laid out. -->
        <div class="rostok-progress-row bunker-progress-row" aria-label="Опыт и радиация">
          <div id="rostokExperience" class="rostok-progress bunker-progress" role="progressbar" aria-label="Опыт" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="expBarFill bunker-progress-fill"></div><span id="rostokExperienceText" class="rostok-progress-text bunker-progress-text">Опыт: 0</span></div>
          <div id="rostokRadiation" class="rostok-progress bunker-progress" role="progressbar" aria-label="Радиация" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="radiationBarFill bunker-progress-fill"></div><span id="rostokRadiationText" class="rostok-progress-text bunker-progress-text">Радиация: 0 / 100</span></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    rostokCampScreen = el;
    el.addEventListener('click', event => {
      const action = event.target.closest('[data-rostok-action]')?.dataset.rostokAction;
      if (action === 'map') return closeRostokCamp();
      if (action === 'inventory' || action === 'kpk') return openRostokDestination(action);
      if (action === 'barman') return openBarmanHub();
      if (action === 'warehouse') return openRostokDestination('warehouse');
      if (action === 'read') return readRostokBook();
    });
    window.addEventListener('resize', layoutRostokCamp);
    window.visualViewport?.addEventListener('resize', layoutRostokCamp);
    return el;
  }

  function openRostokCamp() {
    rostokReturnPending = false;
    saveWorldPosition('rostok-bar','rostok-bar');
    closeBarmanHub(false);
    const el = ensureRostokCampScreen();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    main.style.display = 'none';
    const chat = document.getElementById('embeddedChatWidget');
    if (chat) chat.style.display = 'none';
    el.classList.add('active');
    document.body.classList.add('rostok-camp-visible');
    requestAnimationFrame(layoutRostokCamp);
  }

  function openRostokDestination(screen) {
    rostokReturnPending = true;
    saveWorldPosition(screen,'rostok-bar',true);
    if (rostokCampScreen) rostokCampScreen.classList.remove('active');
    document.body.classList.remove('rostok-camp-visible');
    setZoneLocation(4);
    if (typeof openScreen === 'function') openScreen(screen);
  }

  function ensureBarmanHub() {
    if (barmanHubScreen) return barmanHubScreen;
    const el = document.createElement('section');
    el.id = 'barmanHubScreen';
    el.className = 'trader-portrait-screen barman-hub-screen';
    el.hidden = true;
    el.dataset.actionCount = '3';
    el.setAttribute('aria-label', 'Бармен');
    el.innerHTML = `
      <img id="barmanHubArtwork" class="trader-portrait-artwork" src="${SERVER_URL}/api/zone-camp/4?v=20260922-position3" width="941" height="1672" alt="Бармен в 100 RADS" draggable="false">
      <div class="barman-hub-name">БАРМЕН</div>
      <nav class="trader-portrait-actions" aria-label="Действия: Бармен">
        <button type="button" data-barman-action="talk">Говорить</button>
        <button type="button" data-barman-action="trade">Торговля</button>
        <button type="button" data-barman-action="back">Назад</button>
      </nav>`;
    document.body.appendChild(el);
    barmanHubScreen = el;
    el.addEventListener('click', event => {
      const action = event.target.closest('[data-barman-action]')?.dataset.barmanAction;
      if (action === 'talk') {
        if (typeof showGameAlert === 'function') showGameAlert('Бармен: Что принёс, сталкер? Посмотрим, чем можно торговаться.');
        return;
      }
      if (action === 'trade') {
        closeBarmanHub(false);
        if (window.TradeMenu?.open) window.TradeMenu.open('barman');
        return;
      }
      if (action === 'back') closeBarmanHub(true);
    });
    return el;
  }

  function openBarmanHub() {
    saveWorldPosition('barman','rostok-bar');
    const el = ensureBarmanHub();
    if (rostokCampScreen) rostokCampScreen.classList.remove('active');
    document.body.classList.remove('rostok-camp-visible');
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    main.style.display = 'none';
    el.hidden = false;
    el.classList.add('active');
    document.body.classList.add('trader-portrait-visible');
    return el;
  }

  function closeBarmanHub(returnToCamp = true) {
    if (barmanHubScreen) {
      barmanHubScreen.hidden = true;
      barmanHubScreen.classList.remove('active');
    }
    document.body.classList.remove('trader-portrait-visible');
    if (returnToCamp) openRostokCamp();
  }

  async function readRostokBook() {
    if (readingBook || enteringRaid) return;
    readingBook = true;
    const btn = document.getElementById('rostokReadBook');
    if (btn) btn.disabled = true;
    try {
      await useKnowledgeBookFromHeader();
    } finally {
      readingBook = false;
      if (btn) btn.disabled = false;
      refreshRostokCamp();
    }
  }

  function closeRostokCamp() {
    if (rostokCampScreen) rostokCampScreen.classList.remove('active');
    document.body.classList.remove('rostok-camp-visible');
    setZoneLocation(4);
    openZoneMap('camp');
  }

  function patchRostokReturnNavigation() {
    const nativeOpen = window.openScreen;
    if (typeof nativeOpen !== 'function' || nativeOpen.__rostokReturnAware) return;
    const wrapped = function(screen) {
      if (screen === 'main' && rostokReturnPending) {
        rostokReturnPending = false;
        return openRostokCamp();
      }
      return nativeOpen.apply(this, arguments);
    };
    wrapped.__rostokReturnAware = true;
    wrapped.__rostokNative = nativeOpen;
    window.openScreen = wrapped;
  }

  patchRostokReturnNavigation();

  function renderZoneMapPoints() {
    const layer = document.getElementById('zoneMapPoints');
    if (!layer) return;
    layer.replaceChildren();
    for (const point of zoneMapPoints) {
      const x = clamp(finite(point.x), 0, 100);
      const y = clamp(finite(point.y), 0, 100);
      const kind = ['camp', 'enemy', 'anomaly', 'mutant', 'transition'].includes(point.kind) ? point.kind : 'enemy';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'zone-map-point zone-map-point-' + kind;
      button.dataset.zonePoint = point.id || kind;
      button.dataset.zoneKind = kind;
      button.style.left = x + '%';
      button.style.top = y + '%';
      button.setAttribute('aria-label', point.label || kind);
      button.innerHTML = '<span class="zone-map-point-icon" aria-hidden="true"></span><span class="zone-map-point-label"></span>';
      button.querySelector('.zone-map-point-icon').textContent = point.icon || '●';
      button.querySelector('.zone-map-point-label').textContent = point.label || kind;
      button.addEventListener('click', () => activateZoneMapPoint(point));
      layer.appendChild(button);
    }
  }

  function fitZoneMapCanvas(width, height) {
    const canvas = document.getElementById('zoneMapCanvas');
    if (!canvas || !width || !height) return;
    const ratio = Number(width) / Number(height);
    canvas.style.aspectRatio = width + ' / ' + height;
    canvas.style.width = `min(100vw, calc((100dvh - 52px) * ${ratio}))`;
    canvas.style.height = `min(calc(100dvh - 52px), calc(100vw / ${ratio}))`;
  }

  function zoneMapAssetUrl(location) {
    const config = ZONE_MAP_ASSETS[location] || ZONE_MAP_ASSETS[1];
    return `${SERVER_URL}${config.path}?v=20260922-position3`;
  }

  function preloadZoneMapArtwork(location) {
    return new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = zoneMapAssetUrl(location);
    });
  }

  function loadZoneMapArtwork(location) {
    const config = ZONE_MAP_ASSETS[location] || ZONE_MAP_ASSETS[1];
    const image = document.getElementById('zoneMapArtwork');
    if (!image) return;
    const seq = ++zoneMapLoadSeq;
    fitZoneMapCanvas(config.width, config.height);
    image.alt = `Карта Зоны — ${ZONE_MAP_NAMES[location] || ('локация ' + location)}`;
    image.onload = () => {
      if (seq !== zoneMapLoadSeq || zoneLocation !== location) return;
      fitZoneMapCanvas(config.width, config.height);
    };
    image.onerror = () => {
      if (seq !== zoneMapLoadSeq || zoneLocation !== location) return;
      image.removeAttribute('src');
      image.alt = 'Не удалось загрузить карту Зоны';
    };
    image.src = zoneMapAssetUrl(location);
  }

  function zoneTravelDuration() {
    const override = Number(window.__zoneMapTravelMs);
    return Number.isFinite(override) && override >= 0 ? override : ZONE_TRAVEL_MS;
  }

  function zoneTravelArtworkUrl(location) {
    const path = ZONE_TRAVEL_ASSETS[Number(location)] || ZONE_TRAVEL_ASSETS[1];
    const base = String(path).startsWith('/') ? SERVER_URL + path : path;
    return base + '?v=' + ZONE_TRAVEL_CACHE;
  }

  function loadZoneTravelImage(path) {
    const raw=String(path||'');
    const src=(raw.startsWith('/')?SERVER_URL+raw:raw)+'?v='+ZONE_TRAVEL_CACHE;
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('Не удалось загрузить '+raw));
      image.src=src;
    });
  }

  async function renderZoneTravelCombat(scene,config,token) {
    const fighters=window.CombatFighters,effects=window.CombatEffects;
    if(!scene||!fighters||!effects||!Array.isArray(config?.fighters)||config.fighters.length<2)return false;
    const canvas=document.createElement('canvas');
    canvas.className='zone-travel-combat-canvas';
    canvas.width=1536;canvas.height=1024;canvas.dataset.ready='0';
    scene.append(canvas);
    const resolved=config.fighters.slice(0,2).map(gear=>fighters.resolve(gear));
    if(resolved.some(gear=>!gear?.ready)){canvas.dataset.ready='error';return false;}
    try{
      const [left,right]=await Promise.all(resolved.map(gear=>fighters.load(gear,loadZoneTravelImage)));
      if(scene.dataset.renderToken!==token||!left||!right)return false;
      const ctx=canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      effects.drawGroundShadow(ctx,fighters.feet(left,'player'));
      effects.drawGroundShadow(ctx,fighters.feet(right,'enemy'));
      fighters.draw(ctx,left,'player');
      fighters.draw(ctx,right,'enemy');
      effects.drawMuzzleFlash(ctx,fighters.muzzle(left,'player'),{age:18});
      effects.drawMuzzleFlash(ctx,fighters.muzzle(right,'enemy'),{age:18});
      canvas.dataset.ready='1';
      return true;
    }catch(error){
      canvas.dataset.ready='error';
      console.warn('[zone travel combat]',error);
      return false;
    }
  }

  function prepareZoneTravelArtwork(location) {
    const target = Number(location);
    const overlay = document.getElementById('zoneMapTravel');
    const image = document.getElementById('zoneMapTravelArtwork');
    const title = document.getElementById('zoneMapTravelDestination');
    const scene = document.getElementById('zoneMapTravelScene');
    const url = zoneTravelArtworkUrl(target);
    const name = ZONE_MAP_NAMES[target] || ('Локация ' + target);
    if (overlay) {
      overlay.dataset.scene = ZONE_TRAVEL_SCENES[target]?.kind || '';
      overlay.style.setProperty('--zone-travel-image', 'url("' + url + '")');
    }
    if (image) {
      image.alt = 'Переход на локацию ' + name;
      image.src = url;
    }
    if (title) title.textContent = name.toLocaleUpperCase('ru-RU');
    if (scene) {
      scene.replaceChildren();
      const config = ZONE_TRAVEL_SCENES[target] || {};
      const addImage = (className,src,alt='') => {
        if (!src) return null;
        const node=document.createElement('img');
        node.className=className;node.src=src+'?v='+ZONE_TRAVEL_CACHE;node.alt=alt;node.draggable=false;
        scene.append(node);return node;
      };
      const renderToken=target+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);
      scene.dataset.renderToken=renderToken;
      if(config.kind==='camp'){
        // The authored Kordon background already contains the moon, campfire and seated stalkers.
      }else if(config.kind==='anomaly'){
        const field=document.createElement('div');field.className='zone-travel-anomaly-field';
        scene.append(field);
        (config.actors||[]).forEach((src,i)=>addImage('zone-travel-actor zone-travel-actor-'+(i?'right':'left'),src,'Сталкер'));
        addImage('zone-travel-detector',config.detector,'Детектор РИПЕР');
        addImage('zone-travel-artifact',config.artifact,'Артефакт Медуза');
      }else if(config.kind==='mutant'){
        addImage('zone-travel-mutant',config.mutant,'Мутант');
        void renderZoneTravelCombat(scene,config,renderToken);
      }
    }
  }

  function setZoneTravelProgress(value) {
    const pct = clamp(Math.round(Number(value) || 0), 0, 100);
    const fill = document.getElementById('zoneMapTravelFill');
    const text = document.getElementById('zoneMapTravelPercent');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
    const bar = document.querySelector('#zoneMapTravel .zone-map-travel-bar');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
  }

  async function travelToZoneLocation(targetLocation) {
    if (zoneMapTravelling) return;
    const target = Number(targetLocation);
    if (!ZONE_MAP_ASSETS[target] || target === zoneLocation) return;

    const el = ensureZoneMapScreen();
    const overlay = document.getElementById('zoneMapTravel');
    const route = document.getElementById('zoneMapTravelRoute');
    const fromName = ZONE_MAP_NAMES[zoneLocation] || ('Локация ' + zoneLocation);
    const toName = ZONE_MAP_NAMES[target] || ('Локация ' + target);
    const duration = zoneTravelDuration();
    zoneMapTravelling = true;

    if (route) route.textContent = fromName + ' → ' + toName;
    prepareZoneTravelArtwork(target);
    setZoneTravelProgress(0);
    el.classList.add('travelling');
    if (overlay) overlay.hidden = false;

    const started = performance.now();
    let raf = 0;
    const animate = now => {
      const elapsed = Math.max(0, now - started);
      const progress = duration <= 0 ? 95 : Math.min(95, (elapsed / duration) * 95);
      setZoneTravelProgress(progress);
      if (elapsed < duration) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const preload = preloadZoneMapArtwork(target);
    if (duration > 0) await new Promise(resolve => setTimeout(resolve, duration));
    await preload;
    cancelAnimationFrame(raf);
    setZoneTravelProgress(100);
    await new Promise(resolve => setTimeout(resolve, duration > 0 ? 220 : 0));

    setZoneRaidKind('');
    setZoneLocation(target);
    saveWorldPosition('zone-map','zone-map',true);
    if (overlay) overlay.hidden = true;
    el.classList.remove('travelling');
    zoneMapTravelling = false;
  }

  function ensureZoneMapScreen() {
    if (zoneMapScreen) return zoneMapScreen;
    const el = document.createElement('section');
    el.id = 'zoneMapScreen';
    el.className = 'zone-map-screen screen';
    el.setAttribute('aria-label', 'Карта Зоны');
    el.innerHTML = `
      <header class="zone-map-header">
        <div id="zoneMapTitle" class="zone-map-title">${ZONE_MAP_NAMES[zoneLocation] || ('Локация ' + zoneLocation)}</div>
      </header>
      <div class="zone-map-frame">
        <div id="zoneMapCanvas" class="zone-map-canvas">
          <img id="zoneMapArtwork" class="zone-map-artwork" alt="Карта Зоны" draggable="false">
          <div id="zoneMapPoints" class="zone-map-points" aria-label="Точки на карте"></div>
        </div>
      </div>
      <div id="zoneMapTravel" class="zone-map-travel" hidden>
        <img id="zoneMapTravelArtwork" class="zone-map-travel-artwork" alt="" draggable="false">
        <div id="zoneMapTravelScene" class="zone-map-travel-scene" aria-hidden="true"></div>
        <div class="zone-map-travel-shade" aria-hidden="true"></div>
        <div class="zone-map-travel-heading">
          <div class="zone-map-travel-caption">ПЕРЕХОД МЕЖДУ ЛОКАЦИЯМИ</div>
          <div id="zoneMapTravelDestination" class="zone-map-travel-destination"></div>
        </div>
        <div class="zone-map-travel-bottom">
          <div id="zoneMapTravelRoute" class="zone-map-travel-route"></div>
          <div id="zoneMapTravelPercent" class="zone-map-travel-percent">0%</div>
          <div class="zone-map-travel-bar" role="progressbar" aria-label="Загрузка карты" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div id="zoneMapTravelFill" class="zone-map-travel-fill"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    zoneMapScreen = el;
    renderZoneMapPoints();
    loadZoneMapArtwork(zoneLocation);
    return el;
  }

  function openZoneMap(origin = '') {
    if (!worldPositionRestoring) saveWorldPosition('zone-map','zone-map');
    if (typeof currentEnemy !== 'undefined' && currentEnemy) {
      if (typeof showGameAlert === 'function') showGameAlert('Сначала завершите текущую встречу.');
      return;
    }
    if (typeof currentAnomaly !== 'undefined' && currentAnomaly) {
      if (typeof showGameAlert === 'function') showGameAlert('Сначала завершите аномалию.');
      return;
    }
    zoneMapOrigin = origin || ((typeof raidActive !== 'undefined' && raidActive) ? 'raid' : 'camp');
    const el = ensureZoneMapScreen();
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    main.style.display = 'none';
    const chat = document.getElementById('embeddedChatWidget');
    if (chat) chat.style.display = 'none';
    el.classList.add('active');
    document.body.classList.add('zone-map-visible');
    renderZoneMapPoints();
    loadZoneMapArtwork(zoneLocation);
  }

  function hideZoneMap() {
    if (zoneMapScreen) zoneMapScreen.classList.remove('active');
    document.body.classList.remove('zone-map-visible');
  }

  function closeZoneMap() {
    hideZoneMap();
    if (zoneMapOrigin === 'raid' && typeof raidActive !== 'undefined' && raidActive && typeof returnToRaid === 'function') {
      return returnToRaid();
    }
    if (typeof openScreen === 'function') openScreen('main');
  }

  async function continueFromZoneMap() {
    hideZoneMap();
    if (typeof raidActive !== 'undefined' && raidActive) {
      if (typeof returnToRaid === 'function') returnToRaid();
      return;
    }
    if (enteringRaid || readingBook) return;
    enteringRaid = true;
    const btn = document.getElementById('bunkerRaid');
    if (btn) btn.disabled = true;
    try {
      if (typeof startRaid === 'function') await startRaid();
    } finally {
      enteringRaid = false;
      if (btn) btn.disabled = false;
      scheduleLayout();
    }
  }

  async function activateZoneMapPoint(point) {
    const kind = point?.kind || '';
    if (kind === 'camp') {
      setZoneRaidKind('');
      if (zoneLocation === 4) {
        hideZoneMap();
        if (typeof raidActive !== 'undefined' && raidActive && typeof endRaid === 'function') {
          await endRaid();
        }
        openRostokCamp();
        return;
      }
      setZoneLocation(1);
      hideZoneMap();
      if (typeof raidActive !== 'undefined' && raidActive && typeof endRaid === 'function') {
        await endRaid();
      } else if (typeof openScreen === 'function') {
        openScreen('main');
      }
      return;
    }

    if (kind === 'transition') {
      const target = Number(point?.targetLocation || 0);
      if (target === 1) {
        await travelToZoneLocation(1);
        return;
      }
      if (target === 2) {
        if (zoneLocation === 1 && !firstLocationToSecondReady()) {
          if (typeof showGameAlert === 'function') {
            showGameAlert('У меня еще недостаточно хорошое снаряжения чтобы идти на свалку');
          }
          return;
        }
        await travelToZoneLocation(2);
        return;
      }
      if (target === 3) {
        if (!lastNinePistolsReady()) {
          if (typeof showGameAlert === 'function') {
            showGameAlert('Чтобы попасть на НИИ Агропром, должны быть открыты последние 9 пистолетов.');
          }
          return;
        }
        await travelToZoneLocation(3);
        return;
      }
      if (target === 4) {
        if (!secondPistolDecadeReady()) {
          if (typeof showGameAlert === 'function') {
            showGameAlert('Чтобы попасть в Россток, должна быть открыта вторая десятка пистолетов.');
          }
          return;
        }
        await travelToZoneLocation(4);
        return;
      }
      if (point?.future) {
        if (!secondPistolDecadeReady()) {
          if (typeof showGameAlert === 'function') {
            showGameAlert('Переход откроется, когда станет доступна вторая десятка пистолетов.');
          }
          return;
        }
        if (typeof showGameAlert === 'function') showGameAlert('Локация ещё не открыта сталкерами.');
        return;
      }
      return;
    }

    if (!zoneRouteKinds.has(kind)) return;
    setZoneRaidKind(kind);
    window.__zoneMapRequestedPoint = point ? {...point, location: zoneLocation} : null;
    await continueFromZoneMap();
  }

  function setZoneMapPoints(points) {
    if (!Array.isArray(points)) return;
    zoneMapPoints = points
      .filter(point => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
      .map(point => ({
        ...point,
        x: clamp(Number(point.x), 0, 100),
        y: clamp(Number(point.y), 0, 100)
      }));
    renderZoneMapPoints();
  }

  function patchRaidMapButton() {
    const nav = document.getElementById('raidNavButtons');
    if (!nav) return;
    const button = [...nav.querySelectorAll('button')].find(btn =>
      btn.id === 'raidMapBtn' ||
      btn.getAttribute('onclick') === 'endRaid()' ||
      /Вернуться с рейда|Открыть карту/i.test(btn.textContent || '')
    );
    if (!button) return;
    button.id = 'raidMapBtn';
    button.removeAttribute('onclick');
    button.textContent = 'Открыть карту';
    button.style.background = '#8a7a4a';
    button.onclick = () => openZoneMap('raid');
  }

  async function enterRaid() {
    if (enteringRaid || readingBook) return;
    setZoneRaidKind('');
    setZoneLocation(1);
    openZoneMap('camp');
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
    saveWorldPosition('smoker','cordon-camp');
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
    saveWorldPosition('leonov','cordon-camp');
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

  function patchPersistentScreenNavigation() {
    const nativeOpen = window.openScreen;
    if (typeof nativeOpen !== 'function' || nativeOpen.__worldPositionAware) return;
    const wrapped = function(screen) {
      if (!worldPositionRestoring) {
        if (screen === 'main') {
          if (!rostokReturnPending) saveWorldPosition('cordon-camp','cordon-camp');
        } else if (['inventory','kpk'].includes(screen)) {
          saveWorldPosition(screen,rostokReturnPending && zoneLocation===4 ? 'rostok-bar' : 'cordon-camp');
        } else if (screen === 'warehouse') {
          saveWorldPosition(screen,rostokReturnPending && zoneLocation===4 ? 'rostok-bar' : 'cordon-camp');
        } else if (['arena','market','chat'].includes(screen)) {
          saveWorldPosition(screen,'cordon-camp');
        } else if (screen === 'raid') {
          saveWorldPosition('zone-map','zone-map');
        }
      }
      return nativeOpen.apply(this, arguments);
    };
    wrapped.__worldPositionAware = true;
    wrapped.__worldPositionNative = nativeOpen;
    window.openScreen = wrapped;
  }

  patchPersistentScreenNavigation();

  patchRaidMapButton();
  const raidNav = document.getElementById('raidNavButtons');
  if (raidNav) new MutationObserver(patchRaidMapButton).observe(raidNav, {childList: true, subtree: true});
  window.GamePosition = Object.freeze({
    version:'1.0.0',
    save:saveWorldPosition,
    restoreFromPlayer:restorePlayerWorldPosition,
    get current(){return typeof player==='object'&&player?.worldPosition ? {...player.worldPosition} : null;}
  });
  window.ZoneMap = Object.freeze({
    version: '0.6.9',
    open: openZoneMap,
    close: closeZoneMap,
    continueRaid: continueFromZoneMap,
    setPoints: setZoneMapPoints,
    get points() { return zoneMapPoints.map(point => ({...point})); },
    get routeKind() { return zoneRaidKind; },
    get location() { return zoneLocation; },
    setRoute: setZoneRaidKind,
    setLocation: setZoneLocation,
    firstLocationToSecondReady,
    secondPistolDecadeReady,
    lastNinePistolsReady
  });
  window.BunkerMenu = {version: '1.20.0', refresh, enterRaid, readBook, openLeonov, closeLeonov, openSmoker, closeSmoker, talkSmoker, openZoneMap, openRostokCamp, closeRostokCamp, openBarmanHub, closeBarmanHub};
  layout();
  restorePlayerWorldPositionWhenReady();
})();
