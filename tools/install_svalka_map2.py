#!/usr/bin/env python3
"""Atomically install the approved vertical Svalka map as location 2 artwork."""
from pathlib import Path
import argparse, hashlib, os, shutil, tempfile, urllib.request, time, subprocess

EXPECTED_SHA256='b34011da45489fe4899ad5138c7c67a5e8b93eaee2f1d51c78d7b2d863190324'
RELATIVE_ASSET='ui/zone-map2-v13.jpg'
LIVE_ASSET='ui/zone-map2.jpg'
EXPECTED_WIDTH=864
EXPECTED_HEIGHT=1536

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def fetch(base):
    url=base.rstrip('/')+'/'+RELATIVE_ASSET
    req=urllib.request.Request(url,headers={'User-Agent':'pocketzone-svalka-map/1'})
    with urllib.request.urlopen(req,timeout=45) as r:
        data=r.read()
    if sha256(data)!=EXPECTED_SHA256:
        raise RuntimeError('Контрольная сумма карты Свалки не совпала.')
    return data

def jpeg_size(data):
    if len(data)<4 or data[:2]!=b'\xff\xd8':
        raise RuntimeError('Карта Свалки не JPEG.')
    i=2
    while i+9<len(data):
        if data[i]!=0xFF:
            i+=1;continue
        while i<len(data) and data[i]==0xFF:i+=1
        if i>=len(data):break
        marker=data[i];i+=1
        if marker in (0xD8,0xD9):continue
        if i+2>len(data):break
        length=int.from_bytes(data[i:i+2],'big')
        if length<2 or i+length>len(data):break
        if marker in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
            if length<7:break
            h=int.from_bytes(data[i+3:i+5],'big')
            w=int.from_bytes(data[i+5:i+7],'big')
            return w,h
        i+=length
    raise RuntimeError('Не удалось прочитать размеры JPEG.')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--base',required=True,help='Pinned raw GitHub base URL')
    ap.add_argument('--root',default='/var/www/pocketzone',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()

    root=args.root.resolve(strict=True)
    ui=root/'ui'
    if not ui.is_dir():raise RuntimeError('Не найдена папка ui на сервере.')
    target=ui/'zone-map2.jpg'
    if not target.is_file():raise RuntimeError('Не найдена текущая карта Свалки: '+str(target))

    data=fetch(args.base)
    size=jpeg_size(data)
    if size!=(EXPECTED_WIDTH,EXPECTED_HEIGHT):
        raise RuntimeError(f'Размер карты неверный: {size[0]}x{size[1]}')

    print('Новая Свалка:',EXPECTED_WIDTH,'x',EXPECTED_HEIGHT,'SHA256='+EXPECTED_SHA256)
    if args.check:
        print('CHECK OK: текущая карта на сервере не изменена.')
        return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root.')

    old=target.read_bytes()
    if sha256(old)==EXPECTED_SHA256:
        print('Новая карта Свалки уже установлена.')
        return

    backup=target.with_name('zone-map2.jpg.before-svalka-vertical-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(target,backup)
    fd,tmp=tempfile.mkstemp(prefix='.zone-map2-',suffix='.jpg',dir=ui)
    try:
        with os.fdopen(fd,'wb') as h:
            h.write(data);h.flush();os.fsync(h.fileno())
        shutil.copystat(target,tmp)
        st=target.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if target.read_bytes()!=old:
            raise RuntimeError('zone-map2.jpg изменился во время проверки.')
        os.replace(tmp,target)
        if sha256(target.read_bytes())!=EXPECTED_SHA256:
            raise RuntimeError('Проверка установленной карты не прошла.')
        probe=subprocess.run(
            ['curl','-fsS','--max-time','5','http://127.0.0.1:3000/api/zone-map/2'],
            capture_output=True,check=False,timeout=10
        )
        if probe.returncode!=0 or sha256(probe.stdout)!=EXPECTED_SHA256:
            raise RuntimeError('API /api/zone-map/2 не отдал новую карту.')
        print('СВАЛКА установлена. Backup:',backup)
        print('API /api/zone-map/2 отдаёт новую вертикальную карту.')
    except Exception:
        if os.path.exists(tmp):os.unlink(tmp)
        shutil.copy2(backup,target)
        raise

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
