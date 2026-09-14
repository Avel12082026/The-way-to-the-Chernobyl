const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function extract(name, next) {
  return html.slice(html.indexOf('    function ' + name + '('), html.indexOf('    function ' + next + '('));
}
const calls = [];
const ctx = {
  currentEnemy: {name: 'Мутант'}, currentAnomaly: {name: 'Аномалия'}, raidActive: true,
  battleTurn: 0, player: {armor: {name: 'Костюм'}, weapon: {name: 'Пистолет'}},
  ARMOR_CHAR_IMAGES: {'Костюм': 'armor_char_27.webp'},
  weapons: [{name: 'Пистолет', id: 87}],
  parseGearName: name => ({baseName: name}),
  document: {getElementById: () => ({classList: {contains: () => true}})},
  window: {
    AnomalyScene: {hide: () => calls.push('hide-search'), show: () => calls.push('show-search')},
    CombatScene: {hide: () => calls.push('hide-combat'), show: c => calls.push(['show-combat', c.armor, c.weaponId])}
  }
};
vm.createContext(ctx);
vm.runInContext(extract('updateCombatScene', 'renderBattleButtons') + extract('updateAnomalyScene', 'startAnomalyEncounter'), ctx);
ctx.updateCombatScene();
assert.deepEqual(calls, ['hide-search', ['show-combat', 27, 87]]);
calls.length = 0;
ctx.updateAnomalyScene();
assert.deepEqual(calls, ['hide-search'], 'Search must remain hidden even with a stale anomaly during combat');
console.log('Combat excludes the two-hand anomaly scene and preserves equipped armor and pistol');
