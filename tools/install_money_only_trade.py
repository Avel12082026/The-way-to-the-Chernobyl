#!/usr/bin/env python3
"""Remove player-level requirements from buying and equipping ordinary gear.

Vendor assortment, prices, currency checks, admin-only restrictions and premium-only
restrictions remain unchanged. The only removed condition is player level.
"""
from pathlib import Path
import argparse, os, re, shutil, subprocess, tempfile, time

SERVICE='pocketzone.service'
MARK='// MONEY_ONLY_TRADE_V1'

def replace_once(text, old, new, label):
    n=text.count(old)
    if n==0:
        if new in text:
            return text,False
        raise RuntimeError(f'{label}: поддерживаемый участок не найден')
    if n!=1:
        raise RuntimeError(f'{label}: ожидался 1 участок, найдено {n}')
    return text.replace(old,new,1),True

def patch(source):
    text=source; changed=False

    # Weapon-progression middleware used to reject a catalogue weapon when the
    # player's level was below unlockLevel. Keep the middleware but turn that
    # part into a pass-through. There can be one or two historical copies.
    pattern=re.compile(
        r"""        const playerId=String\(req\.telegramUser\.id\);\n"""
        r"""        const row=db\.prepare\('SELECT data FROM players WHERE id=\?'\)\.get\(playerId\);\n"""
        r"""        if\(!row\)return res\.status\(404\)\.json\(\{success:false,error:'Игрок не найден'\}\);\n"""
        r"""        const data=safeParsePlayerData\(row\.data\);\n"""
        r"""        const level=Math\.max\(1,Number\(data&&data\.level\)\|\|1\);\n"""
        r"""        const required=Number\(entry\.weapon\.unlockLevel\)\|\|1;\n"""
        r"""        if\(level<required\)\n"""
        r"""            return res\.status\(400\)\.json\(\{\n"""
        r"""                success:false,\n"""
        r"""                error:'Это оружие откроется на '\+required\+' уровне',\n"""
        r"""                requiredLevel:required,\n"""
        r"""                progressionIndex:entry\.index\n"""
        r"""            \}\);\n"""
    )
    text,n=pattern.subn('',text)
    if n: changed=True

    old_shop="""        if (category === 'weapon') {
            // Оружие теперь открывается строго по уровню игрока (unlockLevel), не по тиру
            // снаряжения — та же логика, что unlockWeaponsByLevel() на клиенте
            if (item.adminOnly) return res.json({ success: false, error: 'Этот товар вам ещё не доступен' });
            if ((Number(data.level) || 1) < (item.unlockLevel || 0)) {
                return res.json({ success: false, error: 'Этот товар вам ещё не доступен' });
            }
        } else if (category === 'armor') {
            // Броня теперь открывается строго по уровню игрока (unlockLevel), не по тиру
            // снаряжения — та же логика, что unlockArmorByLevel() на клиенте.
            // Премиальную броню (isPremiumArmor) тут купить нельзя вообще — только за
            // Telegram Stars в магазине Байт или дроп с арены (каждые 5000 убийств игроков)
            if (item.adminOnly || item.isPremiumArmor) return res.json({ success: false, error: 'Этот товар вам ещё не доступен' });
            if ((Number(data.level) || 1) < (item.unlockLevel || 0)) {
                return res.json({ success: false, error: 'Этот товар вам ещё не доступен' });
            }
        }"""
    new_shop="""        if (category === 'weapon') {
            if (item.adminOnly) return res.json({ success: false, error: 'Этот товар доступен только администратору' });
        } else if (category === 'armor') {
            // Premium armor keeps its separate acquisition path; player level no longer gates ordinary armor.
            if (item.adminOnly || item.isPremiumArmor) return res.json({ success: false, error: 'Этот товар недоступен в обычной торговле' });
        }"""
    if old_shop in text:
        text=text.replace(old_shop,new_shop,1);changed=True
    elif new_shop not in text:
        raise RuntimeError('основной маршрут магазина: неизвестная версия уровневой проверки')

    for old,label in [
        ("""            const unlockTier = getDetectorUnlockTierServer(data.level);
            if (item.tier > unlockTier) return res.json({ success: false, error: 'Этот детектор вам ещё не доступен по уровню' });
""",'уровень детектора'),
        ("""            const unlockTier = getResearchSuitUnlockTierServer(data.level);
            if (item.tier > unlockTier) return res.json({ success: false, error: 'Этот комбинезон вам ещё не доступен по уровню' });
""",'уровень исследовательского костюма'),
        ("""                if(!weapon.adminOnly&&!weapon.starterGear&&(Number(data.level)||1)<(Number(weapon.unlockLevel)||0))
                    return {success:false,error:`Оружие откроется на ${weapon.unlockLevel} уровне`};
""",'экипировка оружия'),
        ("""                if(!armor.adminOnly&&!armor.starterGear){
                    if(armor.isResearchSuit){
                        if(Number(armor.tier)>getResearchSuitUnlockTierServer(data.level))
                            return {success:false,error:'Этот комбинезон ещё недоступен по уровню'};
                    }else if((Number(data.level)||1)<(Number(armor.unlockLevel)||0)){
                        return {success:false,error:`Броня откроется на ${armor.unlockLevel} уровне`};
                    }
                }
""",'экипировка брони'),
    ]:
        if old in text:
            text=text.replace(old,'',1);changed=True
        elif label in ('уровень детектора','уровень исследовательского костюма'):
            # These may already be removed by a prior run.
            pass

    if MARK not in text:
        pos=text.find('app.listen(PORT,')
        if pos<0: pos=text.find('app.listen(')
        if pos<0: raise RuntimeError('app.listen не найден')
        text=text[:pos]+MARK+'\n'+text[pos:];changed=True

    forbidden=[
        "error:'Это оружие откроется на '+required+' уровне'",
        "Этот детектор вам ещё не доступен по уровню",
        "Этот комбинезон вам ещё не доступен по уровню",
        "Оружие откроется на ${weapon.unlockLevel} уровне",
        "Броня откроется на ${armor.unlockLevel} уровне",
    ]
    leftovers=[x for x in forbidden if x in text]
    if leftovers:
        raise RuntimeError('остались уровневые ограничения покупки/экипировки: '+', '.join(leftovers))
    return text,changed

