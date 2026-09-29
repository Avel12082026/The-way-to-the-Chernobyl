#!/usr/bin/env node
'use strict';

// Fit exactly one shared weapon sprite across the armor poses. This tool changes
// numeric fitting metadata only; it never creates per-equipment image files.
const fs = require('node:fs');
const path = require('node:path');

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const rounded = value => Math.round(value * 1e6) / 1e6;
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

function segmentContact(sourceTrigger, start, end, radius) {
  // Preserve the exact arithmetic of already published horizontal profiles.
  if (start[1] === end[1] && start[0] <= end[0] && sourceTrigger[0] <= start[0]) {
    const dy = start[1] - sourceTrigger[1];
    return [clamp(sourceTrigger[0] + Math.sqrt(Math.max(0, radius ** 2 - dy ** 2)), start[0], end[0]), start[1]];
  }
  const vector = [end[0] - start[0], end[1] - start[1]];
  const relative = [start[0] - sourceTrigger[0], start[1] - sourceTrigger[1]];
  const a = vector[0] ** 2 + vector[1] ** 2;
  if (!(a > 0)) throw Error('Support segment must have positive length');
  const b = 2 * (relative[0] * vector[0] + relative[1] * vector[1]);
  const c = relative[0] ** 2 + relative[1] ** 2 - radius ** 2;
  const discriminant = b ** 2 - 4 * a * c;
  const candidates = [0, 1, clamp(-b / (2 * a), 0, 1)];
  if (discriminant >= 0) {
    candidates.push(clamp((-b + Math.sqrt(discriminant)) / (2 * a), 0, 1));
    candidates.push(clamp((-b - Math.sqrt(discriminant)) / (2 * a), 0, 1));
  }
  const error = t => Math.abs(Math.hypot(relative[0] + vector[0] * t, relative[1] + vector[1] * t) - radius);
  const t = candidates.sort((first, second) => error(first) - error(second))[0];
  return [start[0] + vector[0] * t, start[1] + vector[1] * t];
}

function onSegment(value, start, end) {
  if (!point(value)) return false;
  const vector = [end[0] - start[0], end[1] - start[1]];
  const lengthSquared = vector[0] ** 2 + vector[1] ** 2;
  if (!(lengthSquared > 0)) return false;
  const relative = [value[0] - start[0], value[1] - start[1]];
  const t = (relative[0] * vector[0] + relative[1] * vector[1]) / lengthSquared;
  const cross = relative[0] * vector[1] - relative[1] * vector[0];
  return t >= -1e-9 && t <= 1 + 1e-9 && Math.abs(cross) / Math.sqrt(lengthSquared) <= 1e-6;
}

