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
SELL_MARKER = "MARKET_STALKCOINS_SELL_V2"
BUY_MARKER = "MARKET_STALKCOINS_BUY_V2"
MARKER = "MARKET_STALKCOINS_V2"

def route_slice(text, start_marker, end_marker):
    start=text.find(start_marker)
    if start<0: raise ValueError(f'не найден маршрут {start_marker}')
    end=text.find(end_marker,start)
    if end<0: raise ValueError(f'не найден конец маршрута {start_marker}')
    return start,end,text[start:end]

def patch_sell(block):
    healthy = (
        "currency: requestedCurrency" in block and
        "requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" in block and
        "INSERT INTO market" in block and "currency" in block
    )
    if healthy:
        return block
    if 'INSERT INTO market' not in block or 'currency' not in block:
        raise ValueError('маршрут market/sell не сохраняет колонку currency')
    block,n=re.subn(
        r"const\s*\{\s*item\s*,\s*quantity\s*,\s*price(?:\s*,\s*currency(?::\s*\w+)?)?\s*\}\s*=\s*req\.body\s*;",
        "const { item, quantity, price, currency: requestedCurrency } = req.body;",
        block,count=1)
    if n!=1 and "currency: requestedCurrency" not in block:
        raise ValueError('не удалось найти разбор полей market/sell')
    replacement="        const currency = requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'; // "+SELL_MARKER
    block,n=re.subn(
        r"^[ \t]*const currency\s*=.*?;[^\n]*$",
        replacement,
        block,count=1,flags=re.M)
    if n!=1:
        anchor="        const prc = parseInt(price, 10);"
        if block.count(anchor)!=1: raise ValueError('не удалось установить проверку валюты market/sell')
        block=block.replace(anchor,anchor+"\n"+replacement,1)
    if not (
        "currency: requestedCurrency" in block and
        "requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" in block
    ):
        raise ValueError('market/sell после патча всё ещё не сохраняет выбранную валюту')
    return block

