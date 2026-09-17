"""Focused full-client regression for the 2026-09-18 trade/hub corrections. No live writes."""
import asyncio, base64, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation' / 'trade-v2'
OUT.mkdir(parents=True, exist_ok=True)
TG = "window.Telegram={WebApp:{initData:'offline-trade-v2',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    calls, errors = [], []
    state = dict(nickname='Тест',health=103,maxHealth=150,hunger=100,thirst=100,coins=9999999,
                 breedCredits=7,level=600,exp=123,radiation=0,inventory={},warehouse={})
    zh_b64=(ROOT/'ui/zhuchara-portrait.webp.b64').read_text().strip()
    leonov_b64=(ROOT/'ui/leonov-portrait.webp.b64').read_text().strip()

    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844},has_touch=True)
        page.set_default_timeout(7000)
        page.on('pageerror',lambda e:errors.append(str(e)))

        async def fixture(path,payload):
            calls.append({'path':path,'payload':payload})
            if path.endswith('/player/private'): return state
            if path.endswith('/named-artifacts'): return []
            if path.endswith('/shop/buy'):
                name=payload.get('name'); qty=int(payload.get('qty') or 1)
                state['inventory'][name]=state['inventory'].get(name,0)+qty
                return {'success':True,'inventory':state['inventory'],'warehouse':state['warehouse'],'coins':state['coins'],'breedCredits':state['breedCredits'],'intellect':0}
            if path.endswith('/shop/sell') or path.endswith('/scientists/sell'):
                name=payload.get('name'); qty=int(payload.get('qty') or 1)
                state['inventory'][name]=max(0,state['inventory'].get(name,0)-qty)
                return {'success':True,'inventory':state['inventory'],'warehouse':state['warehouse'],'coins':state['coins']+10,'breedCredits':state['breedCredits'],'intellect':0}
            if path.endswith('/warehouse/transfer'):
                return {'success':True,'inventory':state['inventory'],'warehouse':state['warehouse'],'coins':state['coins'],'breedCredits':state['breedCredits']}
            if '/faction' in path: return {'success':True,'faction':None}
            return []
        async def asset(path):
            if path.endswith('/ui/zhuchara-portrait.webp.b64'): return zh_b64
            if path.endswith('/ui/leonov-portrait.webp.b64'): return leonov_b64
            return ''
        await page.expose_function('__tradeV2Fixture',fixture)
        await page.expose_function('__tradeV2Asset',asset)
        await page.evaluate(TG)
        await page.evaluate("""() => {window.fetch=async(input,init={})=>{
          const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
          if(path.startsWith('/ui/')&&path.endsWith('.b64')){const data=await window.__tradeV2Asset(path);return new Response(data,{status:data?200:404});}
          const data=path.includes('/api/')?await window.__tradeV2Fixture(path,init.body?JSON.parse(init.body):{}):{};
          return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
        }}""")

        html=(ROOT/'index.html').read_text()
        def inline_script(m):
            src=m.group(1).split('?')[0]; f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else (f.read_text() if f.is_file() else '')
            if 'defer' in m.group(0): code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline_script,html)
        def inline_css(m):
            f=ROOT/m.group(1).split('?')[0]
            return '<style>'+f.read_text()+'</style>' if f.is_file() else ''
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',inline_css,html)
        artwork=ROOT/'file_000000002bb08210800056ebfb1dce1f.png'
        html=html.replace(artwork.name+'?v=0503d3b544d1','data:image/png;base64,'+base64.b64encode(artwork.read_bytes()).decode())
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("window.TradeMenu?.version==='1.1.0' && window.TraderHubs?.version==='1.0.1'")

        data=await page.evaluate("({catalog:getShopCatalog(),detector:detectors[0].name,items:getShopCatalog().slice(0,35).map(x=>x.name)})")
        inv={name:3 for name in data['items'][:30]}
        state['inventory']=inv.copy()
        await page.evaluate('(inv)=>{player.level=600;player.coins=9999999;player.inventory=inv;updateUI()}',inv)

        # Zhuchara opens a portrait hub first; three actions stay on one bottom row.
        await page.locator('#bunkerZhuchara').click()
        await page.wait_for_timeout(100)
        assert await page.locator('#zhucharaHubScreen').is_visible()
        assert not await page.locator('#tradeMenu').is_visible()
        await page.wait_for_function("document.getElementById('zhucharaHubArtwork').naturalWidth>0")
        assert await page.locator('#zhucharaHubArtwork').evaluate('(e)=>e.naturalWidth')==240
        zh_buttons=page.locator('#zhucharaHubScreen .trader-portrait-actions button')
        assert await zh_buttons.all_inner_texts()==['Торговля','Говорить','Назад']
        ys=await zh_buttons.evaluate_all('(xs)=>xs.map(x=>Math.round(x.getBoundingClientRect().top))')
        assert len(set(ys))==1,ys
        await page.screenshot(path=str(OUT/'zhuchara-hub-390x844.png'))

        await page.locator('[data-zhuchara-action=trade]').click()
        assert await page.locator('#tradeMenu').is_visible()
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='zhuchara'

        # Merchant/player grids expose the same 7x3 viewport and scroll independently.
        sizes=await page.evaluate("""() => {
          const s=document.getElementById('tradeStockScroll'),i=document.getElementById('tradeInventory');
          return {sh:s.clientHeight,ih:i.clientHeight,ss:s.scrollHeight,is:i.scrollHeight,
                  so:getComputedStyle(s).overflowY,io:getComputedStyle(i).overflowY};
        }""")
        assert abs(sizes['sh']-sizes['ih'])<=2,sizes
        assert sizes['ss']>sizes['sh'] and sizes['is']>sizes['ih'],sizes
        assert sizes['so']=='auto' and sizes['io']=='auto',sizes

        # Fill both staging areas far enough to require their own scrolling.
        stock_names=await page.locator('#tradeStock [data-trade-source=stock]').evaluate_all('(xs)=>xs.slice(0,10).map(x=>x.dataset.tradeName)')
        inv_names=await page.locator('#tradeInventory [data-trade-source=inventory]:not(.trade-not-accepted)').evaluate_all('(xs)=>xs.slice(0,10).map(x=>x.dataset.tradeName)')
        for name in stock_names: await page.locator(f'#tradeStock [data-trade-name={json.dumps(name,ensure_ascii=False)}]').click()
        for name in inv_names: await page.locator(f'#tradeInventory [data-trade-name={json.dumps(name,ensure_ascii=False)}]').click()
        staging=await page.evaluate("""() => Object.fromEntries(['tradeBuySlots','tradeSellSlots'].map(id=>{const e=document.getElementById(id);return [id,{h:e.clientHeight,sh:e.scrollHeight,o:getComputedStyle(e).overflowY}]}))""")
        for value in staging.values():
            assert value['o']=='auto' and value['sh']>value['h'],staging
        await page.screenshot(path=str(OUT/'trade-scrolls-390x844.png'))

        # Close Zhuchara trade -> portrait hub, then verify Leonov's four actions in one bottom row.
        await page.locator('[data-trade-action=back]').click()
        assert await page.locator('#zhucharaHubScreen').is_visible()
        await page.evaluate("openScreen('main')")
        await page.locator('#bunkerLeonov').click()
        await page.wait_for_timeout(100)
        leonov_actions=page.locator('#leonovHubScreen .leonov-actions [data-leonov-action]')
        assert await leonov_actions.all_inner_texts()==['Селекция','Торговля','Говорить','Назад']
        lys=await leonov_actions.evaluate_all('(xs)=>xs.map(x=>Math.round(x.getBoundingClientRect().top))')
        assert len(set(lys))==1,lys
        await page.screenshot(path=str(OUT/'leonov-bottom-row-390x844.png'))

        # Leonov no longer sells detectors.
        await page.locator('#leonovHubScreen [data-leonov-action=trade]').click()
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='leonov'
        assert await page.locator(f'#tradeStock [data-trade-name={json.dumps(data["detector"],ensure_ascii=False)}]').count()==0

        # Diesel sells detectors; staged purchase sends technician + detector to the existing shop endpoint.
        await page.evaluate("openScreen('main');openScreen('technician');openTechnicianTab('sell')")
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='technician'
        detector=page.locator(f'#tradeStock [data-trade-name={json.dumps(data["detector"],ensure_ascii=False)}]')
        assert await detector.count()==1
        await detector.click()
        await page.locator('#tradeBuy').click(); await page.wait_for_timeout(200)
        writes=[c for c in calls if c['path'].endswith('/shop/buy')]
        assert writes and writes[-1]['payload']['vendor']=='technician',writes[-1] if writes else None
        assert writes[-1]['payload']['category']=='detector'
        assert writes[-1]['payload']['name']==data['detector']

        # Mobile and landscape: no horizontal overflow in hubs/trade.
        for w,h in [(320,568),(390,844),(844,390)]:
            await page.set_viewport_size({'width':w,'height':h})
            await page.evaluate("openScreen('main');openScreen('shop')")
            await page.wait_for_timeout(60)
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            boxes=await page.locator('#zhucharaHubScreen .trader-portrait-actions button').evaluate_all('(xs)=>xs.map(x=>x.getBoundingClientRect()).map(r=>({l:r.left,r:r.right,t:r.top,b:r.bottom}))')
            assert all(b['l']>=-1 and b['r']<=w+1 and b['t']>=-1 and b['b']<=h+1 for b in boxes),boxes
            await page.locator('[data-zhuchara-action=trade]').click()
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')

        assert not errors,errors
        report={'status':'passed','live_player_writes':0,'page_errors':errors,'viewports':3,
                'checks':['equal 7x3 merchant/player viewports','merchant scroll','inventory scroll','buy staging scroll','sell staging scroll','Leonov 4-button bottom row','Zhuchara portrait and 3-button bottom row','Leonov detectors removed','Diesel detectors present','technician detector buy payload']}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        await browser.close()

asyncio.run(main())
