#!/usr/bin/env python3
"""Exact-version deployment to the existing PM2 game process. Filled by package_mobile_deploy.py."""
import hashlib,json,os,shutil,sqlite3,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
SPEC = None  # EMBED_SPEC
MODULE = None  # EMBED_MODULE
SERVER=Path('/var/www/pocketzone/server.js')

def sha(raw):return hashlib.sha256(raw).hexdigest()
def run(args,**kw):return subprocess.run(args,check=True,**kw)
def status():
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/api/mobile/status',timeout=2) as r:
            return r.status==200 and json.load(r)=={'success':True,'version':1}
    except (OSError,ValueError):return False

def find_process(server):
    if not shutil.which('node') or not shutil.which('pm2'):raise RuntimeError('Не найдены node/PM2. Ничего не изменено; пришлите этот вывод для определения способа запуска.')
    # Do not start a second PM2 daemon just to inspect processes.
    pm2home=Path(os.environ.get('PM2_HOME',str(Path.home()/'.pm2')))
    pidfile=pm2home/'pm2.pid'
    if not pidfile.is_file():raise RuntimeError('Не найден работающий PM2 root. Ничего не изменено; нужно определить способ запуска.')
    try:os.kill(int(pidfile.read_text().strip()),0)
    except (OSError,ValueError):raise RuntimeError('PM2 не запущен. Ничего не изменено.')
    listing=run(['pm2','jlist'],capture_output=True,text=True,timeout=15)
    try:processes=json.loads(listing.stdout)
    except ValueError:raise RuntimeError('Не удалось прочитать список PM2; ничего не изменено')
    matches=[]
    for process in processes:
        env=process.get('pm2_env',{})
        path=env.get('pm_exec_path')
        if path and Path(path).resolve()==server and env.get('status')=='online':matches.append(process)
    if len(matches)!=1:raise RuntimeError('Не найден единственный активный процесс именно /var/www/pocketzone/server.js. Ничего не изменено; требуется проверить процесс.')
    process=matches[0];pid=int(process['pid']);process_id=int(process['pm_id'])
    # Confirm the process owns the listener, not a different game/server on port 3000.
    sockets=set()
    for entry in (Path('/proc')/str(pid)/'fd').iterdir():
        try:
            link=os.readlink(entry)
            if link.startswith('socket:['):sockets.add(link[8:-1])
        except OSError:pass
    listener=False
    for filename in ('/proc/net/tcp','/proc/net/tcp6'):
        for line in Path(filename).read_text().splitlines()[1:]:
            fields=line.split()
            if fields[1].split(':')[-1]=='0BB8' and fields[3]=='0A' and fields[9] in sockets:listener=True
    if not listener:raise RuntimeError('Выбранный процесс не слушает порт 3000. Ничего не изменено.')
    cwd=(Path('/proc')/str(pid)/'cwd').resolve();database=cwd/'game.db'
    if not database.is_file():raise RuntimeError('Не найдена база game.db запущенного процесса. Ничего не изменено.')
    return process_id,database,cwd

