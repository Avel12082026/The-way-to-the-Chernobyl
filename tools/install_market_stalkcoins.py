#!/usr/bin/env python3
"""Enable player-market sales/purchases in either Stalbytes or Stalcoins.

Patches only the two market write routes. Refuses unknown layouts, writes a backup,
validates JavaScript syntax, and never edits the database directly.
"""
from pathlib import Path
import argparse, hashlib, os, re, shutil, subprocess, tempfile, time

SELL_START = "app.post('/api/market/sell'"
SELL_END = "app.post('/api/market/cancel'"
BUY_START = "app.post('/api/market/buy'"
BUY_END = "// ===== ГЛОБАЛЬНЫЙ РЕЕСТР"
MARKER = "MARKET_STALKCOINS_V1"

def route_slice(text, start_marker, end_marker):
    start=text.find(start_marker)
    if start<0: raise ValueError(f'не найден маршрут {start_marker}')
    end=text.find(end_marker,start)
    if end<0: raise ValueError(f'не найден конец маршрута {start_marker}')
    return start,end,text[start:end]

def patch_sell(block):
    if MARKER in block: return block
    if 'INSERT INTO market' not in block or 'currency' not in block:
        raise ValueError('маршрут market/sell не сохраняет колонку currency')
    block,n=re.subn(
        r"const\s*\{\s*item\s*,\s*quantity\s*,\s*price(?:\s*,\s*currency(?::\s*\w+)?)?\s*\}\s*=\s*req\.body\s*;",
        "const { item, quantity, price, currency: requestedCurrency } = req.body;",
        block,count=1)
    if n!=1: raise ValueError('не удалось найти разбор полей market/sell')
    block,n=re.subn(
        r"^[ \t]*const currency\s*=.*?;[^\n]*$",
        "        const currency = requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'; // MARKET_STALKCOINS_V1",
        block,count=1,flags=re.M)
    if n!=1:
        anchor="        const prc = parseInt(price, 10);"
        if block.count(anchor)!=1: raise ValueError('не удалось установить проверку валюты market/sell')
        block=block.replace(anchor,anchor+"\n        const currency = requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'; // MARKET_STALKCOINS_V1",1)
    return block

def patch_buy(block):
    if MARKER in block: return block
    old_check="    if ((buyerData.coins || 0) < lot.price) return res.json({ success: false, error: 'Недостаточно Байт' });"
    if old_check not in block:
        m=re.search(r"^\s*if \(\(buyerData\.coins \|\| 0\) < lot\.price\) return res\.json\(\{ success: false, error: '[^']+' \}\);\s*$",block,re.M)
        if not m: raise ValueError('не найдена проверка баланса market/buy')
        old_check=m.group(0)
    new_check="""    const marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'; // MARKET_STALKCOINS_V1
    const buyerBalance = marketCurrency === 'stalkcoins'
        ? (Number(buyerData.breedCredits) || 0)
        : (Number(buyerData.coins) || 0);
    if (buyerBalance < lot.price) {
        return res.json({ success: false, error: marketCurrency === 'stalkcoins' ? 'Недостаточно сталкоинов' : 'Недостаточно сталбайтов' });
    }"""
    block=block.replace(old_check,new_check,1)

    old_debit="    buyerData.coins -= lot.price;"
    if block.count(old_debit)!=1: raise ValueError('не найдено списание сталбайтов market/buy')
    block=block.replace(old_debit,"""    if (marketCurrency === 'stalkcoins') buyerData.breedCredits = (Number(buyerData.breedCredits) || 0) - lot.price;
    else buyerData.coins = (Number(buyerData.coins) || 0) - lot.price;""",1)

    old_credit="            sellerData.coins = (sellerData.coins || 0) + lot.price;"
    if block.count(old_credit)!=1: raise ValueError('не найдено начисление продавцу market/buy')
    block=block.replace(old_credit,"""            if (marketCurrency === 'stalkcoins') sellerData.breedCredits = (Number(sellerData.breedCredits) || 0) + lot.price;
            else sellerData.coins = (Number(sellerData.coins) || 0) + lot.price;""",1)
    return block

def build(source):
    if "ALTER TABLE market ADD COLUMN currency" not in source and "currency TEXT" not in source:
        raise ValueError('в server.js нет миграции/колонки market.currency')
    if 'breedCredits' not in source:
        raise ValueError('в server.js не найдено поле breedCredits')
    s0,s1,sell=route_slice(source,SELL_START,SELL_END)
    source=source[:s0]+patch_sell(sell)+source[s1:]
    b0,b1,buy=route_slice(source,BUY_START,BUY_END)
    source=source[:b0]+patch_buy(buy)+source[b1:]
    return source

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    path=args.server.resolve(strict=True)
    old=path.read_bytes()
    try:
        text=old.decode('utf-8')
        new_text=build(text)
    except (UnicodeError,ValueError) as exc:
        raise SystemExit('СТОП: '+str(exc))
    new=new_text.encode('utf-8')
    if new==old:
        print('Рынок со сталкоинами уже установлен.'); return
    fd,name=tempfile.mkstemp(prefix='market-stalkcoins-',suffix='.js',dir=path.parent)
    temp=Path(name)
    try:
        with os.fdopen(fd,'wb') as f:
            f.write(new); f.flush(); os.fsync(f.fileno())
        subprocess.run(['node','--check',str(temp)],check=True)
        if args.check:
            print('Совместимость маршрутов и синтаксис подтверждены. Файлы не изменены.'); return
        shutil.copystat(path,temp)
        if hasattr(os,'chown') and os.geteuid()==0:
            st=path.stat(); os.chown(temp,st.st_uid,st.st_gid)
        if hashlib.sha256(path.read_bytes()).digest()!=hashlib.sha256(old).digest():
            raise SystemExit('СТОП: server.js изменился во время установки. Файл не заменён.')
        backup=path.with_name(path.name+'.before-market-stalkcoins-'+str(time.time_ns()))
        shutil.copy2(path,backup)
        os.replace(temp,path)
        print('Рынок Сталбайты/Сталкоины установлен. Резервная копия:',backup)
    finally:
        if temp.exists(): temp.unlink()

if __name__=='__main__':
    main()
