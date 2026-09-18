#!/usr/bin/env python3
"""Install quest/balance patch on the reviewed Pocket Zone systemd service.

The installer is intentionally anchor-guarded: if the live server no longer matches
known gameplay blocks, it stops before changing code.
"""
import hashlib, os, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

SERVER=Path('/var/www/pocketzone/server.js')
SERVICE='pocketzone.service'
MODULE_NAME='quest-balance.cjs'
MARK='// QUEST_BALANCE_V1'

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
    if MARK in source: return source,False
    text=source

    text=replace_once(text,'const UPGRADE_MAX_LEVEL = 100;','const UPGRADE_MAX_LEVEL = 50;','лимит улучшения')
    text=replace_once(text,'const UPGRADE_BYTE_THRESHOLD = 50;','const UPGRADE_BYTE_THRESHOLD = 25;','порог валюты улучшения')
    text=replace_once(text,'const UPGRADE_MAX_BONUS_PCT_SERVER = 0.5;','const UPGRADE_MAX_BONUS_PCT_SERVER = 0.25;','максимальный бонус улучшения')

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

    text=replace_once(
        text,
        "    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);\n    return res.json({success:true});\n});\n\napp.post('/api/raid/step'",
        "    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);\n    questBalance.markRaidReturn(playerId);\n    return res.json({success:true});\n});\n\napp.post('/api/raid/step'",
        'отметка возвращения из рейда'
    )

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
            body=r.read().decode('utf-8','replace')
            return r.status==200 and '"success":true' in body and '"version":1' in body
    except Exception:
        return False

def main():
    if os.geteuid()!=0: raise RuntimeError('Запустите установщик от root на сервере.')
    server=SERVER.resolve(strict=True)
    module_source=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/quest-balance.cjs').resolve(strict=True)
    raw=server.read_bytes();source=raw.decode('utf-8')
    new_source,changed=patch(source)
    module_raw=module_source.read_bytes()

    if not changed and health():
        print('Уже установлено; API заданий отвечает.');return

    pid,cwd,database=process_check(server)
    with tempfile.TemporaryDirectory(prefix='zone-quest-check-') as td:
        p=Path(td);(p/'server.js').write_text(new_source);(p/MODULE_NAME).write_bytes(module_raw)
        run(['node','--check',str(p/'server.js')],timeout=30)
        run(['node','--check',str(p/MODULE_NAME)],timeout=30)

    stamp=time.strftime('%Y%m%d_%H%M%S')+'_'+str(os.getpid())
    backup=server.parent/('BACKUP_BEFORE_QUEST_BALANCE_'+stamp);backup.mkdir(mode=0o700)
    shutil.copy2(server,backup/'server.js')
    existing=server.parent/MODULE_NAME
    if existing.exists():shutil.copy2(existing,backup/MODULE_NAME)
    make_db_backup(database,backup/'game.db');os.chmod(backup/'game.db',0o600)

    owner=server.stat()
    def atomic(path,content,mode):
        fd,name=tempfile.mkstemp(prefix='.quest-stage-',dir=path.parent)
        try:
            with os.fdopen(fd,'wb') as h:h.write(content);h.flush();os.fsync(h.fileno())
            os.chown(name,owner.st_uid,owner.st_gid);os.chmod(name,mode);os.replace(name,path)
        finally:
            if os.path.exists(name):os.unlink(name)
    try:
        atomic(existing,module_raw,0o644)
        atomic(server,new_source.encode('utf-8'),owner.st_mode & 0o777)
        run(['systemctl','restart',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        for _ in range(25):
            if health():
                process_check(server)
                print('ГОТОВО: задания, баланс +50, исследовательская броня, ранний PvE и редкость артефактов установлены.')
                print('Резервная копия:',backup)
                print('server.js SHA-256:',sha(server.read_bytes()))
                return
            time.sleep(1)
        raise RuntimeError('Новый API не ответил после перезапуска')
    except Exception as error:
        atomic(server,raw,(backup/'server.js').stat().st_mode & 0o777)
        if (backup/MODULE_NAME).exists():atomic(existing,(backup/MODULE_NAME).read_bytes(),0o644)
        elif existing.exists():existing.unlink()
        try:run(['systemctl','restart',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        except Exception:pass
        raise RuntimeError('Установка не подтверждена. Старый код восстановлен. База не откатывалась. '+str(error))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('СТОП:',e)
        sys.exit(1)
