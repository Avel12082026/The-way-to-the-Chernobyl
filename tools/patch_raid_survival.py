#!/usr/bin/env python3
"""Guarded patch of the server supplied by the owner; never executes it or edits DB data."""
from pathlib import Path
import sys

OLD_MARK_V1='// RAID_SURVIVAL_20260920_V1'
OLD_MARK_V2='// RAID_SURVIVAL_20260920_V2'
MARK='// RAID_SURVIVAL_20260920_V3'

BELT_HELPER_V2=r"""function pveBeltHazardProtection(data) {
    const anomaly={};
    let radiation=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name) continue;
        const def=typeof serverArtifactDef==='function'?serverArtifactDef(name):null;
        const stats=def&&def.stats&&typeof def.stats==='object'?def.stats:pveArtifactStatsForName(name);
        if(!stats||typeof stats!=='object') continue;
        for(const [key,raw] of Object.entries(stats)){
            const value=Number(raw)||0;
            if(key==='radiation') radiation+=value;
            else if(key.startsWith('anomaly_')){
                const anomalyName=key.slice('anomaly_'.length);
                anomaly[anomalyName]=(Number(anomaly[anomalyName])||0)+value;
            }
        }
    }
    return {radiation,anomaly};
}

"""

BELT_HELPER=r"""function pveBeltHazardProtection(data) {
    const anomaly={};
    let radiationProtection=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name) continue;
        const def=typeof serverArtifactDef==='function'?serverArtifactDef(name):null;
        const stats=def&&def.stats&&typeof def.stats==='object'?def.stats:pveArtifactStatsForName(name);
        if(!stats||typeof stats!=='object') continue;
        for(const [key,raw] of Object.entries(stats)){
            const value=Number(raw)||0;
            // Internal "radiation" is the protective stat shown to players as "Радиозащита".
            if(key==='radiation') radiationProtection+=value;
            else if(key.startsWith('anomaly_')){
                const anomalyName=key.slice('anomaly_'.length);
                anomaly[anomalyName]=(Number(anomaly[anomalyName])||0)+value;
            }
        }
    }
    return {radiationProtection,anomaly};
}

"""

TURN_EFFECTS_PRISTINE=r"""function pveArtifactTurnEffects(data) {
    let extraHunger=0, extraThirst=0, leak=0, radiationResist=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name) continue;
        const st=pveArtifactStatsForName(name);
        if(Number(st.hunger)<0) extraHunger+=-Number(st.hunger);
        if(Number(st.thirst)<0) extraThirst+=-Number(st.thirst);
        if(Number(st.radiationLeak)<0) leak+=-Number(st.radiationLeak);
        if(Number(st.radiation)>0) radiationResist+=Number(st.radiation);
    }
    data.hunger=Math.max(0,(Number(data.hunger)||0)-extraHunger);
    data.thirst=Math.max(0,(Number(data.thirst)||0)-extraThirst);
    const netLeak=Math.max(0,leak-radiationResist);
    if(netLeak>0){
        data.radiation=Math.min(100,(Number(data.radiation)||0)+netLeak);
        data.health=Math.round(Math.max(0,(Number(data.health)||0)-netLeak)*10)/10;
        if(data.radiation>=100) data.health=0;
    }
    return {extraHunger,extraThirst,netLeak};
}"""

TURN_EFFECTS_V2=r"""function pveArtifactTurnEffects(data) {
    let extraHunger=0, extraThirst=0, leak=0, radiationResist=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name) continue;
        const st=pveArtifactStatsForName(name);
        if(Number(st.hunger)<0) extraHunger+=-Number(st.hunger);
        if(Number(st.thirst)<0) extraThirst+=-Number(st.thirst);
        if(Number(st.radiationLeak)<0) leak+=-Number(st.radiationLeak);
        if(Number(st.radiation)>0) radiationResist+=Number(st.radiation);
    }
    data.hunger=Math.max(0,(Number(data.hunger)||0)-extraHunger);
    data.thirst=Math.max(0,(Number(data.thirst)||0)-extraThirst);
    const netLeak=Math.max(0,leak-radiationResist);
    if(netLeak>0){
        data.radiation=Math.min(100,(Number(data.radiation)||0)+netLeak);
        // Leakage adds contamination only; pveRadiationDamage handles the later turn once.
    }
    return {extraHunger,extraThirst,netLeak};
}"""

