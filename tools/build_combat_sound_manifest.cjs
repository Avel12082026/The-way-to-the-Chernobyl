#!/usr/bin/env node
'use strict';
// Explicit mappings cover the gameplay catalog, including guns without side-view art.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalog = vm.runInNewContext(html.match(/const weapons = (\[[\s\S]*?\n    \]);/)[1]);
const groups = {
  pistol380: [[86,1.12],[2,1.09],[87,1],[1,.98],[3,1.02],[88,1.04]],
  pistol9: [[5,.98],[89,1],[90,.99],[91,1.02],[92,.98],[93,.97],[94,.95],[95,.93],[96,.95]],
  pistol45: [[97,.94],[98,1],[99,.98],[100,.97],[101,.96],[105,.84]],
  revolver38: [[6,1.05],[102,.95],[103,.91],[104,.86]],
  ppsh: [[7,1.02]],
  smg9: [[8,1.08],[9,1.03]],
  ar556: [[11,1.08],[12,1.04],[37,1.01],[21,1.03],[26,1.05],[17,.97],[38,1.02],[45,1.01],[57,1],[69,1.03],[67,.96]],
  ak762: [[43,1],[16,.96],[15,1],[25,.96],[63,.93],[51,.94],[75,.95]],
  mosin: [[13,1.02],[24,1.04],[28,1],[36,.98],[22,.95],[29,.94],[53,.93]],
  sks: [[14,1]],
  rifle300: [[46,1.04],[42,1.02],[23,1],[76,.99],[61,.95],[59,.96],[71,.95],[77,.93]],
  rifle3006: [[31,.97],[27,1],[70,.98],[39,.96],[60,.94],[48,.93],[64,.95],[35,.86],[66,.86],[52,.82],[58,.83],[49,.84],[54,.82],[72,.81],[78,.87],[73,.88],[65,.80]],
  suppressed: [[18,1],[30,.95],[40,1.03],[33,.77],[47,.92]],
  shotgun_cd: [[4,1.10],[20,1.08],[107,1.02],[116,1],[19,1.01],[10,.96],[32,.98],[44,.94],[56,.92],[68,.97],[74,.91]],
  shotgun_mossberg: [[106,1],[113,.97],[62,1.04],[119,.98]],
  shotgun_winchester: [[108,1],[109,1.01],[110,1.03],[111,.99],[112,1.02],[114,.98],[117,.97],[120,.98],[121,.96],[122,.91],[124,.87],[125,.86]],
  shotgun_benelli: [[115,1],[118,1.02],[50,.98],[123,1.01]],
  gauss: [[55,1]]
};
const assignments = {};
for (const [profile, entries] of Object.entries(groups)) for (const [id, rate] of entries) {
  if (assignments[id]) throw Error('Duplicate weapon '+id);
  assignments[id] = {profile, rate, gain:1};
}
// These are presentation bursts for one gameplay attack, not magazine capacities.
// Classify by the game's weapon class: a recorded sound family can contain both
// rifles and machine guns, and the TT happens to use the PPSh recording.
const burstTypes = {
  pistol:{shots:3,intervalMs:180},
  automatic:{shots:3,intervalMs:100},
  machineGun:{shots:6,intervalMs:100},
  doubleBarrel:{shots:2,intervalMs:260},
  shotgun:{shots:3,intervalMs:260},
  rifle:{shots:2,intervalMs:350}
};
function burstType(weapon, profile) {
  if (weapon.name.startsWith('Пулемёт ')) return 'machineGun';
  if (weapon.id === 4) return 'doubleBarrel'; // The catalog's hunting sawed-off.
  if (weapon.name.startsWith('Дробовик ') || weapon.id === 10) return 'shotgun'; // Saiga-12 is named a carbine.
  if (weapon.name.startsWith('Винтовка ') || [55,73].includes(weapon.id)) return 'rifle'; // Gauss/X-17 rifle progression.
  if (weapon.name.startsWith('Автомат ') || weapon.name.startsWith('ПП') || weapon.id === 16) return 'automatic'; // Vepr carbine.
  if (['pistol380','pistol9','pistol45','revolver38'].includes(profile) || weapon.id === 7) return 'pistol';
  throw Error('Missing presentation burst for '+weapon.id+' '+weapon.name);
}
const weapons = {};
const burstCounts = {};
for (const weapon of catalog) {
  if (weapon.adminOnly) continue; // "Убиваю взглядом" is not a firearm.
  if (!assignments[weapon.id]) throw Error('Missing weapon '+weapon.id+' '+weapon.name);
  const type = burstType(weapon, assignments[weapon.id].profile);
  weapons[weapon.id] = {name:weapon.name,...assignments[weapon.id],burst:{...burstTypes[type]}};
  burstCounts[type] = (burstCounts[type] || 0) + 1;
}
if (Object.keys(weapons).length !== 116 || Object.keys(assignments).length !== 116) throw Error('Catalog coverage changed');
const profiles = {};
const folder = path.join(root, 'audio/gunshots');
for (const key of Object.keys(groups)) {
  const files = fs.readdirSync(folder).filter(name=>name.startsWith(key+'-')&&name.endsWith('.mp3')).sort();
  if (!files.length) throw Error('Missing recorded sound family '+key);
  profiles[key] = {files, gain:key==='suppressed'?.48:key==='smg9'?.88:1};
}
const manifest = {version:'gunshots-20260929-v1',base:'audio/gunshots/',profiles,weapons};
fs.writeFileSync(path.join(root,'audio/combat-sounds.js'), '(function(root){\n\'use strict\';\nconst bank='+JSON.stringify(manifest,null,2)+';\nroot.COMBAT_SOUND_BANK=bank;\nif(typeof module!==\'undefined\')module.exports=bank;\n})(typeof window!==\'undefined\'?window:globalThis);\n');
console.log('Mapped '+Object.keys(weapons).length+' firearms to '+Object.keys(profiles).length+' licensed sound families.');
console.log('Presentation bursts: '+JSON.stringify(burstCounts));
