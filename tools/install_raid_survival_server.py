#!/usr/bin/env python3
"""Install/upgrade raid survival: stronger tier damage, exact signed belt protection, delayed radiation."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
OLD_MARK='// RAID_SURVIVAL_V2'
MARK='// RAID_SURVIVAL_V3'

OLD_TURN_EFFECTS="""    const netLeak=Math.max(0,leak-radiationResist);
    if(netLeak>0){
        data.radiation=Math.min(100,(Number(data.radiation)||0)+netLeak);
        data.health=Math.round(Math.max(0,(Number(data.health)||0)-netLeak)*10)/10;
        if(data.radiation>=100) data.health=0;
    }
    return {extraHunger,extraThirst,netLeak};"""
NEW_TURN_EFFECTS="""    const netLeak=Math.max(0,leak-radiationResist);
    if(netLeak>0){
        // Radiation sources only fill the meter. HP damage is applied on later player turns.
        data.radiation=Math.min(100,(Number(data.radiation)||0)+netLeak);
    }
    return {extraHunger,extraThirst,netLeak};"""

OLD_RADIATION="""function pveRadiationDamage(data) {
    const rad=Math.max(0,Number(data.radiation)||0);
    if(rad<=0) return 0;
    data.health=Math.round(Math.max(0,(Number(data.health)||0)-rad)*10)/10;
    return rad;
}"""
NEW_RADIATION="""function pveRadiationDamage(data) {
    const rad=Math.max(0,Math.min(100,Number(data.radiation)||0));
    if(rad<=0) return 0;
    // Radiation hurts on subsequent player turns, not during artifact-search attempts.
    // At 100 radiation the player loses 15 HP per turn until radiation is removed.
    const damage=Math.round(rad*0.15*10)/10;
    data.health=Math.round(Math.max(0,(Number(data.health)||0)-damage)*10)/10;
    return damage;
}"""

OLD_VITALS="""            data.hunger=Math.max(0,Math.min(Number(data.maxHunger)||100,(Number(data.hunger)||0)-5));
            data.thirst=Math.max(0,Math.min(Number(data.maxThirst)||100,(Number(data.thirst)||0)-5));"""
NEW_VITALS="""            data.hunger=Math.max(0,Math.min(Number(data.maxHunger)||100,(Number(data.hunger)||0)-2));
            data.thirst=Math.max(0,Math.min(Number(data.maxThirst)||100,(Number(data.thirst)||0)-2));"""

OLD_ANOMALY="""            const rawRad=86+Math.floor(Math.random()*8),radRes=Math.max(0,Number(data.radiationResist)||0);
            const radiationAdded=Math.max(0,rawRad-radRes);
            data.radiation=Math.min(100,(Number(data.radiation)||0)+radiationAdded);
            const specific=Number(data.anomalyResist&&data.anomalyResist[a.name])||0;
            const searchDmg=Math.max(0,radiationAdded-effLuck*0.5-Math.max(0,specific));
            data.health=Math.round(Math.max(0,(Number(data.health)||0)-searchDmg)*10)/10;
            if(data.radiation>=100)data.health=0;
            const anomalyDmg=Math.max(0,Number(a.tier)*4-specific);
            if(anomalyDmg>0)data.health=Math.round(Math.max(0,data.health-anomalyDmg)*10)/10;
            const turnEffects=pveArtifactTurnEffects(data);
            if(data.radiation>=100)data.health=0;"""
NEW_ANOMALY="""            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);
            const exposure=pveAnomalyExposureServer(playerId,data,a);
            const radiationAdded=exposure.radiationAdded;
            const anomalyDmg=exposure.anomalyDmg;
            const searchDmg=0; // radiation itself starts hurting only on later player turns
            data.radiation=Math.min(100,(Number(data.radiation)||0)+radiationAdded);
            if(anomalyDmg>0)data.health=Math.round(Math.max(0,(Number(data.health)||0)-anomalyDmg)*10)/10;
            const turnEffects=pveArtifactTurnEffects(data);"""

OLD_HELPER=r"""// RAID_SURVIVAL_V2
function pveAnomalyExposureServer(data,a){
    const tier=Math.max(1,Math.min(9,Number(a&&a.tier)||1));
    const specific=Math.max(0,Number(data.anomalyResist&&data.anomalyResist[a.name])||0);
    const radRes=Math.max(0,Number(data.radiationResist)||0);
    const parsedArmor=parseGearNameServer(data.armor&&data.armor.name||'');
    const armorBase=SHOP_ARMOR.find(x=>x.name===parsedArmor.baseName);
    const research=!!(armorBase&&armorBase.isResearchSuit);
    const upgradeLevel=research?Math.max(0,Number(parsedArmor.level)||0):0;

    // Tiers 1-8 scale smoothly. Tier 9 is intentionally a major wall:
    // only an upgraded research suit gets generic extra protection against named tier-9 anomalies.
    const rawRadiation=tier>=9
        ? 55+Math.random()*20
        : 4+tier*2.5+Math.random()*(2+tier*1.4);
    const researchRadBonus=tier>=9?Math.min(75,upgradeLevel*1.5):0;
    const radiationAdded=Math.round(Math.max(0,rawRadiation-radRes-researchRadBonus)*10)/10;

    const rawAnomaly=tier>=9
        ? 105+Math.random()*30
        : 8+tier*5+Math.random()*(3+tier);
    const researchAnomalyBonus=tier>=9?Math.min(110,upgradeLevel*2.2):0;
    const anomalyDmg=Math.round(Math.max(0,rawAnomaly-specific-researchAnomalyBonus)*10)/10;
    return {radiationAdded,anomalyDmg,rawRadiation,rawAnomaly,research,upgradeLevel,specific,radRes};
}