TURN_EFFECTS_V3=r"""function pveArtifactTurnEffects(data) {
    let extraHunger=0, extraThirst=0, radiationRaw=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name) continue;
        const def=typeof serverArtifactDef==='function'?serverArtifactDef(name):null;
        const st=def&&def.stats&&typeof def.stats==='object'?def.stats:pveArtifactStatsForName(name);
        if(Number(st.hunger)<0) extraHunger+=-Number(st.hunger);
        if(Number(st.thirst)<0) extraThirst+=-Number(st.thirst);
        // radiationLeak is the legacy storage key for the visible harmful effect
        // "Радиация +N". Its sign must never turn it into protection.
        radiationRaw+=Math.abs(Number(st.radiationLeak)||0);
    }
    data.hunger=Math.max(0,(Number(data.hunger)||0)-extraHunger);
    data.thirst=Math.max(0,(Number(data.thirst)||0)-extraThirst);
    // radiationResist is the combined "Радиозащита" from belt artifacts, armour
    // and faction bonuses, recomputed by the server before each raid turn/search.
    const radiationProtection=Number(data.radiationResist)||0;
    const netLeak=Math.max(0,radiationRaw-radiationProtection);
    if(netLeak>0){
        data.radiation=Math.min(100,(Number(data.radiation)||0)+netLeak);
    }
    return {extraHunger,extraThirst,radiationRaw,radiationProtection,netLeak};
}"""

OLD_HAZARD_CALL="""            const hazard=RaidSurvival.search(data,a,{
                researchSuit:!!(armorDef&&armorDef.isResearchSuit),
                adminSuit:!!(armorDef&&armorDef.adminOnly),
                upgrades:(data.armorUpgradeData||{})[getStableArmorKeyServer(armorName)]||{}
            });"""

V2_HAZARD_CALL="""            const beltHazard=pveBeltHazardProtection(data);
            const factionHazardPct=typeof pveFactionBonuses==='function'
                ? (Number(pveFactionBonuses(playerId,data,null).anomalyRadResistPct)||0) : 0;
            const factionHazardScale=Math.max(0,1+factionHazardPct/100);
            let armorHazard=null;
            if(armorName&&typeof getArmorEffectiveStatsServer==='function'){
                const effective=getArmorEffectiveStatsServer(armorName,data);
                if(effective&&effective.stats&&typeof effective.stats==='object'){
                    armorHazard={radiation:0,anomaly:{}};
                    for(const [key,raw] of Object.entries(effective.stats)){
                        const value=(Number(raw)||0)*factionHazardScale;
                        if(key==='radiation')armorHazard.radiation+=value;
                        else if(key.startsWith('anomaly_')){
                            const anomalyName=key.slice('anomaly_'.length);
                            armorHazard.anomaly[anomalyName]=(Number(armorHazard.anomaly[anomalyName])||0)+value;
                        }
                    }
                }
            }
            const hazard=RaidSurvival.search(data,a,{
                researchSuit:!!(armorDef&&armorDef.isResearchSuit),
                adminSuit:!!(armorDef&&armorDef.adminOnly),
                upgrades:(data.armorUpgradeData||{})[getStableArmorKeyServer(armorName)]||{},
                artifactAnomaly:beltHazard.anomaly,
                artifactRadiation:beltHazard.radiation,
                artifactDerivedScale:factionHazardScale,
                ...(armorHazard?{armourAnomaly:armorHazard.anomaly,armourRadiation:armorHazard.radiation}:{})
            },Math.random);"""

NEW_HAZARD_CALL="""            const beltHazard=pveBeltHazardProtection(data);
            const factionHazardPct=typeof pveFactionBonuses==='function'
                ? (Number(pveFactionBonuses(playerId,data,null).anomalyRadResistPct)||0) : 0;
            const factionHazardScale=Math.max(0,1+factionHazardPct/100);
            let armorHazard=null;
            if(armorName&&typeof getArmorEffectiveStatsServer==='function'){
                const effective=getArmorEffectiveStatsServer(armorName,data);
                if(effective&&effective.stats&&typeof effective.stats==='object'){
                    armorHazard={radiation:0,anomaly:{}};
                    for(const [key,raw] of Object.entries(effective.stats)){
                        const value=(Number(raw)||0)*factionHazardScale;
                        if(key==='radiation')armorHazard.radiation+=value;
                        else if(key.startsWith('anomaly_')){
                            const anomalyName=key.slice('anomaly_'.length);
                            armorHazard.anomaly[anomalyName]=(Number(armorHazard.anomaly[anomalyName])||0)+value;
                        }
                    }
                }
            }
            const hazard=RaidSurvival.search(data,a,{
                researchSuit:!!(armorDef&&armorDef.isResearchSuit),
                adminSuit:!!(armorDef&&armorDef.adminOnly),
                upgrades:(data.armorUpgradeData||{})[getStableArmorKeyServer(armorName)]||{},
                artifactAnomaly:beltHazard.anomaly,
                artifactRadiation:beltHazard.radiationProtection,
                artifactDerivedScale:factionHazardScale,
                ...(armorHazard?{armourAnomaly:armorHazard.anomaly,armourRadiation:armorHazard.radiation}:{})
            },Math.random);"""

STEP_TURN_OLD="""            const turnEffects=pveArtifactTurnEffects(data);
            const radiationDamage=pveRadiationDamage(data);"""
STEP_TURN_NEW="""            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);
            const turnEffects=pveArtifactTurnEffects(data);
            const radiationDamage=pveRadiationDamage(data);"""

def once(source,old,new):
    if source.count(old)!=1:
        raise ValueError('Не совпал ожидаемый участок server.js: '+old[:95])
    return source.replace(old,new,1)