def patch_buy(block):
    # Current live server uses buyer/seller; older archived server family uses buyerData/sellerData.
    if "const buyer = safeParsePlayerData" in block and "const seller = safeParsePlayerData" in block:
        healthy = all(token in block for token in (
            "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'",
            "buyer.breedCredits=(Number(buyer.breedCredits)||0)-lot.price",
            "seller.breedCredits=(Number(seller.breedCredits)||0)+lot.price",
            "Недостаточно сталкоинов",
            "Недостаточно сталбайтов",
        ))
        if healthy:
            return block
        old_check="""            if ((Number(buyer.coins)||0) < lot.price) {
                const e=new Error('NO_COINS'); e.userMessage='Недостаточно Байт'; throw e;
            }"""
        new_check="""            const marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'; // MARKET_STALKCOINS_BUY_V2
            const buyerBalance = marketCurrency === 'stalkcoins'
                ? (Number(buyer.breedCredits) || 0)
                : (Number(buyer.coins) || 0);
            if (buyerBalance < lot.price) {
                const e=new Error('NO_MARKET_FUNDS');
                e.userMessage=marketCurrency === 'stalkcoins' ? 'Недостаточно сталкоинов' : 'Недостаточно сталбайтов';
                throw e;
            }"""
        if "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" not in block:
            if block.count(old_check)!=1:
                raise ValueError('не найдена проверка баланса текущего market/buy')
            block=block.replace(old_check,new_check,1)
        old_debit="            buyer.coins=(Number(buyer.coins)||0)-lot.price;"
        new_debit="""            if (marketCurrency === 'stalkcoins') {
                buyer.breedCredits=(Number(buyer.breedCredits)||0)-lot.price;
            } else {
                buyer.coins=(Number(buyer.coins)||0)-lot.price;
            }"""
        if "buyer.breedCredits=(Number(buyer.breedCredits)||0)-lot.price" not in block:
            if block.count(old_debit)!=1: raise ValueError('не найдено списание валюты текущего market/buy')
            block=block.replace(old_debit,new_debit,1)
        old_credit="            seller.coins=(Number(seller.coins)||0)+lot.price;"
        new_credit="""            if (marketCurrency === 'stalkcoins') {
                seller.breedCredits=(Number(seller.breedCredits)||0)+lot.price;
            } else {
                seller.coins=(Number(seller.coins)||0)+lot.price;
            }"""
        if "seller.breedCredits=(Number(seller.breedCredits)||0)+lot.price" not in block:
            if block.count(old_credit)!=1: raise ValueError('не найдено начисление продавцу текущего market/buy')
            block=block.replace(old_credit,new_credit,1)
        required=(
            "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'",
            "buyer.breedCredits=(Number(buyer.breedCredits)||0)-lot.price",
            "seller.breedCredits=(Number(seller.breedCredits)||0)+lot.price",
            "Недостаточно сталкоинов","Недостаточно сталбайтов"
        )
        if not all(token in block for token in required):
            raise ValueError('текущий market/buy после патча не использует валюту лота во всех операциях')
        return block

    # Older route shape.
    healthy = all(token in block for token in (
        "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'",
        "buyerData.breedCredits = (Number(buyerData.breedCredits) || 0) - lot.price",
        "sellerData.breedCredits = (Number(sellerData.breedCredits) || 0) + lot.price",
        "Недостаточно сталкоинов",
        "Недостаточно сталбайтов",
    ))
    if healthy:
        return block

    new_check="""    const marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'; // MARKET_STALKCOINS_BUY_V2
    const buyerBalance = marketCurrency === 'stalkcoins'
        ? (Number(buyerData.breedCredits) || 0)
        : (Number(buyerData.coins) || 0);
    if (buyerBalance < lot.price) {
        return res.json({ success: false, error: marketCurrency === 'stalkcoins' ? 'Недостаточно сталкоинов' : 'Недостаточно сталбайтов' });
    }"""

    partial=re.compile(
        r"^[ \t]*const marketCurrency\s*=.*?\n"
        r"[\s\S]*?^[ \t]*if \(buyerBalance < lot\.price\) \{\n"
        r"[\s\S]*?^[ \t]*\}",
        re.M)
    block,n=partial.subn(new_check,block,count=1)
    if n!=1:
        old=re.search(r"^\s*if \(\(buyerData\.coins \|\| 0\) < lot\.price\) return res\.json\(\{ success: false, error: '[^']+' \}\);(?:\s*//[^\n]*)?\s*$",block,re.M)
        if not old: raise ValueError('не найдена проверка баланса market/buy')
        block=block[:old.start()]+new_check+block[old.end():]

    debit_stalk="buyerData.breedCredits = (Number(buyerData.breedCredits) || 0) - lot.price"
    if debit_stalk not in block:
        old_debit="    buyerData.coins -= lot.price;"
        if block.count(old_debit)!=1: raise ValueError('не найдено списание валюты market/buy')
        block=block.replace(old_debit,"""    if (marketCurrency === 'stalkcoins') buyerData.breedCredits = (Number(buyerData.breedCredits) || 0) - lot.price;
    else buyerData.coins = (Number(buyerData.coins) || 0) - lot.price;""",1)

    credit_stalk="sellerData.breedCredits = (Number(sellerData.breedCredits) || 0) + lot.price"
    if credit_stalk not in block:
        old_credit="            sellerData.coins = (sellerData.coins || 0) + lot.price;"
        if block.count(old_credit)!=1: raise ValueError('не найдено начисление продавцу market/buy')
        block=block.replace(old_credit,"""            if (marketCurrency === 'stalkcoins') sellerData.breedCredits = (Number(sellerData.breedCredits) || 0) + lot.price;
            else sellerData.coins = (Number(sellerData.coins) || 0) + lot.price;""",1)

    required=(
        "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'",
        debit_stalk,credit_stalk,"Недостаточно сталкоинов","Недостаточно сталбайтов"
    )
    if not all(token in block for token in required):
        raise ValueError('market/buy после патча не использует валюту лота во всех операциях')
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
    # Final fail-closed verification: an old V1 marker alone is never treated as success.
    _,_,sell_check=route_slice(source,SELL_START,SELL_END)
    _,_,buy_check=route_slice(source,BUY_START,BUY_END)
    if "requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" not in sell_check:
        raise ValueError('проверка market/sell не пройдена')
    if "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" not in buy_check:
        raise ValueError('проверка market/buy не пройдена: валюта лота')
    current_ok=(
        "buyer.breedCredits=(Number(buyer.breedCredits)||0)-lot.price" in buy_check and
        "seller.breedCredits=(Number(seller.breedCredits)||0)+lot.price" in buy_check
    )
    legacy_ok=(
        "buyerData.breedCredits = (Number(buyerData.breedCredits) || 0) - lot.price" in buy_check and
        "sellerData.breedCredits = (Number(sellerData.breedCredits) || 0) + lot.price" in buy_check
    )
    if not (current_ok or legacy_ok):
        raise ValueError('проверка market/buy не пройдена: списание/начисление сталкоинов')
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
