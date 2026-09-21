#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_weapon_progression.py'
spec=importlib.util.spec_from_file_location('weapon_progression',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

# Live-like catalogue: server historically has no starterGear on Beretta.
source=r"""
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({id:1000+i,name:'Автомат A'+(i+1),dmg:100+i,unlockLevel:10+i})),
 ...Array.from({length:29},(_,i)=>({id:2000+i,name:'Винтовка R'+(i+1),dmg:200+i,unlockLevel:20+i})),
 ...Array.from({length:29},(_,i)=>({id:i===0?86:3000+i,name:i===0?'Beretta 21A Bobcat':'Пистолет P'+(i+1),dmg:50+i,unlockLevel:30+i})),
 ...Array.from({length:29},(_,i)=>({id:4000+i,name:'Дробовик S'+(i+1),dmg:75+i,unlockLevel:40+i}))
];
let playerData={level:31,weapon:{name:'Пистолет P11'},inventory:{}};
const battleRow={enemy_kind:'npc',payload:JSON.stringify({weaponDrop:'Пистолет P12',weaponName:'Пистолет P12'})};
const PVE_SCHEMA='pve_battles';
const db={prepare(sql){
  if(sql.startsWith('SELECT enemy_kind,payload FROM pve_battles'))return{get(){return battleRow}};
  if(sql.startsWith('SELECT data FROM players'))return{get(){return{data:JSON.stringify(playerData)}}};
  if(sql.startsWith('UPDATE players SET data='))return{run(data){playerData=JSON.parse(data);return{changes:1}}};
  return{get(){return null},run(){return{changes:1}}};
}};
const requireAuth=(_q,_s,n)=>n();
function safeParsePlayerData(x){return JSON.parse(x)}
function parseGearNameServer(name){return {baseName:String(name||'').replace(/\s+\+\d+$/,'')}}
function raidCreateNpcPayload(data){return {name:'npc',tier:1};}
const routes={};
const app={
  post(path,...handlers){(routes[path]||(routes[path]=[])).push(handlers)},
  listen(){}
};

// ZONE_MAP_LOCATION1_SHOP_V1
const ZONE_MAP_LOCATION1_WEAPONS=new Set();
const ZONE_MAP_LOCATION1_ARMOR=new Set();
app.post('/api/shop/buy',(req,res,next)=>{
    if(String(req.body?.vendor||'')!=='zhuchara')return next();
    const category=String(req.body?.category||''),name=String(req.body?.name||'');
    if(category==='weapon'&&!ZONE_MAP_LOCATION1_WEAPONS.has(name))
        return res.status(400).json({success:false,error:'Этот ствол продаётся на другой локации'});
    if(category==='armor'&&!ZONE_MAP_LOCATION1_ARMOR.has(name))
        return res.status(400).json({success:false,error:'Этот костюм продаётся на другой локации'});
    return next();
});

app.post('/api/shop/buy',(req,res)=>{});
app.post('/api/raid/step',(req,res)=>{});
app.post('/api/pve/victory',(req,res)=>{
  // Simulate legacy victory code dropping an unrelated random weapon.
  const wrong=WEAPON_PROGRESSION_SERVER[50].name;
  playerData.inventory[wrong]=(Number(playerData.inventory[wrong])||0)+1;
  return res.json({success:true,state:{inventory:{...playerData.inventory}},rewards:['Старый случайный дроп: '+wrong]});
});
app.listen(3000);
"""

patched,changed=mod.patch(source)
assert changed
assert mod.MARK in patched
assert mod.NPC_MARK in patched
assert mod.VICTORY_MARK in patched

for text in [
    "weapon.unlockLevel=1+index*3",
    "const ordered=[...pistols,...shotguns,...automatics,...rifles]",
    "String(w&&w.name||'')==='Beretta 21A Bobcat'",
    "pistols[0].starterGear=true",
    "weaponProgressionNpcWeaponServer",
    "const shift=Math.floor(Math.random()*3)-1",
    "npc.weaponDrop=weapon.name",
    "npc.weapon={",
    "Оружие с NPC:",
    "Это оружие откроется на ",
]:
    assert text in patched,text

# The old first-location 10-pistol cap must be removed; armor cap remains.
assert "Этот ствол продаётся на другой локации" not in patched
assert "Этот костюм продаётся на другой локации" in patched

# Progression middleware must run before original routes.
assert patched.index(mod.MARK)<patched.index("app.post('/api/shop/buy'",patched.index(mod.MARK)+1)
assert patched.index(mod.NPC_MARK)<patched.index("app.post('/api/raid/step'",patched.index(mod.NPC_MARK)+1)
assert patched.index(mod.VICTORY_MARK)<patched.index("app.post('/api/pve/victory'",patched.index(mod.VICTORY_MARK)+1)

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

# Execute the patched fixture, not only node --check. This catches live startup errors
# and verifies that victory loot replaces the legacy random weapon with the NPC ±1 weapon.
runtime=patched+r"""
if(WEAPON_PROGRESSION_SERVER.length!==116)throw new Error('bad progression length');
if(WEAPON_PROGRESSION_SERVER[0].name!=='Beretta 21A Bobcat')throw new Error('bad first pistol');
if(WEAPON_PROGRESSION_SERVER[0].unlockLevel!==1)throw new Error('bad first unlock');
if(WEAPON_PROGRESSION_SERVER[28].unlockLevel!==85)throw new Error('bad pistol end');
if(WEAPON_PROGRESSION_SERVER[29].unlockLevel!==88)throw new Error('bad shotgun start');
if(WEAPON_PROGRESSION_SERVER[58].unlockLevel!==175)throw new Error('bad automatic start');
if(WEAPON_PROGRESSION_SERVER[87].unlockLevel!==262)throw new Error('bad rifle start');
if(WEAPON_PROGRESSION_SERVER[115].unlockLevel!==346)throw new Error('bad final unlock');
if(!WEAPON_PROGRESSION_SERVER[0].starterGear)throw new Error('starter marker not restored');

const player={level:31,weapon:{name:WEAPON_PROGRESSION_SERVER[10].name}};
const oldRandom=Math.random;
for(const pair of [[0.0,9],[0.5,10],[0.999,11]]){
  Math.random=()=>pair[0];
  const w=weaponProgressionNpcWeaponServer(player);
  if(w.progressionIndex!==pair[1])throw new Error('NPC window broken '+pair);
}
Math.random=oldRandom;

// Run all registered /api/pve/victory middleware/routes in Express order.
const flat=routes['/api/pve/victory'].flat();
const req={telegramUser:{id:'1'},body:{battleToken:'battle-1'}};
let responseBody=null;
const res={
  json(body){responseBody=body;return body},
  status(){return this}
};
let cursor=0;
function next(){const fn=flat[cursor++];if(fn)return fn(req,res,next)}
next();

const expected=WEAPON_PROGRESSION_SERVER[11].name;
const wrong=WEAPON_PROGRESSION_SERVER[50].name;
if((Number(playerData.inventory[expected])||0)!==1)throw new Error('expected NPC weapon not awarded');
if(Number(playerData.inventory[wrong])||0)throw new Error('legacy random weapon not removed');
if(!responseBody||responseBody.success!==true)throw new Error('victory response lost');
if(!responseBody.npcWeaponDrop||responseBody.npcWeaponDrop.name!==expected)throw new Error('NPC drop metadata wrong');
if(!responseBody.rewards.some(x=>String(x).includes('Оружие с NPC: '+expected)))throw new Error('reward line missing');
if(responseBody.rewards.some(x=>String(x).includes(wrong)))throw new Error('old random reward line survived');

console.log('RUNTIME PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(runtime,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],check=True,capture_output=True,text=True)
    assert 'RUNTIME PASS' in proc.stdout

print('PASS: live-like 3-level progression, global trader stock and NPC ±1 victory loot are executed end-to-end')
