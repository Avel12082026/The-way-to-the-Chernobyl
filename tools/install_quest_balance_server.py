#!/usr/bin/env python3
"""Install quest/balance patch on the reviewed Pocket Zone systemd service.

The installer is intentionally anchor-guarded: if the live server no longer matches
known gameplay blocks, it stops before changing code.
"""
import argparse, json, hashlib, os, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

SERVER=Path('/var/www/pocketzone/server.js')
SERVICE='pocketzone.service'
MODULE_NAME='quest-balance.cjs'
MARK='// QUEST_BALANCE_V2'
# Release gate opened after the 2026-09-19 live read-only audits:
# 15 valid profiles, no ordinary gear > +50, empty market, no active raids/PvE,
# and administrator-only weapon/armor/artifact correctly excluded.
LIVE_DEPLOYMENT_READY=True
KNOWN_SERVER_SHA256={
    '975ce098ce2853f2520be1a65c1806a7e7b06822ac437ea2ea8b096476f18068',
    'c5d1bbec86d084d2aff46f94c9400a09e11ef9e96e3c65bb9c31821c17f9ad39',
}
OLD_RAID_END="""app.post('/api/raid/end',requireAuth,(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    const sess=raidSession(playerId,token);if(!sess)return res.json({success:false,error:'Рейд не найден'});
    if(sess.pending_type)return res.json({success:false,error:'Сначала завершите текущую встречу'});
    db.prepare('DELETE FROM raid_sessions WHERE player_id=?').run(playerId);
    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
    return res.json({success:true});
});"""
NEW_RAID_END="""app.post('/api/raid/end',requireAuth,(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    try {
        const result=db.transaction(()=>{
            const sess=raidSession(playerId,token);
            if(!sess)return {success:false,error:'Рейд не найден'};
            if(sess.pending_type)return {success:false,error:'Сначала завершите текущую встречу'};
            questBalance.markRaidReturn(playerId);
            db.prepare('DELETE FROM raid_sessions WHERE player_id=? AND token=?').run(playerId,token);
            db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
            return {success:true};
        })();
        return res.json(result);
    } catch(error) {
        console.error('[/api/raid/end]',error);
        return res.status(500).json({success:false,error:'Не удалось завершить рейд. Повторите попытку.'});
    }
});"""
OLD_DEFENSE="""        const reduction=defense/(defense+100);
        damage=Math.round(Math.max(0,(Number(payload.dmg)||0)*(1-reduction))*10)/10;"""
NEW_DEFENSE="""        const safeDefense=Number.isFinite(defense)?defense:0;
        // Negative resistance increases damage; it never creates a singularity or immunity.
        const multiplier=safeDefense>=0?100/(100+safeDefense):1+Math.min(150,-safeDefense)/100;
        damage=Math.round(Math.max(0,Number(payload.dmg)||0)*multiplier*10)/10;"""
OLD_UPGRADE_GUARD="""    const statLevel = Number((data.armorUpgradeData[stableKey] && data.armorUpgradeData[stableKey][statKey]) || 0);
    if (statLevel >= UPGRADE_MAX_LEVEL) return res.json({ success: false, error: 'Эта характеристика уже улучшена до максимума' });"""
NEW_UPGRADE_GUARD="""    const upgradeRecord=data.armorUpgradeData[stableKey]||{};
    const statLevel = Number(upgradeRecord[statKey]) || 0;
    const adminBalanceExcluded=!!armorBase.adminOnly;
    const totalUpgrades=Math.max(parsed.level,Object.values(upgradeRecord).reduce((n,x)=>n+(Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0),0));
    if (adminBalanceExcluded ? statLevel >= 100 : totalUpgrades >= UPGRADE_MAX_LEVEL)
        return res.json({ success: false, error: adminBalanceExcluded ? 'Администраторская характеристика уже улучшена до максимума' : 'Достигнут общий предел: 50 улучшений предмета' });
    if (!isCoreStat && statKey!=='radiation' && !RAID_ANOMALIES.some(a=>'anomaly_'+a.name===statKey))
        return res.json({success:false,error:'Неизвестная характеристика брони'});"""

def run(args,**kw): return subprocess.run(args,check=True,**kw)
def sha(data): return hashlib.sha256(data).hexdigest()

def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1: raise RuntimeError(f'{label}: ожидался 1 участок, найдено {count}. Ничего не изменено.')
    return text.replace(old,new,1)

