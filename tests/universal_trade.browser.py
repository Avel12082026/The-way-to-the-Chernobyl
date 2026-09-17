"""Full client test with every API mocked. No live account, purchase, or inventory writes."""
import asyncio
import copy
import json
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation' / 'universal-trade'
OUT.mkdir(parents=True, exist_ok=True)
LEGACY = '--legacy-fixture' in sys.argv
TG = "window.Telegram={WebApp:{initData:'offline-fixture',initDataUnsafe:{user:{id:101}},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state = dict(nickname='Тестовый сталкер',health=103,maxHealth=150,hunger=100,thirst=100,coins=999999,breedCredits=7,level=6,exp=12,radiation=0,inventory={},warehouse={})
    calls, errors, checks = [], [], []
    fault, fail_name = None, None
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = await browser.new_page(viewport={'width':390,'height':844},has_touch=True)
        page.set_default_timeout(6000)
        page.on('pageerror',lambda e: errors.append(str(e)))
        async def fixture(path, data, method):
            calls.append({'path':path,'data':copy.deepcopy(data),'method':method})
            if path.endswith('/player/private'): return copy.deepcopy(state)
            if path.endswith('/named-artifacts'): return [{'name':'Тестовый именной артефакт','stats':{'health':1},'tier':9}]
            if path.endswith('/equipment/features'): return {'artifactSlotTarget':True}
            if path.endswith(('/shop/buy','/shop/sell','/scientists/sell','/friendly/buy','/warehouse/transfer')):
                await asyncio.sleep(.05)
                name = data.get('name') or data.get('item'); count = data.get('qty',1)
                if fault == 'reject' or name == fail_name: return {'success':False,'error':'Тестовый отказ сервера'}
                if fault == 'offline': raise RuntimeError('Simulated dropped response')
                if path.endswith('/warehouse/transfer'):
                    src,dst=(state['inventory'],state['warehouse']) if data['direction']=='deposit' else (state['warehouse'],state['inventory'])
                    if src.get(name,0)<count: return {'success':False,'error':'Нет предметов'}
                    src[name]-=count;dst[name]=dst.get(name,0)+count
                elif path.endswith('/buy'):
                    state['inventory'][name]=state['inventory'].get(name,0)+count;state['coins']-=10*count
                else:
                    if state['inventory'].get(name,0)<count: return {'success':False,'error':'Нет предметов'}
                    state['inventory'][name]-=count
                    if name=='Тестовый именной артефакт': state['breedCredits']+=50*count
                    else: state['coins']+=5*count
                result={'success':True,'inventory':copy.deepcopy(state['inventory']),'warehouse':copy.deepcopy(state['warehouse']),'coins':state['coins'],'breedCredits':state['breedCredits'],'intellect':5}
                if fault == 'committed-response-lost': raise RuntimeError('Server committed but response lost')
                return result
            if path.endswith('/artifacts/breed'):
                await asyncio.sleep(.1)
                return {'success':False,'error':'Тест: селекция не списывает предметы'}
            if path.endswith('/raid/friendly/leave'): return {'success':True}
            if '/faction' in path: return {'success':True,'faction':None}
            return []
        await page.expose_function('__fixture',fixture)
        await page.evaluate(TG)
        await page.evaluate("""() => {window.fetch=async(input,init={})=>{
          const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
          const value=path.includes('/api/')?await window.__fixture(path,init.body?JSON.parse(init.body):null,init.method||'GET'):{};
          return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        }}""")
        # Prevent *all* outside network use, including image loads and delayed modules.
        await page.route('**/*',lambda route: route.abort())
        html=(ROOT/'index.html').read_text()
        def script(match):
            src=match[1].split('?')[0]; f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
            if 'defer' in match[0]: code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
        def css(match):
            f=ROOT/match[1].split('?')[0]
            return '<style>'+f.read_text()+'</style>' if f.is_file() else ''
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
        await page.set_content(html,wait_until='domcontentloaded',timeout=8000)
        await page.wait_for_function('window.UniversalTrade?.version === "1.0.0" && player.coins===999999')
        # Fixture includes the real dynamic named-artifact registry (not the regular artifacts array).
        defs=await page.evaluate("({goods:getShopCatalog().slice(0,2).map(x=>x.name),artifact:artifacts.find(x=>!x.gen).name,weapon:weapons.find(x=>!x.adminOnly).name,medkit:consumables.find(x=>x.type==='medkit').name,detector:detectors[0].name})")
        a,b=defs['goods'];artifact=defs['artifact'];weapon=defs['weapon'];medkit=defs['medkit'];named='Тестовый именной артефакт'
        state.update(await page.evaluate('JSON.parse(JSON.stringify(player))'))
        state['inventory']={a:4,b:2,artifact:3,weapon:2,named:1};state['warehouse']={b:3}
        await page.evaluate('(s)=>{Object.assign(player,s);namedArtifactsList=[{name:"Тестовый именной артефакт",stats:{health:1},tier:9}];updateUI()}',state)
        writes=lambda:[c for c in calls if c['path'].endswith(('/shop/buy','/shop/sell','/scientists/sell','/friendly/buy','/warehouse/transfer'))]
        item=lambda source,name:page.locator(f'[data-ut-source="{source}"]').filter(has=page.locator('.ut-name',has_text=re.compile('^'+re.escape(name)+'$')))
        async def wait_idle():
            await page.wait_for_function('!UniversalTrade.snapshot().busy');await page.wait_for_timeout(80)
        async def drag(source,name,target,touch=False,cancel=False):
            src=item(source,name);await src.scroll_into_view_if_needed()
            box=await src.bounding_box();sx,sy=box['x']+box['width']/2,box['y']+box['height']/2
            if touch:
                cdp=await page.context.new_cdp_session(page)
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]});await page.wait_for_timeout(270)
            else: await page.mouse.move(sx,sy);await page.mouse.down()
            dest=page.locator(f'[data-ut-drop="{target}"]');await dest.scroll_into_view_if_needed()
            box=await dest.bounding_box();tx,ty=box['x']+box['width']/2,box['y']+min(box['height']/2,45)
            if touch:
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':tx,'y':ty}]})
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]});await cdp.detach()
            else:
                await page.mouse.move(tx,ty,steps=10)
                if cancel:await page.keyboard.press('Escape')
                await page.mouse.up()
            await page.wait_for_timeout(650);await wait_idle()
        # Merchant entry through the actual old route, not the module's debug API.
        await page.evaluate("openScreen('shop')")
        assert await page.locator('#universalTradeScreen').is_visible()
        assert await page.locator('#utStock .slot').count()>=35
        assert await page.locator('#utBuy').is_disabled() and await page.locator('#utSell').is_disabled()
        assert len(writes())==0
        before=await page.evaluate('JSON.stringify(player.inventory)')
        await drag('stock',a,'sell',touch=True)
        assert not (await page.evaluate('UniversalTrade.snapshot()'))['buy']
        await drag('stock',a,'buy',touch=True,cancel=True)
        assert not (await page.evaluate('UniversalTrade.snapshot()'))['buy']
        await drag('stock',a,'buy',touch=True)
        assert (await page.evaluate('UniversalTrade.snapshot()'))['buy']==[[a,1]]
        await drag('inventory',b,'sell')
        assert (await page.evaluate('UniversalTrade.snapshot()'))['sell']==[[b,1]]
        assert await page.evaluate('JSON.stringify(player.inventory)')==before and len(writes())==0
        checks.extend(['mouse/touch drag','wrong-target rejection','cancelled drag','no spending on staging'])
        # Adjacent buttons cover the entire width with no center-square gap.
        x=await page.locator('#utBuy').bounding_box();y=await page.locator('#utSell').bounding_box();bar=await page.locator('.ut-deal-bar').bounding_box()
        assert abs(x['x']+x['width']-y['x'])<1
        assert abs(x['width']+y['width']-bar['width'])<1
        # Server rejection keeps selected goods and inventory; double click sends one request.
        fault='reject';await page.locator('#utBuy').scroll_into_view_if_needed()
        n=len(writes());await page.evaluate('document.getElementById("utBuy").click();document.getElementById("utBuy").click()');await wait_idle()
        assert len(writes())==n+1
        assert (await page.evaluate('UniversalTrade.snapshot()'))['buy']==[[a,1]]
        assert await page.evaluate('JSON.stringify(player.inventory)')==before
        fault=None;await page.locator('#utBuy').click();await wait_idle()
        assert writes()[-1]['data']['vendor']=='zhuchara'
        assert not (await page.evaluate('UniversalTrade.snapshot()'))['buy']
        await page.locator('#utSell').click();await wait_idle()
        assert writes()[-1]['data']['vendor']=='zhuchara'
        checks.extend(['double-submit lock','server rejection','confirmed purchase','confirmed sale'])
        # Single-copy and stock limits; baskets remain separate.
        await page.evaluate('UniversalTrade.refresh()')
        for _ in range(5):await item('inventory',b).click()
        assert dict((await page.evaluate('UniversalTrade.snapshot()'))['sell'])[b]==state['inventory'][b]
        await page.locator('[data-ut-action="clear"]').click()
        # Partial batch: the first item is committed, second retained after rejection.
        await item('stock',a).click();await item('stock',b).click();fail_name=b
        await page.locator('#utBuy').click();await wait_idle()
        assert (await page.evaluate('UniversalTrade.snapshot()'))['buy']==[[b,1]]
        fail_name=None;await page.locator('[data-ut-action="clear"]').click()
        checks.append('partial batch preserves only unconfirmed items')
        # Lost response after server commit: block retry until private state reconciliation.
        await item('stock',a).click();fault='committed-response-lost';n=len(writes())
        await page.locator('#utBuy').click();await wait_idle()
        assert (await page.evaluate('UniversalTrade.snapshot()'))['uncertain']
        await page.evaluate('document.getElementById("utBuy").click()');await wait_idle();assert len(writes())==n+1
        fault=None;await page.locator('#utSync').click();await wait_idle()
        assert not (await page.evaluate('UniversalTrade.snapshot()'))['uncertain']
        assert not (await page.evaluate('UniversalTrade.snapshot()'))['buy']
        assert await page.evaluate('(name)=>player.inventory[name]',a)==state['inventory'][a]
        checks.append('lost-response reconciliation without duplicate purchase')
        # Warehouse transfer both ways uses the real server contract.
        n=len(writes());await drag('inventory',a,'deposit',touch=True)
        assert len(writes())==n+1 and writes()[-1]['data']['direction']=='deposit'
        await drag('warehouse',b,'inventory',touch=True)
        assert writes()[-1]['data']['direction']=='withdraw'
        checks.append('warehouse transfers both ways')
        # Item details and cash guard.
        await item('stock',a).click();await page.locator('#utInfo').click()
        assert await page.locator('#itemInfoModal').is_visible()
        await page.evaluate('document.getElementById("itemInfoModal").classList.remove("active");player.coins=0;UniversalTrade.refresh()')
        assert await page.locator('#utBuy').is_disabled()
        await page.evaluate('(n)=>{player.coins=n;UniversalTrade.refresh()}',state['coins'])
        await page.locator('[data-ut-action="back"]').click()
        assert await page.locator('#mainMenu').is_visible()
        # Actual Leonov hub route on CI; only old local artifact needs the fixture bypass.
        if not LEGACY:
            await page.evaluate('BunkerMenu.openLeonov()');await page.locator('[data-leonov-action="trade"]').click()
        else:await page.evaluate('UniversalTrade.open("leonov")')
        assert (await page.evaluate('UniversalTrade.snapshot()'))['vendor']=='leonov'
        assert not await page.locator('#leonovSelectionPanel').is_visible()
        assert await item('stock',medkit).count()==1
        assert await item('stock',weapon).count()==0
        await item('inventory',named).click()
        assert '50 жет.' in await page.locator('#utSellTotal').inner_text()
        await page.locator('#utSell').click();await wait_idle()
        assert writes()[-1]['path'].endswith('/scientists/sell')
        assert await page.evaluate('player.breedCredits')==57
        checks.extend(['Leonov catalog restrictions','named artifact token sale','selection separated from trading'])
        await page.locator('[data-ut-action="back"]').click()
        if not LEGACY:
            assert await page.locator('#leonovHubScreen').is_visible()
            await page.locator('[data-leonov-action="selection"]').click()
            assert await page.locator('#leonovSelectionPanel').is_visible()
            assert not await page.locator('#universalTradeScreen').is_visible()
            assert not await page.locator('#leonovBuyButton').is_visible()
            await page.evaluate('(a)=>{breedSlot1=a;breedSlot2=a;renderScientists()}',artifact)
            assert await page.locator('#leonovBreedButton').is_visible()
            n=len(writes());await page.evaluate('doBreedArtifacts();doBreedArtifacts()');await page.wait_for_timeout(250)
            assert len(writes())==n
            assert len([c for c in calls if c['path'].endswith('/artifacts/breed')])==1
            await page.evaluate('document.getElementById("gameAlertModal").classList.remove("active");exitScientists();BunkerMenu.closeLeonov()')
        # Diesel retains upgrades and uses one common trading screen with no invented buy stock.
        await page.evaluate('openScreen("technician")');await page.locator('#technicianScreen [onclick="openTechnicianTab(\'sell\')"]').click()
        assert (await page.evaluate('UniversalTrade.snapshot()'))['vendor']=='technician'
        assert await page.locator('#utStock [data-ut-item]').count()==0
        await item('inventory',weapon).click();await page.locator('#utSell').click();await wait_idle()
        assert writes()[-1]['data']['vendor']=='technician'
        await page.locator('[data-ut-action="back"]').click()
        assert await page.locator('#technicianScreen').is_visible()
        checks.append('Diesel trading and upgrades preserved')
        # Friendly encounters use their own buy endpoint and never expose the base warehouse.
        await page.evaluate("raidActive=true;raidSessionToken='offline';currentEnemy={name:'Друг',faction:{name:'Свобода'}};isFriendlyEncounterActive=true;openFriendlyTrade()")
        assert (await page.evaluate('UniversalTrade.snapshot()'))['vendor']=='friendly'
        assert not await page.locator('#utStorageArea').is_visible()
        assert await page.locator('#utDeposit').is_disabled()
        await item('stock',a).click();await item('stock',a).click();n=len(writes())
        await page.locator('#utBuy').click();await wait_idle()
        assert len(writes())==n+2 and writes()[-1]['path'].endswith('/friendly/buy')
        await page.locator('[data-ut-action="back"]').click();await page.wait_for_timeout(150)
        await page.evaluate('raidActive=false;inventoryOpenedFromRaid=false;currentEnemy=null;openScreen("main")')
        checks.append('friendly faction trade, no remote warehouse access')
        # Layout and route checks on small phones and landscape, high levels and long names.
        await page.evaluate('player.level=600;openScreen("shop")')
        await page.locator('#utSearch').fill('нет такого товара')
        assert await page.locator('#utStock [data-ut-item]').count()==0
        await page.locator('#utSearch').fill('')
        for width,height in [(320,568),(360,800),(390,844),(412,915),(844,390)]:
            await page.set_viewport_size({'width':width,'height':height})
            for who in ['zhuchara','leonov','technician']:
                await page.evaluate('(v)=>UniversalTrade.open(v)',who);await page.wait_for_timeout(80)
                assert not await page.locator('#universalTradeScreen').evaluate('(e)=>e.scrollWidth>e.clientWidth+1')
                bounds=await page.locator('#universalTradeScreen').bounding_box()
                assert bounds and 0<=bounds['y']<=10 and bounds['y']+bounds['height']<=height+1
                await page.screenshot(path=str(OUT/f'{who}-{width}x{height}.png'))
        await page.evaluate('openScreen("main")')
        for screen in ['inventory','warehouse','kpk','starsShop','market','technician']:
            await page.evaluate('(s)=>openScreen(s)',screen)
            assert await page.locator('#'+screen+'Screen').is_visible()
        assert not errors,errors
        result={'status':'passed','live_player_writes':0,'mock_trade_writes':len(writes()),'page_errors':errors,'viewports':5,'checks':checks+['full-width adjacent buttons','no horizontal overflow','legacy non-NPC screens preserved','search','item information','insufficient funds']}
        (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));await browser.close()

asyncio.run(main())
