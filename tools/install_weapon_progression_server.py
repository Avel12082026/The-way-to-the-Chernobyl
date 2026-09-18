#!/usr/bin/env python3
"""Install the reviewed overlapping weapon progression on the live Pocket Zone server.

The installer only accepts the exact quest/balance server reviewed on 2026-09-19.
It backs up server.js + game.db, updates public profile currency fields, installs the
shared weapon progression catalogue/module, migrates equipped ordinary weapon damage,
restarts pocketzone.service, verifies both APIs and rolls code+DB back on failure.
"""
import argparse, hashlib, json, os, re, shutil, sqlite3, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT=Path('/var/www/pocketzone')
SERVER=ROOT/'server.js'
DB=ROOT/'game.db'
SERVICE='pocketzone.service'
MARK='// WEAPON_PROGRESSION_V1'
KNOWN_SERVER_SHA256={'c94ef4e6594968eea0fe415d8e4f1caf973de14afd482ee49c2abd2a658618e2'}

def sha(data): return hashlib.sha256(data).hexdigest()
def run(args,**kw): return subprocess.run(args,check=True,**kw)

def replace_once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: ожидался 1 участок, найдено {n}. Ничего не изменено.')
    return text.replace(old,new,1)

def process_check():
    show=run(['systemctl','show',SERVICE,'--property=LoadState,ActiveState,SubState,MainPID,WorkingDirectory'],
             capture_output=True,text=True,timeout=15)
    state=dict(line.split('=',1) for line in show.stdout.splitlines() if '=' in line)
    if state.get('LoadState')!='loaded' or state.get('ActiveState')!='active' or state.get('SubState')!='running':
        raise RuntimeError('pocketzone.service не запущен.')
    if Path(state.get('WorkingDirectory','')).resolve()!=ROOT.resolve():
        raise RuntimeError('pocketzone.service использует другой WorkingDirectory.')
    return state

def make_db_backup(target):
    src=sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True,timeout=10)
    dst=sqlite3.connect(target)
    try:
        src.backup(dst,pages=256,sleep=.02)
        if dst.execute('PRAGMA quick_check').fetchone()[0]!='ok':
            raise RuntimeError('quick_check резервной базы не пройден')
    finally:
        dst.close();src.close()

def patch(source):
    if MARK in source:return source,False
    if '// QUEST_BALANCE_V2' not in source:
        raise RuntimeError('Не найден установленный QUEST_BALANCE_V2. Ничего не изменено.')
    text=source

    text=replace_once(
        text,
        "        nickname: full.nickname, username: row.username,\n        level: Number(full.level)||1,\n        stats: full.stats || {},",
        "        nickname: full.nickname, username: row.username,\n        level: Number(full.level)||1, exp:Number(full.exp)||0,\n        coins:Number(full.coins)||0, breedCredits:Number(full.breedCredits)||0,\n        stats: full.stats || {},",
        'публичные Сталбайты/Сталкоины'
    )
    text=replace_once(
        text,
        "        weapon:{name:'Beretta 21A Bobcat',tier:1,dmg:80},",
        "        weapon:{name:'Beretta 21A Bobcat',tier:1,dmg:66},",
        'стартовый урон Beretta 21A'
    )

    fn_start=text.index('function raidCreateNpcPayload(data){')
    fn_end=text.index('function raidCreateMutantPayload(data){',fn_start)
    block=text[fn_start:fn_end]
    old="""    const safeWeapons=SHOP_WEAPONS.filter(w=>Number(w.tier)<=tier&&!w.adminOnly&&!w.isPremiumWeapon);
    const safeArmors=SHOP_ARMOR.filter(a=>Number(a.tier)<=tier&&!a.adminOnly&&!a.isPremiumArmor);
    const wt=Math.max(...safeWeapons.map(w=>Number(w.tier)||0));
    const at=Math.max(...safeArmors.map(a=>Number(a.tier)||0));
    const weaponPool=safeWeapons.filter(w=>Number(w.tier)===wt);
    const armorPool=safeArmors.filter(a=>Number(a.tier)===at);"""
    new="""    const safeWeapons=weaponProgression.combatPool(Number(data.level)||1);
    const safeArmors=SHOP_ARMOR.filter(a=>Number(a.tier)<=tier&&!a.adminOnly&&!a.isPremiumArmor);
    const at=Math.max(...safeArmors.map(a=>Number(a.tier)||0));
    const weaponPool=safeWeapons;
    const armorPool=safeArmors.filter(a=>Number(a.tier)===at);"""
    if block.count(old)!=1:
        raise RuntimeError(f'оружие NPC рейда: ожидался 1 участок, найдено {block.count(old)}')
    block=block.replace(old,new,1)
    text=text[:fn_start]+block+text[fn_end:]

    injection="""const weaponProgression = require('./weapon-progression.cjs')({
    app,SHOP_WEAPONS,PVE_MUTANTS,PVE_NPC_TIER_HP,PVE_NPC_TIER_DMG,PVE_NPC_TIER_MULT
});
""" + MARK + "\n\n"
    text=replace_once(text,"const questBalance = require('./quest-balance.cjs')({",
                      injection+"const questBalance = require('./quest-balance.cjs')({",
                      'подключение weapon-progression')
    return text,True