def process_check(server):
    show=run(['systemctl','show',SERVICE,'--property=LoadState,ActiveState,SubState,MainPID,WorkingDirectory'],capture_output=True,text=True,timeout=15)
    state=dict(line.split('=',1) for line in show.stdout.splitlines() if '=' in line)
    if state.get('LoadState')!='loaded' or state.get('ActiveState')!='active' or state.get('SubState')!='running':
        raise RuntimeError('pocketzone.service не запущен. Ничего не изменено.')
    pid=int(state.get('MainPID','0') or 0)
    if pid<=0: raise RuntimeError('Не найден MainPID pocketzone.service.')
    proc=Path('/proc')/str(pid)
    cwd=(proc/'cwd').resolve()
    args=[os.fsdecode(x) for x in (proc/'cmdline').read_bytes().split(b'\0') if x]
    if not args or Path(args[0]).name!='node': raise RuntimeError('Служба запущена не через node.')
    script=(cwd/args[-1]).resolve() if not os.path.isabs(args[-1]) else Path(args[-1]).resolve()
    if script!=server.resolve(): raise RuntimeError('Служба запускает другой server.js. Ничего не изменено.')
    database=cwd/'game.db'
    if not database.is_file(): raise RuntimeError('Не найдена game.db рабочего процесса.')
    return pid,cwd,database

def make_db_backup(database,target):
    src=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=10)
    dst=sqlite3.connect(target)
    deadline=time.monotonic()+90
    def progress(_status,_remaining,_total):
        if time.monotonic()>deadline: raise RuntimeError('Резервное копирование базы заняло слишком долго.')
    try:
        src.backup(dst,pages=256,progress=progress,sleep=.05)
        if dst.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise RuntimeError('quick_check резервной базы не пройден.')
    finally:
        dst.close();src.close()

