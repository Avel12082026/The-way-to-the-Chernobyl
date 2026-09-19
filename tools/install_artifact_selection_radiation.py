#!/usr/bin/env python3
"""Install artifact-selection radiation rules with strict source checks and code-only rollback."""
from pathlib import Path
import argparse, fcntl, hashlib, json, os, shutil, subprocess, sys, tempfile, time, urllib.request

from patch_artifact_selection_radiation import build, MARK

ROOT=Path('/var/www/pocketzone')
SERVICE='pocketzone.service'
VERSION='20260920.1'
MODULE_NAME='artifact-selection-radiation.cjs'
MODULE_HASH='3f0dbc10a18b3fbce20cbbb7c49ccc39b63c850d67e9766e7ccf6160c90ab57f'

# Exact live server.js after the confirmed RAID_ANOMALY_V3 20260920.3 install.
KNOWN_SERVER_INPUTS={
    '335e72ba85836fb5af0df9d44dda2353792cd6f65add1aa00ed0fe00b7fc1060',
}

def digest(data): return hashlib.sha256(data).hexdigest()

def run(args,**kw):
    kw.setdefault('check',True)
    kw.setdefault('timeout',45)
    return subprocess.run(args,**kw)

def atomic(path,content,st=None):
    fd,name=tempfile.mkstemp(prefix='.artifact-selection-radiation-',suffix=path.suffix,dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as handle:
            handle.write(content);handle.flush();os.fsync(handle.fileno())
        if st:
            os.chmod(name,st.st_mode&0o777)
            if os.geteuid()==0: os.chown(name,st.st_uid,st.st_gid)
        else:
            os.chmod(name,0o644)
        os.replace(name,path)
    finally:
        if os.path.exists(name): os.unlink(name)

def payload_path():
    p=Path(__file__).resolve().parents[1]/'server_patches'/MODULE_NAME
    if p.exists(): return p
    return Path(__file__).resolve().with_name(MODULE_NAME)

def prepare(root,payload):
    server=root/'server.js'
    if not server.exists(): raise RuntimeError('server.js не найден')
    before=server.read_bytes()
    source=before.decode('utf-8')
    module=payload.read_bytes()
    if digest(module)!=MODULE_HASH:
        raise RuntimeError('Не совпал SHA-256 модуля селекции радиации')

    installed=root/MODULE_NAME
    if MARK in source:
        patched=source
        if "ArtifactSelectionRadiation.mergeStats(a1.stats,a2.stats,{perStatCap})" not in source:
            raise RuntimeError('Обнаружен неполный патч селекции радиации')
    else:
        server_hash=digest(before)
        if server_hash not in KNOWN_SERVER_INPUTS:
            raise RuntimeError('server.js отличается от проверенной версии. Ничего не установлено. SHA='+server_hash)
        patched=build(source)

    updates={'server.js':patched.encode('utf-8'),MODULE_NAME:module}
    with tempfile.TemporaryDirectory(prefix='artifact-selection-radiation-check-') as td:
        for name,data in updates.items():
            candidate=Path(td)/name
            candidate.write_bytes(data)
            run(['node','--check',str(candidate)])
    return {'server.js':before},updates

def check_service(root):
    state=run(['systemctl','show',SERVICE,'-p','ActiveState','-p','MainPID'],capture_output=True,text=True).stdout
    fields=dict(line.split('=',1) for line in state.splitlines() if '=' in line)
    if fields.get('ActiveState')!='active': raise RuntimeError('Служба pocketzone.service не активна')
    pid=int(fields.get('MainPID','0'))
    if pid<=0: raise RuntimeError('Нет рабочего PID службы')
    proc=Path('/proc')/str(pid)
    if (proc/'cwd').resolve()!=root.resolve(): raise RuntimeError('Служба работает из другой папки')
    args=[os.fsdecode(x) for x in (proc/'cmdline').read_bytes().split(b'\0') if x]
    if not args or Path(args[0]).name!='node' or not any(Path(a).name=='server.js' for a in args[1:]):
        raise RuntimeError('Не подтверждён запуск node server.js')

def endpoint(path):
    with urllib.request.urlopen('http://127.0.0.1:3000'+path,timeout=2) as response:
        if response.status!=200: raise RuntimeError('HTTP check failed')
        return json.load(response)

def healthy():
    try:
        selection=endpoint('/api/artifact-selection/version')
        raid=endpoint('/api/raid/survival-version')
        market=endpoint('/api/market')
        return (
            selection.get('success') is True and selection.get('version')==VERSION
            and raid.get('success') is True and raid.get('version')=='20260920.3'
            and isinstance(market,list)
        )
    except Exception:
        return False

def service(action):
    run(['systemctl',action,SERVICE],stdout=subprocess.DEVNULL)

def deploy(root,before,updates,control=service,probe=healthy,wait_seconds=40):
    stamp=time.strftime('%Y%m%d_%H%M%S')+'_'+str(os.getpid())
    backup=root/('BACKUP_BEFORE_ARTIFACT_SELECTION_RADIATION_'+stamp)
    backup.mkdir(mode=0o700)
    original={};stats={}
    for name in updates:
        path=root/name
        original[name]=path.read_bytes() if path.exists() else None
        stats[name]=path.stat() if path.exists() else (root/'server.js').stat()
        if path.exists(): shutil.copy2(path,backup/name)

    for name,data in before.items():
        if original.get(name)!=data:
            raise RuntimeError('Файл изменился между проверкой и установкой: '+name)

    try:
        control('stop')
        for name,data in updates.items(): atomic(root/name,data,stats[name])
        control('start')
        deadline=time.monotonic()+wait_seconds
        while time.monotonic()<deadline:
            if probe(): return backup
            time.sleep(1)
        raise RuntimeError('API не подтвердил селекцию радиации '+VERSION+' за время ожидания')
    except Exception as failure:
        try: control('stop')
        except Exception: pass
        for name,data in original.items():
            path=root/name
            if data is None:
                if path.exists(): path.unlink()
            else:
                atomic(path,data,stats[name])
        try: control('start')
        except Exception as restart:
            raise RuntimeError('Код восстановлен, но служба не запустилась. Backup: '+str(backup)+'; '+str(restart)) from failure
        raise RuntimeError('Проверка не пройдена. Старый код восстановлен, база не откатывалась. Backup: '+str(backup)+'; '+str(failure)) from failure

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only',type=Path,help='Только проверить файлы в указанной папке')
    args=parser.parse_args()
    root=args.check_only or ROOT
    payload=payload_path()
    if not payload.exists(): raise RuntimeError(MODULE_NAME+' не найден')
    before,updates=prepare(root,payload)

    if args.check_only:
        print('CHECK OK: селекция радиации совместима. Ничего не установлено.')
        return
    if os.geteuid()!=0: raise RuntimeError('Команда установки выполняется через SSH от root')
    check_service(root)

    with (root/'.artifact-selection-radiation-install.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if all((root/name).exists() and (root/name).read_bytes()==data for name,data in updates.items()) and healthy():
            print('OK: ARTIFACT_SELECTION_RADIATION уже установлен; повторный перезапуск не требуется')
            return
        backup=deploy(root,before,updates)
        run(['systemctl','is-active','--quiet',SERVICE])
        print('OK: ARTIFACT_SELECTION_RADIATION '+VERSION+' установлен')
        print('Радиация +N уменьшается на 1 при селекции и исчезает на нуле; Радиозащита остаётся отдельным положительным свойством')
        print('Резервная копия кода:',backup)
        print('server.js SHA-256:',digest((root/'server.js').read_bytes()))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('СТОП:',exc)
        sys.exit(1)
