#!/usr/bin/env python3
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_zone_map_routing_server.py'
spec=importlib.util.spec_from_file_location('zone_map_installer',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const crypto=require('crypto');
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({
   name:'Пистолет '+(i+1),starterGear:i===0,
   unlockLevel:i<10?i+1:(i<20?210+(i-10)*10:700+(i-20)*10)
 })),
 {name:'Дробовик test',unlockLevel:900}
];
const SHOP_ARMOR=Array.from({length:12},(_,i)=>({name:'a'+i,unlockLevel:i+1}));
const RAID_ANOMALIES=[{name:'A1',tier:1},{name:'A2',tier:2},{name:'A3',tier:3}];
const PVE_MUTANTS=[
 {name:'m1',tier:1,hp:200},{name:'m2',tier:3,hp:400},{name:'m3',tier:5,hp:600}
];
const app={post(){},get(){},listen(){}};
const db={},requireAuth=()=>{},rateLimit=()=>()=>{};
function raidSession(){}
function safeParsePlayerData(){}
function pveArtifactTurnEffects(){}
function pveRadiationDamage(){}
function pveApplyDeathNow(){}
function raidState(){}
function raidCreateNpcPayload(){return {name:'npc',tier:1,faction:'x',hp:650,dmg:55};}
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
assert mod.ROUTE_MARK in patched
assert mod.SHOP_MARK in patched
assert "app.get('/api/zone-map/:location'" in patched
assert "3:'zone-map3.png'" in patched
assert "if(![1,2,3].includes(zoneLocation))" in patched
assert "const zoneTier=zoneLocation" in patched

# Location 3 unlock is exactly the last nine pistols.
assert "ZONE_MAP_LAST_NINE_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(-9)" in patched
assert "if(location===3)return zoneMapListUnlocked(data,ZONE_MAP_LAST_NINE_PISTOLS_SERVER,9)" in patched
assert "НИИ Агропром пока закрыт. Должны быть открыты последние 9 пистолетов." in patched

# Human enemies on location 3 are Military, while Svalka remains Bandits.
assert "if(zoneLocation===2)npc.faction='Бандиты'" in patched
assert "if(zoneLocation===3)npc.faction='Военные'" in patched
assert "npc.tier=zoneTier" in patched

# Mutants/anomalies are routed by the logical location tier; map 3 therefore yields tier 3.
assert "sourceTier" in patched and "tier:zoneTier" in patched
assert ".filter(a=>Number(a.tier)===zoneTier&&!a.isNamedArtifactAnomaly)" in patched

# Location-one trader restriction remains intact.
assert "ZONE_MAP_FIRST_PISTOLS_SERVER" in patched and "ZONE_MAP_FIRST_ARMOR_SERVER" in patched
assert "Этот ствол продаётся на другой локации" in patched
assert "Этот костюм продаётся на другой локации" in patched

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

# Live server is V2: V3 installer must replace that block in place.
v2=source.replace(
    "app.listen(3000);",
    mod.SHOP_GUARD +
    "// ZONE_MAP_ROUTING_V2\n"
    "const ZONE_MAP_FILES=Object.freeze({1:'zone-map1.jpg',2:'zone-map2.jpg'});\n"
    "app.post('/api/raid/zone-step',(req,res)=>{});\n"
    "app.listen(3000);"
)
upgraded,changed3=mod.patch(v2)
assert changed3
assert mod.ROUTE_MARK in upgraded
assert "// ZONE_MAP_ROUTING_V2" not in upgraded
assert "3:'zone-map3.png'" in upgraded
assert mod.SHOP_MARK in upgraded

installer=path.read_text(encoding='utf-8')
assert "OLD_ROUTE_MARKS=('// ZONE_MAP_ROUTING_V1','// ZONE_MAP_ROUTING_V2')" in installer
assert "b'\\x89PNG\\r\\n\\x1a\\n'" in installer
assert "Совместимость трёх локаций" in installer

print('PASS: V3 installer upgrades live V2 and adds NII Agroprom, last-nine-pistol gate, Military-only NPCs and tier-3 routing')
