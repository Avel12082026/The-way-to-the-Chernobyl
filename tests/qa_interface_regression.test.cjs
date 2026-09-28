const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const terminology = fs.readFileSync('ui/terminology-market.js', 'utf8');
const start = terminology.indexOf('  const replacements = [');
const end = terminology.indexOf('  function rewriteTree', start);
assert(start >= 0 && end > start, 'terminology rewrite block missing');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(terminology.slice(start, end) + '\nthis.rewriteText = rewriteText;', ctx);

for (const [input, expected] of [
  ['⭐ Магазин Байт', '⭐ Магазин Сталбайтов'],
  ['Байтов: 10', 'Сталбайтов: 10'],
  ['Байт', 'Сталбайт'],
  ['Магазин Сталбайтов', 'Магазин Сталбайтов'],
]) {
  const once = ctx.rewriteText(input);
  const twice = ctx.rewriteText(once);
  assert.equal(once, expected, input + ' first pass');
  assert.equal(twice, expected, input + ' second pass');
  assert(!twice.includes('Сталстал'), input + ' recursive replacement');
}

const index = fs.readFileSync('index.html', 'utf8');
assert(!index.includes('<span class="zr-sr">🎒 Инвентарь</span>'), 'inventory title duplicated for assistive text');
assert(!index.includes('<span class="zr-sr">⭐ Магазин Байт</span>'), 'shop title duplicated for assistive text');
assert(index.includes('empty_slot_weapon.png') && index.includes('alt="" aria-hidden="true"'), 'decorative slot filenames exposed');
assert(index.includes('ui/terminology-market.js?v=20260928-qa-fix1'), 'terminology cache key missing');
assert(index.includes('ui/bunker-menu.js?v=20260928-qa-fix1'), 'bunker menu cache key missing');

console.log('PASS: terminology is idempotent and QA text/accessibility regressions are fixed');