def turn_effects_v3(source):
    if TURN_EFFECTS_V3 in source:
        return source
    if TURN_EFFECTS_V2 in source:
        return once(source,TURN_EFFECTS_V2,TURN_EFFECTS_V3)
    if TURN_EFFECTS_PRISTINE in source:
        return once(source,TURN_EFFECTS_PRISTINE,TURN_EFFECTS_V3)
    raise ValueError('Не найден проверенный блок эффектов артефактов за ход')

def add_step_recompute(source):
    if STEP_TURN_NEW in source:
        return source
    return once(source,STEP_TURN_OLD,STEP_TURN_NEW)

def normalize_saved_radiation_leak(source):
    # Full production server.js keeps a derived field for client state. The isolated
    # route fixture does not contain this helper, so normalize it when present.
    old="else if(stat==='radiationLeak') data.radiationLeakTotal+=-v;"
    new="else if(stat==='radiationLeak') data.radiationLeakTotal+=Math.abs(v);"
    if old in source:
        if source.count(old)!=1:
            raise ValueError('Неоднозначный пересчёт radiationLeakTotal')
        return source.replace(old,new,1)
    return source

def upgrade_v2(source):
    s=once(source,OLD_MARK_V2,MARK)
    s=once(s,BELT_HELPER_V2,BELT_HELPER)
    s=once(s,V2_HAZARD_CALL,NEW_HAZARD_CALL)
    s=turn_effects_v3(s)
    return normalize_saved_radiation_leak(add_step_recompute(s))

def upgrade_v1(source):
    anchor=OLD_MARK_V1+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\nfunction pveArtifactTurnEffects(data) {"
    replacement=MARK+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\n"+BELT_HELPER+"function pveArtifactTurnEffects(data) {"
    s=once(source,anchor,replacement)
    s=once(s,OLD_HAZARD_CALL,NEW_HAZARD_CALL)
    s=turn_effects_v3(s)
    return normalize_saved_radiation_leak(add_step_recompute(s))

def build(source):
    if MARK in source:
        required=(
            "artifactRadiation:beltHazard.radiationProtection",
            "Math.abs(Number(st.radiationLeak)||0)",
            "serverRecomputeArtifactDerived(playerId,data);\n            const turnEffects=pveArtifactTurnEffects(data);",
            'RaidSurvival.travelCost',
        )
        if any(x not in source for x in required):
            raise ValueError('Неполный патч выживания V3; автоматическая установка остановлена')
        return source
    if OLD_MARK_V2 in source:
        return upgrade_v2(source)
    if OLD_MARK_V1 in source:
        return upgrade_v1(source)

    s=once(source,'function pveArtifactTurnEffects(data) {',
        MARK+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\n"+BELT_HELPER+"function pveArtifactTurnEffects(data) {")
    s=turn_effects_v3(s)
    old_radiation="""function pveRadiationDamage(data) {
    const rad=Math.max(0,Number(data.radiation)||0);
    if(rad<=0) return 0;
    data.health=Math.round(Math.max(0,(Number(data.health)||0)-rad)*10)/10;
    return rad;
}"""
    s=once(s,old_radiation,"function pveRadiationDamage(data) {\n    return RaidSurvival.radiationDamage(data);\n}")
    for key in ('hunger','thirst'):
        maxkey='max'+key.title()
        old=f'data.{key}=Math.max(0,Math.min(Number(data.{maxkey})||100,(Number(data.{key})||0)-5));'
        s=once(s,old,old.replace('-5)', '-RaidSurvival.travelCost)'))
    start=s.index('            const rawRad=86+Math.floor(Math.random()*8),radRes=')
    end=s.index('            let found=[],success=Math.random()*100<chance;',start)
    old=s[start:end]
    if 'const anomalyDmg=' not in old or old.count('if(data.radiation>=100)data.health=0;')!=2:
        raise ValueError('Не совпал блок последствий поиска аномалии')
    new="""            serverRecomputeArtifactDerived(playerId,data);
            const armorName=data.armor&&data.armor.name||'';
            const armorDef=SHOP_ARMOR.find(x=>x.name===parseGearNameServer(armorName).baseName);
"""+NEW_HAZARD_CALL+"""
            const {radiationAdded,searchDmg,anomalyDmg}=hazard;
            const turnEffects=pveArtifactTurnEffects(data);
"""
    s=s[:start]+new+s[end:]
    s=once(s,'            let found=[],success=Math.random()*100<chance;',
        '            let found=[],success=data.health>0&&Math.random()*100<chance;')
    s=add_step_recompute(s)
    # Read-only capability used by the updater to wait for this exact process/version.
    s=once(s,"app.listen(PORT, () => {", "app.get('/api/raid/survival-version',(_req,res)=>res.json({success:true,version:RaidSurvival.version,travelCost:RaidSurvival.travelCost}));\n\napp.listen(PORT, () => {")
    return normalize_saved_radiation_leak(s)

if __name__=='__main__':
    p=Path(sys.argv[1]);out=Path(sys.argv[2]);out.write_text(build(p.read_text(encoding='utf-8')),encoding='utf-8')
