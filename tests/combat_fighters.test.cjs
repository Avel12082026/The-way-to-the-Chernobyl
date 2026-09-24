const assert = require('node:assert/strict');
const f = require('../images/combat/fighters.js');
const shotgunIds = [20,106,107,108,109,110,111,19,112,113,114,32,115,116,44,117,62,118,50,119,56,120,121,68,122,123,74,124,125];
const automaticIds=[11,12,37,21,26,17,38,45,57,69,67,43,16,15,25,18,10,63,51,75,61,59,71,77,22,29,53,47,65];
const heavyIds=[...shotgunIds,...automaticIds];
function context() {
  const calls = [];
  return { calls, ...Object.fromEntries(['save','restore','translate','rotate','scale','drawImage','beginPath','moveTo','lineTo','closePath','rect','clip'].map(name => [name, (...args) => calls.push([name, ...args])])) };
}
(async () => {
  const oldWeapons = Object.fromEntries(Object.entries(f.data.weapons).filter(([, w]) => (w.pose || 'pistol') === 'pistol'));
  assert.equal(Object.keys(f.data.characters).length, 96);
  assert.equal(Object.keys(oldWeapons).length, 26);
  assert.deepEqual(Object.keys(f.data.weapons).filter(id => f.data.weapons[id].pose === 'heavy').map(Number).sort((a,b)=>a-b), heavyIds.slice().sort((a,b)=>a-b));
  for (const character of Object.values(f.data.characters)) assert.ok(character.poses.pistol && character.poses.heavy);
  for (const key of Object.keys(f.data.pairAdjustments)) assert.ok(f.data.weapons[key.split('-')[1]]);
  const urls = new Set();
  let combinations = 0;
  for (const armorId of Object.keys(f.data.characters)) {
    for (const weaponId of Object.keys(f.data.weapons)) {
      const gear = f.resolve({ armorId, weaponId });
      const pose = heavyIds.includes(Number(weaponId)) ? 'heavy' : 'pistol';
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
        const hasHands = !Array.isArray(gear.character.handMasks) || gear.character.handMasks.some(p => Array.isArray(p) && p.length >= 3 && p.every(v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)));
        const handSource = Array.isArray(gear.character.handMasks) ? gear.body : gear.hands;
        const guard=gear.weapon.foregroundGuard,hasGuard=Array.isArray(guard)&&guard.length===4&&guard.every(Number.isFinite)&&guard[2]>0&&guard[3]>0;
        const compact=gear.pose==='heavy'&&Array.isArray(gear.supportArm)&&gear.supportArm.length>=3&&Array.isArray(gear.adjustment?.supportShift)&&gear.adjustment.supportShift.length===2;
        const handPasses=compact?(Array.isArray(gear.character.handMasks)?gear.character.handMasks.filter(p=>Array.isArray(p)&&p.length>=3).length:2):(hasHands?1:0);
        assert.deepEqual(ctx.calls.filter(c => c[0] === 'drawImage').map(c => c[1].url), [...Array(compact?2:1).fill(gear.body), gear.gun, ...(forearm ? [gear.body] : []), ...Array(handPasses).fill(handSource), ...(hasGuard ? [gear.gun] : [])]);
        assert.deepEqual(ctx.calls.filter(c => c[0] === 'scale')[0], ['scale', (side === 'enemy' ? -1 : 1) * 800/1536, 800/1536]);
        assert.equal(ctx.calls.filter(c => c[0] === 'save').length, ctx.calls.filter(c => c[0] === 'restore').length);
      }
      combinations++;
    }
  }
  assert.equal(combinations, 96 * (26 + 29 + 29));
  assert.equal(urls.size, 96 * 2 * 2 + 26 + 29 + 29);
  assert.equal(f.resolve({ armorId: 999, weaponId: 20 }).ready, false);
  assert.equal(f.resolve({ armorId: 1, weaponId: 9999 }).ready, false);
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
  // Isolate single-pass fitting/occlusion fixtures from the release manifest's guard overlays.
  // Guard replay is covered separately below, and the full matrix above includes real guards.
  fitted.weapon = { ...fitted.weapon, foregroundGuard: undefined };
  const adjusted = context();
  f.draw(adjusted, fitted, 'player');
  assert.deepEqual(adjusted.calls.filter(c => c[0] === 'translate').at(-1), ['translate', fitted.character.grip[0] - 20, fitted.character.grip[1] - 18]);
  assert.deepEqual(adjusted.calls.filter(c => c[0] === 'rotate'), [['rotate', 7.5 * Math.PI / 180]]);
  assert.deepEqual(adjusted.calls.filter(c => c[0] === 'scale').at(-1), ['scale', fitted.weapon.scale * 1.1, fitted.weapon.scale * 1.1]);
  assert.equal(fittedGear.gun, f.resolve({ armorId: 96, weaponId: 20 }).gun);
  if (savedAdjustment) f.data.pairAdjustments[pairKey] = savedAdjustment; else delete f.data.pairAdjustments[pairKey];
  // A shared clipped part of the same body can occlude the stock, without a new image.
  const polygon = [[460,400],[585,435],[550,510],[420,470]];
  const clippedLayers = { ...fitted, character: { ...fitted.character, handMasks: undefined, foregroundArm: polygon } };
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
    f.draw(ctx, { ...fitted, character: { ...fitted.character, handMasks: undefined, foregroundArm } }, 'player');
    assert.equal(ctx.calls.filter(c => c[0] === 'drawImage').length, 3);
    assert.equal(ctx.calls.filter(c => c[0] === 'clip').length, 0);
  }
  const pistolLayers = await f.load(f.resolve({ armorId: 1, weaponId: 86 }), async url => ({ url, width: 1800, height: 1536 }));
  const pistolCtx = context();
  f.draw(pistolCtx, { ...pistolLayers, character: { ...pistolLayers.character, handMasks: undefined, foregroundArm: polygon }, weapon: {...pistolLayers.weapon, foregroundGuard:undefined} }, 'player');
  assert.equal(pistolCtx.calls.filter(c => c[0] === 'drawImage').length, 3, 'Pistols are unaffected by optional heavy occlusion');
  assert.equal(pistolCtx.calls.filter(c => c[0] === 'clip').length, 0);
  const pistolKey = '1-86', savedPistolAdjustment = f.data.pairAdjustments[pistolKey];
  f.data.pairAdjustments[pistolKey] = { size: 125, dx: 6, dy: -4, angle: -3 };
  const correctedPistol = await f.load(f.resolve({ armorId: 1, weaponId: 86 }), async url => ({ url, width: 1800, height: 1536 }));
  const correctedCtx = context();
  f.draw(correctedCtx, correctedPistol, 'player');
  assert.deepEqual(correctedCtx.calls.filter(c => c[0] === 'translate').at(-1), ['translate', correctedPistol.character.grip[0] + 6, correctedPistol.character.grip[1] - 4]);
  assert.deepEqual(correctedCtx.calls.filter(c => c[0] === 'scale').at(-1), ['scale', correctedPistol.weapon.scale * 1.25, correctedPistol.weapon.scale * 1.25]);
  assert.ok(correctedCtx.calls.filter(c => c[0] === 'rotate').every(c=>c[1]===-3*Math.PI/180));
  if (savedPistolAdjustment) f.data.pairAdjustments[pistolKey] = savedPistolAdjustment; else delete f.data.pairAdjustments[pistolKey];
  const handMasks = [[[520,430],[550,430],[550,460],[520,460]], [[875,425],[900,425],[900,445],[875,445]]];
  for (const side of ['player', 'enemy']) {
    const ctx = context();
    const clipped = { ...fitted, character: { grip: fitted.character.grip, handMasks } };
    f.draw(ctx, clipped, side);
    assert.deepEqual(ctx.calls.filter(c => c[0] === 'drawImage').map(c => c[1].url), [fittedGear.body, fittedGear.gun, fittedGear.body]);
    assert.deepEqual(ctx.calls.filter(c => c[0] === 'moveTo'), handMasks.map(p => ['moveTo', ...p[0]]));
    assert.equal(ctx.calls.filter(c => c[0] === 'closePath').length, 2);
    assert.equal(ctx.calls.filter(c => c[0] === 'clip').length, 1, 'Hand outlines form one clip and one image draw');
    const clipAt = ctx.calls.findIndex(c => c[0] === 'clip');
    assert.equal(ctx.calls[clipAt + 1][1], fitted.body, 'Hand masks use the original body, preserving fingers missing from cropped hands PNG');
    assert.deepEqual(ctx.calls.slice(clipAt + 2).map(c => c[0]), ['restore','restore'], 'Hand clip cannot leak to the other fighter');
    assert.deepEqual(ctx.calls.filter(c => c[0] === 'scale')[0], ['scale', (side === 'enemy' ? -1 : 1) * 800/1536, 800/1536]);
    assert.equal(ctx.calls.filter(c => c[0] === 'save').length, 3);
    assert.equal(ctx.calls.filter(c => c[0] === 'restore').length, 3);
  }
  for (const handMasks of [[], [[[1,2],[3,4]]], [[[1,2],[3,4],[5,NaN]]]]) {
    const ctx = context();
    f.draw(ctx, { ...fitted, character: { grip: fitted.character.grip, handMasks } }, 'player');
    assert.equal(ctx.calls.filter(c => c[0] === 'drawImage').length, 2, 'Empty or invalid outlines never replay a whole hand crop');
    assert.equal(ctx.calls.filter(c => c[0] === 'clip').length, 0);
  }
  const guardRect=[420,450,130,170];
  const guardLayers={...pistolLayers,character:{grip:[838,314]},weapon:{...pistolLayers.weapon,foregroundGuard:guardRect},adjustment:{dx:6,dy:-4,size:125,angle:15}};
  for(const side of ['player','enemy']){
    const ctx=context();f.draw(ctx,guardLayers,side);
    assert.deepEqual(ctx.calls.filter(c=>c[0]==='drawImage').map(c=>c[1]),[pistolLayers.body,pistolLayers.gun,pistolLayers.hands,pistolLayers.gun]);
    assert.deepEqual(ctx.calls.filter(c=>c[0]==='translate').slice(-2),[['translate',844,310],['translate',844,310]],'Both gun passes use the same translated grip');
    assert.deepEqual(ctx.calls.filter(c=>c[0]==='rotate'),[['rotate',15*Math.PI/180],['rotate',15*Math.PI/180]]);
    assert.deepEqual(ctx.calls.filter(c=>c[0]==='scale').slice(-2),[['scale',pistolLayers.weapon.scale*1.25,pistolLayers.weapon.scale*1.25],['scale',pistolLayers.weapon.scale*1.25,pistolLayers.weapon.scale*1.25]]);
    assert.deepEqual(ctx.calls.filter(c=>c[0]==='rect'),[['rect',420-pistolLayers.weapon.grip[0],450-pistolLayers.weapon.grip[1],130,170]],'Guard rectangle uses source weapon coordinates');
    const clipAt=ctx.calls.findIndex(c=>c[0]==='clip');
    assert.equal(ctx.calls[clipAt+1][1],pistolLayers.gun);
    assert.deepEqual(ctx.calls.slice(clipAt+2).map(c=>c[0]),['restore','restore']);
    assert.equal(ctx.calls.filter(c=>c[0]==='save').length,ctx.calls.filter(c=>c[0]==='restore').length);
  }
  for(const foregroundGuard of [undefined,[],[1,2,0,4],[1,2,3,-4],[1,2,3,NaN],[1,2,3,4,5]]){
    const ctx=context();f.draw(ctx,{...guardLayers,weapon:{...guardLayers.weapon,foregroundGuard}},'player');
    assert.equal(ctx.calls.filter(c=>c[0]==='drawImage').length,3,'Invalid or absent guard never adds a gun pass');
    assert.equal(ctx.calls.filter(c=>c[0]==='clip').length,0);
  }
  console.log(JSON.stringify({ passed: true, combinations, uniqueImageURLs: urls.size, pistolPairAdjustments: true, handMasks: true, foregroundGuard:true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