def deploy():
    if not isinstance(SPEC,dict) or not isinstance(MODULE,str):raise RuntimeError('Installer has not been packaged')
    if os.geteuid()!=0:raise RuntimeError('Запустите установщик на сервере от root')
    server=SERVER.resolve(strict=True);raw=server.read_bytes();text=raw.decode('utf-8')
    module=server.parent/'mobile-auth.cjs';new_module=MODULE.encode()
    if sha(raw)==SPEC['target_sha256']:
        if module.is_file() and module.read_bytes()==new_module and status():
            print('Уже установлено; сервер отвечает.');return
        raise RuntimeError('Код уже обновлён, но модуль/ответ сервера отличаются. Нужна проверка; ничего не изменено.')
    if sha(raw)!=SPEC['source_sha256']:raise RuntimeError('server.js изменился после проверки. Ничего не изменено: пришлите актуальный файл.')
    for change in SPEC['replacements']:
        if text.count(change['old'])!=1:raise RuntimeError('Неоднозначный участок патча; ничего не изменено')
        text=text.replace(change['old'],change['new'],1)
    new=text.encode()
    if sha(new)!=SPEC['target_sha256']:raise RuntimeError('Контрольная сумма результата не совпала')
    if module.exists() and module.read_bytes()!=new_module:raise RuntimeError('Другой mobile-auth.cjs уже существует. Нужна проверка.')
    process_id,database,cwd=find_process(server)
    # Validate code before touching live files or database.
    with tempfile.TemporaryDirectory(prefix='zone-mobile-check-') as name:
        check=Path(name);(check/'server.js').write_bytes(new);(check/'mobile-auth.cjs').write_bytes(new_module)
        run(['node','--check',str(check/'server.js')],timeout=20)
        run(['node','--check',str(check/'mobile-auth.cjs')],timeout=20)
    run(['node','-e',"if(typeof Object.hasOwn!=='function')process.exit(1)"],timeout=10)
    stamp=time.strftime('%Y%m%d_%H%M%S')+'_'+str(os.getpid())
    backup=server.parent/('BACKUP_BEFORE_MOBILE_'+stamp);backup.mkdir(mode=0o700)
    shutil.copy2(server,backup/'server.js')
    had_module=module.exists()
    if had_module:shutil.copy2(module,backup/'mobile-auth.cjs')
    # SQLite backup API includes WAL state; never copy just a live game.db file.
    source=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=10)
    target=sqlite3.connect(backup/'game.db');deadline=time.monotonic()+60
    def progress(_status,_remaining,_total):
        if time.monotonic()>deadline:raise RuntimeError('Резервное копирование базы заняло слишком долго; сервер не изменён')
    try:
        source.backup(target,pages=256,progress=progress,sleep=.1)
        if target.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('Проверка резервной копии базы не пройдена')
    finally:target.close();source.close()
    os.chmod(backup/'game.db',0o600)
    (backup/'deployment.json').write_text(json.dumps({'process_id':process_id,'server':str(server),'cwd':str(cwd),'database':str(database),'source_sha256':sha(raw),'target_sha256':sha(new)},indent=2))
    if sha(server.read_bytes())!=SPEC['source_sha256']:raise RuntimeError('server.js изменился во время подготовки. Установка остановлена.')
    def atomic(path,content,mode):
        fd,name=tempfile.mkstemp(prefix='.mobile-stage-',dir=path.parent)
        try:
            with os.fdopen(fd,'wb') as f:f.write(content);f.flush();os.fsync(f.fileno())
            os.chmod(name,mode);os.replace(name,path)
        finally:
            if os.path.exists(name):os.unlink(name)
    try:
        atomic(module,new_module,0o644);atomic(server,new,server.stat().st_mode & 0o777)
        run(['pm2','restart',str(process_id)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        for attempt in range(20):
            if status():
                print('ГОТОВО: вход и магазин жетонов подключены к серверу.');print('Резервная копия:',backup);return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск нового API')
    except Exception as error:
        atomic(server,raw,(backup/'server.js').stat().st_mode & 0o777)
        if had_module:atomic(module,(backup/'mobile-auth.cjs').read_bytes(),(backup/'mobile-auth.cjs').stat().st_mode & 0o777)
        elif module.exists():module.unlink()
        try:run(['pm2','restart',str(process_id)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        except Exception:print('Не удалось перезапустить прежний сервер. Требуется ручная проверка PM2.')
        # Do not restore the DB automatically: that could erase concurrent player progress.
        raise RuntimeError('Установка не подтверждена. Старый код восстановлен; база не откатывалась. Резервная копия: '+str(backup)) from error
if __name__=='__main__':
    try:deploy()
    except Exception as error:print('СТОП:',error);sys.exit(1)
