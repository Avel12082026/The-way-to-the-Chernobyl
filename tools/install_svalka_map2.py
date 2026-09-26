#!/usr/bin/env python3
"""Validate/install the approved lossless Svalka PNG without rescaling or recompression."""
from pathlib import Path
import argparse, hashlib, os, shutil, tempfile, time

EXPECTED_SHA256='11bc819df27415eaac63182b0411171512fb29f3601844f9b802ec15924fb1a4'
LIVE_ASSET='ui/zone-map2.png'
EXPECTED_WIDTH=941
EXPECTED_HEIGHT=1672

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def png_size(data):
    if len(data)<24 or data[:8]!=b'\x89PNG\r\n\x1a\n' or data[12:16]!=b'IHDR':
        raise RuntimeError('Карта Свалки не PNG.')
    return int.from_bytes(data[16:20],'big'),int.from_bytes(data[20:24],'big')

def validate(data):
    if sha256(data)!=EXPECTED_SHA256:
        raise RuntimeError('Контрольная сумма карты Свалки не совпала: файл был изменён или пережат.')
    size=png_size(data)
    if size!=(EXPECTED_WIDTH,EXPECTED_HEIGHT):
        raise RuntimeError(f'Размер карты неверный: {size[0]}x{size[1]}')
    return size

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',default='/var/www/pocketzone',type=Path)
    ap.add_argument('--source',type=Path,help='Исходный PNG 941x1672; копируется байт-в-байт')
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()

    root=args.root.resolve(strict=True)
    target=root/LIVE_ASSET
    source=args.source.resolve(strict=True) if args.source else target
    data=source.read_bytes()
    validate(data)
    print('Свалка:',EXPECTED_WIDTH,'x',EXPECTED_HEIGHT,'PNG SHA256='+EXPECTED_SHA256)

    if args.check:
        print('CHECK OK: исходный PNG проверен, перекодирование не выполнялось.')
        return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root.')
    if target.is_file() and sha256(target.read_bytes())==EXPECTED_SHA256:
        print('Новая карта Свалки уже установлена без сжатия.')
        return

    target.parent.mkdir(parents=True,exist_ok=True)
    backup=None
    if target.exists():
        backup=target.with_name(target.name+'.before-svalka-hq-'+time.strftime('%Y%m%d_%H%M%S'))
        shutil.copy2(target,backup)

    fd,tmp=tempfile.mkstemp(prefix='.zone-map2-',suffix='.png',dir=target.parent)
    try:
        with os.fdopen(fd,'wb') as h:
            h.write(data);h.flush();os.fsync(h.fileno())
        if target.exists():
            shutil.copystat(target,tmp)
            st=target.stat();os.chown(tmp,st.st_uid,st.st_gid)
        else:
            os.chmod(tmp,0o644)
        os.replace(tmp,target)
        validate(target.read_bytes())
        print('СВАЛКА установлена байт-в-байт.',('Backup: '+str(backup)) if backup else '')
    except Exception:
        if os.path.exists(tmp):os.unlink(tmp)
        if backup and backup.exists():shutil.copy2(backup,target)
        raise

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
