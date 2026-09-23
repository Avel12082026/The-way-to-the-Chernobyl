#!/usr/bin/env python3
"""Install Rostok client/server wiring using the exact approved map and bar bytes."""
from pathlib import Path
import argparse, hashlib, os, re, shutil, subprocess, tempfile, time, urllib.request

SERVICE='pocketzone.service'
CACHE_KEY='20260923-rostok-hud3'
MAP_SHA='017f3b41e187a44f33505bd007374ae3a2281c2cefc7bdda1c1ab0bc69ac22aa'
BAR_SHA='bf138d0c05afc2c4d65c504a135d35a1b3af3ecf74ebe8e740d7c3be5b17054c'
MAP_SIZE=(865,1536)
BAR_SIZE=(941,1672)

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def fetch(base,relative):
    url=base.rstrip('/')+'/'+relative
    req=urllib.request.Request(url,headers={'User-Agent':'pocketzone-rostok-installer/1'})
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.read()

def jpeg_size(data):
    if len(data)<4 or data[:2]!=b'\xff\xd8':
        raise RuntimeError('Карта Росстока не JPEG.')
    i=2
    while i+9<len(data):
        if data[i]!=0xff:
            i+=1;continue
        marker=data[i+1];i+=2
        if marker in (0xd8,0xd9) or 0xd0<=marker<=0xd7:
            continue
        if i+2>len(data):break
        length=int.from_bytes(data[i:i+2],'big')
        if length<2 or i+length>len(data):break
        if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
            h=int.from_bytes(data[i+3:i+5],'big');w=int.from_bytes(data[i+5:i+7],'big')
            return w,h
        i+=length
    raise RuntimeError('Не удалось прочитать размер карты Росстока.')

def png_size(data):
    if len(data)<24 or data[:8]!=b'\x89PNG\r\n\x1a\n':
        raise RuntimeError('Изображение бара не PNG.')
    return int.from_bytes(data[16:20],'big'),int.from_bytes(data[20:24],'big')

def validate_asset(path,expected_sha,expected_size,kind):
    data=path.read_bytes()
    actual=sha256(data)
    if actual!=expected_sha:
        raise RuntimeError(f'{kind} изменён или пережат: SHA256 {actual}, ожидался {expected_sha}')
    size=jpeg_size(data) if kind=='Карта Росстока' else png_size(data)
    if size!=expected_size:
        raise RuntimeError(f'{kind}: неверный размер {size[0]}x{size[1]}, ожидался {expected_size[0]}x{expected_size[1]}')
    return data

def bump_cache(index_text,filename):
    pattern=rf'(ui/{re.escape(filename)}\?v=)[^"\']+'
    updated,n=re.subn(pattern,rf'\g<1>{CACHE_KEY}',index_text,count=1)
    if n!=1:
        raise RuntimeError(f'Не найдена единственная ссылка ui/{filename}?v=... в index.html')
    return updated

