#!/usr/bin/env python3
"""Atomic bundle installer for weapon progression, rare NPC loot and adaptive PvE."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time, urllib.request

SERVICE='pocketzone.service'
HELPERS=(
    'tools/install_weapon_class_damage.py',
    'tools/install_weapon_progression.py',
    'tools/install_pve_adaptive_balance.py',
)

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def fetch(base,rel):
    url=base.rstrip('/')+'/'+rel
    req=urllib.request.Request(url,headers={'User-Agent':'pocketzone-balance-installer/1'})
    with urllib.request.urlopen(req,timeout=45) as r:
        data=r.read()
    if not data:
        raise RuntimeError('Пустой файл: '+rel)
    return data

def load_patch(code,filename):
    ns={'__name__':'bundle_helper_'+filename.replace('/','_'),'__file__':filename}
    exec(compile(code.decode('utf-8'),filename,'exec'),ns,ns)
    fn=ns.get('patch')
    if not callable(fn):
        raise RuntimeError('В '+filename+' не найдена patch().')
    return fn

def apply_patches(source,base):
    status=[]
    text=source

    damage_patch=load_patch(fetch(base,HELPERS[0]),HELPERS[0])
    out=damage_patch(text)
    if not isinstance(out,tuple) or len(out)!=3:
        raise RuntimeError('Неожиданный ответ install_weapon_class_damage.py')
    text,changed,replaced=out
    status.append({'patch':'weapon-class-damage','changed':bool(changed),'ceilingCalls':int(replaced)})

    progression_patch=load_patch(fetch(base,HELPERS[1]),HELPERS[1])
    out=progression_patch(text)
    if not isinstance(out,tuple) or len(out)!=2:
        raise RuntimeError('Неожиданный ответ install_weapon_progression.py')
    text,changed=out
    status.append({'patch':'weapon-progression-npc-loot','changed':bool(changed)})

    adaptive_patch=load_patch(fetch(base,HELPERS[2]),HELPERS[2])
    out=adaptive_patch(text)
    if not isinstance(out,tuple) or len(out)!=2:
        raise RuntimeError('Неожиданный ответ install_pve_adaptive_balance.py')
    text,changed=out
    status.append({'patch':'adaptive-pve','changed':bool(changed)})

    required=(
        '// WEAPON_CLASS_DAMAGE_V1',
        '// WEAPON_UNLOCK_EVERY_3_LEVELS_V1',
        '// NPC_WEAPON_LOOT_WINDOW_V1',
        '// PVE_ADAPTIVE_COMBAT_V1',
        'npcLootDropChanceServer',
        'pveAdaptiveNpcPayloadServer',
        'pveAdaptiveMutantPayloadServer',
    )
    missing=[x for x in required if x not in text]
    if missing:
        raise RuntimeError('После сборки отсутствуют маркеры: '+', '.join(missing))
    return text,status

def atomic_write(path,data,old_stat):
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name+'.bundle-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as h:
            h.write(data);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp)
        os.chown(tmp,old_stat.st_uid,old_stat.st_gid)
        os.replace(tmp,path)
    except Exception:
        if os.path.exists(tmp):os.unlink(tmp)
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--base',required=True,help='Pinned raw GitHub base URL for one commit')
    ap.add_argument('--root',default='/var/www/pocketzone',type=Path)
    ap.add_argument('--check',action='store_true')
    ap.add_argument('--server-only',action='store_true',help='Update server.js only; static client is hosted separately')
    args=ap.parse_args()

    root=args.root.resolve(strict=True)
    server=(root/'server.js').resolve(strict=True)
    client=None if args.server_only else (root/'index.html').resolve(strict=True)

    old_server=server.read_bytes()
    old_client=None if args.server_only else client.read_bytes()
    new_server,status=apply_patches(old_server.decode('utf-8'),args.base)
    new_client=None
    if not args.server_only:
        new_client=fetch(args.base,'index.html')
        client_text=new_client.decode('utf-8')
        client_required=(
            'WEAPON_CLASS_DAMAGE_V1',
            'WEAPON_UNLOCK_EVERY_3_LEVELS_V1',
            'strict progression damage',
            'const unlockWeaponsByLevel',
        )
        missing=[x for x in client_required if x not in client_text]
        if missing:
            raise RuntimeError('Клиент из выбранного коммита не содержит: '+', '.join(missing))

    with tempfile.TemporaryDirectory(prefix='combat-bundle-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_server,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)

    print('Проверены патчи:')
    for item in status:print(' -',item)

    if args.check:
        print('CHECK OK: server.js не изменён.' if args.server_only else 'CHECK OK: server.js и index.html не изменены.')
        return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root.')

    stamp=time.strftime('%Y%m%d_%H%M%S')
    backup=root/('BACKUP_BEFORE_COMBAT_BALANCE_'+stamp)
    backup.mkdir()
    (backup/'server.js').write_bytes(old_server)
    shutil.copystat(server,backup/'server.js')
    if not args.server_only:
        (backup/'index.html').write_bytes(old_client)
        shutil.copystat(client,backup/'index.html')

    server_stat=server.stat()
    client_stat=None if args.server_only else client.stat()
    try:
        if server.read_bytes()!=old_server:
            raise RuntimeError('server.js изменился во время проверки; установка остановлена.')
        if not args.server_only and client.read_bytes()!=old_client:
            raise RuntimeError('index.html изменился во время проверки; установка остановлена.')

        atomic_write(server,new_server.encode('utf-8'),server_stat)
        if not args.server_only:
            atomic_write(client,new_client,client_stat)

        run(['node','--check',str(server)],timeout=30)
        run(['systemctl','restart',SERVICE],timeout=45)

        for _ in range(25):
            state=run(['systemctl','is-active',SERVICE],capture_output=True,text=True,check=False)
            if state.stdout.strip()=='active':
                probe=run(['curl','-fsS','--max-time','3','http://127.0.0.1:3000/api/market'],
                          capture_output=True,check=False)
                if probe.returncode==0:
                    print('COMBAT BALANCE BUNDLE установлен' + (' (server-only).' if args.server_only else '.'))
                    print('Backup:',backup)
                    print('Включено: урон классов; оружие каждые 3 уровня; NPC ±1 ступень; редкий NPC-лут; адаптивные NPC/мутанты с учётом оружия, брони и артефактов.')
                    return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после пакетного обновления.')
    except Exception:
        shutil.copy2(backup/'server.js',server)
        if not args.server_only and (backup/'index.html').is_file():
            shutil.copy2(backup/'index.html',client)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
