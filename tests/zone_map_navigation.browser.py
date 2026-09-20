#!/usr/bin/env python3
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]

def parts(prefix,count):
    return [(ROOT/'ui'/f'{prefix}-{i:02d}.b64').read_text(encoding='utf-8').strip() for i in range(count)]

async def main():
    js=(ROOT/'ui/bunker-menu.js').read_text(encoding='utf-8')
    css=(ROOT/'ui/bunker-menu.css').read_text(encoding='utf-8')
    map1_parts=parts('zone-map1-hq',11)
    map2_parts=parts('zone-map2-hq',22)
    errors=[]

    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda exc: errors.append(str(exc)))
        await page.set_content('''<!doctype html><html><head></head><body>
          <section id="mainMenu" style="display:block">
            <div id="bunkerScene">
              <img id="bunkerArtwork" alt="">
              <span id="coins"></span><span id="breedCreditsHeader"></span><span id="knowledgeBooksHeader"></span>
              <button id="bunkerRaid" type="button" onclick="BunkerMenu.enterRaid()">raid</button>
            </div>
          </section>
          <section id="raidScreen" class="screen">
            <div id="raidNavButtons">
              <button id="raidStepBtn">Идти дальше</button>
              <button onclick="endRaid()">Вернуться с рейда</button>
            </div>
          </section>
          <div id="embeddedChatWidget"></div>
        </body></html>''')
        await page.add_style_tag(content=css)
        await page.evaluate("""({map1Parts,map2Parts})=>{
          window.__mapParts={1:map1Parts,2:map2Parts};
          window.__calls={start:0,back:0,end:0,open:[],alerts:[],fetches:[]};
          window.raidActive=false;
          window.currentEnemy=null;
          window.currentAnomaly=null;
          window.currentLuckyFind=null;
          window.expNeededForLevel=()=>100;
          window.player={
            level:100,health:100,maxHealth:100,hunger:100,maxHunger:100,thirst:100,maxThirst:100,
            radiation:0,exp:0,coins:100000,breedCredits:0,inventory:{}
          };
          window.weapons=[
            ...Array.from({length:20},(_,i)=>({
              name:'Пистолет '+(i+1),starterGear:i===0,unlockLevel:i<10?i+1:200+(i-10)*20
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
          window.openScreen=(name)=>{
            window.__calls.open.push(name);
            document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));
            document.getElementById('mainMenu').style.display=name==='main'?'block':'none';
          };
          window.showGameAlert=(msg)=>window.__calls.alerts.push(String(msg));
          window.fetch=async(input,init={})=>{
            const url=String(typeof input==='string'?input:input.url);
            let m=url.match(/zone-map1-hq-(\d{2})\.b64/);
            if(m)return new Response(window.__mapParts[1][Number(m[1])],{status:200,headers:{'Content-Type':'text/plain'}});
            m=url.match(/zone-map2-hq-(\d{2})\.b64/);
            if(m)return new Response(window.__mapParts[2][Number(m[1])],{status:200,headers:{'Content-Type':'text/plain'}});
            window.__calls.fetches.push({url,body:init.body?JSON.parse(init.body):null});
            return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }""",{'map1Parts':map1_parts,'map2Parts':map2_parts})
        await page.add_script_tag(content=js)
        await page.wait_for_function("window.BunkerMenu?.version==='1.7.0' && window.ZoneMap?.version==='0.3.0'")

        # Location 1 opens at native resolution and uses the complete image.
        await page.locator('#bunkerRaid').click()
        zone=page.locator('#zoneMapScreen')
        assert await zone.is_visible()
        await page.wait_for_function("document.getElementById('zoneMapArtwork')?.naturalWidth===890")
        size1=await page.locator('#zoneMapArtwork').evaluate("(e)=>[e.naturalWidth,e.naturalHeight,getComputedStyle(e).objectFit]")
        assert size1==[890,1536,'contain'],size1
        points1=await page.evaluate("ZoneMap.points")
        assert len(points1)==11,points1
        assert sum(p['kind']=='enemy' for p in points1)==4
        assert sum(p['kind']=='mutant' for p in points1)==3
        assert sum(p['kind']=='anomaly' for p in points1)==2
        assert sum(p['kind']=='camp' for p in points1)==1
        assert sum(p['kind']=='transition' for p in points1)==1

        # First 10 pistols/armor are already available in the fixture, so map 1 -> 2 opens.
        to2=next(p for p in points1 if p['kind']=='transition' and p.get('targetLocation')==2)
        await page.locator(f'[data-zone-point="{to2["id"]}"]').click()
        await page.wait_for_function("ZoneMap.location===2 && document.getElementById('zoneMapArtwork')?.naturalWidth===1397")
        size2=await page.locator('#zoneMapArtwork').evaluate("(e)=>[e.naturalWidth,e.naturalHeight,getComputedStyle(e).objectFit]")
        assert size2==[1397,1536,'contain'],size2
        points2=await page.evaluate("ZoneMap.points")
        assert len(points2)==11,points2
        assert sum(p['kind']=='enemy' for p in points2)==3
        assert sum(p['kind']=='mutant' for p in points2)==3
        assert sum(p['kind']=='anomaly' for p in points2)==2
        assert sum(p['kind']=='transition' for p in points2)==3
        assert not any(p['kind']=='camp' for p in points2),'location 2 must not have traders/camp'

        # Only the bottom-center transition is active now and returns to location 1.
        back1=next(p for p in points2 if p['kind']=='transition' and p.get('targetLocation')==1)
        await page.locator(f'[data-zone-point="{back1["id"]}"]').click()
        await page.wait_for_function("ZoneMap.location===1")
        assert await zone.is_visible()

        # Return to location 2, then verify both future exits are gated by pistols 11-20.
        points1=await page.evaluate("ZoneMap.points")
        to2=next(p for p in points1 if p['kind']=='transition' and p.get('targetLocation')==2)
        await page.locator(f'[data-zone-point="{to2["id"]}"]').click()
        await page.wait_for_function("ZoneMap.location===2")
        points2=await page.evaluate("ZoneMap.points")
        future=[p for p in points2 if p['kind']=='transition' and p.get('targetLocation') in (3,4)]
        assert len(future)==2,future
        await page.locator(f'[data-zone-point="{future[0]["id"]}"]').click()
        assert 'десят' in (await page.evaluate("window.__calls.alerts.at(-1)")).lower()

        # Once the second ten pistols become available, the same exits remain closed until maps 3/4 exist.
        await page.evaluate("player.level=1000")
        await page.locator(f'[data-zone-point="{future[0]["id"]}"]').click()
        assert (await page.evaluate("window.__calls.alerts.at(-1)"))=='Локация ещё не открыта сталкерами.'

        # Select a human-enemy point on location 2. It starts/resumes a raid with location 2 routing.
        enemy2=next(p for p in points2 if p['kind']=='enemy')
        await page.locator(f'[data-zone-point="{enemy2["id"]}"]').click()
        assert await page.evaluate("ZoneMap.routeKind")=='enemy'
        assert await page.evaluate("ZoneMap.location")==2
        assert await page.evaluate("window.__calls.start")==1

        # Every later "Идти дальше" call is routed through the dedicated endpoint with location + kind.
        await page.evaluate("""()=>fetch('/api/raid/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raidToken:'r'})})""")
        routed=await page.evaluate("window.__calls.fetches.at(-1)")
        assert routed['url'].endswith('/api/raid/zone-step'),routed
        assert routed['body']['zoneKind']=='enemy',routed
        assert routed['body']['zoneLocation']==2,routed

        # Open-map during the raid keeps the current location.
        await page.evaluate("document.getElementById('raidScreen').classList.add('active')")
        await page.locator('#raidMapBtn').click()
        assert await zone.is_visible()
        assert await page.evaluate("ZoneMap.location")==2

        # Location 1 shop catalogue is capped to the first ten pistols and first ten ordinary armor.
        catalog=await page.evaluate("getShopCatalog()")
        assert sum(x.get('category')=='weapon' for x in catalog)==10,catalog
        assert sum(x.get('category')=='armor' for x in catalog)==10,catalog

        assert not errors,errors
        print(json.dumps({'status':'passed','map1':size1,'map2':size2,'location2Kinds':[p['kind'] for p in points2]},ensure_ascii=False))
        await browser.close()

asyncio.run(main())
