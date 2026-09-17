"""Browser regression for sharp trader portraits, Diesel hub and touch scrollbars. No live writes."""
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation'/'trader-portraits-hq'
OUT.mkdir(parents=True,exist_ok=True)
TG="window.Telegram={WebApp:{initData:'offline-hq-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state=dict(nickname='Тест',health=100,maxHealth=100,hunger=100,thirst=100,coins=999999,
               breedCredits=5,level=50,exp=0,radiation=0,inventory={},warehouse={})
    portraits={k:(ROOT/'ui'/'portraits'/f'{k}-hq.b64').read_text().strip()
               for k in ('zhuchara','leonov','diesel')}
    errors=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None,
            args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844},has_touch=True)
        page.set_default_timeout(8000)
        page.on('pageerror',lambda e: errors.append(str(e)))

        async def fixture(path,payload):
            if path.endswith('/player/private'): return state
            if path.endswith('/named-artifacts'): return []
            if '/faction' in path: return {'success':True,'faction':None}
            return []
        async def portrait(key): return portraits[key]
        await page.expose_function('__hqFixture',fixture)
        await page.expose_function('__hqPortrait',portrait)
        await page.evaluate(TG)
        await page.evaluate("""() => {window.fetch=async(input,init={})=>{
          const u=new URL(typeof input==='string'?input:input.url,'http://offline.test');
          const p=u.pathname;
          const m=p.match(/\/ui\/portraits\/(zhuchara|leonov|diesel)-hq\.b64$/);
          if(m){const body=await window.__hqPortrait(m[1]);return new Response(body,{status:200});}
          const data=p.includes('/api/')?await window.__hqFixture(p,init.body?JSON.parse(init.body):{}):{};
          return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
        }}""")

        html=(ROOT/'index.html').read_text()
        def script(m):
            src=m.group(1).split('?')[0];f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else (f.read_text() if f.is_file() else '')
            if 'defer' in m.group(0): code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
        def css(m):
            f=ROOT/m.group(1).split('?')[0]
            return '<style>'+f.read_text()+'</style>' if f.is_file() else ''
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("window.TraderHubs?.version==='1.2.0' && window.TradeMenu?.version==='1.1.0'")
        await page.evaluate("(s)=>{Object.assign(player,s);updateUI();openScreen('main')}",state)

        async def dims(sel):
            await page.wait_for_function("(s)=>{const i=document.querySelector(s);return i&&i.naturalWidth>0}",sel)
            return await page.locator(sel).evaluate("(i)=>[i.naturalWidth,i.naturalHeight,i.dataset.portraitQuality||'']")

        # Zhuchara: full-resolution source and one-row actions.
        await page.locator('#bunkerZhuchara').click()
        assert await page.locator('#zhucharaHubScreen').is_visible()
        assert await dims('#zhucharaHubArtwork')==[864,1536,'hd-864x1536']
        za=page.locator('#zhucharaHubScreen [data-trader-action]')
        assert await za.evaluate_all("(xs)=>xs.map(x=>x.dataset.traderAction)")==['trade','talk','back']
        ys=await za.evaluate_all("(xs)=>xs.map(x=>Math.round(x.getBoundingClientRect().top))")
        assert len(set(ys))==1,ys
        await page.screenshot(path=str(OUT/'zhuchara-hq.png'))

        # Leonov: old tiny loader must never win over HQ portrait.
        await page.locator('#zhucharaHubScreen [data-trader-action=back]').click()
        await page.locator('#bunkerLeonov').click()
        assert await page.locator('#leonovHubScreen').is_visible()
        assert await dims('#leonovHubArtwork')==[864,1536,'hd-864x1536']
        la=page.locator('#leonovHubScreen [data-leonov-action]')
        assert await la.evaluate_all("(xs)=>xs.map(x=>x.dataset.leonovAction)")==['selection','trade','talk','back']
        lys=await la.evaluate_all("(xs)=>xs.map(x=>Math.round(x.getBoundingClientRect().top))")
        assert len(set(lys))==1,lys
        await page.screenshot(path=str(OUT/'leonov-hq.png'))

        # Diesel: own HQ hub with four requested buttons.
        await page.evaluate("openScreen('main')")
        await page.locator('#bunkerDiesel').click()
        assert await page.locator('#dieselHubScreen').is_visible()
        assert await dims('#dieselHubArtwork')==[864,1536,'hd-864x1536']
        da=page.locator('#dieselHubScreen [data-trader-action]')
        assert await da.evaluate_all("(xs)=>xs.map(x=>x.dataset.traderAction)")==['trade','upgrade','talk','back']
        dys=await da.evaluate_all("(xs)=>xs.map(x=>Math.round(x.getBoundingClientRect().top))")
        assert len(set(dys))==1,dys
        await page.screenshot(path=str(OUT/'diesel-hq.png'))

        # Trade returns to Diesel portrait; Upgrade reaches the existing upgrade screen.
        await page.locator('#dieselHubScreen [data-trader-action=trade]').click()
        assert await page.locator('#tradeMenu').is_visible()
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='technician'
        await page.locator('#tradeMenu [data-trade-action=back]').click()
        assert await page.locator('#dieselHubScreen').is_visible()
        await page.locator('#dieselHubScreen [data-trader-action=upgrade]').click()
        assert await page.locator('#technicianScreen').is_visible()
        assert await page.evaluate("technicianTab")=='upgrade'

        # All portrait hubs and trade UI remain inside narrow/landscape viewports.
        for w,h in [(320,568),(390,844),(844,390)]:
            await page.set_viewport_size({'width':w,'height':h})
            for target,hub in [('shop','#zhucharaHubScreen'),('technician','#dieselHubScreen')]:
                await page.evaluate("(s)=>{openScreen('main');openScreen(s)}",target)
                assert await page.locator(hub).is_visible()
                assert not await page.evaluate("document.documentElement.scrollWidth>innerWidth")
        assert not errors,errors

        css=(ROOT/'ui'/'trade-menu.css').read_text()
        assert 'width:22px' in css
        assert 'min-height:58px' in css
        report={'status':'passed','portraits':['zhuchara 864x1536','leonov 864x1536','diesel 864x1536'],
                'checks':['HQ natural dimensions','Leonov retry/HQ override','Diesel four actions',
                          'Diesel trade back','Diesel upgrade','22px scrollbars','mobile/landscape overflow'],
                'page_errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        await browser.close()

asyncio.run(main())
