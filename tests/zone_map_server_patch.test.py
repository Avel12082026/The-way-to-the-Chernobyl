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
const RAID_ANOMALIES=[{name:'A1',tier:1},{name:'A2',tier:2},{name:'A3',tier:3},{name:'A4',tier:4}];
const PVE_MUTANTS=[
 {name:'m1',tier:1,hp:200},{name:'m2',tier:2,hp:300},{name:'m3',tier:3,hp:400},{name:'m4',tier:4,hp:600}
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
assert mod.BARMAN_MARK in patched
assert mod.YANTAR_LEONOV_MARK in patched
assert mod.POSITION_MARK in patched
assert mod.TECHNICIAN_BUY_MARK in patched
assert "sourceVendor==='technician'" in patched
assert "req.body.vendor='leonov'" in patched
assert "app.post('/api/player/position'" in patched
assert "sourceVendor==='barman'||sourceVendor==='leonov-yantar'" in patched
assert "app.get('/api/zone-map/:location'" in patched
assert "app.get('/api/zone-camp/:location'" in patched
assert "1:'zone-map1.png'" in patched
assert "2:'zone-map2.png'" in patched
assert "3:'zone-map3.png'" in patched
assert "4:'zone-map4.png'" in patched
assert "5:'zone-map5.png'" in patched
assert "6:'zone-map6.png'" in patched
assert "4:'rostok-bar.png'" in patched
assert "6:'yantar-bunker.png'" in patched
assert "if(![1,2,3,4,5,6].includes(zoneLocation))" in patched
assert "const zoneTier=zoneLocation" in patched

# Location 3 remains the last-nine-pistol branch.
assert "ZONE_MAP_LAST_NINE_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(-9)" in patched
assert "if(location===3)return zoneMapListUnlocked(data,ZONE_MAP_LAST_NINE_PISTOLS_SERVER,9)" in patched
assert "НИИ Агропром пока закрыт. Должны быть открыты последние 9 пистолетов." in patched

# Rostok is location/tier 4 and unlocks on the second decade of pistols.
assert "ZONE_MAP_SECOND_PISTOLS_SERVER=ZONE_MAP_PISTOLS_SERVER.slice(10,20)" in patched
assert "if(location===4)return zoneMapListUnlocked(data,ZONE_MAP_SECOND_PISTOLS_SERVER,10)" in patched
assert "if(location===5)return zoneMapListUnlocked(data,ZONE_MAP_SECOND_PISTOLS_SERVER,10)" in patched
assert "if(location===6)return zoneMapLocationUnlocked(data,5)" in patched
assert "Росток пока закрыт. Должна быть открыта вторая десятка пистолетов." in patched
assert "Янтарь пока закрыт. Сначала должна быть открыта Темная долина." in patched

# Human factions are location-specific.
assert "if(zoneLocation===2)npc.faction='Бандиты'" in patched
assert "if(zoneLocation===3)npc.faction='Военные'" in patched
assert "if(zoneLocation===4)npc.faction='Наёмники'" in patched
assert "if(zoneLocation===5)npc.faction='Наёмники'" in patched
assert "Темная долина пока закрыта. Сначала должен быть открыт Росток." in patched
assert "else if(zoneTier===5||zoneTier===6)" in patched
assert "pool=list.filter(m=>(Number(m.tier)||0)===zoneTier)" in patched
assert "tierArtifacts=zoneTier===5" in patched
assert "Number(item.tier)===5" in patched
assert "npc.tier=zoneTier" in patched
assert "'yantar-bunker'" in patched
assert "origin==='yantar-bunker'&&zoneMapLocationUnlocked(data,6)" in patched

# Mutants/anomalies are routed by the logical location tier; Rostok therefore yields tier 4.
assert "sourceTier" in patched and "tier:zoneTier" in patched
assert ".filter(a=>Number(a.tier)===zoneTier&&!a.isNamedArtifactAnomaly)" in patched

# Trader stock is split explicitly: Zhuchara gets all 29 pistols + armor 1-29;
# Barman gets all 29 shotguns + armor 30-58; Yantar Leonov gets the
# next 29 automatic weapons and next 29 non-admin/non-premium suits.
assert "ZONE_MAP_FIRST_PISTOLS_SERVER" in patched and "ZONE_MAP_FIRST_ARMOR_SERVER" in patched
assert "ZONE_MAP_LOCATION1_PISTOLS" in patched
assert "zoneMapZhucharaArmorServer" in patched
assert "Number(item.id)>=1&&Number(item.id)<=29" in patched
assert "У Жучары продаются только пистолеты" in patched
assert "ROSTOK_BARMAN_SHOTGUNS_SERVER" in patched
assert "rostokBarmanArmorServer" in patched
assert "Number(item.id)>=30&&Number(item.id)<=58" in patched
assert "У Бармена продаются только дробовики" in patched
assert "У Бармена продаются костюмы с 30-го по 58-й" in patched
assert "YANTAR_LEONOV_WEAPONS_SERVER" in patched
assert "String(item.progressionClass||'')==='automatic'" in patched
assert "return list.length>=29?list.slice(0,29):[]" in patched
assert "YANTAR_LEONOV_ARMOR_SERVER" in patched
assert ".filter(item=>item&&!item.adminOnly&&!item.isPremiumArmor)" in patched
assert "list.slice(58,87)" in patched
assert "sourceVendor!=='leonov-yantar'" in patched
assert "req.body.vendor=armor?.isResearchSuit?'leonov':'zhuchara'" in patched
assert "Beretta 21A Bobcat" in mod.ZONE_ROUTE

again,changed2=mod.patch(patched)
assert not changed2 and again==patched

# An already-installed V4 from before the Barman feature must gain the new guard
# without replacing the V4 route again.
v4_old=patched.replace(mod.BARMAN_GUARD,'').replace(mod.YANTAR_LEONOV_GUARD,'')
v4_old=v4_old.replace(
    "    const sourceVendor=String(req.body?.sourceVendor||req.body?.vendor||'');\n    if(String(req.body?.vendor||'')!=='zhuchara'||sourceVendor==='barman'||sourceVendor==='leonov-yantar')return next();",
    "    if(String(req.body?.vendor||'')!=='zhuchara')return next();"
)
v4_upgraded,v4_changed=mod.patch(v4_old)
assert v4_changed
assert mod.BARMAN_MARK in v4_upgraded
assert mod.YANTAR_LEONOV_MARK in v4_upgraded
assert mod.POSITION_MARK in v4_upgraded
assert "sourceVendor==='barman'||sourceVendor==='leonov-yantar'" in v4_upgraded
assert v4_upgraded.count(mod.ROUTE_MARK)==1
assert "1:'zone-map1.png'" in v4_upgraded
assert "2:'zone-map2.png'" in v4_upgraded
assert "3:'zone-map3.png'" in v4_upgraded

# A live V4 with the first Barman middleware (before consumables were added)
# must be upgraded in place instead of being treated as already current.
legacy_barman=r"""// ROSTOK_BARMAN_SHOP_V1
app.post('/api/shop/buy',(req,res,next)=>{
    const sourceVendor=String(req.body?.sourceVendor||req.body?.vendor||'');
    if(sourceVendor!=='barman')return next();
    const category=String(req.body?.category||''),rawName=String(req.body?.name||'');
    if(!['weapon','armor'].includes(category))
        return res.status(400).json({success:false,error:'Бармен торгует только оружием и бронёй'});
    return next();
});

"""
v4_legacy=patched.replace(mod.BARMAN_GUARD,legacy_barman)
legacy_upgraded,legacy_changed=mod.patch(v4_legacy)
assert legacy_changed
assert legacy_upgraded.count(mod.BARMAN_MARK)==1
assert "ROSTOK_BARMAN_CONSUMABLES_SERVER" in legacy_upgraded
assert "ROSTOK_BARMAN_SHOTGUNS_SERVER" in legacy_upgraded
assert "ROSTOK_BARMAN_ARMOR_SERVER" in legacy_upgraded
assert "'Энергетик'" in legacy_upgraded and "'Аптечка научная'" in legacy_upgraded
assert legacy_barman not in legacy_upgraded

# A live V3 install must upgrade in place to V4.
v3=source.replace(
    "app.listen(3000);",
    mod.SHOP_GUARD +
    "// ZONE_MAP_ROUTING_V3\n"
    "const ZONE_MAP_FILES=Object.freeze({1:'zone-map1.jpg',2:'zone-map2.jpg',3:'zone-map3.jpg'});\n"
    "app.post('/api/raid/zone-step',(req,res)=>{try{}catch(e){console.error('[/api/raid/zone-step]',e);}});\n"
    "const LATER_PATCH_SHOULD_SURVIVE=true;\n"
    "app.listen(3000);"
)
upgraded,changed3=mod.patch(v3)
assert changed3
assert mod.ROUTE_MARK in upgraded
assert "// ZONE_MAP_ROUTING_V3" not in upgraded
assert "1:'zone-map1.png'" in upgraded and "2:'zone-map2.png'" in upgraded and "3:'zone-map3.png'" in upgraded
assert "4:'zone-map4.png'" in upgraded
assert "5:'zone-map5.png'" in upgraded
assert "6:'zone-map6.png'" in upgraded
assert "4:'rostok-bar.png'" in upgraded
assert "6:'yantar-bunker.png'" in upgraded
assert mod.SHOP_MARK in upgraded
assert "const LATER_PATCH_SHOULD_SURVIVE=true;" in upgraded

# Regression for the real live-server tail: nested res.status(...).json({...});
# appears before the route's own closing }); and must not be mistaken for it.
v3_live=source.replace(
    "app.listen(3000);",
    mod.SHOP_GUARD +
    "// ZONE_MAP_ROUTING_V3\n"
    "const ZONE_MAP_FILES=Object.freeze({1:'zone-map1.jpg',2:'zone-map2.jpg',3:'zone-map3.jpg'});\n"
    "app.post('/api/raid/zone-step',requireAuth,(req,res)=>{\n"
    "  try{\n"
    "    if(req.body?.zoneKind==='enemy'){return res.json({success:true,event:{type:'battle'}});}\n"
    "    return res.json({success:true,event:{type:'none'}});\n"
    "  }catch(e){\n"
    "    console.error('[/api/raid/zone-step]',e);\n"
    "    return res.status(500).json({success:false,error:'Ошибка шага рейда по карте'});\n"
    "  }\n"
    "});\n"
    "const PVE_ADAPTIVE_COMBAT_V1=true;\n"
    "app.listen(3000);"
)
upgraded_live,changed_live=mod.patch(v3_live)
assert changed_live
assert mod.ROUTE_MARK in upgraded_live
assert "1:'zone-map1.png'" in upgraded_live and "2:'zone-map2.png'" in upgraded_live and "3:'zone-map3.png'" in upgraded_live
assert "// ZONE_MAP_ROUTING_V3" not in upgraded_live
assert "const PVE_ADAPTIVE_COMBAT_V1=true;" in upgraded_live
assert upgraded_live.count("app.post('/api/raid/zone-step'")==1
assert "Ошибка шага рейда по карте'});\n  }\n});" not in upgraded_live

# The migrated live-like candidate must remain valid JavaScript.
import subprocess,tempfile
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'server.js'
    candidate.write_text(upgraded_live,encoding='utf-8')
    subprocess.run(['node','--check',str(candidate)],check=True,capture_output=True,text=True)

installer=path.read_text(encoding='utf-8')
assert "OLD_ROUTE_MARKS=('// ZONE_MAP_ROUTING_V1','// ZONE_MAP_ROUTING_V2','// ZONE_MAP_ROUTING_V3')" in installer
assert "(root/'ui'/'zone-map4.png',b'\\x89PNG','67aa5efe961a9470c684f2863e17ed76d4bb70773d02b00c33b578ceca0268f3')" in installer
assert "(root/'ui'/'zone-map5.png',b'\\x89PNG','c33cb6e2095b23067f48e494f95405a26145191635ae4d2c0f25a721616229c9')" in installer
assert "(root/'ui'/'zone-map6.png',b'\\x89PNG','20b64cf0096afad57bf3efbef2ac41a572f7879116ba45664b84290d41bb2b9f')" in installer
assert "(root/'ui'/'rostok-bar.png',b'\\x89PNG','bf138d0c05afc2c4d65c504a135d35a1b3af3ecf74ebe8e740d7c3be5b17054c')" in installer
assert "(root/'ui'/'yantar-bunker.png',b'\\x89PNG','25ef6f6783b475f373a737ce0a6c0e13ac5f583908586da41d6dfeb01d802974')" in installer
assert "Файл локации изменён или пережат" in installer
assert "Совместимость шести локаций" in installer

print('PASS: V4 installer adds six locations plus Yantar Leonov 29+29 progression stock')
