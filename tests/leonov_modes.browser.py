"""Full Telegram client, mocked API, no live player data/writes.
Run: python tests/leonov_modes.browser.py /usr/bin/chromium
"""
import asyncio
import base64
import json
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation' / 'leonov-modes'
OUT.mkdir(parents=True, exist_ok=True)
TG = "window.Telegram={WebApp:{initData:'offline-test-only',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state = dict(nickname='Тестовый сталкер', health=89, maxHealth=150, hunger=66, thirst=42,
                 coins=6891, breedCredits=7, level=6, exp=123, radiation=18, inventory={'Книга знаний':3})
    calls, errors = [], []
    response_mode = 'reject'
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else None, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = await browser.new_page(viewport={'width':390,'height':844}, has_touch=True)
        page.set_default_timeout(5000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        async def api_fixture(path, payload, method):
            calls.append({'path':path,'method':method,'payload':payload})
            if path.endswith('/player/private'): return state
            if path.endswith('/artifacts/breed'):
                await asyncio.sleep(.15)
                if response_mode == 'network': raise RuntimeError('Simulated offline network failure')
                if response_mode == 'reject': return {'success':False,'error':'Проверка отказа сервера'}
                for name in (payload['parent1'],payload['parent2']): state['inventory'][name]-=1
                state['inventory']['Тестовая селекция']=1
                state['breedCredits']-=1
                artifact={'name':'Тестовая селекция','tier':1,'gen':1,'stats':{'health':1}}
                state['craftedArtifacts']={artifact['name']:artifact}
                return {'success':True,'inventory':state['inventory'],'breedCredits':state['breedCredits'],'artifact':artifact}
            if path.endswith('/equipment/features'): return {'artifactSlotTarget':True}
            if '/faction' in path: return {'success':True,'faction':None}
            return []
        await page.expose_function('__leonovFixture',api_fixture)
        await page.evaluate(TG)
        await page.evaluate("""() => { window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
            const value=path.includes('/api/')?await window.__leonovFixture(path,init.body?JSON.parse(init.body):null,init.method||'GET'):{};
            return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        }; }""")
        # Embed current local modules so Chromium's network policy cannot mask a code failure.
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
        artwork=ROOT/'file_000000002bb08210800056ebfb1dce1f.png'
        html=html.replace(artwork.name+'?v=0503d3b544d1','data:image/png;base64,'+base64.b64encode(artwork.read_bytes()).decode())
        # Every fetch is mocked, including failed transactions. No live player writes.
        await page.set_content(html,wait_until='domcontentloaded',timeout=5000)
        await page.wait_for_function("window.BunkerMenu?.version === '1.2.0' && document.getElementById('coins').textContent === '6891'")
        names = await page.evaluate("artifacts.filter(a=>!a.isNamedArtifact && !a.gen).slice(0,2).map(a=>a.name)")
        a,b=names
        state.update(await page.evaluate('JSON.parse(JSON.stringify(player))'))
        state['inventory'].update({a:1,b:2})
        await page.evaluate('(inv)=>{player.inventory=inv;updateUI()}',state['inventory'])
        breed_calls=lambda: [c for c in calls if c['path'].endswith('/artifacts/breed')]
        async def enter(mode):
            await page.evaluate("document.getElementById('gameAlertModal').classList.remove('active');openScreen('main');BunkerMenu.openLeonov()")
            await page.locator(f'[data-leonov-action={mode}]').click()
            await page.wait_for_timeout(80)
        async def clean_slots():
            await page.evaluate('breedSlot1=null;breedSlot2=null;renderScientists()')
        async def drag(name,slot, touch=False, cancel=False):
            src=page.locator('[data-leonov-item]').filter(has=page.locator('span',has_text=re.compile('^'+re.escape(name)+'$')))
            await src.scroll_into_view_if_needed()
            source=await src.bounding_box()
            await page.locator(f'[data-leonov-drop="{slot}"]').scroll_into_view_if_needed()
            source=await src.bounding_box()
            target=await page.locator(f'[data-leonov-drop="{slot}"]').bounding_box()
            sx,sy=source['x']+source['width']/2,source['y']+source['height']/2
            tx,ty=target['x']+target['width']/2,target['y']+target['height']/2
            if touch:
                cdp=await page.context.new_cdp_session(page)
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
                await page.wait_for_timeout(260)
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':tx,'y':ty}]})
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
                await cdp.detach()
            else:
                await page.mouse.move(sx,sy);await page.mouse.down()
                await page.mouse.move(tx,ty,steps=12)
                if cancel: await page.keyboard.press('Escape')
                await page.mouse.up()
            await page.wait_for_timeout(550)
        # Hub navigation and no automatic breeding or trade request.
        await page.locator('#bunkerLeonov').click()
        assert await page.locator('#leonovHubScreen').is_visible()
        await page.locator('[data-leonov-action=selection]').click()
        assert await page.locator('#leonovSelectionPanel').is_visible()
        assert not await page.locator('#leonovTradePanel').is_visible()
        assert not await page.locator('#leonovBuyButton').is_visible()
        assert not await page.locator('#leonovSellButton').is_visible()
        assert len(breed_calls())==0
        assert not await page.locator('#gameAlertModal').is_visible()
        assert await page.locator('#leonovSelectionPanel .zr-breed-actions button').count()==1
        assert await page.locator('#leonovArtifactInventory [data-leonov-item]').count()==2
        # Pointer drag retains the original two parents and never spends inventory locally.
        snapshot=await page.evaluate('JSON.stringify(player.inventory)')
        await drag(a,1)
        assert await page.evaluate('breedSlot1')==a
        await drag(b,2,touch=True)
        assert await page.evaluate('breedSlot2')==b
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        await page.screenshot(path=str(OUT/'selection-390x844.png'))
        # Cancel and single-copy duplicate rejection.
        await clean_slots();await drag(a,1,touch=True,cancel=True)
        assert await page.evaluate('breedSlot1') is None
        await drag(a,1);await drag(a,2)
        assert await page.evaluate('breedSlot2') is None
        assert 'два экземпляра' in await page.locator('#leonovDragHint').inner_text()
        await drag(b,2)
        # Server rejection and repeat click guard. Slots/inventory/credits survive rejection.
        await page.evaluate('doBreedArtifacts();doBreedArtifacts()')
        await page.wait_for_timeout(350)
        assert len(breed_calls())==1
        assert breed_calls()[0]['payload']['parent1']==a
        assert breed_calls()[0]['payload']['parent2']==b
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        assert await page.evaluate('breedSlot1')==a
        assert not await page.locator('#leonovBreedButton').is_disabled()
        await page.evaluate("document.getElementById('gameAlertModal').classList.remove('active')")
        response_mode='network'
        await page.evaluate('doBreedArtifacts()');await page.wait_for_timeout(350)
        assert len(breed_calls())==2
        assert await page.evaluate('JSON.stringify(player.inventory)')==snapshot
        assert not await page.locator('#leonovBreedButton').is_disabled()
        await page.evaluate("document.getElementById('gameAlertModal').classList.remove('active')")
        response_mode='ok'
        await page.locator('#leonovBreedButton').click();await page.wait_for_timeout(500)
        assert len(breed_calls())==3
        assert await page.evaluate('breedSlot1') is None
        assert await page.evaluate('breedSlot2') is None
        assert 'Тестовая селекция' in await page.locator('#breedSlot3Label').inner_text()
        assert await page.evaluate('player.breedCredits')==6
        assert await page.evaluate('player.inventory["Тестовая селекция"]')==1
        assert not await page.locator('#gameAlertModal').is_visible()
        # Back reaches approved Leonov hub; trade cannot expose or invoke selection.
        await page.locator('#scientistsScreen .back-btn:visible').click()
        assert await page.locator('#leonovHubScreen').is_visible()
        await page.locator('[data-leonov-action=trade]').click()
        assert await page.locator('#leonovTradePanel').is_visible()
        assert not await page.locator('#leonovSelectionPanel').is_visible()
        assert not await page.locator('#leonovBreedButton').is_visible()
        await page.evaluate('doBreedArtifacts()')
        assert len(breed_calls())==3
        await page.locator('#leonovBuyButton').click()
        assert await page.locator('#scientistsBuyList button').count()>0
        assert await page.locator('#scientistsSellList').inner_text()==''
        await page.locator('#leonovSellButton').click()
        assert await page.locator('#scientistsBuyList').inner_text()==''
        assert 'Тестовая селекция' in await page.locator('#scientistsSellList').inner_text()
        await page.screenshot(path=str(OUT/'trade-390x844.png'))
        await enter('selection')
        assert await page.locator('#scientistsBuyList').inner_text()==''
        assert await page.locator('#scientistsSellList').inner_text()==''
        # Empty inventory refresh does not retain unavailable parents.
        await page.evaluate("player.inventory={};renderScientists()")
        assert await page.locator('#leonovArtifactInventory .leonov-empty').count()==1
        await page.evaluate('(inv)=>{player.inventory=inv;renderScientists()}',state['inventory'])
        for width,height in [(320,568),(360,800),(390,844),(412,915),(844,390)]:
            await page.set_viewport_size({'width':width,'height':height})
            for mode in ('selection','trade'):
                await enter(mode)
                assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
                assert not await page.locator('#scientistsScreen').evaluate('(e)=>e.scrollWidth>e.clientWidth+1')
                if mode=='selection':
                    button=await page.locator('#leonovBreedButton').bounding_box()
                    panel=await page.locator('.zr-breed-actions').bounding_box()
                    assert abs(button['width']-panel['width'])<2
                await page.screenshot(path=str(OUT/f'{mode}-{width}x{height}.png'))
        await page.evaluate("openScreen('scientists')")
        assert await page.locator('#leonovHubScreen').is_visible()
        await page.locator('[data-leonov-action=back]').click()
        assert await page.locator('#mainMenu').is_visible()
        assert not await page.locator('#leonovHubScreen').is_visible()
        for target in ['inventory','warehouse','shop','technician','kpk']:
            await page.evaluate('(s)=>openScreen(s)',target)
            assert await page.locator('#'+target+'Screen').is_visible()
        assert not errors,errors
        result={'status':'passed','live_player_writes':0,'page_errors':errors,'mock_breed_requests':len(breed_calls()),'viewports':5,
                'checks':['exclusive modes','no automatic transaction','original slots and result','mouse drag','touch hold/drag','touch cancellation','single-copy duplicate rejection','no local spending','double-submit guard','server rejection','network failure recovery','server success and result','buy/sell views','back to hub','warehouse entry','other screen navigation','full-width selection action']}
        (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        print(json.dumps(result,ensure_ascii=False));await browser.close()
asyncio.run(main())
