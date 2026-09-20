#!/usr/bin/env python3
import asyncio, json, base64
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
ONE_PX=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')

async def main():
    js=(ROOT/'ui/bunker-menu.js').read_text(encoding='utf-8')
    css=(ROOT/'ui/bunker-menu.css').read_text(encoding='utf-8')
    errors=[]

    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda exc: errors.append(str(exc)))

        async def image_route(route):
            await route.fulfill(status=200,body=ONE_PX,content_type='image/png')
        await page.route('http://game.test/api/zone-map/*',image_route)

        await page.set_content('''<!doctype html><html><body>
          <section id="mainMenu" style="display:block"><div id="bunkerScene">
            <img id="bunkerArtwork" alt="">
            <span id="coins"></span><span id="breedCreditsHeader"></span><span id="knowledgeBooksHeader"></span>
            <button id="bunkerRaid" type="button" onclick="BunkerMenu.enterRaid()">raid</button>
          </div></section>
          <section id="raidScreen" class="screen"><div id="raidNavButtons">
            <button id="raidStepBtn">Идти дальше</button><button onclick="endRaid()">Вернуться с рейда</button>
          </div></section>
          <div id="embeddedChatWidget"></div>
        </body></html>''')
        await page.add_style_tag(content=css)
        await page.evaluate("""()=>{
          window.SERVER_URL='http://game.test';
          window.__calls={start:0,back:0,end:0,open:[],alerts:[],fetches:[]};
          window.raidActive=false;
          window.currentEnemy=null;
          window.currentAnomaly=null;
          window.currentLuckyFind=null;
          window.expNeededForLevel=()=>100;
          window.player={
            level:200,health:100,maxHealth:100,hunger:100,maxHunger:100,
            thirst:100,maxThirst:100,radiation:0,exp:0,coins:100000,breedCredits:0,inventory:{}
          };
          window.weapons=[
            ...Array.from({length:20},(_,i)=>({
              name:'Пистолет '+(i+1),starterGear:i===0,unlockLevel:i<10?1+i:220+(i-10)*20
            })),
            {name:'Дробовик первый',unlockLevel:500}
          ];
          window.armorItems=Array.from({length:12},(_,i)=>({name:'Броня '+(i+1),unlockLevel:i+1}));
          window.getShopCatalog=()=>[
            ...weapons.map(x=>({...x,category:'weapon'})),
            ...armorItems.map(x=>({...x,category:'armor'})),
            {name:'Аптечка',category:'consumable'}
          ];
          window.startRaid=async()=>{window.__calls.start++;window.raidActive=true;};
          window.returnToRaid=()=>{window.__calls.back++;document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById('raidScreen').classList.add('active');};
          window.endRaid=async()=>{window.__calls.end++;window.raidActive=false;window.openScreen('main');};
          window.openScreen=(name)=>{window.__calls.open.push(name);document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById('mainMenu').style.display=name==='main'?'block':'none';};
          window.showGameAlert=(m)=>window.__calls.alerts.push(String(m));
          window.fetch=async(input,init={})=>{
            const url=String(input);
            window.__calls.fetches.push({url,body:init.body?JSON.parse(init.body):null});
            return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }""")
        await page.add_script_tag(content=js)
        await page.wait_for_function("window.BunkerMenu?.version==='1.8.0' && window.ZoneMap?.version==='0.4.0'")

        await page.locator('#bunkerRaid').click()
        zone=page.locator('#zoneMapScreen')
        assert await zone.is_visible()
        assert await page.evaluate('ZoneMap.location')==1
        assert await page.locator('#zoneMapPoints .zone-map-point').count()==11
        canvas=await page.locator('#zoneMapCanvas').bounding_box()
        assert round(canvas['width'])==390 and round(canvas['height'])==844,canvas

        assert await page.evaluate('ZoneMap.firstLocationToSecondReady()') is True
        await page.locator('[data-zone-point="transition-to-2"]').click()
        assert await page.evaluate('ZoneMap.location')==2
        points2=await page.evaluate('ZoneMap.points')
        assert len(points2)==11
        assert not any(p['kind']=='camp' for p in points2)
        assert all(p['label']=='Бандиты' for p in points2 if p['kind']=='enemy')

        future=next(p for p in points2 if p.get('future'))
        await page.locator(f'[data-zone-point="{future["id"]}"]').click()
        assert (await page.evaluate('window.__calls.alerts.at(-1)'))=='Переход откроется, когда станет доступна вторая десятка пистолетов.'

        await page.locator('[data-zone-point="transition-to-1"]').click()
        assert await page.evaluate('ZoneMap.location')==1

        await page.locator('[data-zone-point="transition-to-2"]').click()
        enemy2=next(p for p in (await page.evaluate('ZoneMap.points')) if p['kind']=='enemy')
        await page.locator(f'[data-zone-point="{enemy2["id"]}"]').click()
        assert await page.evaluate('ZoneMap.routeKind')=='enemy'
        assert await page.evaluate('ZoneMap.location')==2
        assert await page.evaluate('window.__calls.start')==1

        await page.evaluate("""()=>fetch('/api/raid/step',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({raidToken:'r'})
        })""")
        routed=await page.evaluate('window.__calls.fetches.at(-1)')
        assert routed['url'].endswith('/api/raid/zone-step'),routed
        assert routed['body']['zoneKind']=='enemy' and routed['body']['zoneLocation']==2,routed

        await page.evaluate("document.getElementById('raidScreen').classList.add('active')")
        await page.locator('#raidMapBtn').click()
        assert await zone.is_visible()
        assert await page.evaluate('ZoneMap.location')==2

        await page.evaluate('player.level=1000')
        await page.locator(f'[data-zone-point="{future["id"]}"]').click()
        assert (await page.evaluate('window.__calls.alerts.at(-1)'))=='Локация ещё не открыта сталкерами.'

        catalog=await page.evaluate('getShopCatalog()')
        assert sum(x.get('category')=='weapon' for x in catalog)==10
        assert sum(x.get('category')=='armor' for x in catalog)==10

        assert not errors,errors
        print(json.dumps({
          'status':'passed',
          'location2Kinds':[p['kind'] for p in points2],
          'routed':routed
        },ensure_ascii=False))
        await browser.close()

asyncio.run(main())
