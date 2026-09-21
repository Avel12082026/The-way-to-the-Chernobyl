#!/usr/bin/env python3
"""Install adaptive PvE balance based on player weapon, armor and equipped artifacts."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
MARK='// PVE_ADAPTIVE_COMBAT_V1'

BLOCK=r"""// PVE_ADAPTIVE_COMBAT_V1
function pveCombatArtifactStatsServer(data){
    const out={health:0,bulletResist:0,hitAbsorption:0};
    const slots=Array.isArray(data&&data.artifactSlots)?data.artifactSlots:[];
    for(const name of slots){
        if(!name)continue;
        let def=null;
        if(typeof serverArtifactDef==='function'){
            try{def=serverArtifactDef(name);}catch(_){}
        }
        if(!def&&Array.isArray(SHOP_ARTIFACTS)){
            const clean=String(name).replace(/[\u200B\u200C]+$/,'');
            def=SHOP_ARTIFACTS.find(a=>a&&a.name===clean)||null;
        }
        const stats=def&&def.stats&&typeof def.stats==='object'?def.stats:{};
        out.health+=(Number(stats.health)||0);
        out.bulletResist+=(Number(stats.bulletResist)||0);
        out.hitAbsorption+=(Number(stats.hitAbsorption)||0);
    }
    return out;
}
function pveCombatProfileServer(data){
    const art=pveCombatArtifactStatsServer(data||{});
    const weaponDamage=Math.max(1,
        Number(data&&data.weapon&&data.weapon.dmg)||
        (typeof weaponProgressionPlayerIndexServer==='function'&&
         Array.isArray(WEAPON_PROGRESSION_SERVER)&&
         Number(WEAPON_PROGRESSION_SERVER[weaponProgressionPlayerIndexServer(data)]&&
                WEAPON_PROGRESSION_SERVER[weaponProgressionPlayerIndexServer(data)].dmg))||
        80
    );
    const storedMaxHealth=Math.max(1,Number(data&&data.maxHealth)||100);
    // maxHealth normally already contains artifact capacity effects. The second term
    // is a safe floor for older profiles where positive health artifacts were not recomputed.
    const maxHealth=Math.max(storedMaxHealth,100+Math.max(0,art.health));
    const armorBullet=Number(data&&data.armor&&data.armor.armor)||0;
    const armorHit=Number(data&&data.armor&&data.armor.hitAbsorption)||0;
    const bulletResist=Math.max(0,armorBullet+art.bulletResist);
    const hitAbsorption=Math.max(0,armorHit+art.hitAbsorption);
    return{weaponDamage,maxHealth,bulletResist,hitAbsorption,artifactStats:art};
}
function pveRawDamageForNetServer(netDamage,defense){
    return Math.max(1,Math.round((Number(netDamage)||1)*(100+Math.max(0,Number(defense)||0))/100));
}
function pveAdaptiveNpcPayloadServer(data,npc){
    if(!npc)return npc;
    const p=pveCombatProfileServer(data);
    const tier=Math.max(1,Math.min(14,Number(npc.tier)||1));
    // About 7 hits on early NPCs, rising to 10 on end-game NPCs.
    const targetShots=Math.min(10,7+Math.floor((tier-1)/4));
    const hp=Math.max(Number(npc.hp)||1,Math.round(p.weaponDamage*targetShots));
    // Without healing, a well-equipped player should survive roughly 4.2-5.8 direct hits.
    const survivalHits=Math.max(4.2,5.8-(tier-1)*0.12);
    const wantedNet=Math.max(1,p.maxHealth/survivalHits);
    const dmg=Math.max(Number(npc.dmg)||1,pveRawDamageForNetServer(wantedNet,p.bulletResist));
    return{...npc,hp,enemyHp:hp,maxEnemyHp:hp,dmg,
        adaptiveBalance:{kind:'npc',targetShots,weaponDamage:p.weaponDamage,
            playerMaxHealth:p.maxHealth,playerDefense:p.bulletResist}};
}
function pveAdaptiveMutantPayloadServer(data,mutant){
    if(!mutant)return mutant;
    const p=pveCombatProfileServer(data);
    const sourceTier=Math.max(0,Number(mutant.sourceTier??mutant.tier)||0);
    // Mutants grow from ~6 required shots to ~11 at the top of their progression.
    const targetShots=Math.min(11,6+Math.floor(sourceTier/5));
    const hp=Math.max(Number(mutant.hp)||1,Math.round(p.weaponDamage*targetShots));
    const survivalHits=Math.max(4.0,6.0-sourceTier*0.07);
    const wantedNet=Math.max(1,p.maxHealth/survivalHits);
    const dmg=Math.max(Number(mutant.dmg)||1,pveRawDamageForNetServer(wantedNet,p.hitAbsorption));
    return{...mutant,hp,enemyHp:hp,maxEnemyHp:hp,dmg,
        adaptiveBalance:{kind:'mutant',targetShots,weaponDamage:p.weaponDamage,
            playerMaxHealth:p.maxHealth,playerDefense:p.hitAbsorption}};
}

