#!/usr/bin/env python3
"""Guarded patch of the server supplied by the owner; never executes it or edits DB data."""
from pathlib import Path
import sys

OLD_MARK='// RAID_SURVIVAL_20260920_V1'
MARK='// RAID_SURVIVAL_20260920_V2'

BELT_HELPER=r"""function pveBeltHazardProtection(data) {
    const anomaly={};
    let radiation=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name) continue;
        const stats=pveArtifactStatsForName(name);
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

OLD_HAZARD_CALL="""            const hazard=RaidSurvival.search(data,a,{
                researchSuit:!!(armorDef&&armorDef.isResearchSuit),
                adminSuit:!!(armorDef&&armorDef.adminOnly),
                upgrades:(data.armorUpgradeData||{})[getStableArmorKeyServer(armorName)]||{}
            });"""

NEW_HAZARD_CALL="""            const beltHazard=pveBeltHazardProtection(data);
            const factionHazardPct=typeof pveFactionBonuses==='function'
                ? (Number(pveFactionBonuses(playerId,data,null).anomalyRadResistPct)||0) : 0;
            const hazard=RaidSurvival.search(data,a,{
                researchSuit:!!(armorDef&&armorDef.isResearchSuit),
                adminSuit:!!(armorDef&&armorDef.adminOnly),
                upgrades:(data.armorUpgradeData||{})[getStableArmorKeyServer(armorName)]||{},
                artifactAnomaly:beltHazard.anomaly,
                artifactRadiation:beltHazard.radiation,
                artifactDerivedScale:1+factionHazardPct/100
            },Math.random);"""

def once(source,old,new):
    if source.count(old)!=1:
        raise ValueError('Не совпал ожидаемый участок server.js: '+old[:95])
    return source.replace(old,new,1)

def upgrade_v1(source):
    anchor=OLD_MARK+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\nfunction pveArtifactTurnEffects(data) {"
    replacement=MARK+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\n"+BELT_HELPER+"function pveArtifactTurnEffects(data) {"
    s=once(source,anchor,replacement)
    s=once(s,OLD_HAZARD_CALL,NEW_HAZARD_CALL)
    return s

def build(source):
    if MARK in source:
        if "artifactAnomaly:beltHazard.anomaly" not in source or 'RaidSurvival.travelCost' not in source:
            raise ValueError('Неполный патч выживания V2; автоматическая установка остановлена')
        return source
    if OLD_MARK in source:
        return upgrade_v1(source)

    s=once(source,'function pveArtifactTurnEffects(data) {',
        MARK+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\n"+BELT_HELPER+"function pveArtifactTurnEffects(data) {")
    s=once(s,'        data.health=Math.round(Math.max(0,(Number(data.health)||0)-netLeak)*10)/10;\n        if(data.radiation>=100) data.health=0;',
        '        // Leakage adds contamination only; pveRadiationDamage handles the later turn once.')
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
    # Read-only capability used by the updater to wait for this exact process/version.
    s=once(s,"app.listen(PORT, () => {", "app.get('/api/raid/survival-version',(_req,res)=>res.json({success:true,version:RaidSurvival.version,travelCost:RaidSurvival.travelCost}));\n\napp.listen(PORT, () => {")
    return s

if __name__=='__main__':
    p=Path(sys.argv[1]);out=Path(sys.argv[2]);out.write_text(build(p.read_text(encoding='utf-8')),encoding='utf-8')
