#!/usr/bin/env python3
"""Install Yantar trade fixes: Vizir for 200 stalkcoins and Leonov gear buyback."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile, time

VIZIR_MARK='// DIESEL_VIZIR_STALKCOIN_V1'
VIZIR_ROUTE=r"""// DIESEL_VIZIR_STALKCOIN_V1
const DIESEL_VIZIR_STALKCOIN_PRICE=200;
app.post('/api/shop/buy',requireAuth,rateLimit('shop-buy-vizir',10,10000),(req,res,next)=>{
    const sourceVendor=String(req.body?.sourceVendor||req.body?.vendor||'');
    const category=String(req.body?.category||'');
    const name=String(req.body?.name||'');
    if(sourceVendor!=='technician'||category!=='detector'||name!=='ВИЗИРЬ')return next();
    const qty=Number(req.body?.qty??1);
    if(qty!==1)return res.status(400).json({success:false,error:'ВИЗИРЬ покупается по одному'});
    const playerId=String(req.telegramUser.id);
    const row=db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
    if(!row)return res.status(404).json({success:false,error:'Игрок не найден'});
    const item=SHOP_DETECTORS.find(d=>d&&d.name==='ВИЗИРЬ');
    if(!item)return res.status(404).json({success:false,error:'Детектор ВИЗИРЬ не найден'});
    const data=safeParsePlayerData(row.data);
    data.inventory=data.inventory&&typeof data.inventory==='object'?data.inventory:{};
    data.coins=Number(data.coins)||0;
    data.breedCredits=Number(data.breedCredits)||0;
    if(data.breedCredits<DIESEL_VIZIR_STALKCOIN_PRICE)
        return res.json({success:false,error:'Недостаточно сталкоинов. Нужно 200'});
    if(countNonStackingSlotsServer(data.inventory)>=50)
        return res.json({success:false,error:'Достигнут предел в 50 разных единиц снаряжения в инвентаре'});
    let finalName=item.name;
    while(Number(data.inventory[finalName])>0){
        let suffix='';
        for(let i=0;i<16;i++)suffix+=Math.random()<0.5?'\u200B':'\u200C';
        finalName=item.name+suffix;
    }
    data.breedCredits-=DIESEL_VIZIR_STALKCOIN_PRICE;
    data.inventory[finalName]=1;
    db.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(data),playerId);
    return res.json({success:true,coins:data.coins,breedCredits:data.breedCredits,inventory:data.inventory});
});

"""

def patch(source):
    text=source;changed=False
    if VIZIR_MARK not in text:
        anchor='// CORDON_TECHNICIAN_DETECTOR_BUY_V1'
        if anchor not in text: raise RuntimeError('Не найден маршрут покупки детекторов Дизеля.')
        text=text.replace(anchor,VIZIR_ROUTE+anchor,1);changed=True

    old="""        } else if (category === 'detector') {
            item = SHOP_DETECTORS.find(d => d.name === name);
            if (!item) return res.json({ success: false, error: 'Детектор не найден' });
        } else if (category === 'armor') {"""
    new="""        } else if (category === 'detector') {
            item = SHOP_DETECTORS.find(d => d.name === name);
            if (!item) return res.json({ success: false, error: 'Детектор не найден' });
            if (item.specialOnly) return res.json({ success: false, error: 'ВИЗИРЬ продаётся у Дизеля за 200 сталкоинов' });
        } else if (category === 'armor') {"""
    if old in text:
        text=text.replace(old,new,1);changed=True
    elif new not in text:
        raise RuntimeError('Не найдена проверка specialOnly детектора.')

    old="""    const resolved = resolveSellPriceServer(name, playerId);
    if (resolved.category !== 'artifact' && resolved.category !== 'loot') {
        return res.json({ success: false, error: 'Леонов покупает только артефакты и части тел мутантов' });
    }"""
    new="""    const resolved = resolveSellPriceServer(name, playerId);
    if (!['artifact','loot','weapon','armor'].includes(resolved.category)) {
        return res.json({ success: false, error: 'Леонов покупает артефакты, трофеи мутантов, оружие и броню' });
    }"""
    if old in text:
        text=text.replace(old,new,1);changed=True
    elif new not in text:
        raise RuntimeError('Не найдена проверка ассортимента Леонова.')

    old="    const markup = resolved.category === 'artifact' ? 1.35 : 1.20;"
    new="    const markup = resolved.category === 'artifact' ? 1.35 : (resolved.category === 'loot' ? 1.20 : 1);"
    if old in text:
        text=text.replace(old,new,1);changed=True
    elif new not in text:
        raise RuntimeError('Не найдена наценка выкупа Леонова.')

    old_comment="""// Продажа Эколог Леонову — артефакты (базовые/гибриды +35%, именные — 50 Жетонов сталкера
// строго по одному) и части тел мутантов (+20%)"""
    new_comment="""// Продажа Эколог Леонову — артефакты (базовые/гибриды +35%, именные — 50 сталкоинов
// строго по одному), части тел мутантов (+20%), оружие и броня (базовая цена продажи)"""
    if old_comment in text:
        text=text.replace(old_comment,new_comment,1);changed=True
    return text,changed

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('server',nargs='?',default='/var/www/pocketzone/server.js',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args();path=args.server.resolve(strict=True)
    old=path.read_bytes();new,changed=patch(old.decode('utf-8'))
    with tempfile.TemporaryDirectory(prefix='yantar-trade-check-') as td:
        candidate=Path(td)/'server.js';candidate.write_text(new,encoding='utf-8')
        subprocess.run(['node','--check',str(candidate)],check=True,timeout=30)
    if args.check:
        print('YANTAR_TRADE_FIXES: проверка пройдена; файлы не изменены.');return
    if not changed:
        print('YANTAR_TRADE_FIXES уже установлены.');return
    if os.geteuid()!=0: raise RuntimeError('Установку нужно запускать от root.')
    backup=path.with_name(path.name+'.before-yantar-trade-'+time.strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(path,backup)
    fd,tmp=tempfile.mkstemp(prefix='.yantar-trade-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as h:
            h.write(new);h.flush();os.fsync(h.fileno())
        shutil.copystat(path,tmp);st=path.stat();os.chown(tmp,st.st_uid,st.st_gid)
        if path.read_bytes()!=old: raise RuntimeError('server.js изменился во время установки')
        os.replace(tmp,path)
        subprocess.run(['node','--check',str(path)],check=True,timeout=30)
        subprocess.run(['systemctl','restart','pocketzone.service'],check=True,timeout=45)
        state=subprocess.run(['systemctl','is-active','pocketzone.service'],capture_output=True,text=True,timeout=15)
        if state.stdout.strip()!='active': raise RuntimeError('pocketzone.service не активен')
        print('YANTAR_TRADE_FIXES установлены. Backup:',backup)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        shutil.copy2(backup,path)
        subprocess.run(['systemctl','restart','pocketzone.service'],check=False,timeout=45)
        raise

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('СТОП:',e);raise SystemExit(1)