def patch(source):
    if '// QUEST_BALANCE_V1' in source: raise RuntimeError('Обнаружен старый экспериментальный патч. Требуется отдельная миграция; автоматическая замена запрещена.')
    if MARK in source: return source,False
    text=source

    text=replace_once(text,'const UPGRADE_MAX_LEVEL = 100;','const UPGRADE_MAX_LEVEL = 50;','лимит улучшения')
    text=replace_once(text,'const UPGRADE_BYTE_THRESHOLD = 50;','const UPGRADE_BYTE_THRESHOLD = 25;','порог валюты улучшения')
    text=replace_once(text,'const UPGRADE_MAX_BONUS_PCT_SERVER = 0.5;','const UPGRADE_MAX_BONUS_PCT_SERVER = 0.25;','максимальный бонус улучшения')
    # Администраторские оружие/броня не входят в баланс игроков:
    # для них сохраняются старые +100 и максимум +50%, без потолков соседнего предмета.
    text=replace_once(
        text,
        'function getUpgradedStatServer(baseStat, level, ceiling) {',
        """function getUpgradedStatServer(baseStat, level, ceiling, adminOnly = false) {
    if (adminOnly) {
        const legacyLevel = Math.max(0, Number(level) || 0);
        const legacyBase = Number(baseStat) || 0;
        const legacyPct = Math.min(0.5, legacyLevel * 0.005);
        return legacyBase === 0 ? Math.round(legacyLevel) : Math.round(legacyBase * (1 + legacyPct));
    }""",
        'отдельная кривая админ-снаряжения'
    )
    text=replace_once(
        text,
        "getUpgradedStatServer(base.armor, u.armor || 0, getNextItemCeilingServer(SHOP_ARMOR, base, 'armor'))",
        "getUpgradedStatServer(base.armor, u.armor || 0, getNextItemCeilingServer(SHOP_ARMOR, base, 'armor'), !!base.adminOnly)",
        'админ-броня пулестойкость'
    )
    text=replace_once(
        text,
        "getUpgradedStatServer(base.hitAbsorption || 0, u.hitAbsorption || 0, getNextItemCeilingServer(SHOP_ARMOR, base, 'hitAbsorption'))",
        "getUpgradedStatServer(base.hitAbsorption || 0, u.hitAbsorption || 0, getNextItemCeilingServer(SHOP_ARMOR, base, 'hitAbsorption'), !!base.adminOnly)",
        'админ-броня гашение'
    )
    text=replace_once(
        text,
        "stats[key] = getUpgradedStatServer(stats[key] || 0, u[key]);",
        "stats[key] = getUpgradedStatServer(stats[key] || 0, u[key], undefined, !!base.adminOnly);",
        'админ-броня прочие характеристики'
    )
    text=replace_once(
        text,
        "        if (parsed.level >= UPGRADE_MAX_LEVEL) return res.json({ success: false, error: 'Этот предмет уже улучшен до максимума' });\n        const weaponCeiling = getNextItemCeilingServer(SHOP_WEAPONS, weaponBase, 'dmg');",
        "        const weaponMaxLevel=weaponBase.adminOnly?100:UPGRADE_MAX_LEVEL;\n        if (parsed.level >= weaponMaxLevel) return res.json({ success: false, error: 'Этот предмет уже улучшен до максимума' });\n        const weaponCeiling = weaponBase.adminOnly ? Infinity : getNextItemCeilingServer(SHOP_WEAPONS, weaponBase, 'dmg');",
        'лимит админ-оружия'
    )
    text=replace_once(
        text,
        "getUpgradedStatServer(weaponBase.dmg, parsed.level, weaponCeiling) >= weaponCeiling",
        "getUpgradedStatServer(weaponBase.dmg, parsed.level, weaponCeiling, !!weaponBase.adminOnly) >= weaponCeiling",
        'потолок админ-оружия'
    )
    text=replace_once(
        text,
        '        const usesTokens = parsed.level >= UPGRADE_BYTE_THRESHOLD;',
        '        const usesTokens = parsed.level >= (weaponBase.adminOnly ? 50 : UPGRADE_BYTE_THRESHOLD);',
        'валюта админ-оружия'
    )
    text=replace_once(
        text,
        "getUpgradedStatServer(weaponBase.dmg, newLevel, weaponCeiling)",
        "getUpgradedStatServer(weaponBase.dmg, newLevel, weaponCeiling, !!weaponBase.adminOnly)",
        'урон админ-оружия после улучшения'
    )
    text=replace_once(
        text,
        '    if (isCoreStat) {\n        armorStatCeiling = getNextItemCeilingServer(SHOP_ARMOR, armorBase, statKey);',
        '    if (isCoreStat && !adminBalanceExcluded) {\n        armorStatCeiling = getNextItemCeilingServer(SHOP_ARMOR, armorBase, statKey);',
        'потолок админ-брони'
    )
    text=replace_once(
        text,
        '    const usesTokens = statLevel >= UPGRADE_BYTE_THRESHOLD;',
        '    const usesTokens = statLevel >= (adminBalanceExcluded ? 50 : UPGRADE_BYTE_THRESHOLD);',
        'валюта админ-брони'
    )
    text=replace_once(
        text,
        "getUpgradedStatServer(weapon.dmg,parsed.level,ceiling)",
        "getUpgradedStatServer(weapon.dmg,parsed.level,ceiling,!!weapon.adminOnly)",
        'экипировка админ-оружия'
    )
    text=replace_once(
        text,
        "getUpgradedStatServer(base.dmg, parsed.level, ceiling)",
        "getUpgradedStatServer(base.dmg, parsed.level, ceiling, !!base.adminOnly)",
        'проверка экипированного админ-оружия'
    )

    old_research="""function getResearchSuitUnlockTierServer(level) {
    // Исследовательские комбинезоны открываются каждые 25 уровней игрока — та же логика,
    // что getResearchSuitUnlockTier на клиенте.
    return Math.min(14, 4 + Math.floor((Math.max(1, Number(level) || 1) - 1) / 50));
}"""
    new_research="""function getResearchSuitUnlockTierServer(level) {
    // Каждый исследовательский костюм открывается не раньше обычной брони того же тира.
    const lv=Math.max(1,Number(level)||1);
    const unlocks=[[4,135],[5,175],[6,220],[7,265],[8,305],[9,350],[10,395],[11,440],[12,480],[13,525],[14,570]];
    let tier=0;
    for(const [value,required] of unlocks)if(lv>=required)tier=value;
    return tier;
}"""
    if old_research not in text:
        # Compatibility with the older 25-level comment/body from the same server family.
        import re
        pattern=r"function getResearchSuitUnlockTierServer\(level\) \{\n(?:    .*\n){0,4}?    return Math\.min\(14, 4 \+ Math\.floor\(\(Math\.max\(1, Number\(level\) \|\| 1\) - 1\) / (?:25|50)\)\);\n\}"
        matches=list(re.finditer(pattern,text))
        if len(matches)!=1: raise RuntimeError(f'доступ исследовательской брони: ожидался 1 участок, найдено {len(matches)}')
        text=text[:matches[0].start()]+new_research+text[matches[0].end():]
    else:
        text=text.replace(old_research,new_research,1)

    text=replace_once(
        text,
        'const PVE_NPC_TIER_HP = {1:25,2:480,3:690,4:1095,5:1720,6:2685,7:4160,8:6420,9:9250,10:13310,11:19170,12:27600,13:39750,14:57240};',
        'const PVE_NPC_TIER_HP = {1:240,2:480,3:690,4:1095,5:1720,6:2685,7:4160,8:6420,9:9250,10:13310,11:19170,12:27600,13:39750,14:57240};',
        'здоровье NPC тира 1'
    )
    text=replace_once(
        text,
        'const PVE_NPC_TIER_DMG = {1:43,2:45,3:46,4:47,5:50,6:53,7:56,8:60,9:72,10:84,11:95,12:106,13:117,14:129};',
        'const PVE_NPC_TIER_DMG = {1:28,2:45,3:46,4:47,5:50,6:53,7:56,8:60,9:72,10:84,11:95,12:106,13:117,14:129};',
        'урон NPC тира 1'
    )
    text=replace_once(
        text,
        'const PVE_NPC_TIER_MULT = {1:1.37,2:0.97,3:1.05,4:1.08,5:1.14,6:1.05,7:0.97,8:0.86,9:0.86,10:0.72,11:0.76,12:0.87,13:0.78,14:0.84};',
        'const PVE_NPC_TIER_MULT = {1:1.00,2:0.97,3:1.05,4:1.08,5:1.14,6:1.05,7:0.97,8:0.86,9:0.86,10:0.72,11:0.76,12:0.87,13:0.78,14:0.84};',
        'множитель NPC тира 1'
    )

    text=replace_once(
        text,
        "    return {...pick,kind:'mutant',enemyHp:Number(pick.hp)||1,maxEnemyHp:Number(pick.hp)||1,medkitsUsed:0};",
        "    const baseHp=Math.max(1,Number(pick.hp)||1);\n    const earlyFloor=Number(pick.tier)<=0?160:Number(pick.tier)<=1?240:Number(pick.tier)<=3?420:0;\n    const balancedHp=Math.max(baseHp,earlyFloor);\n    return {...pick,hp:balancedHp,kind:'mutant',enemyHp:balancedHp,maxEnemyHp:balancedHp,medkitsUsed:0};",
        'раннее здоровье мутантов'
    )

    text=replace_once(
        text,
        'expectedTier=Math.min(PVE_NPC_MAX_TIER,1+Math.floor(level/20));',
        'expectedTier=Math.min(PVE_NPC_MAX_TIER,1+Math.floor(level/40));',
        'единая шкала тира NPC'
    )

    text=replace_once(
        text,
        "const name=a.artifacts[Math.floor(Math.random()*a.artifacts.length)];pveAddItem(data,name,1,true);found.push(name);",
        "const name=questBalance.pickArtifact(a.artifacts)||a.artifacts[0];pveAddItem(data,name,1,true);found.push(name);",
        'взвешенный выбор первого артефакта'
    )
    text=replace_once(
        text,
        "const second=a.artifacts[Math.floor(Math.random()*a.artifacts.length)];pveAddItem(data,second,1,true);found.push(second);",
        "const second=questBalance.pickArtifact(a.artifacts)||a.artifacts[0];pveAddItem(data,second,1,true);found.push(second);",
        'взвешенный выбор бонусного артефакта'
    )

    text=replace_once(text,OLD_RAID_END,NEW_RAID_END,'атомарное возвращение из рейда')
    text=replace_once(text,OLD_DEFENSE,NEW_DEFENSE,'отрицательная защита без бессмертия')
    text=replace_once(text,OLD_UPGRADE_GUARD,NEW_UPGRADE_GUARD,'общий бюджет 50 улучшений брони')
    text=replace_once(text,
        '    const lvl = Math.max(0, Number(level) || 0);',
        '    const lvl = Math.min(UPGRADE_MAX_LEVEL, Math.max(0, Number(level) || 0));',
        'ограничение уровня в расчёте характеристик')

    insertion="""const questBalance = require('./quest-balance.cjs')({
    app,db,requireAuth,rateLimit,
    SHOP_WEAPONS,SHOP_ARMOR,SHOP_ARTIFACTS,SHOP_MUTANT_LOOT,PVE_MUTANTS,RAID_ANOMALIES,
    resolveSellPriceServer,parseGearNameServer
});
""" + MARK + "\n\n"
    text=replace_once(text,'app.listen(PORT, () => {',insertion+'app.listen(PORT, () => {','подключение quest-balance')
    return text,True

