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
 {name:'Пистолет 1',starterGear:true,unlockLevel:1},{name:'Пистолет 2',unlockLevel:2},
 {name:'Пистолет 3',unlockLevel:3},{name:'Пистолет 4',unlockLevel:4},{name:'Пистолет 5',unlockLevel:5},
 {name:'Пистолет 6',unlockLevel:6},{name:'Пистолет 7',unlockLevel:7},{name:'Пистолет 8',unlockLevel:8},
 {name:'Пистолет 9',unlockLevel:9},{name:'Пистолет 10',unlockLevel:10},{name:'Пистолет 11',unlockLevel:220},
 {name:'Дробовик test',unlockLevel:500}
];
const SHOP_ARMOR=Array.from({length:12},(_,i)=>({name:'a'+i,unlockLevel:i+1}));
const RAID_ANOMALIES=[{name:'A1',tier:1},{name:'A2',tier:2}];
const PVE_MUTANTS=[{name:'m1',tier:1,hp:200},{name:'m2',tier:3,hp:400}];
const app={post(){},get(){},listen(){}};
const db={},requireAuth=()=>{},rateLimit=()=>()=>{};
function raidSession(){}
function safeParsePlayerData(){}
function pveArtifactTurnEffects(){}
function pveRadiationDamage(){}
function pveApplyDeathNow(){}
function raidState(){}
function raidCreateNpcPayload(){return {name:'npc',tier:1,faction:'x',hp:1,dmg:1};}
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
for marker in (mod.ROUTE_MARK,mod.SHOP_MARK):
    assert marker in patched
assert "app.get('/api/zone-map/:location'" in patched
assert "zone-map1.jpg" in patched and "zone-map2.jpg" in patched
assert "app.post('/api/raid/zone-step'" in patched
assert "const zoneTier=zoneLocation" in patched
assert "ZONE_MAP_NPC_STATS=Object.freeze({1:{hp:240,dmg:28},2:{hp:480,dmg:45}})" in patched
assert "if(zoneLocation===2)npc.faction='Бандиты'" in patched
assert "sourceTier" in patched and "tier:zoneTier" in patched
assert ".filter(a=>Number(a.tier)===zoneTier&&!a.isNamedArtifactAnomaly)" in patched
assert "zoneMapLocationUnlocked" in patched
assert "ZONE_MAP_FIRST_PISTOLS_SERVER" in patched and "ZONE_MAP_FIRST_ARMOR_SERVER" in patched
assert "Этот ствол продаётся на другой локации" in patched
assert "Этот костюм продаётся на другой локации" in patched

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

# The live server currently has V1. The installer must replace that route block with V2.
v1=source.replace(
    "app.listen(3000);",
    mod.SHOP_GUARD + mod.OLD_ROUTE_MARK +
    "\napp.post('/api/raid/zone-step',(req,res)=>{});\napp.listen(3000);"
)
upgraded,changed3=mod.patch(v1)
assert changed3
assert mod.ROUTE_MARK in upgraded
assert mod.OLD_ROUTE_MARK not in upgraded
assert mod.SHOP_MARK in upgraded
assert "app.get('/api/zone-map/:location'" in upgraded

installer=path.read_text(encoding='utf-8')
assert r"raw_asset[:2]!=b'\xff\xd8'" in installer
assert r"raw_asset[:2]!=b'\\xff\\xd8'" not in installer

print('PASS: V2 map installer is idempotent/upgradable; tiers 1/2, map2 Bandits, exact anomaly tiers, image routes and location-one shop limits are present')
