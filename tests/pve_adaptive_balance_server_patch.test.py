#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_pve_adaptive_balance.py'
spec=importlib.util.spec_from_file_location('pve_adaptive',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const SHOP_ARTIFACTS=[{name:'Артефакт защиты',stats:{health:50,bulletResist:20,hitAbsorption:10}}];
function serverArtifactDef(name){return SHOP_ARTIFACTS.find(a=>a.name===name)||null;}
function raidCreateNpcPayload(data){return {name:'NPC',tier:14,hp:100,dmg:10};}
function raidCreateMutantPayload(data){return {name:'Химера',tier:25,hp:100,dmg:10};}
const app={post(){},listen(){}};

// Normal raid encounter anchors.
function normalStep(data){
    const npc=raidCreateNpcPayload(data);
    const mutant=raidCreateMutantPayload(data);
    return [npc,mutant];
}

// ZONE_MAP_ROUTING_V3
const ZONE_MAP_NPC_STATS={1:{hp:240,dmg:28},2:{hp:480,dmg:45}};
function zoneMapNpcPayload(data,zoneTier,zoneLocation){
    const forcedLevel=zoneTier<=1?1:1+(zoneTier-1)*40;
    const npc=raidCreateNpcPayload({...data,level:forcedLevel});
    if(!npc)return null;
    const stats=ZONE_MAP_NPC_STATS[zoneTier];
    npc.tier=zoneTier;
    if(stats){
        npc.hp=stats.hp;
        npc.enemyHp=stats.hp;
        npc.maxEnemyHp=stats.hp;
        npc.dmg=stats.dmg;
    }
    return npc;
}
function zoneMapMutantPayload(data,zoneTier){
    const pick={name:'Плоть',tier:3,hp:461,dmg:39};
    const baseHp=Math.max(1,Number(pick.hp)||1);
    const floor=zoneTier<=1?240:zoneTier===2?420:0;
    const hp=Math.max(baseHp,floor);
    return {...pick,sourceTier:Number(pick.tier)||0,tier:zoneTier,kind:'mutant',
        hp,enemyHp:hp,maxEnemyHp:hp,medkitsUsed:0};
}

app.post('/api/raid/step',(req,res)=>{});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
assert mod.MARK in patched
assert 'pveCombatArtifactStatsServer' in patched
assert 'pveAdaptiveNpcPayloadServer(data,raidCreateNpcPayload(data))' in patched
assert 'pveAdaptiveMutantPayloadServer(data,raidCreateMutantPayload(data))' in patched
assert "pveAdaptiveNpcPayloadServer(data,raidCreateNpcPayload({...data,level:forcedLevel}))" in patched
assert 'return pveAdaptiveMutantPayloadServer(data,{...pick' in patched
assert 'const stats=ZONE_MAP_NPC_STATS[zoneTier];\n    npc.tier=zoneTier;\n    if(stats)' not in patched

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

runtime=patched+r"""
const profile={
  weapon:{name:'Тест',dmg:100},
  maxHealth:150,
  armor:{name:'Броня',armor:50,hitAbsorption:40},
  artifactSlots:['Артефакт защиты']
};
const p=pveCombatProfileServer(profile);
if(p.weaponDamage!==100)throw new Error('weapon damage');
if(p.maxHealth!==150)throw new Error('max health');
if(p.bulletResist!==70)throw new Error('bullet defense '+p.bulletResist);
if(p.hitAbsorption!==50)throw new Error('hit defense '+p.hitAbsorption);

const npc=pveAdaptiveNpcPayloadServer(profile,{tier:14,hp:100,dmg:10});
if(npc.hp!==1000)throw new Error('npc hp '+npc.hp);
if(npc.adaptiveBalance.targetShots!==10)throw new Error('npc shots');
if(npc.dmg<=10)throw new Error('npc damage not scaled');

const mutant=pveAdaptiveMutantPayloadServer(profile,{tier:25,hp:100,dmg:10});
if(mutant.hp!==1100)throw new Error('mutant hp '+mutant.hp);
if(mutant.adaptiveBalance.targetShots!==11)throw new Error('mutant shots');
if(mutant.dmg<=10)throw new Error('mutant damage not scaled');

console.log('RUNTIME PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(runtime,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],check=True,capture_output=True,text=True)
    assert 'RUNTIME PASS' in proc.stdout

print('PASS: adaptive PvE scales enemy durability with weapon and incoming damage with armor, health and artifacts')
