#!/usr/bin/env python3
"""Expose public stalbytes/stalcoins in player profile cards. Code-only patch; no DB migration."""
import argparse,hashlib,os,shutil,subprocess,sys,tempfile,time,urllib.request,json
from pathlib import Path

SERVER=Path('/var/www/pocketzone/server.js')
SERVICE='pocketzone.service'
KNOWN_SHA={'c94ef4e6594968eea0fe415d8e4f1caf973de14afd482ee49c2abd2a658618e2'}
MARK='// PUBLIC_PROFILE_CURRENCIES_V1'
OLD="""        nickname: full.nickname, username: row.username,
        level: Number(full.level)||1,
        stats: full.stats || {},"""
NEW="""        nickname: full.nickname, username: row.username,
        level: Number(full.level)||1,
        // PUBLIC_PROFILE_CURRENCIES_V1
        coins: Number(full.coins)||0,
        breedCredits: Number(full.breedCredits)||0,
        stats: full.stats || {},"""

def sha(data): return hashlib.sha256(data).hexdigest()
def run(args,**kw): return subprocess.run(args,check=True,**kw)

def patch(source):
    if MARK in source:return source,False
    count=source.count(OLD)
    if count!=1:raise RuntimeError(f'Ожидался 1 блок публичного профиля, найдено {count}. Ничего не изменено.')
    return source.replace(OLD,NEW,1),True

def service_check(server):
    p=run(['systemctl','show',SERVICE,'-p','ActiveState','-p','SubState','-p','MainPID','-p','WorkingDirectory'],
          capture_output=True,text=True,timeout=15)
    state=dict(x.split('=',1) for x in p.stdout.splitlines() if '=' in x)
    if state.get('ActiveState')!='active' or state.get('SubState')!='running':raise RuntimeError('Служба pocketzone не активна.')
    pid=int(state.get('MainPID') or 0);cwd=(Path('/proc')/str(pid)/'cwd').resolve()
    cmd=[os.fsdecode(x) for x in (Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0') if x]
    script=(cwd/cmd[-1]).resolve() if cmd and not os.path.isabs(cmd[-1]) else Path(cmd[-1]).resolve()
    if script!=server.resolve():raise RuntimeError('Служба использует другой server.js.')
    return cwd

def health():
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/api/quests/version',timeout=3) as r:
            x=json.load(r);return r.status==200 and x.get('success') is True and x.get('version')==2
    except Exception:return False

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--dry-run',action='store_true');ap.add_argument('--install',action='store_true');args=ap.parse_args()
    if os.geteuid()!=0:raise RuntimeError('Запустите от root.')
    server=SERVER.resolve(strict=True);raw=server.read_bytes();source=raw.decode('utf-8')
    if sha(raw) not in KNOWN_SHA and MARK not in source:raise RuntimeError('server.js не совпадает с проверенной версией.')
    new,changed=patch(source)
    service_check(server)
    with tempfile.NamedTemporaryFile('w',encoding='utf-8',suffix='.js',delete=False) as h:
        h.write(new);tmp=h.name
    try:run(['node','--check',tmp],timeout=30)
    finally:Path(tmp).unlink(missing_ok=True)
    if args.dry_run or not args.install:
        print(json.dumps({'mode':'READ_ONLY','changed':changed,'sourceSha256':sha(raw),'patchedSha256':sha(new.encode()),'currencies':['coins','breedCredits']},ensure_ascii=False,indent=2));return
    if not changed and health():
        print('Уже установлено.');return
    stamp=time.strftime('%Y%m%d_%H%M%S');backup=server.with_name('server.js.before-profile-currencies-'+stamp);shutil.copy2(server,backup)
    owner=server.stat()
    fd,name=tempfile.mkstemp(prefix='.profile-currencies-',dir=server.parent)
    try:
        with os.fdopen(fd,'wb') as h:h.write(new.encode());h.flush();os.fsync(h.fileno())
        os.chown(name,owner.st_uid,owner.st_gid);os.chmod(name,owner.st_mode&0o777);os.replace(name,server)
        run(['systemctl','restart',SERVICE],timeout=45)
        for _ in range(20):
            if health():
                service_check(server)
                print('ГОТОВО: Сталбайты и Сталкоины добавлены в публичное инфо игрока.')
                print('Backup:',backup);print('server.js SHA-256:',sha(server.read_bytes()));return
            time.sleep(1)
        raise RuntimeError('API не ответил после перезапуска')
    except Exception as e:
        shutil.copy2(backup,server)
        try:run(['systemctl','restart',SERVICE],timeout=45)
        except Exception:pass
        raise RuntimeError('Патч не подтверждён, server.js восстановлен: '+str(e))
    finally:
        if os.path.exists(name):os.unlink(name)

if __name__=='__main__':
    try:main()
    except Exception as e:print('СТОП:',e);sys.exit(1)
