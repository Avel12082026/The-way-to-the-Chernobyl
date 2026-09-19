#!/usr/bin/env python3
"""Install raid balance/multi-quest code with preflight, atomic writes and code-only rollback."""
from pathlib import Path
import argparse, fcntl, hashlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from patch_raid_survival import build
from apply_raid_five_client import patch_server_quests
ROOT=Path('/var/www/pocketzone')
SERVICE='pocketzone.service'
SERVER_BEFORE='7d481279dc1b6eb7c2425fa8a8a905270a917d64369dc5eefe944f37b4dc6759'
QUEST_BEFORE='ef7289b956a1969846d9be25e28693c2d5a28e8b5d0443f44ec1fd3fd1a51308'
# Filled by the release packager after the exact files have passed tests.
SERVER_AFTER_V1='5d0f4b1f6f16671f9fc2e49e2604175857b1d492b4c86a7b748fb74eb0f9fe14'
SERVER_MARK='// RAID_SURVIVAL_20260920_V2'
QUEST_AFTER='c05194aa0f71c549320df6f0c55f2fa917f2f9f1a146a25150dd4963c976aadd'
MODULE_HASH='ceaccb323384261387d73a9a3753d51df72603fd1fe718dbe3e0840890214427'
def digest(b):return hashlib.sha256(b).hexdigest()
def run(args,**kw):return subprocess.run(args,check=True,timeout=45,**kw)
def atomic(path,content,st=None):
    fd,name=tempfile.mkstemp(prefix='.raid-five-',suffix=path.suffix,dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(content);f.flush();os.fsync(f.fileno())
        if st:
            os.chmod(name,st.st_mode&0o777)
            if os.geteuid()==0:os.chown(name,st.st_uid,st.st_gid)
        else:os.chmod(name,0o644)
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
def prepare(root,payload):
    before={name:(root/name).read_bytes() for name in ('server.js','quest-balance.cjs')}
    server_hash=digest(before['server.js'])
    server_text=before['server.js'].decode()
    trusted_post_v2=(SERVER_MARK in server_text and 'artifactAnomaly:beltHazard.anomaly' in server_text and 'RaidSurvival.travelCost' in server_text)
    if server_hash not in (SERVER_BEFORE,SERVER_AFTER_V1) and not trusted_post_v2:
        raise RuntimeError('server.js изменился с проверенной версии. Ничего не установлено. SHA='+server_hash)
    if digest(before['quest-balance.cjs']) not in (QUEST_BEFORE,QUEST_AFTER):
        raise RuntimeError('quest-balance.cjs изменился с проверенной версии. Ничего не установлено. SHA='+digest(before['quest-balance.cjs']))
    module=payload.read_bytes()
    if digest(module)!=MODULE_HASH:raise RuntimeError('Не совпал SHA модуля выживания')
    new={'server.js':build(before['server.js'].decode()).encode(),'quest-balance.cjs':patch_server_quests(before['quest-balance.cjs'].decode()).encode(),'raid-survival.cjs':module}
    server_text_new=new['server.js'].decode()
    if SERVER_MARK not in server_text_new or 'artifactAnomaly:beltHazard.anomaly' not in server_text_new:
        raise RuntimeError('Результат серверного патча не содержит проверенную версию защиты')
    if digest(new['quest-balance.cjs'])!=QUEST_AFTER:
        raise RuntimeError('Результат патча заданий не совпал с протестированной сборкой')
    with tempfile.TemporaryDirectory(prefix='raid-five-check-') as tmp:
        for name,content in new.items():
            p=Path(tmp)/name;p.write_bytes(content);run(['node','--check',str(p)])
    return before,new
def check_service(root):
    state=run(['systemctl','show',SERVICE,'-p','ActiveState','-p','MainPID'],capture_output=True,text=True).stdout
    fields=dict(x.split('=',1) for x in state.splitlines() if '=' in x)
    if fields.get('ActiveState')!='active':raise RuntimeError('Служба не активна; сначала требуется диагностика')
    pid=int(fields.get('MainPID','0'))
    if pid<=0:raise RuntimeError('Нет рабочего PID службы')
    proc=Path('/proc')/str(pid)
    if (proc/'cwd').resolve()!=root.resolve():raise RuntimeError('Служба работает из другой папки')
    args=[os.fsdecode(x) for x in (proc/'cmdline').read_bytes().split(b'\0') if x]
    if not args or Path(args[0]).name!='node' or not any(Path(a).name=='server.js' for a in args[1:]):
        raise RuntimeError('Не подтверждён запуск node server.js')
def endpoint(path):
    with urllib.request.urlopen('http://127.0.0.1:3000'+path,timeout=2) as response:
        if response.status!=200:raise RuntimeError('HTTP check failed')
        return json.load(response)
def healthy():
    try:
        raid=endpoint('/api/raid/survival-version');quests=endpoint('/api/quests/version');market=endpoint('/api/market')
        return raid.get('success') is True and raid.get('version')=='20260920.2' and raid.get('travelCost')==2 and quests.get('multiActive') is True and isinstance(market,list)
    except Exception:return False
def service(action):run(['systemctl',action,SERVICE],stdout=subprocess.DEVNULL)
def deploy(root,before,updates,control=service,probe=healthy,wait_seconds=40):
    stamp=time.strftime('%Y%m%d_%H%M%S')+'_'+str(os.getpid())
    backup=root/('BACKUP_BEFORE_RAID_FIVE_'+stamp);backup.mkdir(mode=0o700)
    original={};stats={}
    for name in updates:
        p=root/name
        original[name]=p.read_bytes() if p.exists() else None
        stats[name]=p.stat() if p.exists() else (root/'server.js').stat()
        if p.exists():shutil.copy2(p,backup/name)
    for name,content in before.items():
        if original[name]!=content:raise RuntimeError('Файл изменился между проверкой и установкой: '+name)
    try:
        control('stop')
        for name,content in updates.items():atomic(root/name,content,stats[name])
        control('start')
        deadline=time.monotonic()+wait_seconds
        while time.monotonic()<deadline:
            if probe():return backup
            time.sleep(1)
        raise RuntimeError('API не подтвердил новую версию за время ожидания')
    except Exception as failure:
        # Never restore an old database snapshot: any legitimate gameplay writes are preserved.
        try:control('stop')
        except Exception:pass
        for name,content in original.items():
            p=root/name
            if content is None:
                if p.exists():p.unlink()
            else:atomic(p,content,stats[name])
        try:control('start')
        except Exception as restart:raise RuntimeError('Код восстановлен, но служба не запустилась. Backup: '+str(backup)+'; '+str(restart)) from failure
        raise RuntimeError('Проверка не пройдена. Старый код восстановлен, база не откатывалась. Backup: '+str(backup)+'; '+str(failure)) from failure
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only',type=Path,help='Только проверка файлов в указанной папке; без изменения службы')
    args=parser.parse_args();root=args.check_only or ROOT
    payload=Path(__file__).resolve().with_name('raid-survival.cjs')
    if not payload.exists():payload=Path(__file__).resolve().parents[1]/'server_patches/raid-survival.cjs'
    before,updates=prepare(root,payload)
    if args.check_only:
        print('CHECK OK: совместимость, SHA и синтаксис трёх файлов подтверждены. Ничего не установлено.');return
    if os.geteuid()!=0:raise RuntimeError('Команда установки выполняется через SSH от root')
    check_service(root)
    with (root/'.raid-five-install.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if all((root/n).exists() and (root/n).read_bytes()==b for n,b in updates.items()) and healthy():
            print('OK: эта версия уже установлена; повторный перезапуск не требуется');return
        backup=deploy(root,before,updates)
        run(['systemctl','is-active','--quiet',SERVICE])
        print('OK: выживание 20260920.2; расход 2/2; точные эффекты артефактов; несколько активных заданий; API рынка отвечает')
        print('Резервная копия кода:',backup)
        print('server.js SHA-256:',digest((root/'server.js').read_bytes()))
if __name__=='__main__':
    try:main()
    except Exception as e:print('СТОП:',e);sys.exit(1)