def health():
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/api/weapon-progression/version',timeout=3) as r:
            wp=json.load(r)
        with urllib.request.urlopen('http://127.0.0.1:3000/api/quests/version',timeout=3) as r:
            q=json.load(r)
        return wp.get('success') is True and wp.get('version')=='2026-09-19-overlap-v1' and q.get('version')==2
    except Exception:
        return False

def load_progression(path):
    data=json.loads(path.read_text(encoding='utf-8'))
    entries=data.get('entries')
    if not isinstance(entries,list) or len(entries)!=116:
        raise RuntimeError('weapon-progression.json должен содержать ровно 116 обычных стволов.')
    by_name={x['name']:x for x in entries}
    if len(by_name)!=116:raise RuntimeError('Дубли имён в weapon-progression.json')
    if 'Убиваю взглядом' in by_name:raise RuntimeError('Админское оружие попало в обычный баланс')
    return data,by_name

def base_and_level(name):
    raw=str(name or '').rstrip('\u200b\u200c')
    m=re.match(r'^(.*) \+(\d+)$',raw)
    return (m.group(1),int(m.group(2))) if m else (raw,0)

def effective_damage(spec,level):
    level=min(50,max(0,int(level or 0)))
    return round(float(spec['damage'])*(1+min(.25,level*.005)))

def scan_and_migrate(by_name,write=False):
    con=sqlite3.connect(DB,timeout=15)
    try:
        if not write:con.execute('PRAGMA query_only=ON')
        rows=con.execute('SELECT id,data FROM players').fetchall()
        changed=0;admin_skipped=0;ordinary_over50=0
        for player_id,raw in rows:
            data=json.loads(raw or '{}')
            weapon=data.get('weapon') if isinstance(data.get('weapon'),dict) else {}
            base,level=base_and_level(weapon.get('name'))
            if base=='Убиваю взглядом':
                admin_skipped+=1
            elif base in by_name:
                if level>50:ordinary_over50+=1
                new_dmg=effective_damage(by_name[base],level)
                if int(round(float(weapon.get('dmg') or 0)))!=new_dmg:
                    weapon['dmg']=new_dmg;changed+=1
                    if write:
                        con.execute('UPDATE players SET data=? WHERE id=?',(json.dumps(data,ensure_ascii=False,separators=(',',':')),player_id))
        if write:con.commit()
        else:con.rollback()
        return {'profiles':len(rows),'equippedWeaponRowsToUpdate':changed,'adminEquippedSkipped':admin_skipped,'ordinaryEquippedOver50':ordinary_over50}
    finally:con.close()

