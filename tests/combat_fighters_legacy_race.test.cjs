const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fighters = require('../images/combat/fighters.js');

const imageLoads = [], legacyLoads = [];
const host = {
  children: [],
  replaceChildren(...children) { this.children = children; },
  setAttribute() {}
};
let legacyCanvas;
// Match scene.js: mount its canvas synchronously, retain it across hide(),
// and finish loading asynchronously. It does not mount again on later show().
const legacy = {
  show() {
    if (!legacyCanvas) {
      legacyCanvas = { kind: 'legacy' };
      host.replaceChildren(legacyCanvas);
    }
    return new Promise(resolve => legacyLoads.push(resolve));
  },
  hide() {},
  react() {}
};
const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, clip() {}, drawImage() {}, clearRect() {}, fillRect() {} };
const env = {
  setTimeout, clearTimeout, console, performance: { now: () => 0 }, cancelAnimationFrame() {},
  Image: class {
    constructor() { this.width = 1024; this.height = 1536; }
    set src(url) { imageLoads.push(() => this.onload?.()); }
  },
  document: {
    getElementById: () => host,
    createElement: tag => tag === 'canvas'
      ? { kind: 'modular', setAttribute() {}, getContext: () => ctx }
      : { setAttribute() {} },
    addEventListener() {}
  },
  window: {
    CombatScene: legacy, matchMedia: () => ({ matches: false }),
    CombatFighters: fighters, COMBAT_ASSETS: {},
    CombatAssets: { getVisuals: () => ({ ready: false }) }, CombatLayout: {}
  }
};
vm.runInNewContext(fs.readFileSync(__dirname + '/../images/combat/side-scene.js', 'utf8'), env);

(async () => {
  const scene = env.window.CombatScene;
  const modular = { enemy: { name: 'NPC', battleToken: 'race', hp: 100 }, armor: 1, weaponId: 86, enemyGear: { armorId: 1, weaponId: 86 } };
  const fallback = { ...modular, armor: 0, weaponId: 0, enemyGear: null };
  const pendingLegacy = scene.show(fallback);
  assert.equal(host.children[0], legacyCanvas);
  const pendingModular = scene.show(modular);
  imageLoads.splice(0).forEach(finish => finish());
  await pendingModular;
  assert.equal(host.children[0].kind, 'modular');
  legacyLoads.shift()(false); // Legacy load was cancelled by the switch.
  await pendingLegacy;
  const returnedLegacy = scene.show(fallback);
  assert.equal(host.children[0], legacyCanvas, 'Restoring legacy after an interrupted load must attach its own canvas');
  legacyLoads.shift()(true);
  await returnedLegacy;
  assert.equal(host.children[0], legacyCanvas);
  scene.hide();
  console.log('PASS: interrupted legacy load cannot capture the modular canvas');
})().catch(error => { console.error(error); process.exitCode = 1; });
