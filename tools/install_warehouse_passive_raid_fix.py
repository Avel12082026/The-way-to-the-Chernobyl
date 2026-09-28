#!/usr/bin/env python3
"""Fix warehouse base detection when a completed raid leaves a passive raid_sessions row.

A passive raid session (no pending encounter and no PvE battle) must not block warehouse
transfers. A pending encounter or active PvE battle still blocks warehouse access.
"""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

OLD="""function isPlayerInActiveRaidServer(playerId) {
    try {
        return !!db.prepare('SELECT 1 FROM raid_sessions WHERE player_id = ?').get(String(playerId));
    } catch (e) {
        return false;
    }
}"""

NEW="""function isPlayerInActiveRaidServer(playerId) {
    try {
        const id=String(playerId);
        // A completed raid can leave a passive raid_sessions row behind. That row alone
        // must not make the base warehouse unusable. Only a real unresolved encounter
        // or an active PvE battle counts as an active raid for warehouse access.
        const battle=db.prepare('SELECT 1 FROM pve_battles WHERE player_id = ?').get(id);
        if(battle)return true;
        const raid=db.prepare('SELECT pending_type FROM raid_sessions WHERE player_id = ?').get(id);
        return !!(raid && raid.pending_type);
    } catch (e) {
        return false;
    }
}"""

def patch(source):
    if NEW in source:
        return source,False
    if OLD not in source:
        raise RuntimeError('Поддерживаемая версия isPlayerInActiveRaidServer не найдена.')
    return source.replace(OLD,NEW,1),True

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    path=args.server.resolve(strict=True)
    old=path.read_bytes();source=old.decode('utf-8')
    new,changed=patch(source)
    with tempfile.TemporaryDirectory(prefix='warehouse-base-guard-') as td:
        candidate=Path(td)/'server.js';candidate.write_text(new,encoding='utf-8')
        subprocess.run(['node','--check',str(candidate)],check=True,timeout=30)
    if args.check:
        print('WAREHOUSE_PASSIVE_RAID_V1: проверка пройдена; файлы не изменены.')
        return
    if not changed:
        print('WAREHOUSE_PASSIVE_RAID_V1 уже установлен.')
        return
    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root.')
    backup=path.with_name(path.name+'.before-warehouse-passive-raid-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.warehouse-passive-raid-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as h:
            h.write(new);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp);st=path.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if path.read_bytes()!=old:
            raise RuntimeError('server.js изменился во время установки')
        os.replace(tmp,path)
        subprocess.run(['node','--check',str(path)],check=True,timeout=30)
        subprocess.run(['systemctl','restart','pocketzone.service'],check=True,timeout=45)
        state=subprocess.run(['systemctl','is-active','pocketzone.service'],capture_output=True,text=True,timeout=15)
        if state.stdout.strip()!='active':
            raise RuntimeError('pocketzone.service не активен после перезапуска')
        print('WAREHOUSE_PASSIVE_RAID_V1 установлен. Backup:',backup)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        subprocess.run(['systemctl','restart','pocketzone.service'],check=False,timeout=45)
        raise

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
