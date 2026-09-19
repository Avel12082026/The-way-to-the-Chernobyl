#!/usr/bin/env python3
"""Guarded patch of the server supplied by the owner; never executes it or edits DB data."""
from pathlib import Path
import sys
MARK='// RAID_SURVIVAL_20260920_V1'
def once(source,old,new):
    if source.count(old)!=1:
        raise ValueError('Не совпал ожидаемый участок server.js: '+old[:95])
    return source.replace(old,new,1)
def build(source):
    if MARK in source:
        if "RaidSurvival.search(data,a," not in source or 'RaidSurvival.travelCost' not in source:
            raise ValueError('Неполный патч выживания; автоматическая установка остановлена')
        return source
    s=once(source,'function pveArtifactTurnEffects(data) {',
        MARK+"\nconst RaidSurvival=require('./raid-survival.cjs');\n\nfunction pveArtifactTurnEffects(data) {")
    s=once(s,'        data.health=Math.round(Math.max(0,(Number(data.health)||0)-netLeak)*10)/10;\n        if(data.radiation>=100) data.health=0;',
        '        // Leakage adds contamination only; pveRadiationDamage handles the later turn once.')
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
            const hazard=RaidSurvival.search(data,a,{
                researchSuit:!!(armorDef&&armorDef.isResearchSuit),
                adminSuit:!!(armorDef&&armorDef.adminOnly),
                upgrades:(data.armorUpgradeData||{})[getStableArmorKeyServer(armorName)]||{}
            });
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