def atomic(path,content,mode,uid,gid):
    fd,tmp=tempfile.mkstemp(prefix='.weapon-stage-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as h:
            h.write(content);h.flush();os.fsync(h.fileno())
        os.chown(tmp,uid,gid);os.chmod(tmp,mode);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('module',type=Path)
    p.add_argument('data',type=Path)
    p.add_argument('--dry-run',action='store_true')
    p.add_argument('--install',action='store_true')
    args=p.parse_args()
    if args.install==args.dry_run:
        raise RuntimeError('Укажите ровно один режим: --dry-run или --install')
    if os.geteuid()!=0:raise RuntimeError('Запустите от root.')
    process_check()
    raw=SERVER.read_bytes();source=raw.decode('utf-8')
    current_sha=sha(raw)
    if MARK not in source and current_sha not in KNOWN_SERVER_SHA256:
        raise RuntimeError('server.js не совпадает с проверенной версией. SHA-256: '+current_sha)
    module_raw=args.module.resolve(strict=True).read_bytes()
    data_path=args.data.resolve(strict=True)
    data_raw=data_path.read_bytes()
    data,by_name=load_progression(data_path)
    new_source,changed=patch(source)

    with tempfile.TemporaryDirectory(prefix='weapon-progression-check-') as td:
        td=Path(td)
        (td/'server.js').write_text(new_source,encoding='utf-8')
        (td/'weapon-progression.cjs').write_bytes(module_raw)
        (td/'weapon-progression.json').write_bytes(data_raw)
        run(['node','--check',str(td/'server.js')],timeout=30)
        run(['node','--check',str(td/'weapon-progression.cjs')],timeout=30)

    summary=scan_and_migrate(by_name,write=False)
    con=sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True,timeout=10)
    try:
        summary['activeRaids']=con.execute('SELECT COUNT(*) FROM raid_sessions').fetchone()[0]
        summary['activePveBattles']=con.execute('SELECT COUNT(*) FROM pve_battles').fetchone()[0]
        summary['marketLots']=con.execute('SELECT COUNT(*) FROM market').fetchone()[0]
    finally:con.close()
    summary['adminWeaponExcluded']='Убиваю взглядом'
    if summary['ordinaryEquippedOver50']:
        raise RuntimeError('Найдено обычное экипированное оружие выше +50.')
    if summary['activeRaids'] or summary['activePveBattles']:
        raise RuntimeError('Есть активный рейд/бой. Установка остановлена.')

    if args.dry_run:
        print(json.dumps({'mode':'READ_ONLY','syntax':'passed','sourceSha256':current_sha,
            'patchedSha256':sha(new_source.encode()),'progressionVersion':data['version'],'summary':summary},
            ensure_ascii=False,indent=2))
        print('Админское оружие не изменяется. Файлы, база и служба не менялись.')
        return

    if not changed and health():
        print('Уже установлено; weapon progression API отвечает.')
        return

    stamp=time.strftime('%Y%m%d_%H%M%S')+'_'+str(os.getpid())
    backup=ROOT/('BACKUP_BEFORE_WEAPON_PROGRESSION_'+stamp)
    backup.mkdir(mode=0o700)
    shutil.copy2(SERVER,backup/'server.js')
    for name in ('weapon-progression.cjs','weapon-progression.json'):
        path=ROOT/name
        if path.exists():shutil.copy2(path,backup/name)
    make_db_backup(backup/'game.db');os.chmod(backup/'game.db',0o600)

    stat=SERVER.stat();dbstat=DB.stat()
    try:
        atomic(ROOT/'weapon-progression.cjs',module_raw,0o644,stat.st_uid,stat.st_gid)
        atomic(ROOT/'weapon-progression.json',data_raw,0o644,stat.st_uid,stat.st_gid)
        atomic(SERVER,new_source.encode(),stat.st_mode&0o777,stat.st_uid,stat.st_gid)
        scan_and_migrate(by_name,write=True)
        run(['systemctl','restart',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        for _ in range(25):
            if health():
                process_check()
                print('ГОТОВО: новая шкала оружия и PvE установлена.')
                print('Резервная копия:',backup)
                print('server.js SHA-256:',sha(SERVER.read_bytes()))
                print('Миграция:',json.dumps(summary,ensure_ascii=False))
                return
            time.sleep(1)
        raise RuntimeError('Новый API не ответил после перезапуска')
    except Exception as error:
        try:run(['systemctl','stop',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        except Exception:pass
        atomic(SERVER,(backup/'server.js').read_bytes(),(backup/'server.js').stat().st_mode&0o777,stat.st_uid,stat.st_gid)
        for name in ('weapon-progression.cjs','weapon-progression.json'):
            target=ROOT/name;old=backup/name
            if old.exists():atomic(target,old.read_bytes(),0o644,stat.st_uid,stat.st_gid)
            elif target.exists():target.unlink()
        for suffix in ('-wal','-shm'):
            side=Path(str(DB)+suffix)
            if side.exists():side.unlink()
        atomic(DB,(backup/'game.db').read_bytes(),dbstat.st_mode&0o777,dbstat.st_uid,dbstat.st_gid)
        try:run(['systemctl','restart',SERVICE],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
        except Exception:pass
        raise RuntimeError('Установка отменена; код и база восстановлены. '+str(error))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('СТОП:',e);sys.exit(1)
