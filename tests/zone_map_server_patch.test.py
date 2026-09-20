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
 {name:'w0',starterGear:true,unlockLevel:1},{name:'w1'},{name:'w2'},{name:'w3'},{name:'w4'},
 {name:'w5'},{name:'w6'},{name:'w7'},{name:'w8'},{name:'w9'},{name:'w10'},
 {name:'Дробовик test'}
];
const SHOP_ARMOR=Array.from({length:12},(_,i)=>({name:'a'+i}));
const RAID_ANOMALIES=[];
const app={post(){},listen(){}};
const db={},requireAuth=()=>{},rateLimit=()=>()=>{};
function raidSession(){}
function safeParsePlayerData(){}
function pveArtifactTurnEffects(){}
function pveRadiationDamage(){}
function pveApplyDeathNow(){}
function raidState(){}
function raidCreateNpcPayload(){}
function raidEncounterTier(){}
function raidCreateMutantPayload(){}
app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
assert mod.ROUTE_MARK in patched and mod.SHOP_MARK in patched
assert patched.index(mod.SHOP_MARK)<patched.index("app.post('/api/shop/buy'")
assert patched.index(mod.ROUTE_MARK)<patched.index('app.listen(')
assert "app.post('/api/raid/zone-step'" in patched
assert "['enemy','mutant','anomaly'].includes(zoneKind)" in patched
assert "npc.faction='Бандиты'" in patched
assert "zoneKind==='anomaly'&&roll<0.30" in patched
assert "zoneKind==='mutant'&&roll<0.20" in patched
assert "slice(0,10)" in patched
assert "Этот ствол продаётся на другой локации" in patched
assert "Этот костюм продаётся на другой локации" in patched
again,changed2=mod.patch(patched)
assert not changed2 and again==patched

partial=patched.replace(mod.SHOP_MARK,'// BROKEN_PARTIAL',1)
try:
    mod.patch(partial)
except RuntimeError as e:
    assert 'частичная установка' in str(e)
else:
    raise AssertionError('partial install must fail closed')

print('PASS: server installer adds dedicated enemy/mutant/anomaly route endpoint and first-ten location shop guard')
