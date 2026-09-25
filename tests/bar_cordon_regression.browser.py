"""Full-client browser regression. All API responses are local fixtures; no live writes."""
import asyncio, base64, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation/bar-cordon'; OUT.mkdir(parents=True,exist_ok=True)
TG="window.Telegram={WebApp:{initData:'offline-bar-cordon',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"
VIEWS=[(320,568),(360,800),(390,844),(412,915),(844,390),(1280,720)]
PAIRS=[('bunkerScene','rostokCampScene'),('bunkerHealth','rostokHealth'),('bunkerHunger','rostokHunger'),('bunkerThirst','rostokThirst'),('bunkerExperience','rostokExperience'),('bunkerRadiation','rostokRadiation'),('bunkerReadBook','rostokReadBook'),('bunkerInventory','rostokInventory'),('bunkerPda','rostokPda')]

async def main():
    state=dict(nickname='Тест',health=103,maxHealth=150,hunger=88,thirst=77,coins=100000000,breedCredits=7,level=600,exp=123,radiation=12,inventory={'Книга знаний':2},warehouse={},intellect=0)
    calls=[]; errors=[]; mode={'status':200,'lost':False,'malformed':False,'read_failure':False}; prices={}
    report={'live_player_writes':0,'geometry':[],'purchases':[],'rejections':[],'checks':[]}
    async def fixture(path,payload):
        calls.append({'path':path,'payload':payload})
        if path.endswith('/player/private'):
            if mode['read_failure']: raise RuntimeError('offline read failure')
            return {'status':200,'body':state.copy()}
        if path.endswith('/named-artifacts'): return {'status':200,'body':[]}
        if path.endswith('/shop/buy'):
            if mode['status']!=200:
                return {'status':mode['status'],'body':{'success':False,'error':'Тестовый отказ '+str(mode['status'])}}
            name=payload['name']; qty=payload.get('qty',1)
            assert isinstance(qty,int) and qty>0
            assert name in prices, name
            cost=prices[name]*qty
            assert state['coins']>=cost
            state['coins']-=cost
            state['inventory'][name]=state['inventory'].get(name,0)+qty
            if mode['lost']: raise RuntimeError('offline lost response after commit')
            if mode['malformed']: return {'status':200,'body':{'unexpected':True}}
            return {'status':200,'body':{'success':True,**state}}
        if path.endswith('/player/position'): return {'status':200,'body':{'success':True,'worldPosition':payload}}
        if path.endswith('/item/use'):
            name=payload.get('name','Книга знаний')
            state['inventory'][name]=max(0,state['inventory'].get(name,0)-1)
            return {'status':200,'body':{'success':True,**state}}
        if '/faction' in path: return {'status':200,'body':{'success':True,'faction':None}}
        return {'status':200,'body':[]}

    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True)
        # The fixture runs on about:blank. All external asset requests are blocked too.
        await context.route('**/*',lambda route:route.abort())
        page=await context.new_page();page.set_default_timeout(6000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.expose_function('__barCordonFixture',fixture)
        await page.evaluate(TG)
        await page.evaluate("""()=>{window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
            const result=path.includes('/api/')?await window.__barCordonFixture(path,init.body?JSON.parse(init.body):{}):{status:404,body:{}};
            return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});
        }}""")
        html=(ROOT/'index.html').read_text()
        def script(m):
            src=m.group(1).split('?')[0]; f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else (f.read_text() if f.is_file() else '')
            if 'defer' in m.group(0): code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        def css(m):
            f=ROOT/m.group(1).split('?')[0]
            return '<style>'+f.read_text()+'</style>' if f.is_file() else ''
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
        artwork=ROOT/'file_000000002bb08210800056ebfb1dce1f.png'
        if artwork.is_file():
            html=html.replace(artwork.name+'?v=0503d3b544d1','data:image/png;base64,'+base64.b64encode(artwork.read_bytes()).decode())
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("window.TradeMenu?.version==='1.3.6' && window.BunkerMenu?.version==='1.20.0' && window.TraderHubs")
        await page.evaluate('(s)=>{Object.assign(player,s);updateUI();openScreen("main")}',state)
        prices.update(await page.evaluate('Object.fromEntries([...consumables,...weapons,...armorItems,...detectors].map(x=>[x.name,getBuyPrice(x.price)]))'))

        async def rect(id):
            return await page.locator('#'+id).evaluate('(e)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}')
        for w,h in VIEWS:
            await page.set_viewport_size({'width':w,'height':h})
            await page.evaluate("openScreen('main')");await page.wait_for_timeout(70)
            cordon={a:await rect(a) for a,b in PAIRS}
            await page.evaluate('BunkerMenu.openRostokCamp()');await page.wait_for_timeout(70)
            await page.locator('#rostokLowerHudArtwork').evaluate('(e,s)=>e.src=s','data:image/png;base64,'+base64.b64encode((ROOT/'ui/rostok-lower-hud.png').read_bytes()).decode())
            worst=0
            for a,b in PAIRS:
                r=await rect(b)
                for key in ('x','y','width','height'):
                    delta=abs(cordon[a][key]-r[key]);worst=max(worst,delta)
                    assert delta<=0.1,(w,h,a,b,key,cordon[a],r)
                assert r['x']>=-0.1 and r['y']>=-0.1 and r['x']+r['width']<=w+0.1 and r['y']+r['height']<=h+0.1,(w,h,b,r)
            bounds=await rect('rostokCampScreen')
            assert bounds=={'x':0,'y':0,'width':w,'height':h},bounds
            # Each clickable HUD control must receive taps, not the artwork or another screen.
            for id in ('rostokInventory','rostokPda','rostokReadBook'):
                assert await page.locator('#'+id).evaluate('(e)=>{let r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'),id
            assert await page.locator('#rostokHealth').get_attribute('aria-valuenow')=='103'
            assert await page.locator('#rostokHealth').get_attribute('aria-valuemax')=='150'
            assert await page.locator('#rostokCoins').inner_text()==str(state['coins'])
            report['geometry'].append({'viewport':[w,h],'max_coordinate_error_px':worst})
            await page.screenshot(path=str(OUT/f'bar-{w}x{h}.png'))
        # Zero values must still cover the painted examples; updates must be live.
        await page.evaluate('player.health=0;player.hunger=0;player.thirst=0;player.coins=0;player.breedCredits=0;updateUI()')
        await page.wait_for_timeout(50)
        for id in ('rostokHealth','rostokHunger','rostokThirst'):
            assert await page.locator('#'+id).get_attribute('aria-valuenow')=='0'
        assert await page.locator('#rostokCoins').inner_text()=='0'
        await page.evaluate('(s)=>{Object.assign(player,s);updateUI()}',state)
        await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(60)
        for id,screen in [('rostokInventory','inventoryScreen'),('rostokPda','kpkScreen')]:
            await page.evaluate('BunkerMenu.openRostokCamp()');await page.wait_for_timeout(50)
            await page.locator('#'+id).tap()
            assert await page.locator('#'+screen).is_visible(),screen
            await page.evaluate("openScreen('main')")
            assert await page.locator('#rostokCampScreen').is_visible()
        report['checks']+=['Cordon/Rostok exact shared geometry at six viewports','zero-value and live HUD updates','PDA/backpack taps and return to bar']

        entries={'zhuchara':('#bunkerZhuchara','#zhucharaHubScreen [data-trader-action="trade"]'), 'leonov':('#bunkerLeonov','#leonovHubScreen [data-leonov-action="trade"]'), 'technician':('#bunkerDiesel','#dieselHubScreen [data-trader-action="trade"]')}
        async def open_vendor(vendor,normal=False):
            await page.evaluate("openScreen('main')")
            if normal:
                first,second=entries[vendor]
                await page.locator(first).tap();await page.locator(second).tap()
            else: await page.evaluate('(v)=>TradeMenu.open(v)',vendor)
            assert await page.locator('#tradeMenu').get_attribute('data-vendor')==vendor
        async def stage(name=None):
            node=page.locator('#tradeStock [data-trade-source="stock"]')
            if name is None:node=node.first
            else:node=page.locator('#tradeStock [data-trade-name='+json.dumps(name,ensure_ascii=False)+']')
            name=await node.get_attribute('data-trade-name')
            await node.tap()
            assert await page.locator('#tradeBuySlots [data-trade-source="buy"]').count()==1
            assert not await page.locator('#tradeBuy').is_disabled()
            return name
        def buy_count():return sum(c['path'].endswith('/shop/buy') for c in calls)
        for vendor in entries:
            await open_vendor(vendor,normal=True)
            items=await page.locator('#tradeStock [data-trade-source="stock"]').evaluate_all('(xs)=>xs.map(x=>({name:x.dataset.tradeName,category:getEquipSlotType(x.dataset.tradeName)||"consumable"}))')
            categories={}
            for item in items:categories.setdefault(item['category'],item['name'])
            for category,name in categories.items():
                before=state['inventory'].get(name,0); coins=state['coins']; start=buy_count()
                await stage(name)
                await page.locator('#tradeBuy').tap()
                await page.wait_for_function("!document.getElementById('tradeMenu').getAttribute('aria-busy') || document.getElementById('tradeMenu').getAttribute('aria-busy')==='false'")
                assert buy_count()==start+1
                assert state['inventory'][name]==before+1
                assert state['coins']==coins-prices[name]
                assert await page.evaluate('(name)=>player.inventory[name]',name)==state['inventory'][name]
                assert await page.evaluate('player.coins')==state['coins']
                payload=next(c['payload'] for c in reversed(calls) if c['path'].endswith('/shop/buy'))
                assert payload['vendor']==vendor and payload['name']==name and payload['category']==category,payload
                report['purchases'].append({'vendor':vendor,'category':category,'name':name})
            # Repeat known refusals against each merchant; none may poison the global trade state.
            for status in (400,401,403,404,409,422,429):
                await open_vendor(vendor)
                name=await stage(); before=json.dumps(state,sort_keys=True)
                mode['status']=status; start=buy_count()
                await page.locator('#tradeBuy').tap();await page.wait_for_timeout(70)
                assert buy_count()==start+1
                assert json.dumps(state,sort_keys=True)==before
                assert ('Тестовый отказ '+str(status)) in await page.locator('#tradeStatus').inner_text()
                assert await page.locator('#tradeResync').is_hidden()
                assert not await page.locator('#tradeBuy').is_disabled()
                assert await page.locator('#tradeBuySlots [data-trade-source="buy"]').count()==1
                mode['status']=200
                # A normal user-initiated next purchase succeeds; there is no automatic retry.
                await page.locator('#tradeBuy').tap();await page.wait_for_timeout(70)
                assert buy_count()==start+2
                report['rejections'].append({'vendor':vendor,'http':status,'basket_preserved':True,'next_buy_succeeds':True})

        # Ambiguous writes must still lock all vendors until a confirmed private-state read.
        for failure in ('lost','500','malformed'):
            await open_vendor('zhuchara'); name=await stage(); start=buy_count()
            mode['lost']=failure=='lost';mode['malformed']=failure=='malformed';mode['status']=500 if failure=='500' else 200
            await page.locator('#tradeBuy').tap();await page.wait_for_timeout(90)
            assert buy_count()==start+1
            assert await page.locator('#tradeResync').is_visible()
            assert await page.locator('#tradeBuy').is_disabled()
            mode.update(status=200,lost=False,malformed=False)
            await open_vendor('leonov')
            assert await page.locator('#tradeResync').is_visible()
            mode['read_failure']=True
            await page.locator('#tradeResync').tap();await page.wait_for_timeout(60)
            assert await page.locator('#tradeBuy').is_disabled()
            mode['read_failure']=False
            await page.locator('#tradeResync').tap();await page.wait_for_timeout(60)
            assert await page.locator('#tradeResync').is_hidden()
            assert await page.evaluate('player.coins')==state['coins']
            assert buy_count()==start+1,'A possibly committed transaction was retried'
        report['checks']+=['real Cordon hub entry for all three vendors','every available merchant item category','21 JSON 4xx rejections preserve basket and do not block next purchase','lost response / HTTP 500 / malformed reply remain locked until resync','failed resync stays locked','no automatic retry of ambiguous writes']
        assert not errors,errors
        report.update(status='passed',javascript_errors=errors,test_purchase_requests=buy_count())
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        await browser.close()

if __name__=='__main__':asyncio.run(main())
