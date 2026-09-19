#!/usr/bin/env python3
"""Install raid survival tuning: delayed radiation damage, tier-scaled anomalies, -2 hunger/thirst."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
MARK='// RAID_SURVIVAL_V2'

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
NEW_ANOMALY="""            const exposure=pveAnomalyExposureServer(data,a);
            const radiationAdded=exposure.radiationAdded;
            const anomalyDmg=exposure.anomalyDmg;
            const searchDmg=0; // radiation itself starts hurting only on later player turns
            data.radiation=Math.min(100,(Number(data.radiation)||0)+radiationAdded);
            if(anomalyDmg>0)data.health=Math.round(Math.max(0,(Number(data.health)||0)-anomalyDmg)*10)/10;
            const turnEffects=pveArtifactTurnEffects(data);"""

HELPER="""// RAID_SURVIVAL_V2
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

def replace_once(text,old,new,label):
    n=text.count(old)
    if n!=1:
        raise RuntimeError(f'{label}: ожидался 1 участок, найдено {n}. Ничего не изменено.')
    return text.replace(old,new,1)

def patch(source):
    if MARK in source:
        return source,False
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
        print('RAID_SURVIVAL_V2 уже установлен.');return
    with tempfile.TemporaryDirectory(prefix='raid-survival-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Совместимость рейдовых маршрутов и синтаксис подтверждены. Файлы не изменены.');return
    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')
    backup=path.with_name(path.name+'.before-raid-survival-'+time.strftime('%Y%m%d_%H%M%S'))
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
                    print('RAID_SURVIVAL_V2 установлен. Backup:',backup);return
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
