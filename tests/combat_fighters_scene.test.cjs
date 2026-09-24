const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const fighters = require('../images/combat/fighters.js');
const urls = [], transforms = [], draws = [], host = { setAttribute() {}, replaceChildren(...children) { this.children = children; } };
let delayed = [];
const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, clip() {}, scale(...s) { transforms.push(s); }, drawImage(image) { draws.push(image.url); }, clearRect() {}, fillRect() {} };
const env = {
  setTimeout, clearTimeout, console, performance: { now: () => 0 }, cancelAnimationFrame() {}, requestAnimationFrame() { return 1; },
  document: { getElementById: () => host, createElement: t => t === 'canvas' ? { setAttribute() {}, getContext: () => ctx } : { setAttribute() {} }, addEventListener() {} },
  Image: class { constructor() { this.width = 1800; this.height = 1536; } set src(url) { this.url = url; urls.push(url); delayed.push(() => this.onload?.()); } },
  window: { CombatScene: { show() { return 'legacy'; }, hide() {}, react() {} }, matchMedia: () => ({ matches: false }), CombatFighters: fighters, COMBAT_ASSETS: {}, CombatAssets: { getVisuals: () => ({ ready: false }) }, CombatLayout: {} }
};
vm.runInNewContext(fs.readFileSync(__dirname + '/../images/combat/side-scene.js', 'utf8'), env);
async function flush(p) { delayed.splice(0).forEach(f => f()); return await p; }
(async () => {
  const scene = env.window.CombatScene;
  const pistol = { enemy: { name: 'NPC', battleToken: 'a', hp: 100 }, armor: 1, weaponId: 86, enemyGear: { armorId: 1, weaponId: 86 } };
  assert.equal(await flush(scene.show(pistol)), true);
  assert.equal(urls.length, 3, 'Player and NPC share cached layers');
  const shotgun = { ...pistol, weaponId: 20, enemyGear: { armorId: 1, weaponId: 20 } };
  assert.equal(await flush(scene.show(shotgun)), true);
  assert.equal(urls.length, 6, 'Changing to shotgun loads heavy body/hands and one gun');
  assert.ok(draws.slice(-6).every(url => !url.includes('-pistol')), 'Both fighters use heavy poses');
  await flush(scene.show({ ...shotgun, weaponId: 106 }));
  assert.equal(urls.length, 7, 'Changing shotgun loads only its image');
  await flush(scene.show({ ...shotgun, armor: 96, weaponId: 106 }));
  assert.equal(urls.length, 9, 'Changing armor reuses cached shotgun');
  await flush(scene.show({ ...shotgun, armor: 96, weaponId: 20 }));
  assert.equal(urls.length, 9, 'Another armor uses the same cached shotgun');
  await flush(scene.show(pistol));
  assert.equal(urls.length, 9, 'Switching back to pistol reuses its layers');
  assert.ok(draws.slice(-6).every(url => !url.includes('-heavy')), 'Switching back restores both pistol poses');
  assert.ok(transforms.some(s => s[0] < 0), 'NPC reflects all layers together');
  assert.ok(urls.every(url => url.endsWith('?v=' + fighters.data.version)), 'Asset cache revision follows manifest');
  scene.react('a', { success: true, enemyHp: 80 }, 'attack');
  assert.match(host.children[1].textContent, /80 HP/);
  await flush(scene.show({ ...shotgun, enemyGear: { armorId: 0, weaponId: 0 } }));
  assert.match(host.children[1].textContent, /Облик противника ещё не готов/);
  assert.equal(await scene.show({ ...pistol, armor: 0, enemyGear: null }), 'legacy');
  await flush(scene.show(shotgun));
  assert.equal(host.children[0].hidden, false);
  const stale = scene.show({ ...shotgun, weaponId: 107 });
  scene.hide();
  assert.equal(await flush(stale), false);
  assert.equal(host.hidden, true);
  console.log('PASS: heavy/pistol switching, shared images, NPC reflection, HP, missing gear, legacy transition and stale loads');
})().catch(error => { console.error(error); process.exitCode = 1; });