def health():
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/api/quests/version',timeout=3) as r:
            body=json.load(r)
            return r.status==200 and body.get('success') is True and body.get('version')==2
    except Exception:
        return False

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('module',nargs='?',default='/tmp/quest-balance.cjs')
    parser.add_argument('--install',action='store_true',help='Установить только после прохождения release gate')
    parser.add_argument('--dry-run',action='store_true',help='Проверить без изменения кода, профилей и службы')
    args=parser.parse_args()
    if args.install and not LIVE_DEPLOYMENT_READY:
        raise RuntimeError('Установка пока закрыта: не завершена итоговая симуляция баланса. Используйте --dry-run.')
    if os.geteuid()!=0:
        raise RuntimeError('Запустите установщик от root на сервере.')

    server=SERVER.resolve(strict=True)
    module_source=Path(args.module).resolve(strict=True)
    raw=server.read_bytes()
    source=raw.decode('utf-8')
    if sha(raw) not in KNOWN_SERVER_SHA256 and MARK not in source:
        raise RuntimeError('Версия server.js не совпадает с проверенной. Ничего не изменено.')

    new_source,changed=patch(source)
    module_raw=module_source.read_bytes()

    if not changed and (server.parent/MODULE_NAME).is_file() and (server.parent/MODULE_NAME).read_bytes()==module_raw and health():
        print('Уже установлено; API заданий отвечает.')
        return

    _pid,cwd,database=process_check(server)
    with tempfile.TemporaryDirectory(prefix='zone-quest-check-') as td:
        p=Path(td)
        (p/'server.js').write_text(new_source,encoding='utf-8')
        (p/MODULE_NAME).write_bytes(module_raw)
        run(['node','--check',str(p/'server.js')],timeout=30)
        run(['node','--check',str(p/MODULE_NAME)],timeout=30)

    if args.dry_run or not args.install:
        import re
        def read_catalog(const_name):
            # Parse the JSON-compatible catalogue by bracket depth; avoid a regex over nested arrays/objects.
            match=re.search(r'const\s+'+re.escape(const_name)+r'\s*=\s*\[',source)
            if not match:
                return []
            begin=source.find('[',match.start())
            depth=0;quote=None;escaped=False
            for pos in range(begin,len(source)):
                ch=source[pos]
                if quote is not None:
                    if escaped: escaped=False
                    elif ch=='\\': escaped=True
                    elif ch==quote: quote=None
                    continue
                if ch in ('"',"'"):
                    quote=ch;continue
                if ch=='[': depth+=1
                elif ch==']':
                    depth-=1
                    if depth==0:
                        try:
                            value=json.loads(source[begin:pos+1])
                            return value if isinstance(value,list) else []
                        except (ValueError,TypeError,json.JSONDecodeError):
                            return []
            return []
        admin_gear={str(x.get('name')) for x in read_catalog('SHOP_WEAPONS')+read_catalog('SHOP_ARMOR') if x.get('adminOnly') and x.get('name')}
        admin_artifacts={str(x.get('name')) for x in read_catalog('SHOP_ARTIFACTS') if x.get('adminOnly') and x.get('name')}
        invis='\\u200b\\u200c\\u200d\\u2060\\ufeff'
        def clean_base(name):
            value=str(name or '').rstrip(invis)
            return re.sub(r' \\+\\d+$','',value)
        source_db=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=10)
        try:
            summary={
                'profiles':0,
                'profilesWithPlayerGearUpgradesOver50':0,
                'profilesWithRegularEquippedArtifacts':0,
                'adminGearExcluded':len(admin_gear),
                'adminArtifactsExcluded':len(admin_artifacts),
            }
            for (raw_data,) in source_db.execute('SELECT data FROM players'):
                data=json.loads(raw_data)
                summary['profiles']+=1
                names=list((data.get('inventory') or {}).keys())+list((data.get('warehouse') or {}).keys())
                names += [str((data.get(k) or {}).get('name','')) for k in ('weapon','armor')]
                over=False
                for name in names:
                    if clean_base(name) in admin_gear:
                        continue
                    match=re.search(r' \\+(\\d+)['+invis+r']*$',str(name or ''))
                    if match and int(match.group(1))>50:
                        over=True
                        break
                if not over:
                    for stable,stats in (data.get('armorUpgradeData') or {}).items():
                        if clean_base(stable) in admin_gear or not isinstance(stats,dict):
                            continue
                        total=sum(max(0,float(v)) for v in stats.values() if isinstance(v,(int,float)))
                        if total>50:
                            over=True
                            break
                summary['profilesWithPlayerGearUpgradesOver50']+=int(over)
                equipped=[str(x or '').rstrip(invis) for x in (data.get('artifactSlots') or []) if x]
                summary['profilesWithRegularEquippedArtifacts']+=int(any(name not in admin_artifacts for name in equipped))
            summary['activeRaids']=source_db.execute('SELECT COUNT(*) FROM raid_sessions').fetchone()[0]
        finally:
            source_db.close()
        print(json.dumps({
            'mode':'READ_ONLY',
            'syntax':'passed',
            'releaseReady':LIVE_DEPLOYMENT_READY,
            'sourceSha256':sha(raw),
            'patchedSha256':sha(new_source.encode()),
            'summary':summary
        },ensure_ascii=False,indent=2))
        print('Админские оружие, броня и артефакты исключены из расчёта баланса.')
        print('Файлы, игровые профили и служба не изменялись. Это проверка, не установка.')
        return

    if server.read_bytes()!=raw:
        raise RuntimeError('server.js изменился во время проверки; установка остановлена.')

    stamp=time.strftime('%Y%m%d_%H%M%S')+'_'+str(os.getpid())
    backup=server.parent/('BACKUP_BEFORE_QUEST_BALANCE_'+stamp)
    backup.mkdir(mode=0o700)
    shutil.copy2(server,backup/'server.js')
    existing=server.parent/MODULE_NAME
    if existing.exists():
        shutil.copy2(existing,backup/MODULE_NAME)
    make_db_backup(database,backup/'game.db')
    os.chmod(backup/'game.db',0o600)

    owner=server.stat()
    db_owner=database.stat()
    def atomic(path,content,mode,uid=owner.st_uid,gid=owner.st_gid):
        fd,name=tempfile.mkstemp(prefix='.quest-stage-',dir=path.parent)
        try:
            with os.fdopen(fd,'wb') as h:
                h.write(content);h.flush();os.fsync(h.fileno())
            os.chown(name,uid,gid)
            os.chmod(name,mode)
            os.replace(name,path)
        finally:
            if os.path.exists(name):
                os.unlink(name)
    try:
        atomic(existing,module_raw,0o644)
        atomic(server,new_source.encode('utf-8'),owner.st_mode & 0o777)
        run(['systemctl','restart',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        for _ in range(25):
            if health():
                process_check(server)
                print('Код установлен, API заданий версии 2 отвечает. Проверьте клиентскую версию перед допуском игроков.')
                print('Резервная копия:',backup)
                print('server.js SHA-256:',sha(server.read_bytes()))
                return
            time.sleep(1)
        raise RuntimeError('Новый API не ответил после перезапуска')
    except Exception as error:
        # Fail closed: stop writers first, then restore code AND the SQLite snapshot.
        # This avoids leaving a half-applied quest schema/profile migration behind.
        try:
            run(['systemctl','stop',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        except Exception:
            pass
        atomic(server,raw,(backup/'server.js').stat().st_mode & 0o777)
        if (backup/MODULE_NAME).exists():
            atomic(existing,(backup/MODULE_NAME).read_bytes(),0o644)
        elif existing.exists():
            existing.unlink()
        for suffix in ('-wal','-shm'):
            sidecar=Path(str(database)+suffix)
            if sidecar.exists():
                sidecar.unlink()
        atomic(database,(backup/'game.db').read_bytes(),db_owner.st_mode & 0o777,db_owner.st_uid,db_owner.st_gid)
        try:
            run(['systemctl','restart',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
            process_check(server)
        except Exception:
            pass
        raise RuntimeError('Установка не подтверждена. Код и база восстановлены из резервной копии: '+str(backup)+'. '+str(error))

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('СТОП:',e)
        sys.exit(1)
