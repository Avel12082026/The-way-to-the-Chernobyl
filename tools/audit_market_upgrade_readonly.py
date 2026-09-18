#!/usr/bin/env python3
"""Read-only audit of market/transfer storage before the +50 equipment migration."""
import argparse,json,re,sqlite3,sys,time
from pathlib import Path

INVISIBLE='\u200b\u200c\u200d\u2060\ufeff'

def extract_array(source,name):
    m=re.search(r'const\s+'+re.escape(name)+r'\s*=\s*\[',source)
    if not m:return []
    start=source.find('[',m.start());depth=0;quote=None;escaped=False
    for i in range(start,len(source)):
        ch=source[i]
        if quote is not None:
            if escaped:escaped=False
            elif ch=='\\':escaped=True
            elif ch==quote:quote=None
            continue
        if ch in ('"',"'"):quote=ch;continue
        if ch=='[':depth+=1
        elif ch==']':
            depth-=1
            if depth==0:
                try:
                    value=json.loads(source[start:i+1])
                    return value if isinstance(value,list) else []
                except Exception:return []
    return []

def parts(name):
    raw=str(name or '')
    visible=raw.rstrip(INVISIBLE)
    m=re.match(r'^(.*) \+(\d+)$',visible)
    return (m.group(1),int(m.group(2))) if m else (visible,0)

def main(root):
    server=(root/'server.js').resolve(strict=True)
    dbpath=(root/'game.db').resolve(strict=True)
    source=server.read_text(encoding='utf-8')
    weapons=extract_array(source,'SHOP_WEAPONS')
    armor=extract_array(source,'SHOP_ARMOR')
    admin={x.get('name') for x in [*weapons,*armor] if isinstance(x,dict) and x.get('adminOnly') and x.get('name')}
    regular={x.get('name') for x in [*weapons,*armor] if isinstance(x,dict) and not x.get('adminOnly') and x.get('name')}

    con=sqlite3.connect(dbpath.as_uri()+'?mode=ro',uri=True,timeout=10)
    con.execute('PRAGMA query_only=ON')
    deadline=time.monotonic()+25
    con.set_progress_handler(lambda:int(time.monotonic()>deadline),1000)
    try:
        tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        transfer_tables=sorted(t for t in tables if re.search(r'parcel|gift',t,re.I))
        result={
            'mode':'READ_ONLY','gameDataChanged':False,
            'marketTablePresent':'market' in tables,
            'marketLots':0,'regularGearLots':0,'regularGearLotsOver50':0,
            'adminGearLotsExcluded':0,'nonGearLots':0,
            'giftOrParcelTables':transfer_tables,
        }
        if 'market' in tables:
            for item,quantity in con.execute('SELECT item,quantity FROM market'):
                result['marketLots']+=1
                base,level=parts(item)
                if base in admin:
                    result['adminGearLotsExcluded']+=1
                elif base in regular:
                    result['regularGearLots']+=1
                    if level>50:result['regularGearLotsOver50']+=1
                else:
                    result['nonGearLots']+=1
        return result
    finally:
        con.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path('/var/www/pocketzone'))
    args=p.parse_args()
    try:
        print(json.dumps(main(args.root),ensure_ascii=False,indent=2))
    except Exception as e:
        print('READ_ONLY market audit failed ('+type(e).__name__+'). Nothing was changed.',file=sys.stderr)
        sys.exit(1)