function fit(character, weapon, profile, override = {}) {
  const trigger = override.trigger || character.trigger;
  const support = override.support || character.support;
  const sourceTrigger = profile.sourceTrigger;
  const [start, end] = profile.sourceSupportSegment;
  if (![trigger, support, sourceTrigger, start, end, character.grip, weapon.grip].every(point)) {
    throw Error('Missing finite trigger, support or grip coordinates');
  }
  if (start[0] === end[0] && start[1] === end[1]) throw Error('Support segment must have positive length');

  const distance = Math.hypot(support[0] - trigger[0], support[1] - trigger[1]);
  const scale = override.scale ?? clamp(distance / profile.nominalContactDistance, ...profile.scaleBounds);
  const sourceSupport = override.sourceSupport || segmentContact(sourceTrigger, start, end, distance / scale);
  if (!onSegment(sourceSupport, start, end)) {
    throw Error('Support contact must remain on the inspected fore-end segment');
  }
  const rawAngle = (Math.atan2(support[1] - trigger[1], support[0] - trigger[0]) -
    Math.atan2(sourceSupport[1] - sourceTrigger[1], sourceSupport[0] - sourceTrigger[0])) * 180 / Math.PI;
  const angle = override.angle ?? clamp(rawAngle, ...profile.angleBounds);
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  function relative(source) {
    const x = (source[0] - weapon.grip[0]) * scale;
    const y = (source[1] - weapon.grip[1]) * scale;
    return [x * cosine - y * sine, x * sine + y * cosine];
  }
  const triggerOffset = relative(sourceTrigger);
  const dx = trigger[0] - character.grip[0] - triggerOffset[0];
  const dy = trigger[1] - character.grip[1] - triggerOffset[1];
  const supportOffset = relative(sourceSupport);
  // A support override is an anatomically corrected point on the original
  // body image. Translate that exact point together with the rest of the arm.
  const shift = [character.grip[0] + dx + supportOffset[0] - support[0],
    character.grip[1] + dy + supportOffset[1] - support[1]];
  const maximumSupportShift = override.maximumSupportShift ?? profile.maximumSupportShift;
  if (Math.hypot(...shift) > maximumSupportShift) throw Error('Far-arm translation exceeds the review bound');
  const adjustment = {size: rounded(scale / weapon.scale * 100), angle: rounded(angle), dx: rounded(dx), dy: rounded(dy)};
  if (Math.hypot(...shift) > .01) adjustment.supportShift = shift.map(rounded);
  if (override.handMasks) adjustment.handMasks = override.handMasks;
  if (override.foregroundArm) adjustment.foregroundArm = override.foregroundArm;
  return {adjustment, sourceTrigger, sourceSupport: sourceSupport.map(rounded), targetTrigger: trigger,
    sourceBodySupport: support, targetSupport: support.map((value, axis) => rounded(value + shift[axis]))};
}

function main(argv) {
  const argument = argv.indexOf('--weapon');
  const weaponId = Number(argument >= 0 ? argv[argument + 1] : NaN);
  if (!Number.isInteger(weaponId) || weaponId <= 0 || argv.filter(value => value === '--weapon').length !== 1) {
    throw Error('Usage: node tools/fit_combat_weapon.cjs --weapon <one ID> [--write] [--report <path>]');
  }
  const root = path.resolve(__dirname, '..');
  const filename = path.join(root, 'images/combat/fighters.js');
  const source = fs.readFileSync(filename, 'utf8');
  const match = source.match(/^const data=(.*);$/m);
  if (!match) throw Error('Cannot locate fighters metadata');
  const data = JSON.parse(match[1]);
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'asset_sources/combat_weapon_fits', weaponId + '.json'), 'utf8'));
  if (profile.weaponId !== weaponId) throw Error('Weapon/profile mismatch');
  const weapon = data.weapons[weaponId];
  if (!weapon || weapon.pose !== 'heavy') throw Error('Profile requires an existing heavy weapon sprite');
  const report = {weaponId, sourceImage: profile.sourceImage, status: 'candidate-awaiting-visual-review', armors: {}};
  for (const [armorId, armor] of Object.entries(data.characters)) {
    const character = armor.poses[weapon.pose];
    const candidate = fit(character, weapon, profile, profile.armorOverrides[armorId]);
    if (candidate.adjustment.supportShift && !data.supportArms[armorId]) throw Error('No far-arm outline for armor ' + armorId);
    data.pairAdjustments[armorId + '-' + weaponId] = candidate.adjustment;
    report.armors[armorId] = candidate;
  }
  if (argv.includes('--write')) fs.writeFileSync(filename, source.replace(match[0], 'const data=' + JSON.stringify(data) + ';'));
  const reportArgument = argv.indexOf('--report');
  if (reportArgument >= 0) fs.writeFileSync(path.resolve(argv[reportArgument + 1]), JSON.stringify(report, null, 2) + '\n');
  console.log(`${argv.includes('--write') ? 'Wrote' : 'Computed'} ${Object.keys(report.armors).length} candidate fits for weapon ${weaponId}; shared PNG unchanged.`);
}

module.exports = {fit, segmentContact, onSegment};
if (require.main === module) main(process.argv.slice(2));