"""

HELPER=r"""// RAID_SURVIVAL_V3
function pveBeltHazardProtection(data){
    const anomaly={};
    let radiation=0;
    for(const name of (Array.isArray(data.artifactSlots)?data.artifactSlots:[])){
        if(!name)continue;
        const def=typeof serverArtifactDef==='function'?serverArtifactDef(name):null;
        const stats=def&&def.stats&&typeof def.stats==='object'?def.stats:pveArtifactStatsForName(name);
        if(!stats||typeof stats!=='object')continue;
        for(const [key,raw] of Object.entries(stats)){
            const value=Number(raw)||0;
            if(key==='radiation')radiation+=value;
            else if(key.startsWith('anomaly_')){
                const anomalyName=key.slice('anomaly_'.length);
                anomaly[anomalyName]=(Number(anomaly[anomalyName])||0)+value;
            }
        }
    }
    return {radiation,anomaly};
}
function pveAnomalyComposite(map,a,tier){
    const source=map&&typeof map==='object'?map:{};
    let value=Number(source[a&&a.name])||0;
    if(tier>=9){
        const keys=['Жарка','Электра','Воронка','Кислотный туман','Карусель','Мясорубка','Печка','Плазменная сфера'];
        value+=keys.reduce((sum,key)=>sum+(Number(source[key])||0),0)/keys.length;
    }
    return value;
}
function pveAnomalyExposureServer(playerId,data,a){
    const tier=Math.max(1,Math.min(9,Number(a&&a.tier)||1));
    const belt=pveBeltHazardProtection(data);
    const factionPct=typeof pveFactionBonuses==='function'
        ? (Number(pveFactionBonuses(playerId,data,null).anomalyRadResistPct)||0) : 0;
    const derivedScale=Math.max(0,1+factionPct/100);

    const artifactSpecific=pveAnomalyComposite(belt.anomaly,a,tier);
    const combinedSpecific=pveAnomalyComposite(data.anomalyResist,a,tier);
    const artifactRadiation=Number(belt.radiation)||0;
    const combinedRadiation=Number(data.radiationResist)||0;

    const armorName=data.armor&&data.armor.name||'';
    const parsedArmor=parseGearNameServer(armorName);
    const effectiveArmor=armorName&&typeof getArmorEffectiveStatsServer==='function'
        ? getArmorEffectiveStatsServer(armorName,data) : null;
    const armorStats=effectiveArmor&&effectiveArmor.stats&&typeof effectiveArmor.stats==='object'
        ? effectiveArmor.stats : null;
    const armorSpecific=armorStats
        ? pveAnomalyComposite(armorStats,a,tier)*derivedScale
        : combinedSpecific-artifactSpecific*derivedScale;
    const armorRadiation=armorStats
        ? (Number(armorStats.radiation)||0)*derivedScale
        : combinedRadiation-artifactRadiation*derivedScale;

    const armorBase=SHOP_ARMOR.find(x=>x.name===parsedArmor.baseName);
    const research=!!(armorBase&&armorBase.isResearchSuit);
    const upgradeLevel=research?Math.max(0,Number(parsedArmor.level)||0):0;
    const researchRadBonus=tier>=9?Math.min(75,upgradeLevel*1.5):0;
    const researchAnomalyBonus=tier>=9?Math.min(110,upgradeLevel*2.2):0;

    const damage=[0,10,16,24,34,46,60,76,94,230];
    const dose=[0,6,10,14,18,23,28,34,40,120];
    const variation=0.95+Math.max(0,Math.min(1,Number(Math.random())||0))*0.10;
    const rawAnomaly=damage[tier]*variation;
    const rawRadiation=dose[tier]*variation;

    // Belt artifacts are intentionally outside armour scaling:
    // +3 protection = exactly 3 less; -3 = exactly 3 more (until the natural zero floor).
    const anomalyDmg=Math.round(Math.max(0,rawAnomaly-armorSpecific-researchAnomalyBonus-artifactSpecific)*10)/10;
    const radiationAdded=Math.round(Math.max(0,rawRadiation-armorRadiation-researchRadBonus-artifactRadiation)*10)/10;
    return {
        radiationAdded,anomalyDmg,rawRadiation,rawAnomaly,research,upgradeLevel,
        specific:combinedSpecific,radRes:combinedRadiation,artifactSpecific,artifactRadiation
    };
}

