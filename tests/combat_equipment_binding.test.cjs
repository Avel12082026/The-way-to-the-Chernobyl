const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function declaration(name, end) {
    const start = html.indexOf(`    const ${name} = `);
    assert.ok(start >= 0, `Missing ${name}`);
    const stop = html.indexOf(end, start);
    assert.ok(stop > start, `Missing end of ${name}`);
    return html.slice(start, stop + end.length);
}
const start = html.indexOf('    function updateCombatScene()');
const stop = html.indexOf('    function renderBattleButtons()', start);
assert.ok(start >= 0 && stop > start);
const parseStart = html.indexOf('    function stripInvisibleSuffix(name)');
const parseStop = html.indexOf('    function getStableArmorKey(name)', parseStart);
const source = [
    declaration('weapons', '\n    ];'),
    declaration('armorItems', '\n    ];'),
    declaration('ARMOR_CHAR_IMAGES', '\n    };'),
    html.slice(parseStart, parseStop),
    html.slice(start, stop)
].join('\n');

function run(player, enemy, options = {}) {
    const before = JSON.stringify({ player, enemy });
    const shown = [];
    let hidden = 0, anomalyHidden = 0;
    const host = { hidden: true, textContent: '' };
    const context = {
        player, currentEnemy: enemy, raidActive: options.raidActive ?? true,
        battleTurn: options.battleTurn ?? 0,
        document: { getElementById(id) {
            if (id === 'raidScreen') return { classList: { contains: () => options.active ?? true } };
            if (id === 'combatScene') return options.noHost ? null : host;
            return null;
        } },
        window: {
            CombatScene: options.noScene ? undefined : { show(config) { shown.push(config); }, hide() { hidden++; } },
            AnomalyScene: { hide() { anomalyHidden++; } }
        }
    };
    vm.runInNewContext(source + '\nupdateCombatScene();', context);
    assert.equal(JSON.stringify({ player, enemy }), before, 'Rendering must not mutate equipped items');
    return { config: shown[0], shown, hidden, anomalyHidden, host };
}
function gear(config) {
    return [config.armor, config.weaponId, config.enemyGear.armorId, config.enemyGear.weaponId];
}

// IDs-only equipment must select exact items on both sides; suit catalog IDs are not image IDs.
let result = run(
    { armor: { id: 64 }, weapon: { id: '12' }, level: 212 },
    { armor: { id: '15' }, weapon: { id: 13 }, level: 999 }
);
assert.deepEqual(gear(result.config), [15, 12, 64, 13]);
assert.equal(result.config.playerLevel, 212, 'Background level comes from the player');
assert.equal(result.config.pending, false);
assert.equal(result.anomalyHidden, 1);

// Canonical upgraded names take precedence over stale IDs, including invisible instance suffixes.
result = run(
    { armor: { name: 'Бронекостюм Титан-Про +4\u200B', id: 1 }, weapon: { name: 'Винтовка СВД +3\u200C', id: 12 }, level: 56 },
    { armor: { name: 'Комбинезон Юность +2', id: 40 }, weapon: { name: 'Автомат АК-74 +1', id: 13 } },
    { battleTurn: 1 }
);
assert.deepEqual(gear(result.config), [40, 13, 1, 12]);
assert.equal(result.config.pending, true);

// NPC payloads may use flat IDs, flat names, string items, or explicit IDs inside items.
for (const enemy of [
    { armorId: '40', weaponId: '13' },
    { armorName: 'Бронекостюм Титан-Про +2', weaponName: 'Винтовка СВД +4' },
    { armor: 'Бронекостюм Титан-Про', weapon: 'Винтовка СВД' },
    { armor: { armorId: 40 }, weapon: { weaponId: 13 } }
]) {
    result = run({ armor: { id: 1 }, weapon: { id: 12 }, level: 1 }, enemy);
    assert.deepEqual(gear(result.config), [1, 12, 40, 13]);
}

// Unknown or unequipped gear must remain unresolved rather than silently becoming starter gear.
for (const equipped of [
    {},
    { armor: { name: 'Без брони' }, weapon: { name: 'Кулаки' } },
    { armor: { name: 'Неизвестная броня', id: 999 }, weapon: { name: 'Неизвестное оружие', id: 999 } },
    { armorId: 999, weaponId: 999 },
    { armor: { id: true }, weapon: { id: true } }
]) {
    result = run({ ...equipped, level: 1 }, { ...equipped });
    assert.deepEqual(gear(result.config), [null, undefined, null, undefined]);
}

const player = { armor: { id: 1 }, weapon: { id: 12 }, level: 1 };
for (const [enemy, options] of [[null, {}], [{ friendly: true }, {}], [{}, { raidActive: false }], [{}, { active: false }]]) {
    result = run(player, enemy, options);
    assert.equal(result.shown.length, 0);
    assert.equal(result.hidden, 1);
}
result = run(player, {}, { noScene: true });
assert.equal(result.host.hidden, false);
assert.match(result.host.textContent, /Не удалось загрузить/);
assert.doesNotThrow(() => run(player, {}, { noScene: true, noHost: true }));
console.log('PASS: exact equipment from IDs and upgraded names, canonical suit mapping, unknown gear, no mutations, player level, inactive battles');
