'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const patch=fs.readFileSync('server_patches/arena_tactical_pvp_20260929.patch','utf8');
const html=fs.readFileSync('index.html','utf8');
const arena=fs.readFileSync('ui/arena-tactical.js','utf8');
const scene=fs.readFileSync('images/combat/side-scene.js','utf8');
assert(patch.includes('ARENA_TACTICAL_PVP_V1'),'tactical arena server block missing');
for(const endpoint of ['/api/arena/battle/status','/api/arena/battle/start','/api/arena/battle/action'])
  assert(patch.includes(endpoint),'arena endpoint missing: '+endpoint);
for(const action of ['attack','aim','defend','reposition','medkit'])
  assert(patch.includes("'"+action+"'"),'arena action missing: '+action);
assert(patch.includes('ARENA_BATTLE_MAX_ROUNDS=12'),'round cap missing');
assert(patch.includes('Math.min(10, Math.floor'),'loner PvP bonus must be capped');
assert(patch.includes("return res.status(410).json"),'legacy instant arena endpoint must be disabled');
assert(html.includes('ui/arena-tactical.js'),'arena client module not loaded');
assert(html.includes("if (window.ArenaTactical) return window.ArenaTactical.render()"),'arena renderer not delegated');
assert(html.includes("if (window.ArenaTactical) return window.ArenaTactical.start(String(targetId))"),'arena attack not delegated');
for(const action of ['attack','aim','defend','reposition','medkit'])
  assert(arena.includes("ArenaTactical.action(\\'"+action+"\\')")||arena.includes("action(\\'"+action+"\\')"),'client action missing: '+action);
assert(arena.includes("Продолжаем незавершённый бой"),'battle resume UI missing');
assert(arena.includes("environmentId:18"),'Rostok arena environment not fixed');
assert(scene.includes('forcedEnvironment'),'combat scene environment override missing');
console.log('PASS: tactical arena UI, persistent rounds, normalized PvP actions and arena scene');
