"""Full-client regression with all networking intercepted; no live player writes."""
import asyncio
import base64
import re
from types import SimpleNamespace
import json
import mimetypes
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation' / 'trade-menu'
OUT.mkdir(parents=True, exist_ok=True)
TG = "window.Telegram={WebApp:{initData:'offline-trade-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state = dict(nickname='Тестовый сталкер', health=103, maxHealth=150, hunger=100, thirst=100,
                 coins=100000, breedCredits=7, level=6, exp=123, radiation=0, inventory={}, warehouse={})
    calls, errors = [], []
    mode = {'response': 'ok', 'reject_name': None, 'read_failure': False}
    prices = {}
    named = "Именной тестовый артефакт"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None, args=['--no-sandbox','--disable-dev-shm-usage'])
        context = await browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
        page = await context.new_page()
        page.set_default_timeout(5000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        async def route_handler(route):
            path = unquote(urlparse(route.request.url).path)
            if 'telegram-web-app.js' in path:
                return await route.fulfill(body=TG, content_type='text/javascript')
            if '/api/' not in path:
                relative = path.lstrip('/') or 'index.html'
                file = (ROOT/relative).resolve()
                if file.is_relative_to(ROOT) and file.is_file():
                    return await route.fulfill(path=str(file), content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
                return await route.fulfill(status=404, body='offline fixture: unavailable asset')
            payload = route.request.post_data_json if route.request.post_data else {}
            calls.append({'path':path,'payload':payload})
            if path.endswith('/named-artifacts'):
                return await route.fulfill(json=[{'name':named,'stats':{'health':10}}])
            if path.endswith('/player/private'):
                if mode['read_failure']: return await route.abort('failed')
                return await route.fulfill(json=state)
            writes = ('/shop/buy','/shop/sell','/scientists/sell','/friendly/buy','/warehouse/transfer')
            if path.endswith(writes):
                await asyncio.sleep(.12)
                name = payload.get('name', payload.get('item'))
                qty = payload.get('qty',1)
                if mode['response']=='reject' or name==mode['reject_name']:
                    return await route.fulfill(json={'success':False,'error':'Тестовый отказ сервера'})
                if mode['response']=='network': return await route.abort('failed')
                if path.endswith('/warehouse/transfer'):
                    state['inventory'][name]-=qty
                    state['warehouse'][name]=state['warehouse'].get(name,0)+qty
                elif path.endswith('/buy'):
                    state['inventory'][name]=state['inventory'].get(name,0)+qty
                    state['coins']-=prices.get(name,10)*qty
                else:
                    assert state['inventory'].get(name,0)>=qty, (name, qty)
                    state['inventory'][name]-=qty
                    if name==named and path.endswith('/scientists/sell'): state['breedCredits']+=50*qty
                    else: state['coins']+=100*qty
                if mode['response']=='lost_after_commit': return await route.abort('failed')
                return await route.fulfill(json={'success':True,'inventory':state['inventory'],'warehouse':state['warehouse'],'coins':state['coins'],'breedCredits':state['breedCredits'],'intellect':3})
            if '/faction' in path: return await route.fulfill(json={'success':True,'faction':None})
            return await route.fulfill(json=[])
        async def api_fixture(path, payload):
            class FixtureRoute:
                request = SimpleNamespace(url='http://offline.test'+path, post_data=bool(payload), post_data_json=payload)
                async def fulfill(self, **kwargs): return kwargs.get('json', {})
                async def abort(self, _): raise RuntimeError('Simulated network failure')
            return await route_handler(FixtureRoute())
        await page.expose_function('__tradeFixture', api_fixture)
        await page.evaluate(TG)
        await page.evaluate("""() => {window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
            const data=path.includes('/api/')?await window.__tradeFixture(path,init.body?JSON.parse(init.body):{}):{};
            return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
        }}""")
        html=(ROOT/'index.html').read_text()
        def script(match):
            src=match[1].split('?')[0];file=ROOT/src
            code=TG if 'telegram-web-app.js' in src else file.read_text() if file.is_file() else ''
            if 'defer' in match[0]: code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
        def css(match):
            file=ROOT/match[1].split('?')[0]
            return '<style>'+file.read_text()+'</style>' if file.is_file() else ''
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
        artwork=ROOT/'file_000000002bb08210800056ebfb1dce1f.png'
        html=html.replace(artwork.name+'?v=0503d3b544d1','data:image/png;base64,'+base64.b64encode(artwork.read_bytes()).decode())
        await context.route('**/*',lambda route:route.abort())
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("typeof window.TradeMenu?.open==='function' && document.getElementById('coins').textContent==='100000'")
        data = await page.evaluate("({catalog:getShopCatalog(),artifact:artifacts.find(a=>!a.adminOnly).name,gear:weapons[0].name,detector:detectors[0].name,medkit:consumables.find(c=>c.type==='medkit').name})")
        prices.update({item['name']:item['price'] for item in data['catalog']})
        a,b=data['catalog'][0]['name'],data['catalog'][1]['name']
        state.update(await page.evaluate('JSON.parse(JSON.stringify(player))'))
        state['inventory'].update({a:10,b:10,data['artifact']:2,data['gear']:1,data['detector']:1,named:1,"<img src=x onerror=alert(1)>":1})
        await page.evaluate('(value)=>{Object.assign(player,value);updateUI()}',state)
        writes=lambda:[c for c in calls if c['path'].endswith(('/shop/buy','/shop/sell','/scientists/sell','/friendly/buy','/warehouse/transfer'))]
        def item(source,name):
            # Attribute selectors preserve exact item names, including invisible unique suffixes.
            return page.locator(f'#tradeMenu [data-trade-source={source}][data-trade-name={json.dumps(name,ensure_ascii=False)}]')
        async def click(source,name):
            await item(source,name).click()
        async def clear(side):
            for name in await page.locator(f'#tradeMenu [data-trade-source={side}]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.tradeName)'):
                # Clicking a staged cell returns it immediately; no editor/remove round-trip is required.
                await click(side,name)
        async def drag(source,name,target,touch=False,cancel=False):
            node=item(source,name)
            await node.scroll_into_view_if_needed()
            start=await node.bounding_box()
            destination=page.locator(f'#tradeMenu [data-trade-drop={target}]')
            await destination.scroll_into_view_if_needed()
            # Test viewports fit both stock and staging. For warehouse use inventory instead.
            start=await node.bounding_box(); end=await destination.bounding_box()
            sx,sy=start['x']+start['width']/2,start['y']+start['height']/2
            tx,ty=end['x']+end['width']/2,end['y']+min(35,end['height']/2)
            if touch:
                cdp=await context.new_cdp_session(page)
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
                await page.wait_for_timeout(270)
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':tx,'y':ty}]})
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
                await cdp.detach()
            else:
                await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(tx,ty,steps=10)
                if cancel: await page.keyboard.press('Escape')
                await page.mouse.up()
            await page.wait_for_timeout(550)
        # Real menu hotspot: current client opens Zhuchara's portrait hub before the shared trade screen.
        await page.locator('#bunkerZhuchara').click()
        if await page.locator('#zhucharaHubScreen').is_visible():
            await page.locator('#zhucharaHubScreen [data-trader-action=trade]').click()
        assert await page.locator('#tradeMenu').is_visible()
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='zhuchara'
        assert len(writes())==0
        assert await page.locator('#tradeBuy').is_disabled()
        assert await page.locator('#tradeSell').is_disabled()
        assert await page.locator('#tradeStock .trade-cell').count()==len(data['catalog'])
        assert await page.locator('#tradeMenu .trade-actions>button').count()==2
        snapshot=await page.evaluate('JSON.stringify(player.inventory)')
        await drag('stock',a,'buy')
        assert await item('buy',a).count()==1, 'Mouse drag must stage the item'
        # A one-of-one item disappears from the bag while it is reserved for sale, but player.inventory is still untouched.
        await click('inventory',data['gear'])
        assert await item('sell',data['gear']).count()==1
        assert await item('inventory',data['gear']).count()==0
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        await click('sell',data['gear'])
        assert await item('sell',data['gear']).count()==0
        assert await item('inventory',data['gear']).count()==1
        assert (await item('inventory',data['gear']).inner_text()).endswith('×1')

        # Stack quantities are projected in the bag: staged amount is hidden, returning it restores the count.
        await drag('inventory',b,'sell',touch=True)
        assert await item('sell',b).count()==1, 'Touch hold/drag must stage the item'
        assert (await item('inventory',b).inner_text()).endswith('×9')
        assert len(writes())==0
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        await page.locator('#tradeQuantity').fill('3');await page.locator('#tradeQuantity').press('Tab')
        assert (await item('sell',b).inner_text()).endswith('×3')
        assert (await item('inventory',b).inner_text()).endswith('×7')
        await drag('sell',b,'inventory')
        assert await item('sell',b).count()==0
        assert (await item('inventory',b).inner_text()).endswith('×10')
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        await click('inventory',b)
        await page.locator('#tradeQuantity').fill('3');await page.locator('#tradeQuantity').press('Tab')
        assert (await item('sell',b).inner_text()).endswith('×3')
        assert (await item('inventory',b).inner_text()).endswith('×7')
        await page.locator('#tradeQuantity').fill('999');await page.locator('#tradeQuantity').press('Tab')
        assert await page.locator('#tradeQuantity').input_value()=='3'
        await page.locator('#tradeBuy').evaluate('(b)=>{b.click();b.click()}')
        await page.wait_for_timeout(300)
        assert len(writes())==1, 'Double tap must send exactly one request'
        assert writes()[-1]['payload']['vendor']=='zhuchara'
        assert writes()[-1]['payload']['name']==a
        assert await item('buy',a).count()==0
        await page.locator('#tradeSell').click();await page.wait_for_timeout(300)
        assert writes()[-1]['payload']['qty']==3
        assert await item('sell',b).count()==0
        await click('stock',a)
        mode['response']='reject'
        before=await page.evaluate('JSON.stringify(player.inventory)')
        await page.locator('#tradeBuy').click();await page.wait_for_timeout(300)
        assert await item('buy',a).count()==1
        assert await page.evaluate('JSON.stringify(player.inventory)')==before
        assert 'отклонена' in await page.locator('#tradeStatus').inner_text()
        # Lost response AFTER server commit: no retry, block until authoritative reload.
        mode['response']='lost_after_commit'
        old=state['inventory'][a]
        await page.locator('#tradeBuy').click();await page.wait_for_timeout(300)
        assert state['inventory'][a]==old+1
        assert await page.locator('#tradeBuy').is_disabled()
        assert await page.locator('#tradeResync').is_visible()
        assert await item('buy',a).count()==0
        n=len(writes());mode['read_failure']=True
        await page.locator('#tradeResync').click();await page.wait_for_timeout(200)
        assert len(writes())==n and await page.locator('#tradeBuy').is_disabled()
        mode.update(response='ok',read_failure=False)
        await page.locator('#tradeResync').click();await page.wait_for_timeout(200)
        assert await page.evaluate('(name)=>player.inventory[name]',a)==old+1
        assert len(writes())==n
        # Partial failure: successful positions disappear, rejected ones remain.
        await click('stock',a);await click('stock',b)
        mode['reject_name']=b
        await page.locator('#tradeBuy').click();await page.wait_for_timeout(400)
        assert await item('buy',a).count()==0
        assert await item('buy',b).count()==1
        mode['reject_name']=None
        await clear('buy')
        await drag('stock',a,'sell')
        assert await item('sell',a).count()==0
        await drag('stock',a,'buy',touch=True,cancel=True)
        assert await item('buy',a).count()==0
        await drag('inventory',b,'warehouse',touch=True)
        assert writes()[-1]['path'].endswith('/warehouse/transfer')
        assert writes()[-1]['payload']['direction']=='deposit'
        # Leonov: close Zhuchara's portrait hub, then enter Leonov through the real hotspot.
        await page.locator('[data-trade-action=back]').click()
        await page.evaluate("openScreen('main')")
        await page.locator('#bunkerLeonov').click()
        if await page.locator('[data-leonov-action=trade]').count():
            await page.locator('[data-leonov-action=selection]').click()
            assert await page.locator('#leonovSelectionPanel').is_visible()
            assert not await page.locator('#tradeMenu').is_visible()
            assert not await page.locator('#leonovTradePanel').is_visible()
            assert not await page.locator('#leonovBreedButton').is_visible()
            await page.locator('#scientistsScreen .back-btn:visible').click()
            await page.locator('[data-leonov-action=trade]').click()
        else: # Archive baseline uses the same legacy handler; CI tests current main.
            await page.evaluate('openScientistsBuyView()')
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='leonov'
        assert await page.locator('#tradeMenu [onclick="doBreedArtifacts()"]:visible').count()==0
        assert await item('stock',data['detector']).count()==1
        assert await item('stock',data['gear']).count()==0
        await click('inventory',named)
        assert '50 жет.' in await page.locator('#tradeSellTotal').inner_text()
        await page.locator('#tradeSell').click();await page.wait_for_timeout(250)
        assert writes()[-1]['path'].endswith('/scientists/sell')
        assert await page.evaluate('player.breedCredits')==57
        await click('stock',data['medkit']);await page.locator('#tradeBuy').click();await page.wait_for_timeout(250)
        assert writes()[-1]['payload']['vendor']=='leonov'
        # Diesel remains equipment-only; upgrades are preserved separately.
        await page.evaluate("openScreen('technician');openTechnicianTab('sell')")
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='technician'
        assert await page.locator('#tradeStock .trade-cell').count()==0
        assert await page.locator('#tradeBuy').is_disabled()
        await click('inventory',a)
        assert await item('sell',a).count()==0
        await click('inventory',data['gear'])
        await page.locator('#tradeSell').click();await page.wait_for_timeout(250)
        assert writes()[-1]['payload']['vendor']=='technician'
        await page.locator('[data-trade-action=back]').click()
        assert await page.locator('#technicianScreen').is_visible()
        assert await page.evaluate('technicianTab')=='upgrade'
        # All friendly-faction encounters use the same view, with no warehouse in a raid.
        await page.evaluate("raidActive=true;currentEnemy={name:'Тестовый сталкер',faction:{name:'Сталкеры'},friendly:true};openFriendlyTrade()")
        assert await page.locator('#tradeMenu').get_attribute('data-vendor')=='friendly'
        assert await page.locator('#tradeWarehouse').is_disabled()
        await click('stock',a)
        await page.locator('#tradeBuy').click();await page.wait_for_timeout(250)
        assert writes()[-1]['path'].endswith('/friendly/buy')
        await page.evaluate("raidActive=false;currentEnemy=null;openScreen('main')")
        assert not await page.locator('#tradeMenu').is_visible()
        # Named/admin artifacts are not confused with each other or static artifacts.
        await page.evaluate("player.inventory[artifacts.find(a=>a.adminOnly).name]=1;updateUI();openScreen('shop')")
        assert await page.locator('#tradeInventory .trade-cell').count()>0
        # No item name can create markup in the UI.
        assert await page.locator('#tradeInventory img[src=x]').count()==0
        # Empty inventory, affordability and exact numeric guards.
        await page.evaluate("player.inventory={};player.coins=0;updateUI()")
        assert await page.locator('#tradeInventory .trade-cell').count()==0
        assert await page.locator('#tradeInventory .trade-empty').count()==14
        await click('stock',a)
        assert await page.locator('#tradeBuy').is_disabled()
        n=len(writes())
        await page.locator('#tradeBuy').evaluate('(b)=>b.click()')
        assert len(writes())==n
        await page.evaluate('(value)=>{Object.assign(player,value);updateUI()}',state)
        await clear('buy')
        # Auto-buy preferences survive, but purchases still require the main Buy button.
        await page.evaluate('(name)=>{player.autoBuyTargets={[name]:30}}',a)
        await page.locator('#tradeAuto summary').click()
        await page.locator('[data-trade-action=autofill]').click()
        assert await item('buy',a).count()==1
        assert len(writes())==n
        await clear('buy')
        await page.evaluate("delete player.inventory['<img src=x onerror=alert(1)>'];updateUI()")
        reports=[]
        for width,height in [(320,568),(360,800),(390,844),(412,915),(844,390)]:
            await page.set_viewport_size({'width':width,'height':height})
            await page.evaluate("openScreen('main');openScreen('shop')")
            await page.wait_for_timeout(80)
            report=await page.evaluate("""() => {
                const root=document.getElementById('tradeMenu'),buy=document.getElementById('tradeBuy').getBoundingClientRect(),sell=document.getElementById('tradeSell').getBoundingClientRect(),row=root.querySelector('.trade-actions').getBoundingClientRect();
                return {width:innerWidth,height:innerHeight,overflow:root.scrollWidth>root.clientWidth+1,gap:sell.left-buy.right,covered:Math.abs(buy.width+sell.width-row.width)<1};
            }""")
            assert not report['overflow'],report
            assert abs(report['gap'])<1 and report['covered'],report
            reports.append(report)
            await page.locator('#tradeMenu').screenshot(path=str(OUT/f'trade-{width}x{height}.png'))
        assert not errors,errors
        report={'status':'passed','live_player_writes':0,'page_errors':errors,'mock_write_requests':len(writes()),'viewports':reports,
                'checks':['four NPC vendor adapters','catalog level gates','original prices and currency kinds','mouse drag','touch drag','cancel','wrong-side drop','quantity bounds','no local spending','double tap guard','server refusal','lost reply after commit','failed resync locks trades','partial batch failure','warehouse drop','warehouse raid restriction','Leonov trade versus selection','Diesel upgrade preservation','no item-name HTML injection','empty inventory','insufficient balance','no central button gap','auto-buy preferences and staged refill']}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False));await browser.close()

asyncio.run(main())