def run(args,**kw):
    kw.setdefault('check',True)
    return subprocess.run(args,**kw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    path=args.server.resolve(strict=True)
    old=path.read_bytes();source=old.decode('utf-8')
    new,changed=patch(source)
    with tempfile.TemporaryDirectory(prefix='money-only-trade-check-') as td:
        candidate=Path(td)/'server.js';candidate.write_text(new,encoding='utf-8')
        run(['node','--check',str(candidate)],timeout=30)
    if args.check:
        print('MONEY_ONLY_TRADE_V1: уровневые ограничения покупки/экипировки отсутствуют; файлы не изменены.')
        return
    if not changed:
        print('MONEY_ONLY_TRADE_V1 уже установлен.')
        return
    if os.geteuid()!=0: raise RuntimeError('Установку нужно запускать от root.')
    backup=path.with_name(path.name+'.before-money-only-trade-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.money-only-trade-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as h:
            h.write(new);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp);st=path.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if path.read_bytes()!=old: raise RuntimeError('server.js изменился во время проверки')
        os.replace(tmp,path)
        run(['node','--check',str(path)],timeout=30)
        run(['systemctl','restart',SERVICE],timeout=45)
        state=run(['systemctl','is-active',SERVICE],capture_output=True,text=True,check=False,timeout=15)
        if state.stdout.strip()!='active': raise RuntimeError('pocketzone.service не запущен после обновления')
        print('MONEY_ONLY_TRADE_V1 установлен. Backup:',backup)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        run(['systemctl','restart',SERVICE],check=False,timeout=45)
        raise

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('СТОП:',e)
        raise SystemExit(1)
