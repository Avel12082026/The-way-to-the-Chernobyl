const assert = require('node:assert/strict');
const { argumentsFrom, compareMirror, compareGeometryMirror } = require('../tools/review_weapon_fits.cjs');

assert.throws(() => argumentsFrom(['--weapon', '114,32', '--cache', '/tmp/source', '--out', '/tmp/review']), /exactly one/);
assert.throws(() => argumentsFrom(['--weapon', '114', '--weapon', '32', '--cache', '/tmp/source', '--out', '/tmp/review']), /repeated/);
assert.equal(argumentsFrom(['--weapon', '114', '--cache', '/tmp/source', '--out', '/tmp/review']).weapon, '114');

const player = Uint8ClampedArray.from([10, 20, 30, 255, 50, 60, 70, 255]);
const enemy = Uint8ClampedArray.from([50, 60, 70, 255, 10, 20, 30, 255]);
assert.equal(compareMirror(player, enemy, 2, 1).exact, true);
assert.equal(compareMirror(player, enemy, 2, 1).withinRasterTolerance, true);
const broken = enemy.slice(); broken[0] = 100;
assert.equal(compareMirror(player, broken, 2, 1).withinRasterTolerance, false, 'A visibly wrong NPC pixel must not pass reflection QA');
const rounding = enemy.slice(); rounding[0]++;
assert.equal(compareMirror(player, rounding, 2, 1).exact, false);
assert.equal(compareMirror(player, rounding, 2, 1).withinRasterTolerance, true);
const emptyA = Uint8ClampedArray.from([255, 100, 0, 0]);
const emptyB = Uint8ClampedArray.from([0, 0, 255, 0]);
assert.equal(compareMirror(emptyA, emptyB, 1, 1).maxPremultipliedDifference, 0, 'Invisible RGB must not imply a visible reflection defect');
const playerCommands = [{ op: 'drawImage', image: 'gun', points: [[100, 50], [200, 75]] }];
const enemyCommands = [{ op: 'drawImage', image: 'gun', points: [[1436, 50], [1336, 75]] }];
assert.equal(compareGeometryMirror(playerCommands, enemyCommands, 1536).equivalent, true);
assert.equal(compareGeometryMirror(playerCommands, [{ ...enemyCommands[0], image: 'body' }], 1536).equivalent, false, 'Changing a mirrored layer is a regression');
assert.equal(compareGeometryMirror(playerCommands, [{ ...enemyCommands[0], points: [[1435, 50], [1336, 75]] }], 1536).equivalent, false, 'One-pixel transform error must fail even if most pixels match');
console.log('PASS: one-weapon review selection, exact reflection, visible defect detection and transparent RGB handling');
