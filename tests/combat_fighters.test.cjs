const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const f = require('../images/combat/fighters.js');
const shotgunIds = [20,106,107,108,109,110,111,19,112,113,114,32,115,116,44,117,62,118,50,119,56,120,121,68,122,123,74,124,125];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function context() {
  const calls = [];
  return { calls, ...Object.fromEntries(['save','restore','translate','rotate','scale','drawImage','beginPath','moveTo','lineTo','closePath','clip'].map(name => [name, (...args) => calls.push([name, ...args])])) };
}
(async () => {
  const oldCharacters = Object.fromEntries(Object.entries(f.data.characters).map(([id, c]) => [id, c.poses.pistol]));
  const oldWeapons = Object.fromEntries(Object.entries(f.data.weapons).filter(([, w]) => (w.pose || 'pistol') === 'pistol'));
  // Frozen fingerprints of the already published pistol anchors and settings.
  assert.equal(hash(oldCharacters), '2bcfc3952b6b58091f9941995c778350807ad9205f6f5692dcf408521b852cf7');
  assert.equal(hash(oldWeapons), '0877bcddfee5d53cc6d68d02e90f84572559a1aff13c66759848433522000d56');
  assert.equal(Object.keys(f.data.characters).length, 96);
  assert.equal(Object.keys(oldWeapons).length, 26);
  assert.deepEqual(Object.keys(f.data.weapons).filter(id => f.data.weapons[id].pose === 'heavy').map(Number).sort((a,b)=>a-b), shotgunIds.slice().sort((a,b)=>a-b));
  for (const character of Object.values(f.data.characters)) assert.ok(character.poses.pistol && character.poses.heavy);
  for (const key of Object.keys(f.data.pairAdjustments)) assert.ok(shotgunIds.includes(Number(key.split('-')[1])));
  const urls = new Set();
  let combinations = 0;
  for (const armorId of Object.keys(f.data.characters)) {
    for (const weaponId of Object.keys(f.data.weapons)) {
      const gear = f.resolve({ armorId, weaponId });
      const pose = shotgunIds.includes(Number(weaponId)) ? 'heavy' : 'pistol';
      assert.equal(gear.ready, true);
      assert.equal(gear.pose, pose);
      assert.equal(gear.character, f.data.characters[armorId].poses[pose]);
      assert.equal(gear.body, `images/combat/modular/characters/${armorId}-${pose}.png`);
      assert.equal(gear.hands, `images/combat/modular/hands/${armorId}-${pose}.png`);
      assert.equal(gear.gun, `images/combat/modular/weapons/${weaponId}.png`);
      const layers = await f.load(gear, async url => { urls.add(url); return { url, width: 1800, height: 1536 }; });
      for (const side of ['player', 'enemy']) {
        const ctx = context();
        assert.equal(f.draw(ctx, layers, side), true);
        const forearm = gear.pose === 'heavy' && Array.isArray(gear.character.foregroundArm) && gear.character.foregroundArm.length >= 3;
        assert.deepEqual(ctx.calls.filter(c => c[0] === 'drawImage').map(c => c[1].url), forearm ? [gear.body, gear.gun, gear.body, gear.hands] : [gear.body, gear.gun, gear.hands]);
        assert.deepEqual(ctx.calls.filter(c => c[0] === 'scale')[0], ['scale', (side === 'enemy' ? -1 : 1) * 800/1536, 800/1536]);
        assert.equal(ctx.calls.filter(c => c[0] === 'save').length, ctx.calls.filter(c => c[0] === 'restore').length);
      }
      combinations++;
    }
  }
  assert.equal(combinations, 96 * (26 + 29));
  assert.equal(urls.size, 96 * 2 * 2 + 26 + 29);
  assert.equal(f.resolve({ armorId: 999, weaponId: 20 }).ready, false);
  assert.equal(f.resolve({ armorId: 1, weaponId: 11 }).ready, false);
  assert.equal(f.resolve(null).ready, false);
  assert.equal(await f.load(f.resolve(null), () => { throw Error('must not load missing gear'); }), null);
  assert.equal(f.draw(context(), null, 'player'), false);
  assert.equal(f.draw(context(), {}, 'unknown'), false);
  await assert.rejects(() => f.load(f.resolve({ armorId: 1, weaponId: 20 }), async () => { throw Error('missing'); }), /missing/);
  // Pair fitting transforms the gun only; pose, hands and shared asset URLs stay fixed.
  const pairKey = '1-20', savedAdjustment = f.data.pairAdjustments[pairKey];
  f.data.pairAdjustments[pairKey] = { size: 110, dx: -20, dy: -18, angle: 7.5 };
  const fittedGear = f.resolve({ armorId: 1, weaponId: 20 });
  const fitted = await f.load(fittedGear, async url => ({ url, width: 1800, height: 1536 }));
  const adjusted = context();
  f.draw(adjusted, fitted, 'player');
  assert.deepEqual(adjusted.calls.filter(c => c[0] === 'translate').at(-1), ['translate', fitted.character.grip[0] - 20, fitted.character.grip[1] - 18]);
  assert.deepEqual(adjusted.calls.filter(c => c[0] === 'rotate'), [['rotate', 7.5 * Math.PI / 180]]);
  assert.deepEqual(adjusted.calls.filter(c => c[0] === 'scale').at(-1), ['scale', fitted.weapon.scale * 1.1, fitted.weapon.scale * 1.1]);
  assert.equal(fittedGear.gun, f.resolve({ armorId: 96, weaponId: 20 }).gun);
  assert.equal(f.resolve({ armorId: 1, weaponId: 86 }).adjustment, undefined);
  if (savedAdjustment) f.data.pairAdjustments[pairKey] = savedAdjustment; else delete f.data.pairAdjustments[pairKey];
  // A shared clipped part of the same body can occlude the stock, without a new image.
  const polygon = [[460,400],[585,435],[550,510],[420,470]];
  const clippedLayers = { ...fitted, character: { ...fitted.character, foregroundArm: polygon } };
  for (const side of ['player', 'enemy']) {
    const ctx = context();
    f.draw(ctx, clippedLayers, side);
    assert.deepEqual(ctx.calls.filter(c => c[0] === 'drawImage').map(c => c[1].url), [fittedGear.body, fittedGear.gun, fittedGear.body, fittedGear.hands]);
    assert.deepEqual(ctx.calls.filter(c => c[0] === 'moveTo'), [['moveTo', ...polygon[0]]]);
    assert.deepEqual(ctx.calls.filter(c => c[0] === 'lineTo'), polygon.slice(1).map(p => ['lineTo', ...p]));
    const clipAt = ctx.calls.findIndex(c => c[0] === 'clip');
    assert.equal(ctx.calls[clipAt - 1][0], 'closePath');
    assert.equal(ctx.calls[clipAt + 1][0], 'drawImage');
    assert.equal(ctx.calls[clipAt + 1][1], fitted.body);
    assert.equal(ctx.calls[clipAt + 2][0], 'restore', 'Clip is restored before drawing hands');
    assert.equal(ctx.calls.filter(c => c[0] === 'clip').length, 1);
    assert.equal(ctx.calls.filter(c => c[0] === 'save').length, 3);
    assert.equal(ctx.calls.filter(c => c[0] === 'restore').length, 3);
  }
  for (const foregroundArm of [undefined, [], [[1,2],[3,4]], [[1,2],[3,4],[5,NaN]]]) {
    const ctx = context();
    f.draw(ctx, { ...fitted, character: { ...fitted.character, foregroundArm } }, 'player');
    assert.equal(ctx.calls.filter(c => c[0] === 'drawImage').length, 3);
    assert.equal(ctx.calls.filter(c => c[0] === 'clip').length, 0);
  }
  const pistolLayers = await f.load(f.resolve({ armorId: 1, weaponId: 86 }), async url => ({ url, width: 1800, height: 1536 }));
  const pistolCtx = context();
  f.draw(pistolCtx, { ...pistolLayers, character: { ...pistolLayers.character, foregroundArm: polygon } }, 'player');
  assert.equal(pistolCtx.calls.filter(c => c[0] === 'drawImage').length, 3, 'Pistols are unaffected by optional heavy occlusion');
  assert.equal(pistolCtx.calls.filter(c => c[0] === 'clip').length, 0);
  console.log(JSON.stringify({ passed: true, combinations, uniqueImageURLs: urls.size, pistolBaselineUnchanged: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
