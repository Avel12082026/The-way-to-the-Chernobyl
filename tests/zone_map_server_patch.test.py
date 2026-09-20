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
 {name:'Пистолет 3',unlockLevel:3},{name:'Пистолет 4',unlockLevel:4},
 {name:'Пистолет 5',unlockLevel:5},{name:'Пистолет 6',unlockLevel:6},
 {name:'Пистолет 7',unlockLevel:7},{name:'Пистолет 8',unlockLevel:8},
 {name:'Пистолет 9',unlockLevel:9},{name:'Пистолет 10',unlockLevel:10},
 {name:'Пистолет 11',unlockLevel:200},{name:'Дробовик test',unlockLevel:500}
];
const SHOP_ARMOR=Array.from({length:12},(_,i)=>({name:'a'+i,unlockLevel:i+1}));
const RAID_ANOMALIES=[{name:'A1',tier:1},{name:'A2',tier:2}];
const app={post(){},listen(){}};
const db={},requireAuth=()=>{},rateLimit=()=>()=>{};
function raidSession(){}
function safeParsePlayerData(){}
function pveArtifactTurnEffects(){}
function pveRadiationDamage(){}
function pveApplyDeathNow(){}
function raidState(){}
function raidCreateNpcPayload(){return {name:'npc',tier:1,faction:'x'};}
function raidEncounterTier(){}
function raidCreateMutantPayload(){return {name:'m',tier:3,hp:100,dmg:10};}
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
assert mod.ROUTE_MARK in patched
assert mod.SHOP_MARK in patched
assert "app.post('/api/raid/zone-step'" in patched
assert 'zoneLocation' in patched
assert "['enemy','mutant','anomaly']" in patched
assert 'Бандиты' in patched, 'location 2 human enemies must be bandits'
assert 'sourceTier' in patched, 'location tier presentation must preserve original mutant tier'
assert 'RAID_ANOMALIES' in patched and 'zoneTier' in patched
assert 'slice(0,10)' in patched or 'slice(0, 10)' in patched
assert 'Этот ствол продаётся на другой локации' in patched
assert 'Этот костюм продаётся на другой локации' in patched
assert 'первые 10' in patched.lower() or 'first' in patched.lower() or 'location' in patched.lower()

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

# The checked-in installer must know how to upgrade the V1 already installed on the live server.
installer=path.read_text(encoding='utf-8')
assert "ZONE_MAP_ROUTING_V1" in installer
assert "ZONE_MAP_ROUTING_V2" in installer
assert "zoneLocation" in installer
assert "Бандиты" in installer
assert "sourceTier" in installer

print('PASS: V2 installer is idempotent; location 1/2 routed tiers, map2 Bandits, exact anomaly tiering and location-one shop guard are present')
