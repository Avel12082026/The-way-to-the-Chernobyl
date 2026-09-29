#!/usr/bin/env node
// Review one shared weapon sprite across every suit using the production renderer.
// All composite review images belong in scratch, never the game's runtime assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function argumentsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!/^--[a-z-]+$/.test(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw Error('Usage: node tools/review_weapon_fits.cjs --weapon ID --cache PATH --out PATH [--renderer PATH] [--armor 1,2,3]');
    }
    const key = argv[i++].slice(2);
    if (!['weapon', 'cache', 'out', 'renderer', 'armor'].includes(key) || key in args) throw Error('Unknown or repeated option: --' + key);
    args[key] = argv[i];
  }
  if (!/^\d+$/.test(args.weapon || '') || !args.cache || !args.out) throw Error('Supply exactly one --weapon ID, --cache PATH and --out PATH.');
  return args;
}
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function hashText(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function nativeCanvas() {
  for (const name of ['@napi-rs/canvas', ...(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? [path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '@napi-rs/canvas')] : [])]) {
    try { return require(name); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw Error('Set CODEX_PRIMARY_RUNTIME_NODE_MODULES to the directory containing @napi-rs/canvas.');
}
function alphaBounds(image, createCanvas) {
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  let left = image.width, top = image.height, right = -1, bottom = -1, transparent = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const a = pixels[(y * image.width + x) * 4 + 3];
    if (!a) transparent++;
    if (a > 16) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  if (right < left) throw Error('Empty source image');
  return { bbox: [left, top, right + 1, bottom + 1], transparentFraction: transparent / (image.width * image.height) };
}
function compareMirror(left, right, width, height) {
  let differingPixels = 0, maxChannelDifference = 0, absoluteDifference = 0, opaquePixelCount = 0;
  let maxPremultipliedDifference = 0, premultipliedAbsoluteDifference = 0, pixelsOverTwoLevels = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4, q = (y * width + width - 1 - x) * 4;
    if (left[p + 3]) opaquePixelCount++;
    let differs = false, largestPremultipliedDifference = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(left[p + c] - right[q + c]);
      differs ||= d > 0; maxChannelDifference = Math.max(maxChannelDifference, d); absoluteDifference += d;
      // RGB beneath zero alpha has no visual meaning; compare composited energy.
      const premultiplied = c === 3 ? d : Math.abs(left[p + c] * left[p + 3] / 255 - right[q + c] * right[q + 3] / 255);
      largestPremultipliedDifference = Math.max(largestPremultipliedDifference, premultiplied);
      maxPremultipliedDifference = Math.max(maxPremultipliedDifference, premultiplied);
      premultipliedAbsoluteDifference += premultiplied;
    }
    if (differs) differingPixels++;
    if (largestPremultipliedDifference > 2.01) pixelsOverTwoLevels++;
  }
  // Floating-point transforms can round antialiased edges a few levels apart.
  // Keep raw metrics and a strict visible-pixel tolerance; never report this as exact.
  const withinRasterTolerance = maxPremultipliedDifference <= 8 && pixelsOverTwoLevels <= Math.max(1, opaquePixelCount * 0.0001);
  return { exact: differingPixels === 0, withinRasterTolerance, differingPixels, maxChannelDifference, absoluteDifference, opaquePixelCount, maxPremultipliedDifference, premultipliedAbsoluteDifference, pixelsOverTwoLevels };
}
function traceContext(ctx, layers) {
  const commands = [];
  const point = (x, y) => { const m = ctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  const instrumented = new Proxy(ctx, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== 'function') return value;
      return (...args) => {
        if (key === 'drawImage') {
          if (args.length !== 3) throw Error('Review trace needs support for this new drawImage signature');
          const [image, x, y] = args;
          commands.push({ op: key, image: image === layers.body ? 'body' : image === layers.hands ? 'hands' : image === layers.gun ? 'gun' : 'unknown', points: [point(x, y), point(x + image.width, y), point(x + image.width, y + image.height), point(x, y + image.height)] });
        } else if (key === 'moveTo' || key === 'lineTo') commands.push({ op: key, points: [point(...args)] });
        else if (key === 'rect') {
          const [x, y, w, h] = args; commands.push({ op: key, points: [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)] });
        } else if (['beginPath', 'closePath', 'clip', 'save', 'restore'].includes(key)) commands.push({ op: key, args });
        return value.apply(target, args);
      };
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  return { ctx: instrumented, commands };
}
function compareGeometryMirror(player, enemy, width) {
  if (player.length !== enemy.length) return { equivalent: false, reason: 'Different draw/clip command counts' };
  let maxCoordinateDifference = 0;
  for (let i = 0; i < player.length; i++) {
    const p = player[i], q = enemy[i];
    if (p.op !== q.op || p.image !== q.image || JSON.stringify(p.args) !== JSON.stringify(q.args) || p.points?.length !== q.points?.length) return { equivalent: false, reason: 'Different command or layer at ' + i };
    for (let j = 0; j < (p.points?.length || 0); j++) {
      maxCoordinateDifference = Math.max(maxCoordinateDifference, Math.abs(width - p.points[j][0] - q.points[j][0]), Math.abs(p.points[j][1] - q.points[j][1]));
    }
  }
  // Native canvas exposes float32 matrices: allow less than 1/1024 screen pixel.
  return { equivalent: maxCoordinateDifference < 1 / 1024, commands: player.length, maxCoordinateDifference, tolerance: 1 / 1024 };
}
function contactCrop(renderer, layers, gunBounds) {
  const p = renderer.placement(layers, 'player');
  const bodyPoint = point => [p.x + p.scale * (point[0] - layers.body.width / 2), p.y + p.scale * (point[1] - p.ground)];
  const character = layers.character;
  const points = [character.grip, character.trigger, character.support, ...(character.foregroundArm || []), ...(character.handMasks || []).flat()].filter(Array.isArray).map(bodyPoint);
  const shift = layers.adjustment?.supportShift;
  if (Array.isArray(shift) && Array.isArray(layers.supportArm)) {
    for (const point of layers.supportArm) points.push(bodyPoint([point[0] + shift[0], point[1] + shift[1]]));
  }
  const [left, top, right, bottom] = gunBounds;
  for (const point of [[left, top], [right, top], [right, bottom], [left, bottom]]) {
    const projected = renderer.project(layers, 'player', point); points.push([projected.x, projected.y]);
  }
  const x = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])) - 35));
  const y = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])) - 55));
  return [x, y, Math.min(1536, Math.ceil(Math.max(...points.map(p => p[0])) + 35)) - x, Math.min(1024, Math.ceil(Math.max(...points.map(p => p[1])) + 55)) - y];
}
async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const output = path.resolve(args.out), cache = path.resolve(args.cache);
  const forbidden = [path.join(root, 'images'), path.join(root, 'asset_sources')];
  if (forbidden.some(dir => output === dir || output.startsWith(dir + path.sep))) throw Error('Review composites must be written outside runtime/source asset directories.');
  const rendererPath = path.resolve(args.renderer || path.join(root, 'images/combat/fighters.js'));
  const renderer = require(rendererPath), weaponId = Number(args.weapon);
  const weapon = renderer.data.weapons[weaponId];
  if (!weapon) throw Error('Unknown weapon ' + weaponId);
  const allArmor = Object.keys(renderer.data.characters).map(Number).sort((a, b) => a - b);
  const armorIds = args.armor ? args.armor.split(',').map(Number) : allArmor;
  if (!armorIds.length || new Set(armorIds).size !== armorIds.length || armorIds.some(id => !allArmor.includes(id))) throw Error('Invalid/duplicate armor selection.');
  const { createCanvas, loadImage } = nativeCanvas();
  const pose = weapon.pose || 'pistol';
  const weaponPath = path.join(cache, 'weapons', weaponId + '.png');
  const gun = await loadImage(weaponPath), gunAlpha = alphaBounds(gun, createCanvas);
  const filesFor = armorId => ({
    body: path.join(cache, armorId + '-' + pose + '.png'),
    hands: path.join(cache, 'hands', armorId + '-' + pose + '.png')
  });
  const missing = armorIds.flatMap(id => Object.values(filesFor(id))).filter(file => !fs.existsSync(file));
  if (missing.length) throw Error('Missing ' + missing.length + ' assets; first: ' + missing.slice(0, 5).join(', '));
  fs.mkdirSync(path.join(output, 'actors'), { recursive: true });
  fs.mkdirSync(path.join(output, 'crops'), { recursive: true });
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), weaponId, name: weapon.name, pose,
    rendererSha256: hash(rendererPath), sharedWeapon: { path: 'images/combat/modular/weapons/' + weaponId + '.png', sha256: hash(weaponPath), ...gunAlpha },
    rendererCodeSha256: hashText(fs.readFileSync(rendererPath, 'utf8').replace(/^const data=.*;$/m, 'const data=<separately-hashed-fit-data>;')),
    weaponFitSha256: hashText(JSON.stringify(allArmor.map(armorId => {
      const fit = renderer.resolve({ armorId, weaponId });
      return { armorId, character: fit.character, weapon: fit.weapon, adjustment: fit.adjustment || null, supportArm: fit.supportArm || null, feet: fit.feet, muzzle: fit.muzzle };
    }))),
    expectedArmorCount: allArmor.length, renderedArmorCount: 0, completeArmorCoverage: armorIds.length === allArmor.length,
    humanReview: { status: 'pending', instruction: 'Inspect every contact crop and any flagged full scene. Record armor IDs and findings against these exact renderer/source hashes. Rendering and mirror checks do not establish correct anatomy or grip.' },
    sheets: [], armors: []
  };
  const width = 1536, height = 1024;
  const player = createCanvas(width, height), playerCtx = player.getContext('2d');
  const enemy = createCanvas(width, height), enemyCtx = enemy.getContext('2d');
  const full = createCanvas(width, height), fullCtx = full.getContext('2d');
  const cellWidth = 640, cellHeight = 440, band = 36;
  let sheet, sheetCtx;
  for (let index = 0; index < armorIds.length; index++) {
    const armorId = armorIds[index], source = filesFor(armorId);
    const gear = renderer.resolve({ armorId, weaponId });
    if (!gear.ready) throw Error('Unresolved pair ' + armorId + ':' + weaponId);
    const body = await loadImage(source.body), hands = await loadImage(source.hands);
    const layers = await renderer.load(gear, url => Promise.resolve(url === gear.body ? body : url === gear.hands ? hands : gun));
    playerCtx.clearRect(0, 0, width, height); enemyCtx.clearRect(0, 0, width, height);
    const playerTrace = traceContext(playerCtx, layers), enemyTrace = traceContext(enemyCtx, layers);
    if (!renderer.draw(playerTrace.ctx, layers, 'player') || !renderer.draw(enemyTrace.ctx, layers, 'enemy')) throw Error('Renderer failed for ' + gear.key);
    const geometryMirror = compareGeometryMirror(playerTrace.commands, enemyTrace.commands, width);
    const mirror = compareMirror(playerCtx.getImageData(0, 0, width, height).data, enemyCtx.getImageData(0, 0, width, height).data, width, height);
    const crop = contactCrop(renderer, layers, gunAlpha.bbox);
    const cropped = createCanvas(crop[2], crop[3]), cropCtx = cropped.getContext('2d');
    cropCtx.fillStyle = '#b8b6ae'; cropCtx.fillRect(0, 0, cropped.width, cropped.height);
    cropCtx.drawImage(player, ...crop, 0, 0, cropped.width, cropped.height);
    const filename = 'armor-' + String(armorId).padStart(3, '0') + '.jpg';
    fs.writeFileSync(path.join(output, 'crops', filename), cropped.toBuffer('image/jpeg', 94));
    fullCtx.fillStyle = '#282e28'; fullCtx.fillRect(0, 0, width, height);
    fullCtx.drawImage(player, 0, 0); fullCtx.drawImage(enemy, 0, 0);
    fullCtx.fillStyle = '#e6e4dc'; fullCtx.font = '24px sans-serif';
    fullCtx.fillText('Armor ' + armorId + ' | weapon ' + weaponId + ' | player / NPC', 24, 34);
    fs.writeFileSync(path.join(output, 'actors', filename), full.toBuffer('image/jpeg', 94));
    if (index % 16 === 0) {
      sheet = createCanvas(cellWidth * 4, cellHeight * 4); sheetCtx = sheet.getContext('2d');
      sheetCtx.fillStyle = '#333730'; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
    }
    const cell = index % 16, x = cell % 4 * cellWidth, y = Math.floor(cell / 4) * cellHeight;
    sheetCtx.fillStyle = '#b8b6ae'; sheetCtx.fillRect(x + 2, y + band, cellWidth - 4, cellHeight - band - 2);
    const scale = Math.min((cellWidth - 12) / cropped.width, (cellHeight - band - 10) / cropped.height);
    sheetCtx.drawImage(cropped, x + (cellWidth - cropped.width * scale) / 2, y + band + (cellHeight - band - cropped.height * scale) / 2, cropped.width * scale, cropped.height * scale);
    sheetCtx.fillStyle = '#f2f0e8'; sheetCtx.font = '22px sans-serif';
    sheetCtx.fillText('Armor ' + armorId + ' | weapon ' + weaponId, x + 12, y + 26);
    const row = {
      armorId, bodySha256: hash(source.body), handsSha256: hash(source.hands),
      fitSha256: hashText(JSON.stringify({ character: gear.character, weapon: gear.weapon, adjustment: gear.adjustment || null, supportArm: gear.supportArm || null, feet: gear.feet, muzzle: gear.muzzle })),
      adjustment: gear.adjustment || null, supportShift: gear.adjustment?.supportShift || null,
      crop, mirror, geometryMirror, actor: 'actors/' + filename, contactCrop: 'crops/' + filename,
      humanReview: { status: 'pending', findings: [] }
    };
    report.armors.push(row); report.renderedArmorCount++;
    if (index % 16 === 15 || index === armorIds.length - 1) {
      const name = 'sheet-' + String(Math.floor(index / 16) + 1).padStart(2, '0') + '.jpg';
      fs.writeFileSync(path.join(output, name), sheet.toBuffer('image/jpeg', 95)); report.sheets.push(name);
      console.log('Rendered weapon ' + weaponId + ': ' + (index + 1) + '/' + armorIds.length + ' armors -> ' + name);
    }
  }
  report.automated = { renderedAllRequested: true, nonemptyAll: report.armors.every(row => row.mirror.opaquePixelCount > 0), mirrorGeometryAll: report.armors.every(row => row.geometryMirror.equivalent), exactMirrorAll: report.armors.every(row => row.mirror.exact), mirrorWithinRasterToleranceAll: report.armors.every(row => row.mirror.withinRasterTolerance), humanGripApproval: false };
  fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ weaponId, output, rendered: report.renderedArmorCount, completeArmorCoverage: report.completeArmorCoverage, ...report.automated }));
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { argumentsFrom, compareMirror, compareGeometryMirror, contactCrop };
