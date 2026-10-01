const assert=require('assert');
const fs=require('fs');

const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const patch=fs.readFileSync('server_patches/trader_consumable_tiers_20260929.patch','utf8');

assert(trade.includes("const ZHUCHARA_CONSUMABLES = new Set(['Хлеб','Вода','Аптечка гражданская','Водка Столичная'])"));
assert(trade.includes("const BARMAN_CONSUMABLES = new Set(['Хлеб','Тушенка','Вода','Энергетик','Аптечка гражданская','Аптечка армейская','Антирад'])"));
assert(trade.includes("const LEONOV_CONSUMABLE_TYPES = new Set(['food','water','medkit','antirad'])"));
assert(trade.includes("const LEONOV_BUYBACK_TYPES = new Set(['food','water','medkit','antirad'])"));
assert(trade.includes("ZHUCHARA_CONSUMABLES.has(item.name)"));
assert(trade.includes("BARMAN_CONSUMABLES.has(item.name)"));
assert(trade.includes("LEONOV_CONSUMABLE_TYPES.has(c.type)"));
assert(trade.includes("LEONOV_BUYBACK_TYPES.has(supply.type)"));
assert(html.includes('ui/trade-menu.js?v=20261001-vodka1'));

assert(patch.includes("TRADER_CONSUMABLE_TIERS_V1"));
assert(patch.includes("ZHUCHARA_CONSUMABLES_SERVER"));
assert(patch.includes("'Хлеб','Вода','Аптечка гражданская'"));
assert(patch.includes("'Аптечка гражданская','Аптечка армейская'"));
assert(patch.includes("LEONOV_CONSUMABLES_SERVER"));
assert(patch.includes("['food','water','medkit','antirad'].includes"));
assert(patch.includes("аптечки, еду, воду и антирад"));

console.log('PASS: trader consumable progression and Leonov buyback rules');