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
  const beforeAutomatics=urls.length;
  const automatic={...shotgun,weaponId:11,enemyGear:{armorId:1,weaponId:11}};
  await flush(scene.show(automatic));
  assert.equal(urls.length,beforeAutomatics+1,'Automatic reuses heavy pose and shares the new gun for player and NPC');
  await flush(scene.show({...automatic,weaponId:12}));
  assert.equal(urls.length,beforeAutomatics+2,'Changing automatic loads only its image');
  await flush(scene.show({...automatic,armor:96}));
  assert.equal(urls.length,beforeAutomatics+2,'Automatic on another cached armor uses the same gun image');
  assert.ok(draws.slice(-4).every(url=>!url.includes('-pistol')),'Automatic keeps the ready two-handed pose');
  const beforeRifles = urls.length;
  const rifle = { ...automatic, weaponId: 14, enemyGear: { armorId: 1, weaponId: 14 } };
  assert.equal(await flush(scene.show(rifle)), true);
  assert.equal(urls.length, beforeRifles + 1, 'Rifle shares cached heavy body/hands and one gun between player and NPC');
  assert.equal(await flush(scene.show({ ...rifle, weaponId: 46, enemyGear: { armorId: 1, weaponId: 46 } })), true);
  assert.equal(urls.length, beforeRifles + 2, 'Changing rifle loads only its weapon image');
  assert.equal(await flush(scene.show({ ...rifle, armor: 96, enemyGear: { armorId: 96, weaponId: 14 } })), true);
  assert.equal(urls.length, beforeRifles + 2, 'Another cached armor reuses the rifle image');

  const armorIds = Object.keys(fighters.data.characters).map(Number).sort((a, b) => a - b);
  assert.deepEqual(armorIds, Array.from({ length: 96 }, (_, i) => i + 1), 'All existing armors are exercised');
  assert.equal(Object.keys(fighters.data.weapons).length, 113, 'Candidate contains all 113 weapons');
  const sequence = [86, 20, 11, 14, 46, 86];
  for (const armorId of armorIds) {
    for (let step = 0; step < sequence.length; step++) {
      const weaponId = sequence[step];
      const gear = { armorId, weaponId };
      const resolved = fighters.resolve(gear);
      const expectedPose = weaponId === 86 ? 'pistol' : 'heavy';
      assert.equal(resolved.ready, true, `Armor ${armorId}, weapon ${weaponId} is available`);
      assert.equal(resolved.pose, expectedPose, `Armor ${armorId}, weapon ${weaponId} chooses the correct pose`);
      const beforeUrls = urls.length, beforeDraws = draws.length, beforeTransforms = transforms.length;
      const next = { ...pistol, armor: armorId, weaponId, enemyGear: gear };
      assert.equal(await flush(scene.show(next)), true, `Armor ${armorId}, weapon ${weaponId} scene renders`);
      const sceneDraws = draws.slice(beforeDraws);
      const suffix = '?v=' + fighters.data.version;
      const allowed = new Set([resolved.body, resolved.hands, resolved.gun].map(url => url + suffix));
      assert.ok(sceneDraws.length >= 4, `Armor ${armorId}, weapon ${weaponId} draws both fighters`);
      assert.ok(sceneDraws.every(url => allowed.has(url)), `Armor ${armorId}, weapon ${weaponId} does not retain previous gear`);
      assert.ok(sceneDraws.filter(url => url === resolved.body + suffix).length >= 2, `Armor ${armorId} body is drawn for player and NPC`);
      assert.ok(sceneDraws.filter(url => url === resolved.gun + suffix).length >= 2, `Weapon ${weaponId} is drawn for player and NPC`);
      assert.ok(transforms.slice(beforeTransforms).some(s => s[0] < 0), `Armor ${armorId}, weapon ${weaponId} reflects the NPC`);
      const newUrls = urls.slice(beforeUrls);
      assert.equal(new Set(newUrls).size, newUrls.length, `Armor ${armorId}, weapon ${weaponId} shares concurrent player/NPC loads`);
      if (step >= 2 && step <= 4) {
        assert.ok(newUrls.length <= 1 && newUrls.every(url => url === resolved.gun + suffix),
          `Armor ${armorId}: switching heavy weapons reuses body/hands`);
      }
      if (step === sequence.length - 1) {
        assert.equal(newUrls.length, 0, `Armor ${armorId}: returning to the pistol reuses its cached pose`);
      }
    }
  }
  assert.ok(urls.every(url => url.endsWith('?v=' + fighters.data.version)), 'Every rifle and armor load uses the current cache revision');

  const latestRifle = { ...rifle, armor: 96, weaponId: 46, enemyGear: { armorId: 96, weaponId: 46 } };
  const supersededRifle = scene.show({ ...latestRifle, weaponId: 42, enemyGear: { armorId: 96, weaponId: 42 } });
  const currentRifle = scene.show(latestRifle);
  assert.equal(await flush(currentRifle), true, 'A newer rifle selection completes');
  const afterCurrentRifle = draws.length;
  assert.equal(await supersededRifle, false, 'A stale rifle selection cannot overwrite newer equipment');
  assert.equal(draws.length, afterCurrentRifle, 'Stale rifle completion adds no old equipment draws');
  assert.equal(host.hidden, false);

  const hiddenRifle = scene.show({ ...latestRifle, weaponId: 55, enemyGear: { armorId: 96, weaponId: 55 } });
  const beforeHide = draws.length;
  scene.hide();
  assert.equal(await flush(hiddenRifle), false, 'A rifle load finishing after hide is discarded');
  assert.equal(draws.length, beforeHide, 'Hidden rifle completion does not redraw');
  assert.equal(host.hidden, true);
  assert.equal(await flush(scene.show(latestRifle)), true, 'Rifle scene reopens after a cancelled load');
  assert.equal(host.hidden, false);

  const stale = scene.show({ ...shotgun, weaponId: 107 });
  scene.hide();
  assert.equal(await flush(stale), false);
  assert.equal(host.hidden, true);
  console.log('PASS: rifle/automatic/shotgun/pistol switching across 96 armors, shared images, NPC reflection, HP, missing gear, legacy transition and stale loads');
})().catch(error => { console.error(error); process.exitCode = 1; });
