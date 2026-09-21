#!/usr/bin/env python3
"""Install class-based weapon damage hierarchy on the live game server."""
from pathlib import Path
import argparse, os, re, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
MARK='// WEAPON_CLASS_DAMAGE_V1'

BLOCK=r"""// WEAPON_CLASS_DAMAGE_V1
const WEAPON_CLASS_DAMAGE_MULTIPLIERS=Object.freeze({
    pistol:1.00,
    shotgun:1.25,
    automatic:1.50,
    rifle:1.75
});
function weaponDamageClassServer(list,item){
    if(!Array.isArray(list)||!item||item.adminOnly)return'';
    const regular=list.filter(w=>w&&!w.adminOnly);
    const classSize=29;
    if(regular.length!==classSize*4)return'';
    const pistolStart=regular.findIndex(o=>!!(o&&o.starterGear)||String(o&&o.name||'')==='Beretta 21A Bobcat'||Number(o&&o.id)===86);
    if(pistolStart!==classSize*2)
        throw new Error('WEAPON_CLASS_DAMAGE_V1: нарушена структура каталога оружия');
    const index=regular.indexOf(item);
    if(index<0)return'';
    if(index<classSize)return'automatic';
    if(index<classSize*2)return'rifle';
    if(index<classSize*3)return'pistol';
    return'shotgun';
}
(function applyWeaponClassDamageServer(){
    const regular=(Array.isArray(SHOP_WEAPONS)?SHOP_WEAPONS:[]).filter(w=>w&&!w.adminOnly);
    if(regular.length!==116)
        throw new Error('WEAPON_CLASS_DAMAGE_V1: ожидалось 116 обычных стволов, найдено '+regular.length);
    const counts={pistol:0,shotgun:0,automatic:0,rifle:0};
    for(const weapon of regular){
        const cls=weaponDamageClassServer(SHOP_WEAPONS,weapon);
        const mult=WEAPON_CLASS_DAMAGE_MULTIPLIERS[cls];
        if(!mult)throw new Error('WEAPON_CLASS_DAMAGE_V1: неизвестный класс '+String(weapon&&weapon.name||''));
        weapon.dmg=Math.round((Number(weapon.dmg)||0)*mult);
        counts[cls]++;
    }
    if(counts.pistol!==29||counts.shotgun!==29||counts.automatic!==29||counts.rifle!==29)
        throw new Error('WEAPON_CLASS_DAMAGE_V1: неверное распределение классов '+JSON.stringify(counts));
})();
function getWeaponClassNextCeilingServer(list,item,statKey){
    if(statKey!=='dmg')return getNextItemCeilingServer(list,item,statKey);
    if(!item||item.unlockLevel===undefined)return Infinity;
    const cls=weaponDamageClassServer(list,item);
    const candidates=list.filter(o=>o&&!o.adminOnly&&!o.isPremiumArmor&&!o.isResearchSuit&&
        o.unlockLevel!==undefined&&o.unlockLevel>item.unlockLevel&&
        (!cls||weaponDamageClassServer(list,o)===cls));
    if(!candidates.length)return Infinity;
    const minUnlock=Math.min(...candidates.map(o=>o.unlockLevel));
    const nextTier=candidates.filter(o=>o.unlockLevel===minUnlock)
        .sort((a,b)=>(Number(a[statKey])||0)-(Number(b[statKey])||0));
    const nextItem=nextTier[0];
    const nextCeiling=getWeaponClassNextCeilingServer(list,nextItem,statKey);
    const nextValueAt20=getUpgradedStatServer(Number(nextItem[statKey])||0,20,nextCeiling,!!nextItem.adminOnly);
    return Math.max(Number(item[statKey])||0,nextValueAt20);
}

"""

def run(cmd,**kw):
    kw.setdefault('check',True)
    return subprocess.run(cmd,**kw)

def patch(source):
    if MARK in source:
        required=('WEAPON_CLASS_DAMAGE_MULTIPLIERS','getWeaponClassNextCeilingServer','weaponDamageClassServer')
        if not all(x in source for x in required):
            raise RuntimeError('Маркер баланса оружия есть, но патч неполный.')
        return source,False,0

    if 'const SHOP_WEAPONS' not in source:
        raise RuntimeError('Не найден SHOP_WEAPONS.')
    if 'getNextItemCeilingServer' not in source:
        raise RuntimeError('Не найдена серверная логика потолка улучшений.')

    pattern=r'getNextItemCeilingServer\(\s*SHOP_WEAPONS\s*,'
    text,n=re.subn(pattern,'getWeaponClassNextCeilingServer(SHOP_WEAPONS,',source)
    if n<1:
        raise RuntimeError('Не найдены вызовы потолка улучшения оружия.')

    anchors=['app.listen(']
    total=sum(text.count(a) for a in anchors)
    if total!=1:
        raise RuntimeError(f'app.listen: ожидался один якорь, найдено {total}.')
    text=text.replace('app.listen(',BLOCK+'app.listen(',1)
    return text,True,n

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    path=args.server.resolve(strict=True)
    old=path.read_bytes()
    source=old.decode('utf-8')
    new_text,changed,replaced=patch(source)

    if not changed:
        print('WEAPON_CLASS_DAMAGE_V1 уже установлен.')
        return

    with tempfile.TemporaryDirectory(prefix='weapon-class-damage-check-') as td:
        candidate=Path(td)/'server.js'
        candidate.write_text(new_text,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
        if args.check:
            print(f'Иерархия урона подтверждена: пистолеты < дробовики < автоматы < винтовки. Перенаправлено потолков улучшения: {replaced}. Файлы не изменены.')
            return

    if os.geteuid()!=0:
        raise RuntimeError('Установку нужно запускать от root на сервере.')

    backup=path.with_name(path.name+'.before-weapon-class-damage-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.weapon-class-damage-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as h:
            h.write(new_text);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp)
        st=path.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if path.read_bytes()!=old:
            raise RuntimeError('server.js изменился во время проверки; установка остановлена.')
        os.replace(tmp,path)
        run(['node','--check',str(path)],timeout=30)
        run(['systemctl','restart',SERVICE],timeout=45)
        for _ in range(20):
            state=run(['systemctl','is-active',SERVICE],capture_output=True,text=True,check=False)
            if state.stdout.strip()=='active':
                probe=run(['curl','-fsS','--max-time','2','http://127.0.0.1:3000/api/market'],
                          capture_output=True,check=False)
                if probe.returncode==0:
                    print('WEAPON_CLASS_DAMAGE_V1 установлен. Backup:',backup)
                    print('Множители: пистолеты x1.00; дробовики x1.25; автоматы x1.50; винтовки x1.75.')
                    return
            time.sleep(1)
        raise RuntimeError('Сервер не подтвердил запуск после обновления.')
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