"""

def replace_once(text,old,new,label):
    n=text.count(old)
    if n!=1:
        raise RuntimeError(f'{label}: ожидался 1 участок, найдено {n}. Ничего не изменено.')
    return text.replace(old,new,1)

def patch(source):
    if MARK in source:
        return source,False

    # Upgrade the previously installed V2 in place. No player/database data is touched.
    if OLD_MARK in source:
        text=replace_once(source,OLD_HELPER,HELPER,'обновление расчёта аномалий V2→V3')
        text=replace_once(
            text,
            '            const exposure=pveAnomalyExposureServer(data,a);',
            "            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);\n            const exposure=pveAnomalyExposureServer(playerId,data,a);",
            'пересчёт экипированных артефактов'
        )
        return text,True

    text=source
    text=replace_once(text,OLD_TURN_EFFECTS,NEW_TURN_EFFECTS,'отложенный урон радиации')
    text=replace_once(text,OLD_RADIATION,NEW_RADIATION,'урон радиации за ход')
    text=replace_once(text,OLD_VITALS,NEW_VITALS,'сытость и жажда -2')
    route="app.post('/api/raid/anomaly/search'"
    if text.count(route)!=1:
        raise RuntimeError('маршрут поиска аномалии не найден однозначно')
    text=text.replace(route,HELPER+route,1)
    text=replace_once(text,OLD_ANOMALY,NEW_ANOMALY,'урон и радиация аномалии')
    return text,True

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    path=args.server.resolve(strict=True)
    old=path.read_bytes()
    source=old.decode('utf-8')
    new_text,changed=patch(source)
    if not changed:
        print('RAID_SURVIVAL_V3 уже установлен.');return
    with tempfile.TemporaryDirectory(prefix='raid-survival-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Совместимость рейдовых маршрутов и синтаксис подтверждены. Файлы не изменены.');return
    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')
    backup=path.with_name(path.name+'.before-raid-survival-v3-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.raid-survival-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as h:
            h.write(new_text);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp)
        st=path.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if path.read_bytes()!=old:
            raise RuntimeError('server.js изменился во время проверки; установка остановлена.')
        os.replace(tmp,path)
        run(['node','--check',str(path)],timeout=30)
        run(['systemctl','restart',SERVICE],timeout=45)
        for _ in range(20):
            state=run(['systemctl','is-active',SERVICE],capture_output=True,text=True,check=False)
            if state.stdout.strip()=='active':
                probe=run(['curl','-fsS','--max-time','2','http://127.0.0.1:3000/api/market'],capture_output=True,check=False)
                if probe.returncode==0:
                    print('RAID_SURVIVAL_V3 установлен. Backup:',backup);return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после обновления')
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
