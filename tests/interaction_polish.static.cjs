'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const hubs=fs.readFileSync('ui/trader-hubs.js','utf8');
const trade=fs.readFileSync('ui/trade-menu.js','utf8');
const css=fs.readFileSync('ui/trader-hubs.css','utf8');
const sound=fs.readFileSync('ui/pda-notification.mp3.b64','utf8').trim();

new Function(hubs);
new Function(trade);
assert(Buffer.from(sound,'base64').subarray(0,3).toString()==='ID3','PDA sound must decode as MP3');

assert(hubs.includes("dataset.dieselUpgradeOnly = 'true'"));
assert(hubs.includes('openTechnicianUpgrade'));
assert(css.includes('#technicianScreen[data-diesel-upgrade-only="true"] .zr-hero{display:none!important}'));
assert(css.includes('button[onclick*="openTechnicianTab"]{display:none!important}'));

assert(!trade.includes('data-trade-action="info"'));
assert(trade.includes("queues[source].delete(name)"));
assert(trade.includes("showItemInfoModal(name)"));
assert(trade.includes("openTechnicianUpgrade()"));

assert(css.includes('#gameAlertModal,#gameConfirmModal,#itemInfoModal'));
assert(css.includes('z-index:6500!important'));

for(const kind of ['dm','parcel','system']) assert(hubs.includes("data-pda-indicator=\"'+kind+'\"") || hubs.includes("['"+kind+"'"));
assert(hubs.includes("document.getElementById('bunkerPda')"));
assert(hubs.includes("document.getElementById('kpkChatBtn')"));
assert(hubs.includes("ui/pda-notification.mp3.b64"));
assert(hubs.includes('latestDm > previousState.latestDm'));
assert(hubs.includes('latestParcel > previousState.latestParcel'));
assert(hubs.includes('latestSystem > previousState.latestSystem'));

assert(hubs.includes("row.id='raidUtilityButtons'"));
assert(hubs.includes("telegram.id='raidTelegramBtn'"));
assert(hubs.includes("openBackpackFromRaid()"));
assert(css.includes('#raidUtilityButtons{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));

console.log('interaction polish static checks: OK');
