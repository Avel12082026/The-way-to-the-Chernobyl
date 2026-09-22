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
        await page.route('http://game.test/api/zone-camp/*',image_route)

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
            thirst:100,maxThirst:100,radiation:12,exp:37,coins:123456,breedCredits:7,inventory:{'Книга знаний':3}
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
          window.TradeMenu={open:(id)=>{window.__calls.trade=id;return true;}};
          window.useKnowledgeBookFromHeader=async()=>{window.__calls.read=(window.__calls.read||0)+1;player.inventory['Книга знаний']=Math.max(0,(player.inventory['Книга знаний']||0)-1);player.exp+=10;};
          window.fetch=async(input,init={})=>{
            const url=String(input);
            window.__calls.fetches.push({url,body:init.body?JSON.parse(init.body):null});
            return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }""")
        await page.add_script_tag(content=js)
        await page.wait_for_function("window.BunkerMenu?.version==='1.13.0' && window.ZoneMap?.version==='0.6.4'")

        zone=page.locator('#zoneMapScreen')
        await page.locator('#bunkerRaid').click()
        assert await zone.is_visible()
        assert await page.evaluate('ZoneMap.location')==1
        assert await page.locator('#zoneMapTitle').inner_text()=='Кордон'
        assert await page.locator('#zoneMapScreen .zone-map-back').count()==0
        assert await page.locator('#zoneMapScreen [data-zone-map-action="back"]').count()==0

        # Location 2 remains gated by first ten pistols + first ten armor.
        await page.locator('[data-zone-point="transition-to-2"]').click()
        assert (await page.evaluate('window.__calls.alerts.at(-1)'))=='У меня еще недостаточно хорошое снаряжения чтобы идти на свалку'

        await page.evaluate('player.level=200')
        await page.locator('[data-zone-point="transition-to-2"]').click()
        await page.wait_for_function("ZoneMap.location===2")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        assert await page.locator('#zoneMapTitle').inner_text()=='Свалка'

        # New Svalka artwork is 864x1536 and must remain fully proportional.
        canvas2=await page.locator('#zoneMapCanvas').bounding_box()
        assert abs((canvas2['width']/canvas2['height'])-(864/1536))<0.02,canvas2

        # Bottom Svalka transition returns to Kordon through the loading screen.
        await page.locator('[data-zone-point="transition-to-1"]').click()
        travel=page.locator('#zoneMapTravel')
        await travel.wait_for(state='visible')
        assert await page.locator('#zoneMapTravelRoute').inner_text()=='Свалка → Кордон'
        await page.wait_for_function("ZoneMap.location===1")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        assert await page.locator('#zoneMapTitle').inner_text()=='Кордон'

        # Kordon transition is the reverse route back to Svalka and also loads first.
        await page.locator('[data-zone-point="transition-to-2"]').click()
        await travel.wait_for(state='visible')
        assert await page.locator('#zoneMapTravelRoute').inner_text()=='Кордон → Свалка'
        await page.wait_for_function("ZoneMap.location===2")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        assert await page.locator('#zoneMapTitle').inner_text()=='Свалка'

        points2=await page.evaluate('ZoneMap.points')
        top=next(p for p in points2 if p['id']=='transition-to-4')
        assert top.get('future') is not True and top['targetLocation']==4
        bottom=next(p for p in points2 if p['id']=='transition-to-1')
        left=next(p for p in points2 if p['id']=='transition-to-3')
        assert abs(bottom['x']-62.82)<0.01 and abs(bottom['y']-71.62)<0.01,bottom
        assert abs(left['x']-10.50)<0.01 and abs(left['y']-47.49)<0.01,left

        # Upper Svalka transition is now the Rostok route and uses the second-pistol-decade gate.
        assert await page.evaluate('ZoneMap.secondPistolDecadeReady()') is False
        await page.locator('[data-zone-point="transition-to-4"]').click()
        assert await page.evaluate('ZoneMap.location')==2
        assert (await page.evaluate('window.__calls.alerts.at(-1)'))=='Чтобы попасть в Россток, должна быть открыта вторая десятка пистолетов.'

        await page.evaluate('player.level=400')
        assert await page.evaluate('ZoneMap.secondPistolDecadeReady()') is True
        await page.locator('[data-zone-point="transition-to-4"]').click()
        await travel.wait_for(state='visible')
        assert await page.locator('#zoneMapTravelRoute').inner_text()=='Свалка → Россток'
        await page.wait_for_function("ZoneMap.location===4")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")
        assert await page.locator('#zoneMapTitle').inner_text()=='Россток'

        points4=await page.evaluate('ZoneMap.points')
        assert len(points4)==13,points4
        assert sum(p['kind']=='enemy' for p in points4)==3
        assert sum(p['kind']=='mutant' for p in points4)==3
        assert sum(p['kind']=='anomaly' for p in points4)==3
        assert sum(p['kind']=='camp' for p in points4)==1
        assert all(p['label']=='Наёмники' for p in points4 if p['kind']=='enemy')
        back4=next(p for p in points4 if p['id']=='transition-to-2')
        assert abs(back4['x']-93.76)<0.01 and abs(back4['y']-89.32)<0.01,back4

        canvas4=await page.locator('#zoneMapCanvas').bounding_box()
        assert abs((canvas4['width']/canvas4['height'])-(865/1536))<0.02,canvas4

        # Rostok camp marker opens the 100 RADS artwork with the full Cordon-style working hub.
        await page.locator('[data-zone-point="camp-4"]').click()
        camp=page.locator('#rostokCampScreen')
        assert await camp.is_visible()
        for meter_id in ['rostokHealth','rostokHunger','rostokThirst','rostokExperience','rostokRadiation']:
            assert await page.locator('#'+meter_id).is_visible(),meter_id
        assert await page.locator('#rostokExperienceText').inner_text()=='Опыт: 37 / 100'
        assert await page.locator('#rostokRadiationText').inner_text()=='Радиация: 12 / 100'
        assert await page.locator('#rostokCoins').inner_text()=='123456'
        assert await page.locator('#rostokBreedCredits').inner_text()=='7'
        assert await page.locator('#rostokKnowledgeBooks').inner_text()=='3'
        assert await page.locator('#rostokReadBook').is_visible()
        assert await page.locator('#rostokInventory').is_visible()
        assert await page.locator('#rostokPda').is_visible()

        await page.locator('#rostokReadBook').click()
        await page.wait_for_function("window.__calls.read===1")
        assert await page.locator('#rostokKnowledgeBooks').inner_text()=='2'
        assert await page.locator('#rostokExperienceText').inner_text()=='Опыт: 47 / 100'

        # Back from screens opened inside Rostok must return to the Rostok bar, never Kordon.
        await page.locator('#rostokInventory').click()
        assert (await page.evaluate('window.__calls.open.at(-1)'))=='inventory'
        await page.evaluate("openScreen('main')")
        assert await camp.is_visible()
        assert await page.evaluate('ZoneMap.location')==4

        await page.locator('#rostokPda').click()
        assert (await page.evaluate('window.__calls.open.at(-1)'))=='kpk'
        await page.evaluate("openScreen('main')")
        assert await camp.is_visible()
        assert await page.evaluate('ZoneMap.location')==4

        # Invisible bartender hotspot opens a named Barman hub with Talk/Trade/Back.
        hotspot=page.locator('#rostokBarmanHotspot')
        assert await hotspot.is_visible()
        await hotspot.click()
        barman=page.locator('#barmanHubScreen')
        assert await barman.is_visible()
        actions=page.locator('#barmanHubScreen [data-barman-action]')
        assert await actions.evaluate_all("(xs)=>xs.map(x=>x.dataset.barmanAction)")==['talk','trade','back']
        await page.locator('#barmanHubScreen [data-barman-action="talk"]').click()
        assert 'Бармен:' in (await page.evaluate('window.__calls.alerts.at(-1)'))
        await page.locator('#barmanHubScreen [data-barman-action="trade"]').click()
        assert await page.evaluate('window.__calls.trade')=='barman'
        await page.evaluate('BunkerMenu.openBarmanHub()')
        await page.locator('#barmanHubScreen [data-barman-action="back"]').click()
        assert await camp.is_visible()

        await page.locator('[data-rostok-action="map"]').click()
        assert await zone.is_visible()
        assert await page.evaluate('ZoneMap.location')==4
        assert await page.locator('#zoneMapScreen .zone-map-back').count()==0

        # Rostok return to Svalka is the bottom-right marker.
        await page.locator('[data-zone-point="transition-to-2"]').click()
        await travel.wait_for(state='visible')
        assert await page.locator('#zoneMapTravelRoute').inner_text()=='Россток → Свалка'
        await page.wait_for_function("ZoneMap.location===2")
        await page.wait_for_function("document.getElementById('zoneMapTravel')?.hidden===true")

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
        assert sum(x.get('category')=='weapon' for x in catalog)==30
        assert sum(x.get('category')=='armor' for x in catalog)==10

        assert not errors,errors
        print(json.dumps({
          'status':'passed',
          'agroprom_points':points3,
          'map2_canvas':canvas2,
          'map3_canvas':canvas3,
          'map4_canvas':canvas4,
          'rostok_points':points4,
          'routed':routed
        },ensure_ascii=False))
        await browser.close()

asyncio.run(main())
