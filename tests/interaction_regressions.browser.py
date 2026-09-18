"""Exercise the real client DOM with mocked networking. No live player writes."""
import asyncio, json, re, base64, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation/interaction-regressions'
OUT.mkdir(parents=True,exist_ok=True)
TG="window.Telegram={WebApp:{initData:'offline-only',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state={'nickname':'Тест','health':100,'maxHealth':100,'hunger':100,'thirst':100,'level':600,'exp':0,'radiation':0,'coins':9999999,'breedCredits':50,'inventory':{},'warehouse':{}}
    notifications={'dm':[],'system':[],'friends':[],'fail':False}
    writes=[]; errors=[]; checks=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,service_workers='block')
        page=await context.new_page();page.set_default_timeout(5000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        await context.route('**/*',lambda route:route.abort())
        async def api(path,payload):
            data=[];status=200
            if path.endswith('/player/private'): data=state
            elif path.endswith('/chat/dm/conversations'):
                status=503 if notifications['fail'] else 200
                data=notifications['dm'] if status==200 else {'error':'offline fixture'}
            elif path.endswith('/chat/general'):
                status=503 if notifications['fail'] else 200
                data=notifications['system'] if status==200 else {'error':'offline fixture'}
            elif path.endswith('/friends/pending'):
                status=503 if notifications['fail'] else 200
                data=notifications['friends'] if status==200 else {'error':'offline fixture'}
            elif path.endswith('/shop/buy'):
                writes.append({'path':path,'payload':payload});await asyncio.sleep(.15)
                name=payload['name'];state['inventory'][name]=state['inventory'].get(name,0)+payload['qty']
                data={'success':True,**state}
            elif '/faction' in path: data={'success':True,'faction':None}
            elif path.endswith(('/shop/sell','/scientists/sell','/raid/start','/raid/end')):
                writes.append({'path':path,'payload':payload});data={'success':False,'error':'unexpected fixture write'}
            return {'status':status,'data':data}
        await page.expose_function('__fixture',api)
        await page.evaluate(TG)
        await page.evaluate("""(audio) => {
            window.__pdaPlays=0;HTMLMediaElement.prototype.play=function(){window.__pdaPlays++;return Promise.resolve()};
            const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},configurable:true});
            window.fetch=async(input,init={})=>{
                const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
                if(path.endsWith('pda-notification.mp3.b64'))return new Response(audio);
                if(path.includes('/api/')){const x=await window.__fixture(path,init.body?JSON.parse(init.body):{});return new Response(JSON.stringify(x.data),{status:x.status,headers:{'Content-Type':'application/json'}})}
                return new Response('{}',{status:404});
            };
        }""",(ROOT/'ui/pda-notification.mp3.b64').read_text())
        html=(ROOT/'index.html').read_text()
        def inline_script(m):
            src=m[1].split('?')[0];f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
            if 'defer' in m[0]: code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline_script,html)
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text()+'</style>' if (ROOT/m[1].split('?')[0]).is_file() else '',html)
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("window.TradeMenu?.version==='1.3.0' && player.nickname==='Тест'")
        names=await page.evaluate("getShopCatalog().slice(0,40).map(x=>x.name)")
        state['inventory']={n:10 for n in names}
        armor_name=await page.evaluate('armorItems[5].name');state['inventory'][armor_name]=1
        await page.evaluate('(s)=>{Object.assign(player,s);updateUI()}',state)
        async def dismiss():
            modal=page.locator('#itemInfoModal')
            if await modal.is_visible(): await modal.locator('button').last.click()
        def item(source,name):
            return page.locator(f'#tradeMenu [data-trade-source={source}][data-trade-name={json.dumps(name,ensure_ascii=False)}]')
        assert await page.locator('#bunkerPda').evaluate('(e)=>getComputedStyle(e).position')=='absolute'
        b=await page.locator('#bunkerPda').bounding_box();scene=await page.locator('#bunkerScene').bounding_box()
        assert abs(b['x']-(scene['x']+.841*scene['width']))<2
        checks.append('PDA hotspot stays on the illustrated device')
        await page.evaluate("openScreen('technician')")
        await page.locator('#dieselHubScreen [data-trader-action=talk]').click()
        assert await page.locator('#gameAlertModal').is_visible()
        assert await page.locator('#gameAlertModal button').evaluate('(e)=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}')
        await page.locator('#gameAlertModal button').click()
        await page.locator('#dieselHubScreen [data-trader-action=upgrade]').click()
        assert await page.locator('#technicianScreen').is_visible()
        assert not await page.locator('#tradeMenu').is_visible()
        assert await page.locator('#technicianScreen button[onclick*=openTechnicianTab]:visible').count()==0
        assert await page.locator('#technicianScreen .zr-hero:visible,#technicianScreen .zr-title img:visible').count()==0
        await page.screenshot(path=str(OUT/'diesel-upgrade-390.png'))
        checks.append('Diesel upgrades only, no old portrait or trading tabs; talk dialog topmost')
        await page.locator('#technicianScreen .back-btn').first.click()
        assert await page.locator('#dieselHubScreen').is_visible()
        await page.locator('#dieselHubScreen [data-trader-action=back]').click()
        await page.locator('#bunkerZhuchara').click()
        await page.locator('#zhucharaHubScreen [data-trader-action=trade]').click()
        snapshot=await page.evaluate('JSON.stringify(player.inventory)')
        name=names[0]
        await item('stock',name).click()
        assert await item('buy',name).count()==1
        assert not await page.locator('#itemInfoModal').is_visible()
        await item('buy',name).click()
        assert await item('buy',name).count()==0
        assert not await page.locator('#itemInfoModal').is_visible()
        await item('inventory',name).click()
        assert await item('sell',name).count()==1
        assert not await page.locator('#itemInfoModal').is_visible()
        await item('sell',name).click()
        assert await item('sell',name).count()==0
        assert not await page.locator('#itemInfoModal').is_visible()
        target=item('stock',name);box=await target.bounding_box()
        cdp=await context.new_cdp_session(page);x=box['x']+box['width']/2;y=box['y']+box['height']/2
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        await page.wait_for_timeout(560)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await cdp.detach()
        assert await page.locator('#itemInfoModal').is_visible()
        assert name in await page.locator('#itemInfoModalTitle').text_content()
        assert await item('buy',name).count()==0
        await dismiss()
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        assert not writes
        checks.append('Short tap stages/unstages only; long hold on source opens info without moving the item')
        bag=page.locator('#tradeInventory');await bag.scroll_into_view_if_needed()
        await bag.evaluate('(e)=>e.scrollTop=0')
        outer=await page.locator('#tradeMenu').evaluate('(e)=>e.scrollTop')
        bb=await bag.bounding_box();x=bb['x']+bb['width']*.35;y=bb['y']+min(140,bb['height']-10)
        cdp=await context.new_cdp_session(page)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        for dy in [15,35,65,90]:
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-dy}]})
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await cdp.detach()
        assert await bag.evaluate('(e)=>e.scrollTop')>0
        assert abs(await page.locator('#tradeMenu').evaluate('(e)=>e.scrollTop')-outer)<2
        assert not await page.locator('#itemInfoModal').is_visible()
        await page.wait_for_timeout(550)
        checks.append('Touch inventory swipe stays inside its own scrolling panel')
        await item('stock',name).click();await dismiss()
        await page.locator('#tradeBuy').evaluate('(e)=>{e.click();e.click()}')
        await page.wait_for_timeout(400)
        assert len(writes)==1 and writes[0]['payload']['name']==name
        checks.append('Buy delegates one transaction to mocked server; double tap guarded')
        await page.evaluate("openScreen('main');openScreen('inventory')")
        icon=page.locator('#inventoryScreen img[data-item-info='+json.dumps(armor_name,ensure_ascii=False)+']').first
        icon_name=await icon.get_attribute('data-item-info')
        filename=await page.evaluate('(n)=>getItemIcon(n)',icon_name)
        candidates=list(ROOT.rglob(filename));assert candidates,filename
        icon_b64=base64.b64encode(candidates[0].read_bytes()).decode()
        await icon.evaluate('(e,src)=>{e.src=src;e.style.display=""}', 'data:image/webp;base64,'+icon_b64)
        await icon.click();assert await page.locator('#itemInfoModal').is_visible()
        await dismiss()
        checks.append('Item image factory names open inventory item details')
        await page.evaluate('PdaNotifications.check()')
        notifications['dm']=[{'playerId':'202','lastSenderId':'202','lastMessageAt':1900000000000}]
        before=await page.evaluate('window.__pdaPlays');await page.evaluate('PdaNotifications.check()');await page.wait_for_timeout(100)
        assert await page.locator('#bunkerPda [data-pda-indicator=dm]').get_attribute('aria-hidden')=='false'
        played=await page.evaluate('window.__pdaPlays');assert played>before
        notifications['fail']=True;await page.evaluate('PdaNotifications.check()')
        notifications['fail']=False;await page.evaluate('PdaNotifications.check()');await page.wait_for_timeout(80)
        assert await page.evaluate('window.__pdaPlays')==played
        notifications['dm'][0]['lastMessageAt']+=1
        await page.evaluate('PdaNotifications.check()');await page.wait_for_timeout(80)
        assert await page.evaluate('window.__pdaPlays')>played
        checks.append('New DM while already unread sounds again; failed poll/recovery does not repeat')
        notifications['friends']=[{'id':'303','username':'Новый друг'}]
        before_friend=await page.evaluate('window.__pdaPlays');await page.evaluate('PdaNotifications.check()');await page.wait_for_timeout(80)
        assert await page.locator('#bunkerPda [data-pda-indicator=friend]').get_attribute('aria-hidden')=='false'
        assert await page.locator('#kpkChatBtn [data-pda-indicator=friend]').count()==1
        assert await page.evaluate('window.__pdaPlays')>before_friend
        checks.append('Pending friend request shows on PDA/Telegram indicators and plays the PDA sound')
        await page.evaluate("raidActive=true;currentEnemy=null;currentAnomaly=null;raidSessionToken='offline-test';openScreen('raid')")
        assert await page.locator('#raidUtilityButtons').evaluate("e=>e.previousElementSibling.id==='battleButtonsContainer'")
        boxes=await page.locator('#raidUtilityButtons>button').evaluate_all('(xs)=>xs.map(x=>x.getBoundingClientRect().top)')
        assert len(boxes)==2 and abs(boxes[0]-boxes[1])<1
        styles=await page.locator('#raidUtilityButtons>button').evaluate_all("""xs=>xs.map(e=>{const s=getComputedStyle(e);return [s.backgroundImage,s.borderImageSource,s.fontFamily,s.fontSize,s.borderTopWidth,s.minHeight]})""")
        assert len(styles)==2 and styles[0]==styles[1],styles
        assert await page.locator('#raidTelegramBtn [data-pda-indicator=friend]').count()==1
        await page.locator('#raidTelegramBtn').click()
        assert await page.locator('#chatScreen').is_visible()
        await page.locator('#chatBackToKpkBtn').click()
        assert await page.locator('#raidScreen').is_visible()
        assert await page.evaluate("raidActive && raidSessionToken==='offline-test'")
        assert len(writes)==1
        checks.append('Raid backpack/Telegram one row; chat Back preserves the raid session')
        for w,h in [(320,568),(390,844),(844,390)]:
            await page.set_viewport_size({'width':w,'height':h})
            await page.evaluate("openScreen('main');openScreen('technician')")
            await page.locator('#dieselHubScreen [data-trader-action=upgrade]').click()
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert not errors,errors
        report={'status':'passed','live_player_writes':0,'page_errors':errors,'checks':checks,'viewports':3,'not_verified':'Live parcel event delivery / real Android audio playback'}
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False));await browser.close()

asyncio.run(main())
