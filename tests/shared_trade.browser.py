"""Offline browser regression for the shared NPC trade workspace. No live writes."""
import asyncio, base64, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation' / 'shared-trade'
OUT.mkdir(parents=True, exist_ok=True)
TG = "window.Telegram={WebApp:{initData:'offline-test-only',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state = {
        'nickname':'Тестовый сталкер','health':103,'maxHealth':150,'hunger':100,'thirst':100,
        'coins':12000,'breedCredits':7,'level':100,'exp':123,'radiation':18,'inventory':{},'warehouse':{},
        'weapon':{'name':'Beretta 21A Bobcat','tier':1,'dmg':80},
        'armor':{'name':'Комбинезон Юность','tier':1,'armor':5,'hitAbsorption':3},
        'detector':{'name':'РИПЕР','tier':1}
    }
    calls=[]; errors=[]
    async with async_playwright() as pw:
        exe=sys.argv[1] if len(sys.argv)>1 else os.environ.get('CHROMIUM_EXECUTABLE_PATH')
        browser=await pw.chromium.launch(executable_path=exe or None,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844},has_touch=True)
        page.on('pageerror',lambda e:errors.append(str(e)))

        async def fixture(path,payload):
            calls.append({'path':path,'payload':payload})
            if path.endswith('/player/private'): return state
            if path.endswith('/shop/buy'):
                name=payload['name']; state['coins']-=10; state['inventory'][name]=state['inventory'].get(name,0)+1
                return {'success':True,'coins':state['coins'],'inventory':dict(state['inventory'])}
            if path.endswith('/shop/sell'):
                name=payload['name']; state['coins']+=5; state['inventory'][name]=max(0,state['inventory'].get(name,0)-1)
                return {'success':True,'coins':state['coins'],'intellect':0,'inventory':dict(state['inventory'])}
            if path.endswith('/scientists/sell'):
                name=payload['name']; state['coins']+=8; state['inventory'][name]=max(0,state['inventory'].get(name,0)-1)
                return {'success':True,'coins':state['coins'],'breedCredits':state['breedCredits'],'inventory':dict(state['inventory'])}
            if path.endswith('/friendly/buy'):
                name=payload['name']; state['coins']-=11; state['inventory'][name]=state['inventory'].get(name,0)+1
                return {'success':True,'coins':state['coins'],'inventory':dict(state['inventory'])}
            if '/faction' in path: return {'success':True,'faction':None}
            return {'success':True}

        await page.expose_function('__tradeFixture',fixture)
        await page.evaluate(TG)
        await page.evaluate("""() => { window.fetch=async(input,init={})=>{
          const url=new URL(typeof input==='string'?input:input.url,'http://offline.test');
          if(!url.pathname.includes('/api/')) return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
          const payload=init.body?JSON.parse(init.body):null;
          const value=await window.__tradeFixture(url.pathname,payload);
          return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        }; }""")

        html=(ROOT/'index.html').read_text(encoding='utf-8')
        def script(m):
            src=m[1].split('?')[0]; f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else f.read_text(encoding='utf-8') if f.is_file() else ''
            if 'defer' in m[0]: code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
        def css(m):
            f=ROOT/m[1].split('?')[0]
            return '<style>'+f.read_text(encoding='utf-8')+'</style>' if f.is_file() else ''
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
        artwork=ROOT/'file_000000002bb08210800056ebfb1dce1f.png'
        html=html.replace('file_000000002bb08210800056ebfb1dce1f.png?v=0503d3b544d1','data:image/png;base64,'+base64.b64encode(artwork.read_bytes()).decode())
        await page.set_content(html,wait_until='domcontentloaded',timeout=7000)
        await page.wait_for_function("window.SharedTrade?.version==='1.0.0' && window.BunkerMenu",timeout=7000)

        # Pick real game items so icons/categories/prices use the production dictionaries.
        chosen=await page.evaluate("""() => {
          const stock=getShopCatalog();
          const buy=stock.find(x=>x.category==='consumable') || stock[0];
          const gear=[...weapons,...armorItems,...detectors].find(x=>!x.adminOnly);
          const art=artifacts.find(x=>!x.isNamedArtifact) || artifacts[0];
          return {buy:buy.name,gear:gear.name,artifact:art.name};
        }""")
        state['inventory']={chosen['gear']:2,chosen['artifact']:1}
        await page.evaluate('(x)=>{player.inventory=x;player.warehouse={};updateUI()}',state['inventory'])
        await page.evaluate("""() => {
          warehouseTransfer=async(direction,name,qty)=>{
            qty=qty||1;
            if(direction==='deposit'){
              if((player.inventory[name]||0)<qty) return;
              player.inventory[name]-=qty; player.warehouse[name]=(player.warehouse[name]||0)+qty;
            }else{
              if((player.warehouse[name]||0)<qty) return;
              player.warehouse[name]-=qty; player.inventory[name]=(player.inventory[name]||0)+qty;
            }
            updateUI();
          };
        }""")

        # Zhuchara opens the new shared screen, not the legacy card list.
        await page.evaluate("openScreen('main')")
        await page.locator('#bunkerZhuchara').click()
        assert await page.locator('#sharedTradeScreen').is_visible()
        assert 'Жучара' in await page.locator('#sharedTradeTitle').inner_text()
        assert await page.locator('#sharedTradeVendorGrid .trade-slot').count() >= 35
        assert await page.locator('#sharedTradePlayerGrid .trade-slot').count() >= 35
        assert await page.locator('#sharedTradeWarehouseGrid .trade-slot').count() >= 35
        buy_box=await page.locator('#sharedTradeBuy').bounding_box(); sell_box=await page.locator('#sharedTradeSell').bounding_box()
        assert buy_box and sell_box and sell_box['x']-(buy_box['x']+buy_box['width']) <= 5
        assert abs(buy_box['width']-sell_box['width']) < 5

        # Click is the accessibility fallback for drag: it stages one item, then server confirms purchase.
        first_vendor=page.locator('#sharedTradeVendorGrid [data-trade-origin="vendor"]').first
        vendor_name=await first_vendor.get_attribute('data-trade-name')
        await first_vendor.click()
        assert await page.locator('#sharedTradeBuyStage [data-trade-origin="buy"]').count()==1
        assert not await page.locator('#sharedTradeBuy').is_disabled()
        before=len([c for c in calls if c['path'].endswith('/shop/buy')])
        await page.locator('#sharedTradeBuy').click(); await page.wait_for_timeout(120)
        assert len([c for c in calls if c['path'].endswith('/shop/buy')])==before+1
        assert await page.locator('#sharedTradeBuyStage [data-trade-origin="buy"]').count()==0
        assert await page.evaluate('(n)=>player.inventory[n]||0',vendor_name)>=1

        # Player item -> selling staging -> server-authoritative sale.
        player_slot=page.locator('#sharedTradePlayerGrid [data-trade-origin="player"]').filter(has=page.locator(f'[title="{chosen["gear"]}"]'))
        if await player_slot.count()==0:
            player_slot=page.locator(f'#sharedTradePlayerGrid [data-trade-name="{chosen["gear"]}"]')
        await player_slot.first.click()
        assert await page.locator('#sharedTradeSellStage [data-trade-origin="sell"]').count()==1
        before=len([c for c in calls if c['path'].endswith('/shop/sell')])
        await page.locator('#sharedTradeSell').click(); await page.wait_for_timeout(120)
        assert len([c for c in calls if c['path'].endswith('/shop/sell')])==before+1

        # Drag an owned item onto warehouse bar; bottom warehouse slots refresh immediately.
        src=page.locator(f'#sharedTradePlayerGrid [data-trade-name="{chosen["gear"]}"]').first
        await src.scroll_into_view_if_needed(); await page.locator('#sharedTradeWarehouseDrop').scroll_into_view_if_needed()
        s=await src.bounding_box(); d=await page.locator('#sharedTradeWarehouseDrop').bounding_box()
        if s and d:
            await page.mouse.move(s['x']+s['width']/2,s['y']+s['height']/2); await page.mouse.down()
            await page.mouse.move(d['x']+d['width']/2,d['y']+d['height']/2,steps=12); await page.mouse.up(); await page.wait_for_timeout(120)
            assert await page.locator(f'#sharedTradeWarehouseGrid [data-trade-name="{chosen["gear"]}"]').count()==1

        await page.screenshot(path=str(OUT/'zhuchara-390x844.png'),full_page=True)

        # Diesel keeps upgrade screen, but his former sell button becomes the common Trading entry.
        await page.evaluate("SharedTrade.close();openScreen('technician')")
        trade_btn=page.locator('#technicianScreen button',has_text='Торговля')
        assert await trade_btn.count()>=1
        await trade_btn.first.click()
        assert await page.locator('#sharedTradeScreen').is_visible()
        assert 'Дизель' in await page.locator('#sharedTradeTitle').inner_text()
        assert await page.locator('#sharedTradeBuy').is_disabled()
        assert not await page.locator('#sharedTradePlayerGrid').is_hidden()

        # Leonov Trade is routed from the two-choice hub to exactly the same shared workspace.
        await page.evaluate("SharedTrade.close();openScreen('main');BunkerMenu.openLeonov()")
        await page.locator('#leonovHubScreen [data-leonov-action="trade"]').click()
        assert await page.locator('#sharedTradeScreen').is_visible()
        assert 'Леонов' in await page.locator('#sharedTradeTitle').inner_text()
        assert await page.locator('#leonovTradePanel').count()==1  # legacy panel remains preserved but is not the active UI

        # Friendly encounter trade entry also uses the common workspace.
        await page.evaluate("""() => {
          SharedTrade.close();
          currentEnemy={name:'Тестовый сталкер',faction:{name:'Долг'}};
          openFriendlyTrade();
        }""")
        assert await page.locator('#sharedTradeScreen').is_visible()
        assert 'Тестовый сталкер' in await page.locator('#sharedTradeTitle').inner_text()
        assert not await page.locator('#friendlyTradeModal').is_visible()

        # No horizontal overflow on compact phones; buttons still close the center gap.
        for width,height in [(320,568),(360,800),(390,844),(412,915)]:
            await page.set_viewport_size({'width':width,'height':height}); await page.wait_for_timeout(50)
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            b=await page.locator('#sharedTradeBuy').bounding_box(); s=await page.locator('#sharedTradeSell').bounding_box()
            assert b and s and s['x']-(b['x']+b['width'])<=5

        assert not errors,errors
        report={'status':'passed','offline':True,'live_player_writes':0,'vendors':['zhuchara','leonov','diesel','friendly'],'shop_buy_calls':len([c for c in calls if c['path'].endswith('/shop/buy')]),'shop_sell_calls':len([c for c in calls if c['path'].endswith('/shop/sell')]),'page_errors':errors,'checks':['merchant stock grid','buy/sell staging slots','player loot grid','buttons cover center gap','server buy','server sell','warehouse drag','Diesel common trade entry','Leonov common trade entry','friendly NPC common trade entry','phone widths']}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False))
        await browser.close()

asyncio.run(main())
