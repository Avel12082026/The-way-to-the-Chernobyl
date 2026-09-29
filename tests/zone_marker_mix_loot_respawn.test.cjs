const assert=require('assert');
const fs=require('fs');

const mix=fs.readFileSync('server_patches/zone_marker_event_mix_20260929.patch','utf8');
const loot=fs.readFileSync('server_patches/zone_lucky_common_supplies_20260929.patch','utf8');
const respawn=fs.readFileSync('server_patches/safe_camp_respawn_20260929.patch','utf8');
const html=fs.readFileSync('index.html','utf8');

const added=s=>s.split('\n').filter(line=>line.startsWith('+')&&!line.startsWith('+++')).join('\n');

const mixAdded=added(mix);
const lootAdded=added(loot);
const respawnAdded=added(respawn);

assert(mixAdded.includes("const ZONE_MAP_LUCKY_CHANCE=Object.freeze({1:0.10,2:0.08,3:0.065,4:0.05,5:0.035,6:0.025})"),
  'location-depth lucky-find chance missing');
assert(mixAdded.includes("[['anomaly',0.62],['mutant',0.12],['npc',0.10],['lucky',lucky]]"),
  'anomaly marker priority missing');
assert(mixAdded.includes("[['mutant',0.58],['npc',0.13],['anomaly',0.10],['lucky',lucky]]"),
  'mutant marker priority missing');
assert(mixAdded.includes("[['npc',0.56],['mutant',0.14],['anomaly',0.10],['lucky',lucky]]"),
  'NPC marker priority missing');
assert(mixAdded.includes("Number(m.tier)===tier"),'mutants are not tied to location tier');
assert(!mixAdded.includes("я нашёл часть тела мутанта"),'body parts must not be random lucky loot');

for(const item of ['Хлеб','Вода','Тушенка','Энергетик','Аптечка гражданская','Аптечка армейская','Аптечка научная','Антирад'])
  assert(lootAdded.includes(item),`common supply missing: ${item}`);
assert(lootAdded.includes("gearChance=0.03+(locationTier-1)*0.01"),'gear chance must rise with Zone depth');
assert(lootAdded.includes("Math.random()<0.10?1:0"),'rare +1 tier loot chance missing');
assert(lootAdded.includes("Number(x.tier)===lootTier"),'rare equipment is not tier-filtered');

assert(respawnAdded.includes("'cordon-camp'"),'Cordon safe camp missing');
assert(respawnAdded.includes("'rostok-bar'"),'Rostok safe camp missing');
assert(respawnAdded.includes("'yantar-bunker'"),'Yantar safe camp missing');
assert(respawnAdded.includes('pveResolveDeathSafeCamp'),'death safe-camp resolver missing');
assert(respawnAdded.includes("data.worldPosition={...respawn,updatedAt:Date.now()}"),'death does not move player to safe camp');
assert(html.includes('function returnToDeathSafeCamp()'),'client safe-camp return missing');
assert((html.match(/returnToDeathSafeCamp\(\)/g)||[]).length>=8,'not all client death paths return to safe camp');

console.log('PASS: mixed marker encounters, deep-Zone loot, no random mutant body parts, safe-camp respawn');
