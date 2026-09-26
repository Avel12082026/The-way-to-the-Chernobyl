"""Full-client offline fixtures; no real accounts or transactions."""
import asyncio, base64, json, mimetypes, os, re
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import unquote, urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation/rostok-trade'
OUT.mkdir(parents=True,exist_ok=True)
TG="window.__tgEvents={};window.Telegram={WebApp:{initData:'offline-regression-only',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(n,cb){(window.__tgEvents[n]??=[]).push(cb)},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
    state=dict(nickname='Тестовый сталкер',health=93,maxHealth=113,hunger=94,maxHunger=100,thirst=94,maxThirst=100,coins=127842,breedCredits=7,level=30,exp=912,radiation=0,inventory={'Книга знаний':3},warehouse={})
    errors=[];calls=[];mode={'kind':'ok'}
    async with async_playwright() as pw:
        exe=os.environ.get('CHROMIUM_EXECUTABLE_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        browser=await pw.chromium.launch(executable_path=exe,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=await browser.new_context(viewport={'width':390,'height':768},has_touch=True,device_scale_factor=1)
        page=await context.new_page();page.set_default_timeout(6000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        async def fixture(path,payload):
            def reply(data,status=200):return {'status':status,'text':json.dumps(data,ensure_ascii=False)}
            if '/api/' not in path:
                f=(ROOT/path.lstrip('/')).resolve()
                if f.is_relative_to(ROOT) and f.is_file() and f.suffix in ['.b64','.json','.js','.css']:
                    return {'status':200,'text':f.read_text()}
                return {'status':404,'text':'offline missing asset'}
            calls.append({'path':path,'body':payload})
            if path.endswith('/player/private'):return reply(state)
            if path.endswith(('/shop/buy','/friendly/buy','/shop/sell','/scientists/sell')):
                if mode['kind'].startswith('reject'):return reply({'success':False,'error':'Товар недоступен у этого торговца'},int(mode['kind'][6:]))
                if mode['kind']=='server500':return reply({'success':False,'error':'Внутренняя ошибка'},500)
                if mode['kind']=='network':raise RuntimeError('Simulated connection loss')
                n=payload['name'];q=payload.get('qty',1)
                if path.endswith('/buy'):
                    state['inventory'][n]=state['inventory'].get(n,0)+q;state['coins']-=10*q
                else:
                    state['inventory'][n]=state['inventory'].get(n,0)-q;state['coins']+=10*q
                if mode['kind']=='lost_after_commit':raise RuntimeError('Simulated lost confirmation after write')
                return reply({'success':True,**state})
            if path.endswith('/items/use-knowledge-book'):
                state['inventory']['Книга знаний']-=1;state['exp']+=100
                return reply({'success':True,**state})
            if '/faction' in path:return reply({'success':True,'faction':None})
            if path.endswith('/player/position'):return reply({'success':True,'worldPosition':payload})
            return reply([])
        await page.expose_function('__fixture',fixture)
        await page.evaluate(TG)
        await page.evaluate("""()=>{window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://fixture.test').pathname;
            const r=await window.__fixture(path,init.body?JSON.parse(init.body):{});
            return new Response(r.text,{status:r.status,headers:{'Content-Type':'application/json'}});
        }}""")
        html=(ROOT/'index.html').read_text()
        # set_content() has about:blank as its document URL; give relative game assets
        # the same base URL they have on the deployed GitHub Pages client.
        html=html.replace('<head>','<head><base href="https://avel12082026.github.io/The-way-to-the-Chernobyl/">',1)
        def script(m):
            src=m[1].split('?')[0];f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
            if 'defer' in m[0]:code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
        def css(m):
            f=ROOT/m[1].split('?')[0]
            return '<style>'+f.read_text()+'</style>' if f.is_file() else ''
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
        for rel,ver in [('images/zone-travel/kordon-village.webp','0503d3b544d1'),('ui/rostok-lower-hud.png','09db18421007')]:
            html=html.replace(rel+'?v='+ver,'data:image/png;base64,'+base64.b64encode((ROOT/rel).read_bytes()).decode())
        await context.route('**/*',lambda r:r.abort())
        async def travel_art(route):
            path=urlparse(route.request.url).path
            prefix='/The-way-to-the-Chernobyl/'
            if path.startswith(prefix): path=path[len(prefix):]
            else: path=path.lstrip('/')
            local=(ROOT/path).resolve()
            suffix=local.suffix.lower()
            mime={'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}.get(suffix)
            if local.is_relative_to(ROOT) and local.is_file() and mime:
                await route.fulfill(status=200,body=local.read_bytes(),content_type=mime)
            else:
                await route.abort()
        for pattern in ('**/*.webp','**/*.png','**/*.jpg','**/*.jpeg'):
            await context.route(pattern,travel_art)
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("window.TradeMenu && window.BunkerMenu && document.getElementById('coins').textContent==='127842'")
        await page.wait_for_timeout(200)
        await page.evaluate("window.showGameAlert=msg=>{(window.__alerts??=[]).push(msg)}")
        report={'viewport_checks':[], 'trade_checks':[], 'no_live_player_writes':True}
        async def cordon():
            await page.evaluate("""()=>{document.getElementById('rostokCampScreen')?.classList.remove('active');
                document.body.classList.remove('rostok-camp-visible');
                document.getElementById('mainMenu').style.display='block';
                dispatchEvent(new Event('resize'));BunkerMenu.refresh();}""")
            await page.wait_for_timeout(60)
        async def bar():
            await page.evaluate('BunkerMenu.openRostokCamp()');await page.wait_for_timeout(60)
            f=Path(os.environ.get('ROSTOK_BAR_FIXTURE',str(OUT/'rostok-bar.png')))
            if f.exists():
                await page.locator('#rostokCampArtwork').evaluate('(e,src)=>{e.src=src;return e.decode()}',
                    'data:image/png;base64,'+base64.b64encode(f.read_bytes()).decode())
            await page.locator('#rostokLowerHudArtwork').evaluate('(e)=>e.decode()')
        props=['width','height','font','color','backgroundColor','backgroundImage','borderRadius','padding','boxSizing']
        async def geometry(ids):
            return await page.evaluate("""({ids,props})=>Object.fromEntries(ids.map(id=>{
                const e=document.getElementById(id),s=getComputedStyle(e);
                return [id,{box:e.getBoundingClientRect().toJSON(),style:Object.fromEntries(props.map(k=>[k,s[k]]))}]
            }))""", {'ids':ids,'props':props})
        pairs=[('bunkerHunger','rostokHunger'),('bunkerThirst','rostokThirst'),('bunkerHealth','rostokHealth'),
               ('bunkerReadBook','rostokReadBook'),('bunkerInventory','rostokInventory'),('bunkerPda','rostokPda'),
               ('coins','rostokCoins'),('breedCreditsHeader','rostokBreedCredits'),('knowledgeBooksHeader','rostokKnowledgeBooks')]
        for w,h in [(390,768),(360,640),(412,915),(691,1360),(844,390)]:
            await page.set_viewport_size({'width':w,'height':h});await cordon()
            a=await geometry([x[0] for x in pairs])
            if w==691:await page.screenshot(path=str(OUT/'cordon-reference.png'))
            await bar();b=await geometry([x[1] for x in pairs])
            screen=await page.locator('#rostokCampScreen').bounding_box()
            scene=await page.locator('#rostokCampScene').bounding_box()
            lower=await page.locator('#rostokLowerHudArtwork').bounding_box()
            upper=await page.locator('.rostok-progress-row').bounding_box()
            assert abs(screen['height']-h)<1 and abs(scene['height']-h)<1,(screen,scene,h)
            assert scene['x']>=0 and scene['x']+scene['width']<=w+1,scene
            assert abs(lower['y']+lower['height']-h)<1,lower
            assert 0<=lower['y']-upper['y']-upper['height']<10,(lower,upper)
            delta=0
            for ca,rb in pairs:
                for k in ['x','y','width','height']:
                    d=abs(a[ca]['box'][k]-b[rb]['box'][k]);delta=max(delta,d)
                    assert d<0.12,(w,h,ca,rb,k,a[ca]['box'],b[rb]['box'])
                for k in props[2:]:assert a[ca]['style'][k]==b[rb]['style'][k],(w,h,ca,k,a[ca]['style'][k],b[rb]['style'][k])
            assert b['rostokHealth']['box']['bottom']<h-1
            assert await page.locator('#rostokLowerHudArtwork').evaluate('(e)=>e.naturalWidth===941&&e.naturalHeight===182')
            assert await page.locator('#rostokExperience').count()==1 and await page.locator('#rostokRadiation').count()==1
            assert await page.locator('#rostokLowerHud .bunker-vital').count()==3
            report['viewport_checks'].append({'width':w,'height':h,'max_control_delta_px':delta,'health_bottom':b['rostokHealth']['box']['bottom']})
            if w==691:
                await page.screenshot(path=str(OUT/'rostok-after.png'))
                await page.locator('#rostokLowerHudArtwork').screenshot(path=str(OUT/'rostok-hud-after.png'))
        await page.set_viewport_size({'width':390,'height':768});await bar()
        assert await page.locator('#rostokReadBook').inner_text()==await page.locator('#bunkerReadBook').inner_text()
        for name in ['Experience','Radiation']:
            assert await page.locator('#rostok'+name+' > div').evaluate('(e)=>getComputedStyle(e).backgroundImage')!='none', name+' missing visible fill'

        for value in [0,100]:
            await page.evaluate("""v=>{Object.assign(player,{health:v,maxHealth:100,hunger:v,thirst:v,radiation:v,exp:v?expNeededForLevel(player.level):0,coins:v?1234567890:0,breedCredits:v?12345:0});
                player.inventory['Книга знаний']=v?42:0;updateUI()}""",value)
            for name in ['Health','Hunger','Thirst','Experience','Radiation']:
                assert await page.locator('#rostok'+name+' > div').evaluate('(e)=>e.style.width')==str(value)+'%'
            assert await page.locator('#rostokCoins').inner_text()==('1234567890' if value else '0')
            assert await page.locator('#rostokKnowledgeBooks').inner_text()==('42' if value else '0')
            await page.locator('#rostokLowerHudArtwork').screenshot(path=str(OUT/f'rostok-hud-{value}.png'))
        await page.evaluate('s=>{Object.assign(player,s);updateUI()}',state)
        await page.locator('#rostokReadBook').tap()
        await page.wait_for_function("document.getElementById('rostokKnowledgeBooks').textContent==='2'")
        for button,screen_id in [('rostokInventory','inventoryScreen'),('rostokPda','kpkScreen')]:
            await page.locator('#'+button).tap()
            assert await page.locator('#'+screen_id).is_visible()
            await page.evaluate("openScreen('main')");await page.wait_for_timeout(60)
            assert await page.locator('#rostokCampScreen').is_visible()
        report['hud_interactions']=['book consumed once','inventory opens and returns','PDA opens and returns','live empty/full updates']

        # Capture the actual destination loading screens from the integrated client.
        await page.set_viewport_size({'width':390,'height':844})
        await page.evaluate("player.level=1000;window.__zoneMapTravelMs=2200")
        travel_cases=[
            (1,'transition-to-2','zone-travel-svalka.png','СВАЛКА','images/anomaly/background.jpg'),
            (2,'transition-to-1','zone-travel-cordon.png','КОРДОН','images/combat/environments/01.webp'),
            (2,'transition-to-3','zone-travel-agroprom.png','НИИ АГРОПРОМ','images/combat/environments/11.webp'),
            (2,'transition-to-4','zone-travel-rostok.png','РОССТОК','images/combat/environments/16.webp'),
        ]
        for origin,point_id,filename,title,asset in travel_cases:
            await page.evaluate("(loc)=>{ZoneMap.setLocation(loc);ZoneMap.open('camp')}",origin)
            await page.locator(f'[data-zone-point="{point_id}"]').click()
            travel=page.locator('#zoneMapTravel')
            await travel.wait_for(state='visible')
            assert await page.locator('#zoneMapTravelDestination').inner_text()==title
            assert asset in (await page.locator('#zoneMapTravelArtwork').get_attribute('src'))
            # CI runs offline: feed the same repository background that the real client requests.
            raw=(ROOT/asset).read_bytes()
            suffix=Path(asset).suffix.lower()
            mime='image/jpeg' if suffix in ('.jpg','.jpeg') else ('image/png' if suffix=='.png' else 'image/webp')
            data_uri='data:'+mime+';base64,'+base64.b64encode(raw).decode()
            await page.locator('#zoneMapTravelArtwork').evaluate("(e,src)=>{e.src=src;return e.decode()}",data_uri)
            # Force the exact repository overlay bytes into the offline browser too.
            scene_imgs=page.locator('#zoneMapTravelScene img')
            for n in range(await scene_imgs.count()):
                node=scene_imgs.nth(n)
                src=await node.get_attribute('src')
                p=urlparse(src).path
                prefix='/The-way-to-the-Chernobyl/'
                if p.startswith(prefix): p=p[len(prefix):]
                else: p=p.lstrip('/')
                local=(ROOT/p).resolve()
                assert local.is_relative_to(ROOT) and local.is_file(),(title,p)
                ext=local.suffix.lower()
                mime={'webp':'image/webp','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg'}[ext.lstrip('.')]
                uri='data:'+mime+';base64,'+base64.b64encode(local.read_bytes()).decode()
                await node.evaluate("(e,src)=>{e.src=src;return e.decode()}",uri)
            await page.wait_for_timeout(40)
            kind=await travel.get_attribute('data-scene')
            if title=='КОРДОН':
                assert kind=='camp'
                assert await page.locator('#zoneMapTravelScene .zone-travel-camp-stalker').count()==3
            elif title=='СВАЛКА':
                assert kind=='anomaly'
                assert await page.locator('#zoneMapTravelScene .zone-travel-mutant').count()==0
                assert await page.locator('#zoneMapTravelScene .zone-travel-artifact').count()==1
            else:
                assert kind=='mutant'
                assert await page.locator('#zoneMapTravelScene .zone-travel-mutant').count()==1
            await page.screenshot(path=str(OUT/filename),full_page=True)
            await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        report['travel_screens']=[x[2] for x in travel_cases]
        await bar()

        async def open_vendor(v):
            if await page.locator('#tradeMenu').is_visible():
                await page.locator('#tradeMenu [data-trade-action="back"]').click()
            for sel in ['#zhucharaHubScreen [data-trader-action="back"]','#dieselHubScreen [data-trader-action="back"]',
                        '#leonovHubScreen [data-leonov-action="back"]','#barmanHubScreen [data-barman-action="back"]']:
                loc=page.locator(sel)
                if await loc.count() and await loc.is_visible():await loc.click()
            if v=='zhuchara':
                await page.evaluate('TraderHubs.openZhuchara()');await page.locator('#zhucharaHubScreen [data-trader-action="trade"]').click()
            elif v=='technician':
                await page.evaluate('TraderHubs.openDiesel()');await page.locator('#dieselHubScreen [data-trader-action="trade"]').click()
            elif v=='leonov':
                await page.evaluate('BunkerMenu.openLeonov()');await page.locator('#leonovHubScreen [data-leonov-action="trade"]').click()
            else:
                await page.evaluate('BunkerMenu.openBarmanHub()');await page.locator('#barmanHubScreen [data-barman-action="trade"]').click()
            await page.wait_for_timeout(60)
        def writes():return [c for c in calls if c['path'].endswith(('/shop/buy','/shop/sell','/scientists/sell'))]
        async def select_first():
            loc=page.locator('#tradeStock [data-trade-name]').first
            n=await loc.get_attribute('data-trade-name');await loc.tap();return n
        async def buy():
            assert await page.locator('#tradeBuy').is_enabled()
            await page.locator('#tradeBuy').click()
            await page.wait_for_function("document.getElementById('tradeMenu').getAttribute('aria-busy')==='false'")
        await open_vendor('zhuchara')
        for status in [400,401,403,409,429]:
            if await page.locator('#tradeBuySlots [data-trade-name]').count():await page.locator('#tradeBuySlots [data-trade-name]').first.tap()
            n=await select_first();before=await page.evaluate('({coins:player.coins,inventory:{...player.inventory}})');wc=len(writes())
            mode['kind']='reject'+str(status);await buy()
            assert len(writes())==wc+1
            assert await page.evaluate('({coins:player.coins,inventory:{...player.inventory}})')==before
            assert 'Товар недоступен у этого торговца' in await page.locator('#tradeStatus').inner_text()
            assert not await page.locator('#tradeResync').is_visible()
            assert await page.locator('#tradeBuySlots [data-trade-name]').count()==1
            report['trade_checks'].append(f'HTTP {status}: rejection visible, no balance mutation, no global lock')
        mode['kind']='ok'
        for v in ['technician','leonov','barman','zhuchara']:
            await open_vendor(v);n=await select_first();wc=len(writes());old=state['inventory'].get(n,0)
            await buy();assert len(writes())==wc+1
            assert await page.evaluate('(n)=>player.inventory[n]',n)==old+1
            assert await page.evaluate('player.coins')==state['coins']
            assert writes()[-1]['body']['sourceVendor']==v
            assert writes()[-1]['body']['vendor']==('zhuchara' if v=='barman' else v)
            report['trade_checks'].append(v+': purchase confirmed once, correct vendor and inventory')
        for failure in ['network','server500','lost_after_commit']:
            mode['kind']=failure;n=await select_first();wc=len(writes());await buy()
            assert await page.locator('#tradeResync').is_visible()
            assert not await page.locator('#tradeBuy').is_enabled()
            assert len(writes())==wc+1
            mode['kind']='ok';await page.locator('#tradeResync').click()
            await page.wait_for_function("document.getElementById('tradeMenu').getAttribute('aria-busy')==='false'")
            assert not await page.locator('#tradeResync').is_visible()
            assert len(writes())==wc+1
            assert await page.evaluate('player.coins')==state['coins']
            report['trade_checks'].append(failure+': safely locked, resync succeeds, no duplicate write')
        assert not errors,errors
        report.update(status='passed',javascript_errors=errors,total_trade_requests=len(writes()))
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
        await browser.close()
if __name__=='__main__':asyncio.run(main())
