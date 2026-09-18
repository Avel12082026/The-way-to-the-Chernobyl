'use strict';
const fs=require('fs');
const assert=require('assert');

const term=fs.readFileSync('ui/terminology-market.js','utf8');
const bunkerHtml=fs.readFileSync('ui/bunker-menu.html','utf8');
const bunkerJs=fs.readFileSync('ui/bunker-menu.js','utf8');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const combatCatalog=fs.readFileSync('images/combat/catalog.json','utf8');

for (const [from,to] of [
  ['Жетоны сталкера','Сталкоины'],
  ['Книги знаний','Опыт+'],
  ['Байты','Сталбайты'],
  ['Назат','Назад'],
  ['Тушенка','Тушёнка'],
  ['Псевдо собака','Псевдособака'],
  ['Пси собака','Пси-собака'],
  ['Электро химера','Электрохимера'],
  ['Рука покрытая перьями','Рука, покрытая перьями']
]) {
  assert(term.includes(JSON.stringify(from).slice(1,-1)) || term.includes("'"+from+"'"), 'missing terminology source '+from);
  assert(term.includes(to), 'missing terminology target '+to);
}

assert(term.includes("lot?.currency === 'stalkcoins'"), 'lot currency is not read');
assert(term.includes("player?.breedCredits"), 'Stalcoin balance must use breedCredits');
assert(term.includes("currency = normalized === '2' ? 'stalkcoins' : 'bytes'"), 'sell currency selector missing');
assert(term.includes("currency\n      })") || term.includes("currency\n      }"), 'sell request must include currency');

assert(!index.includes('>Назат<'), 'visible Назат typo remains in index');
assert(index.includes('ui/terminology-market.js?v='), 'terminology market module is not installed');
assert(index.includes('>Сталбайты<'), 'Stalbytes missing from static bunker UI');
assert(index.includes('>Сталкоины<'), 'Stalcoins missing from static bunker UI');
assert(index.includes('>Опыт+<'), 'XP+ missing from static bunker UI');

assert(bunkerHtml.includes('>Сталбайты<'));
assert(bunkerHtml.includes('>Сталкоины<'));
assert(bunkerHtml.includes('>Опыт+<'));
assert(!bunkerHtml.includes('>Байты<'));
assert(!bunkerHtml.includes('>Жетоны сталкера<'));
assert(!bunkerHtml.includes('>Книги знаний<'));

// Internal compatibility: do not rename the saved inventory item.
assert(bunkerJs.includes("player.inventory?.['Книга знаний']"), 'knowledge-book save key was changed');
assert(bunkerJs.includes('Использовать Опыт+'), 'XP+ tooltip missing');
assert(bunkerJs.includes('Опыт+ отсутствует'), 'XP+ empty tooltip missing');

assert(trade.includes('сталбайтов · '), 'trade balance Stalbytes label missing');
assert(trade.includes('сталкоинов'), 'trade balance Stalcoins label missing');
assert(!trade.includes(" + ' Б · '"), 'old trade balance abbreviation remains');
assert(!trade.includes(" + ' жет.'"), 'old Stalker-token abbreviation remains');

for (const bad of ['Псевдо собака','Пси собака','Электро химера']) {
  assert(!combatCatalog.includes(bad), 'source spelling still contains: '+bad);
}
for (const good of ['Псевдособака','Пси-собака','Электрохимера']) {
  assert(combatCatalog.includes(good), 'corrected mutant spelling missing: '+good);
}

console.log('PASS: terminology and player market client requirements');