"""

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def replace_any(text,variants,replacement,label):
    hits=[v for v in variants if v in text]
    if len(hits)!=1:
        raise RuntimeError(f'{label}: ожидался ровно один поддерживаемый вариант, найдено {len(hits)}.')
    return text.replace(hits[0],replacement,1)

def patch(source):
    if MARK in source:
        required=('pveCombatProfileServer','pveAdaptiveNpcPayloadServer','pveAdaptiveMutantPayloadServer')
        if not all(x in source for x in required):
            raise RuntimeError('Маркер адаптивного PvE есть, но патч неполный.')
        return source,False

    if 'const SHOP_ARTIFACTS' not in source:
        raise RuntimeError('Не найден SHOP_ARTIFACTS.')
    if 'raidCreateNpcPayload' not in source or 'raidCreateMutantPayload' not in source:
        raise RuntimeError('Не найдены генераторы NPC/мутантов.')

    text=source

    # Scale the normal raid encounters after their native payload has been built.
    text=replace_any(
        text,
        ['const npc=raidCreateNpcPayload(data);','const npc = raidCreateNpcPayload(data);'],
        'const npc=pveAdaptiveNpcPayloadServer(data,raidCreateNpcPayload(data));',
        'обычный NPC'
    )
    text=replace_any(
        text,
        ['const mutant=raidCreateMutantPayload(data);','const mutant = raidCreateMutantPayload(data);'],
        'const mutant=pveAdaptiveMutantPayloadServer(data,raidCreateMutantPayload(data));',
        'обычный мутант'
    )

    # If the map-routing patch is already installed, its custom encounters must use
    # the same adaptive combat model instead of the old fixed HP/damage override.
    if '// ZONE_MAP_ROUTING_V3' in text:
        text=replace_any(
            text,
            [
                'const npc=raidCreateNpcPayload({...data,level:forcedLevel});',
                'const npc = raidCreateNpcPayload({...data,level:forcedLevel});'
            ],
            'const npc=pveAdaptiveNpcPayloadServer(data,raidCreateNpcPayload({...data,level:forcedLevel}));',
            'NPC карты'
        )
        fixed="""    const stats=ZONE_MAP_NPC_STATS[zoneTier];
    npc.tier=zoneTier;
    if(stats){
        npc.hp=stats.hp;
        npc.enemyHp=stats.hp;
        npc.maxEnemyHp=stats.hp;
        npc.dmg=stats.dmg;
    }
"""
        if fixed not in text:
            raise RuntimeError('Не найден старый фиксированный блок характеристик NPC карты.')
        text=text.replace(fixed,"    npc.tier=zoneTier;\n",1)

        old_mutant="""    return {...pick,sourceTier:Number(pick.tier)||0,tier:zoneTier,kind:'mutant',
        hp,enemyHp:hp,maxEnemyHp:hp,medkitsUsed:0};
"""
        new_mutant="""    return pveAdaptiveMutantPayloadServer(data,{...pick,sourceTier:Number(pick.tier)||0,tier:zoneTier,kind:'mutant',
        hp,enemyHp:hp,maxEnemyHp:hp,medkitsUsed:0});
"""
        if old_mutant not in text:
            raise RuntimeError('Не найден возврат мутанта карты.')
        text=text.replace(old_mutant,new_mutant,1)

    anchor="app.post('/api/raid/step'"
    if text.count(anchor)!=1:
        raise RuntimeError(f'Маршрут шага рейда: ожидался один якорь, найдено {text.count(anchor)}.')
    text=text.replace(anchor,BLOCK+anchor,1)
    return text,True

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
        print('PVE_ADAPTIVE_COMBAT_V1 уже установлен.')
        return

    with tempfile.TemporaryDirectory(prefix='pve-adaptive-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print('Адаптивный PvE подтверждён: HP зависит от оружия; входящий урон — от брони, здоровья и артефактов. Файлы не изменены.')
            return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')

    backup=path.with_name(path.name+'.before-pve-adaptive-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.pve-adaptive-',dir=path.parent)
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
                probe=run(['curl','-fsS','--max-time','2','http://127.0.0.1:3000/api/market'],
                          capture_output=True,check=False)
                if probe.returncode==0:
                    print('PVE_ADAPTIVE_COMBAT_V1 установлен. Backup:',backup)
                    print('NPC и мутанты масштабируются по оружию, броне, maxHealth и экипированным артефактам игрока.')
                    return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после обновления.')
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
