"""Browser regression for renamed resources and dual-currency player market. No live writes."""
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation/terminology-market'
OUT.mkdir(parents=True,exist_ok=True)
TG="window.Telegram={WebApp:{initData:'offline-market-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    calls=[]; errors=[]
    state={'nickname':'Тест','health':100,'maxHealth':100,'hunger':100,'thirst':100,'level':50,'exp':0,
           'radiation':0,'coins':9999,'breedCredits':4,'inventory':{},'warehouse':{}}
    lots=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,service_workers='block')
        page=await context.new_page(); page.set_default_timeout(7000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        await context.route('**/*',lambda route:route.abort())

        async def fixture(path,payload):
            if path.endswith('/player/private'): return {'status':200,'data':state}
            if path.endswith('/market') and path.endswith('/api/market'): return {'status':200,'data':lots}
            if path.endswith('/market/sell'):
                calls.append({'path':path,'payload':payload})
                return {'status':200,'data':{'success':True}}
            if path.endswith('/market/buy'):
                calls.append({'path':path,'payload':payload})
                return {'status':200,'data':{'success':False,'error':'fixture prevents purchase'}}
            if path.endswith('/artifacts'): return {'status':200,'data':[]}
            if '/faction' in path: return {'status':200,'data':{'success':True,'faction':None}}
            if '/chat/' in path or '/friends/' in path: return {'status':200,'data':[]}
            return {'status':200,'data':[]}

        await page.expose_function('__fixture',fixture)
        await page.evaluate(TG)
        await page.evaluate("""() => {
          const store=new Map();
          Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},configurable:true});
          window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
            if(path.includes('/api/')){
              const x=await window.__fixture(path,init.body?JSON.parse(init.body):{});
              return new Response(JSON.stringify(x.data),{status:x.status,headers:{'Content-Type':'application/json'}});
            }
            return new Response('{}',{status:404});
          };
        }""")

        html=(ROOT/'index.html').read_text(encoding='utf-8')
        def inline_script(m):
            src=m[1].split('?')[0]; f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else (f.read_text(encoding='utf-8') if f.is_file() else '')
            if 'defer' in m[0]: code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline_script,html)
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text(encoding='utf-8')+'</style>' if (ROOT/m[1].split('?')[0]).is_file() else '',html)
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("window.TerminologyMarketPatch?.version==='1.0.0' && typeof renderMarket==='function'")
        await page.evaluate('(s)=>{Object.assign(player,s);updateUI()}',state)

        # Bunker labels + spelling correction function.
        labels=await page.locator('#bunkerScene .bunker-resource>span:first-child').all_inner_texts()
        assert labels==['Сталбайты','Сталкоины','Опыт+'],labels
        assert await page.locator('#chatBackToKpkBtn').inner_text()=='Назад'
        words=await page.evaluate("""() => [
          TerminologyMarketPatch.rewriteText('Тушенка'),
          TerminologyMarketPatch.rewriteText('Псевдо собака'),
          TerminologyMarketPatch.rewriteText('Пси собака'),
          TerminologyMarketPatch.rewriteText('Электро химера'),
          TerminologyMarketPatch.rewriteText('Рука покрытая перьями')
        ]""")
        assert words==['Тушёнка','Псевдособака','Пси-собака','Электрохимера','Рука, покрытая перьями'],words

        # Choose a genuine weapon so it belongs to the market's weapon category.
        weapon=await page.evaluate('weapons.find(w=>!w.adminOnly).name')
        state['inventory']={weapon:3}
        await page.evaluate('(inv)=>{player.inventory=inv;updateUI()}',state['inventory'])

        # Sell for Stalcoins: currency must be sent to the server with total price.
        await page.evaluate("""() => {
          window.__promptQueue=['2','2','3'];
          window.prompt=()=>window.__promptQueue.shift();
        }""")
        await page.evaluate('(name)=>listItemForSale(name)',weapon)
        await page.wait_for_timeout(150)
        assert calls and calls[-1]['path'].endswith('/market/sell'),calls
        assert calls[-1]['payload']['currency']=='stalkcoins',calls[-1]
        assert calls[-1]['payload']['quantity']==2,calls[-1]
        assert calls[-1]['payload']['price']==6,calls[-1]

        # Buy list must respect the correct balance for each lot currency.
        lots[:] = [
          {'id':11,'seller_id':'202','seller_username':'Продавец','item':weapon,'quantity':1,'price':5,'currency':'stalkcoins'},
          {'id':12,'seller_id':'203','seller_username':'Продавец 2','item':weapon,'quantity':1,'price':100,'currency':'bytes'}
        ]
        await page.evaluate("""() => { marketTab='buy'; marketCategory='Оружие'; renderMarket(); }""")
        await page.wait_for_timeout(150)
        cards=page.locator('#marketBuyList .shop-item')
        assert await cards.count()==2
        text=await page.locator('#marketBuyList').inner_text()
        assert '5 сталкоинов' in text,text
        assert '100 сталбайтов' in text,text
        stalk_button=cards.nth(0).locator('button',has_text='Купить')
        byte_button=cards.nth(1).locator('button',has_text='Купить')
        assert await stalk_button.is_disabled()
        assert not await byte_button.is_disabled()

        await page.evaluate("player.breedCredits=5;renderMarket()")
        await page.wait_for_timeout(80)
        assert not await page.locator('#marketBuyList .shop-item').nth(0).locator('button',has_text='Купить').is_disabled()

        await page.screenshot(path=str(OUT/'market-stalcoins-390x844.png'),full_page=True)
        assert not errors,errors
        report={'status':'passed','live_writes':0,'mock_market_writes':calls,'checks':[
            'Stalbytes/Stalcoins/XP+ bunker labels','Назад spelling','display spelling aliases',
            'sell lot sends stalkcoins currency','Stalcoin lot uses breedCredits balance','Stalbyte lot uses coins balance']}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False))
        await browser.close()

asyncio.run(main())
