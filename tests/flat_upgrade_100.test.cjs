const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const patch=fs.readFileSync('server_patches/flat_upgrade_100_20260929.patch','utf8');

assert(html.includes('const UPGRADE_MAX_LEVEL = 100; // UPGRADE_FLAT_100_V1'));
assert(html.includes('const UPGRADE_BYTE_THRESHOLD = 50;'));
assert(!html.includes('const UPGRADE_MAX_BONUS_PCT ='));

const fn=(html.match(/function getUpgradedStat\(baseStat, level, ceiling, adminOnly = false\) \{[\s\S]*?\n    \}/)||[])[0];
assert(fn,'getUpgradedStat missing');
const ctx={UPGRADE_MAX_LEVEL:100,Number,Math};
vm.createContext(ctx);
vm.runInContext(fn,ctx);
assert.equal(ctx.getUpgradedStat(80,0),80);
assert.equal(ctx.getUpgradedStat(80,1),81);
assert.equal(ctx.getUpgradedStat(80,50),130);
assert.equal(ctx.getUpgradedStat(80,51),131);
assert.equal(ctx.getUpgradedStat(80,100),180);
assert.equal(ctx.getUpgradedStat(80,150),180);

assert(html.includes("addRow('armor', 'Пулестойкость'"));
assert(html.includes("addRow('hitAbsorption', 'Гашение ударов'"));
assert(html.includes("addRow('radiation', getStatLabel('radiation'), 0, true)"));
assert(html.includes("const key = 'anomaly_' + a.name"));
assert(html.includes('const rowUsesTokens = totalUpgrades >= itemByteThreshold;'));
assert(html.includes('getUpgradeCostTokens(totalUpgrades) : getUpgradeCostBytes(totalUpgrades)'));
assert(html.includes('Все 100 очков улучшения распределены'));
assert(html.includes('⬆️ +1 к характеристике'));
assert(html.includes('⬆️ Урон +1'));

assert(patch.includes('const UPGRADE_MAX_LEVEL = 100;'));
assert(patch.includes('const UPGRADE_BYTE_THRESHOLD = 50;'));
assert(patch.includes('UPGRADE_FLAT_100_V1'));
assert(patch.includes('return base + lvl;'));
assert(patch.includes('const usesTokens = totalUpgrades >= UPGRADE_BYTE_THRESHOLD;'));
assert(patch.includes('const newLevel = totalUpgrades + 1;'));
assert(patch.includes('preserve those N points as bullet-resistance points'));
assert(patch.includes('-    if (isSuit && isCoreStat)'));
assert(patch.includes('-    if (!isSuit && !isCoreStat)'));

console.log('PASS: flat +1 upgrade system, 100 total points, 50 bytes + 50 stalkcoins');