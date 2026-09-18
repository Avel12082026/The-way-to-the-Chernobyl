"""Full client regression tests with isolated state and no live networking."""
import asyncio, json, re, mimetypes, sys
from pathlib import Path
from urllib.parse import urlsplit, unquote
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation/trade-hold-warehouse'
OUT.mkdir(parents=True, exist_ok=True)
TG = "window.Telegram={WebApp:{initData:'offline-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state = dict(nickname='Тест',health=103,maxHealth=150,hunger=80,thirst=80,level=600,
                 exp=0,radiation=0,coins=9999999,breedCredits=50,inventory={},warehouse={})
    writes, errors, checks = [], [], []
    placeholder_images = set()
    images = {p.name:p for p in ROOT.rglob('*') if p.is_file() and p.suffix.lower() in ('.png','.webp','.jpg','.jpeg','.svg')}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None,args=['--no-sandbox','--disable-dev-shm-usage'])
        context = await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block')
        async def resource(route):
            name = Path(unquote(urlsplit(route.request.url).path)).name
            f = images.get(name)
            if f: await route.fulfill(body=f.read_bytes(),content_type=mimetypes.guess_type(f.name)[0] or 'image/png')
            elif Path(name).suffix.lower() in ('.png','.jpg','.jpeg','.webp'):
                # Some icons exist only on the game server, never reach that server in a test.
                # A real image element with a deterministic fixture still exercises native hit testing.
                placeholder_images.add(name)
                await route.fulfill(body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/><text x="12" y="54">TEST</text></svg>',content_type='image/svg+xml')
            else: await route.abort()
        await context.route('**/*',resource)
        page = await context.new_page()
        page.set_default_timeout(7000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        async def api(path,payload):
            data = []
            if path.endswith('/player/private'): data = state
            elif path.endswith('/equipment/features'): data = {'artifactSlotTarget':True}
            elif '/faction' in path: data = {'success':True,'faction':None}
            elif path.endswith(('/shop/buy','/shop/sell','/scientists/buy','/scientists/sell','/warehouse/transfer','/raid/start','/raid/end')):
                writes.append({'path':path,'payload':payload})
                data = {'success':False,'error':'Unexpected fixture write'}
            return data
        await page.expose_function('__fixture',api)
        await page.evaluate(TG)
        await page.evaluate("""audio => {
          HTMLMediaElement.prototype.play=function(){return Promise.resolve()};
          const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},configurable:true});
          window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
            if(path.endsWith('pda-notification.mp3.b64'))return new Response(audio);
            if(path.includes('/api/'))return new Response(JSON.stringify(await window.__fixture(path,init.body?JSON.parse(init.body):{})),{headers:{'Content-Type':'application/json'}});
            return new Response('{}',{status:404});
          };
          window.__contextMenus=[];
        }""",(ROOT/'ui/pda-notification.mp3.b64').read_text())
        html = (ROOT/'index.html').read_text()
        def inline_script(m):
            src=m[1].split('?')[0];f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
            if 'defer' in m[0]: code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline_script,html)
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text()+'</style>' if (ROOT/m[1].split('?')[0]).is_file() else '',html)
        await page.set_content(html,wait_until='domcontentloaded')
        await page.evaluate("document.addEventListener('contextmenu',e=>queueMicrotask(()=>window.__contextMenus.push({blocked:e.defaultPrevented,target:e.target.id||e.target.tagName})),true)")
        await page.wait_for_function("window.TradeItemContextGuard?.version==='1.0.0' && player.nickname==='Тест'")
        names=await page.evaluate("[...new Set([...getShopCatalog().map(x=>x.name),detectors[0].name,armorItems[5].name])]")
        state['inventory']={n:10 for n in names}
        state['warehouse']={names[0]:2}
        await page.evaluate('(s)=>{Object.assign(player,s);updateUI()}',state)
        snapshot=await page.evaluate('JSON.stringify([player.inventory,player.warehouse,player.coins])')
        def cell(source,name):
            return page.locator('#tradeMenu [data-trade-source='+source+'][data-trade-name='+json.dumps(name,ensure_ascii=False)+']')
        async def dismiss():
            modal=page.locator('#itemInfoModal')
            if await modal.is_visible(): await modal.locator('button').last.click()
        async def hold(locator,duration=650):
            await locator.scroll_into_view_if_needed()
            b=await locator.bounding_box();assert b
            x=b['x']+b['width']/2;y=b['y']+b['height']/2
            cdp=await context.new_cdp_session(page)
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            await page.wait_for_timeout(duration)
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            await page.wait_for_timeout(100);await cdp.detach()
        async def menu_cancelled(locator):
            return await locator.evaluate("e=>{const v=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});e.dispatchEvent(v);return v.defaultPrevented}")
        for vendor in ('zhuchara','technician','leonov','friendly'):
            await page.evaluate("v=>{currentEnemy=v==='friendly'?{name:'Дружелюбный сталкер'}:null;TradeMenu.open(v)}",vendor)
            source=page.locator('#tradeStock [data-trade-source]').first
            name=await source.get_attribute('data-trade-name')
            assert await menu_cancelled(source)
            img=source.locator('img').first
            if await img.count():
                assert await img.evaluate("e=>getComputedStyle(e).pointerEvents")=='none'
                assert await menu_cancelled(img)
            await hold(source,1600 if vendor=='technician' else 650)
            assert await page.locator('#itemInfoModal').is_visible(),vendor
            assert name in await page.locator('#itemInfoModalTitle').text_content()
            assert await cell('buy',name).count()==0
            modal=page.locator('#itemInfoModal')
            assert await menu_cancelled(modal)
            preview=modal.locator('img').first
            if await preview.count():
                assert await preview.evaluate("e=>getComputedStyle(e).pointerEvents")=='none'
                assert await menu_cancelled(preview)
                await hold(preview)
                assert await modal.is_visible()
            if vendor=='technician': await page.screenshot(path=str(OUT/'diesel-item-info-390.png'))
            await dismiss();await page.wait_for_timeout(700)
            await source.tap();assert await cell('buy',name).count()==1
            assert not await modal.is_visible()
            assert await menu_cancelled(cell('buy',name))
            await cell('buy',name).tap();assert await cell('buy',name).count()==0
            await page.wait_for_timeout(700)
            await hold(cell('inventory',name))
            assert await modal.is_visible()
            assert await cell('sell',name).count()==0
            await dismiss();await page.wait_for_timeout(700)
            checks.append(vendor+': source/backpack hold shows game info only; preview and staging context menus cancelled; short tap still stages/unstages')
        await page.evaluate("currentEnemy=null;TradeMenu.open('zhuchara')")
        source=page.locator('#tradeStock [data-trade-source]').first
        name=await source.get_attribute('data-trade-name')
        await source.scroll_into_view_if_needed()
        a=await source.bounding_box();b=await page.locator('#tradeBuySlots').bounding_box()
        cdp=await context.new_cdp_session(page)
        x=a['x']+a['width']/2;y=a['y']+a['height']/2;tx=b['x']+b['width']/2;ty=b['y']+b['height']/2
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        await page.wait_for_timeout(270)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+12,'y':y+12}]})
        assert await page.locator('.trade-drag-ghost').count()==1
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':tx,'y':ty}]})
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await cdp.detach()
        assert await cell('buy',name).count()==1
        assert await page.locator('.trade-drag-ghost').count()==0
        assert not await page.locator('#itemInfoModal').is_visible()
        checks.append('Hold-and-drag still stages one item; no native dragging or accidental info modal')
        assert await page.evaluate('JSON.stringify([player.inventory,player.warehouse,player.coins])')==snapshot
        assert not writes,writes
        await page.evaluate("openScreen('main');currentEnemy=null;raidActive=false;inventoryOpenedFromRaid=false;openScreen('warehouse')")
        warehouse=page.locator('#warehouseScreen')
        assert await warehouse.is_visible()
        for w,h in [(390,844),(320,568),(844,390)]:
            await page.set_viewport_size({'width':w,'height':h})
            texts=' '.join(await warehouse.locator('button').all_text_contents()).casefold()
            for forbidden in ('выйти из склада','техник дизель','эколог леонов'): assert forbidden not in texts,texts
            assert 'положить всё' in texts and 'забрать всё' in texts
            assert await warehouse.locator('.back-btn').count()==1
            assert await page.locator('#warehouseGrid [data-drag-item]').count()>0
            assert await page.locator('#warehouseInventoryGrid [data-drag-item]').count()>0
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            await page.screenshot(path=str(OUT/f'warehouse-{w}.png'),full_page=True)
        await warehouse.locator('.back-btn').click()
        assert await page.locator('#mainMenu').is_visible()
        checks.append('Warehouse: three controls removed from DOM; Back returns to main; both transfer buttons/grids retained at 390,320,844 px')
        menus=await page.evaluate('window.__contextMenus')
        assert menus and all(e['blocked'] for e in menus),menus
        assert await page.evaluate("""()=>{
          const input=document.createElement('input');document.querySelector('#itemInfoModal').append(input);
          const image=document.createElement('img');document.body.append(image);
          const out=[input,image].map(e=>{const v=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});e.dispatchEvent(v);return !v.defaultPrevented});
          input.remove();image.remove();return out.every(Boolean);
        }""")
        checks.append('Guard is scoped: editable fields and unrelated images retain their normal context menus')
        assert not errors,errors
        assert not writes,writes
        report=dict(status='passed',checks=checks,context_menu_events=len(menus),page_errors=errors,live_player_writes=0,
                    placeholder_images=sorted(placeholder_images),
                    not_verified='Native Android/Telegram bottom-sheet rendering on a physical phone; Chromium touch emulation and cancellable event tests used')
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False));await browser.close()

asyncio.run(main())
