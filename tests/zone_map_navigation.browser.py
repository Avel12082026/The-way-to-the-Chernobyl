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
          window.__zoneMapTravelMs=90;
          window.__calls={start:0,back:0,end:0,open:[],alerts:[],fetches:[]};
          window.raidActive=false;
          window.currentEnemy=null;
          window.currentAnomaly=null;
          window.currentLuckyFind=null;
          window.expNeededForLevel=()=>100;
          window.player={
            level:1,health:100,maxHealth:100,hunger:100,maxHunger:100,
            thirst:100,maxThirst:100,radiation:0,exp:0,coins:100000,breedCredits:0,inventory:{}
          };
          window.weapons=[
            ...Array.from({length:29},(_,i)=>({
              name:'Пистолет '+(i+1),
              starterGear:i===0,
              unlockLevel:i<10 ? i+1 : (i<20 ? 210+(i-10)*10 : 700+(i-20)*10)
            })),
            {name:'Дробовик первый',unlockLevel:900}
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
        await page.wait_for_function("window.BunkerMenu?.version==='1.10.0' && window.ZoneMap?.version==='0.6.0'")

        zone=page.locator('#zoneMapScreen')
        await page.locator('#bunkerRaid').click()
        assert await zone.is_visible()
        assert await page.evaluate('ZoneMap.location')==1
        assert await page.locator('#zoneMapTitle').inner_text()=='Кардон'

        # Location 2 remains gated by first ten pistols + first ten armor.
        await page.locator('[data-zone-point="transition-to-2"]').click()
        assert (await page.evaluate('window.__calls.alerts.at(-1)'))=='У меня еще недостаточно хорошое снаряжения чтобы идти на свалку'

        await page.evaluate('player.level=200')
        await page.locator('[data-zone-point="transition-to-2"]').click()
        await page.wait_for_function("ZoneMap.location===2")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        assert await page.locator('#zoneMapTitle').inner_text()=='Свалка'

        # Left-middle Svalka transition is the NII Agroprom route and stays locked
        # until all final nine pistols are unlocked.
        assert await page.evaluate('ZoneMap.lastNinePistolsReady()') is False
        await page.locator('[data-zone-point="transition-to-3"]').click()
        assert await page.evaluate('ZoneMap.location')==2
        assert (await page.evaluate('window.__calls.alerts.at(-1)'))=='Чтобы попасть на НИИ Агропром, должны быть открыты последние 9 пистолетов.'

        await page.evaluate('player.level=1000')
        assert await page.evaluate('ZoneMap.lastNinePistolsReady()') is True
        await page.locator('[data-zone-point="transition-to-3"]').click()
        travel=page.locator('#zoneMapTravel')
        await travel.wait_for(state='visible')
        assert await page.locator('#zoneMapTravelRoute').inner_text()=='Свалка → НИИ Агропром'
        await page.wait_for_function("ZoneMap.location===3")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")

        assert await page.locator('#zoneMapTitle').inner_text()=='НИИ Агропром'
        points3=await page.evaluate('ZoneMap.points')
        assert len(points3)==7,points3
        assert sum(p['kind']=='enemy' for p in points3)==2
        assert sum(p['kind']=='mutant' for p in points3)==2
        assert sum(p['kind']=='anomaly' for p in points3)==2
        assert all(p['label']=='Военные' for p in points3 if p['kind']=='enemy')
        assert not any(p['kind']=='camp' for p in points3)

        # Native proportions of the supplied 863x1536 Agroprom map are preserved.
        canvas3=await page.locator('#zoneMapCanvas').bounding_box()
        assert abs((canvas3['width']/canvas3['height'])-(863/1536))<0.02,canvas3

        # A Military marker starts a tier-3 routed raid.
        enemy3=next(p for p in points3 if p['kind']=='enemy')
        await page.locator(f'[data-zone-point="{enemy3["id"]}"]').click()
        assert await page.evaluate('ZoneMap.routeKind')=='enemy'
        assert await page.evaluate('ZoneMap.location')==3
        assert await page.evaluate('window.__calls.start')==1

        await page.evaluate("""()=>fetch('/api/raid/step',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({raidToken:'r'})
        })""")
        routed=await page.evaluate('window.__calls.fetches.at(-1)')
        assert routed['url'].endswith('/api/raid/zone-step'),routed
        assert routed['body']['zoneKind']=='enemy' and routed['body']['zoneLocation']==3,routed

        # Open-map in the raid keeps NII Agroprom as current location.
        await page.evaluate("document.getElementById('raidScreen').classList.add('active')")
        await page.locator('#raidMapBtn').click()
        assert await zone.is_visible()
        assert await page.evaluate('ZoneMap.location')==3
        assert await page.locator('#zoneMapTitle').inner_text()=='НИИ Агропром'

        # Right-middle transition on NII Agroprom returns to Svalka with loading screen.
        await page.locator('[data-zone-point="transition-to-2"]').click()
        await travel.wait_for(state='visible')
        assert await page.locator('#zoneMapTravelRoute').inner_text()=='НИИ Агропром → Свалка'
        await page.wait_for_function("ZoneMap.location===2")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        assert await page.locator('#zoneMapTitle').inner_text()=='Свалка'

        catalog=await page.evaluate('getShopCatalog()')
        assert sum(x.get('category')=='weapon' for x in catalog)==10
        assert sum(x.get('category')=='armor' for x in catalog)==10

        assert not errors,errors
        print(json.dumps({
          'status':'passed',
          'agroprom_points':points3,
          'map3_canvas':canvas3,
          'routed':routed
        },ensure_ascii=False))
        await browser.close()

asyncio.run(main())