def write_atomic(path,data,mode=None):
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name+'.rostok-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as h:
            h.write(data);h.flush();os.fsync(h.fileno())
        if path.exists():
            shutil.copystat(path,tmp)
            st=path.stat()
            if os.geteuid()==0: os.chown(tmp,st.st_uid,st.st_gid)
        else:
            os.chmod(tmp,mode or 0o644)
        os.replace(tmp,path)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        raise

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--base',required=True,help='Pinned raw.githubusercontent.com base URL for the chosen commit')
    ap.add_argument('--root',default='/var/www/pocketzone',type=Path)
    ap.add_argument('--map',required=True,type=Path,help='Exact original Rostok map file')
    ap.add_argument('--bar',required=True,type=Path,help='Exact original 100 RADS bar file')
    ap.add_argument('--check',action='store_true')
    ap.add_argument('--server-only',action='store_true',help='Install server routing and Rostok assets only; Telegram client is hosted separately')
    args=ap.parse_args()

    root=args.root.resolve(strict=True)
    if os.geteuid()!=0 and not args.check:
        raise RuntimeError('Установку нужно запускать от root на сервере.')
    ui=root/'ui';index=root/'index.html';server=root/'server.js'
    required=[ui,server]
    if not args.server_only:
        required.extend([index,ui/'bunker-menu.js',ui/'bunker-menu.css'])
    for p in required:
        if not p.exists(): raise RuntimeError('Не найден обязательный файл: '+str(p))

    map_data=validate_asset(args.map.resolve(strict=True),MAP_SHA,MAP_SIZE,'Карта Росстока')
    bar_data=validate_asset(args.bar.resolve(strict=True),BAR_SHA,BAR_SIZE,'Бар Росстока')

    client_js=fetch(args.base,'ui/bunker-menu.js')
    client_css=fetch(args.base,'ui/bunker-menu.css')
    server_installer=fetch(args.base,'tools/install_zone_map_routing_server.py')
    js_text=client_js.decode('utf-8');css_text=client_css.decode('utf-8')
    if "4:'Россток'" not in js_text or "id:'transition-to-4'" not in js_text or "id:'camp-4'" not in js_text:
        raise RuntimeError('Загруженный bunker-menu.js не содержит полной реализации Росстока.')
    if '#rostokCampScreen.rostok-camp-screen' not in css_text:
        raise RuntimeError('Загруженный bunker-menu.css не содержит экрана бара Росстока.')
    installer_text=server_installer.decode('utf-8')
    if '// ZONE_MAP_ROUTING_V4' not in installer_text or '// ROSTOK_BARMAN_SHOP_V1' not in installer_text or '// PLAYER_WORLD_POSITION_V1' not in installer_text or MAP_SHA not in installer_text or BAR_SHA not in installer_text:
        raise RuntimeError('Серверный установщик не соответствует пакету Росстока.')

    index_old=None
    index_new=None
    if not args.server_only:
        index_old=index.read_bytes()
        index_new=bump_cache(bump_cache(index_old.decode('utf-8'),'bunker-menu.css'),'bunker-menu.js').encode('utf-8')

    if args.check:
        with tempfile.TemporaryDirectory(prefix='rostok-check-') as td:
            p=Path(td)/'bunker-menu.js';p.write_bytes(client_js)
            run(['node','--check',str(p)],timeout=30)
            q=Path(td)/'server-installer.py';q.write_bytes(server_installer)
            run(['python3','-m','py_compile',str(q)],timeout=30)

            # Dry-run the actual V3->V4 patch against the live server.js before
            # touching any server file or asset. This catches shape differences
            # in previously installed route blocks.
            ns={'__name__':'rostok_zone_route_dry_run','__file__':str(q)}
            exec(compile(server_installer.decode('utf-8'),str(q),'exec'),ns,ns)
            patch_fn=ns.get('patch')
            if not callable(patch_fn):
                raise RuntimeError('В серверном установщике не найдена patch().')
            live_source=server.read_text(encoding='utf-8')
            candidate_text,_changed=patch_fn(live_source)
            candidate=Path(td)/'server.candidate.js'
            candidate.write_text(candidate_text,encoding='utf-8')
            run(['node','--check',str(candidate)],timeout=30)
        print('CHECK OK: Россток, изображения, Бармен и сохранение позиции проверены на живом server.js; сервер не изменён.' + (' Режим server-only.' if args.server_only else ''))
        return

    stamp=time.strftime('%Y%m%d_%H%M%S')
    backup=root/f'BACKUP_BEFORE_ROSTOK_{stamp}'
    backup.mkdir()
    tracked=[server,ui/'zone-map4.jpg',ui/'rostok-bar.png']
    if not args.server_only:
        tracked=[ui/'bunker-menu.js',ui/'bunker-menu.css',index]+tracked
    existed={}
    for p in tracked:
        existed[p]=p.exists()
        if p.exists(): shutil.copy2(p,backup/p.name)

    try:
        write_atomic(ui/'zone-map4.jpg',map_data)
        write_atomic(ui/'rostok-bar.png',bar_data)
        if not args.server_only:
            write_atomic(ui/'bunker-menu.js',client_js)
            write_atomic(ui/'bunker-menu.css',client_css)
            write_atomic(index,index_new)
            run(['node','--check',str(ui/'bunker-menu.js')],timeout=30)
        with tempfile.TemporaryDirectory(prefix='rostok-server-') as td:
            installer=Path(td)/'install_zone_map_routing_server.py'
            installer.write_bytes(server_installer)
            run(['python3','-m','py_compile',str(installer)],timeout=30)
            run(['python3',str(installer),str(server)],timeout=90)

        for url,expected in [
            ('http://127.0.0.1:3000/api/zone-map/4',MAP_SHA),
            ('http://127.0.0.1:3000/api/zone-camp/4',BAR_SHA),
        ]:
            probe=run(['curl','-fsS','--max-time','5',url],capture_output=True,timeout=10)
            if sha256(probe.stdout)!=expected:
                raise RuntimeError('API вернул изменённое изображение: '+url)

        if sha256((ui/'zone-map4.jpg').read_bytes())!=MAP_SHA or sha256((ui/'rostok-bar.png').read_bytes())!=BAR_SHA:
            raise RuntimeError('Контрольная сумма изображения изменилась после установки.')

        print('РОССТОК УСТАНОВЛЕН' + (' (server-only).' if args.server_only else '.'))
        print('Карта 865x1536 и бар 941x1672 сохранены байт-в-байт, без пережатия.')
        print('Backup:',backup)
    except Exception:
        for p in tracked:
            bp=backup/p.name
            if existed[p] and bp.exists():
                shutil.copy2(bp,p)
            elif not existed[p] and p.exists():
                p.unlink()
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
