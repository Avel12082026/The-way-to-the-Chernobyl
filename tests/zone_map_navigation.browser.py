#!/usr/bin/env python3
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]

async def main():
    js=(ROOT/'ui/bunker-menu.js').read_text(encoding='utf-8')
    css=(ROOT/'ui/bunker-menu.css').read_text(encoding='utf-8')
    map_b64=(ROOT/'ui/zone-map.webp.b64').read_text(encoding='utf-8').strip()
    errors=[]

    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda exc: errors.append(str(exc)))
        await page.set_content('''<!doctype html><html><head></head><body>
          <section id="mainMenu" style="display:block">
            <div id="bunkerScene">
              <img id="bunkerArtwork" alt="">
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
        await page.evaluate("""(mapB64)=>{
          window.__mapB64=mapB64;
          window.__calls={start:0,back:0,end:0,open:[]};
          window.raidActive=false;
          window.currentEnemy=null;
          window.currentAnomaly=null;
          window.startRaid=async()=>{window.__calls.start++;window.raidActive=true;};
          window.returnToRaid=()=>{window.__calls.back++;document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById('raidScreen').classList.add('active');};
          window.endRaid=async()=>{window.__calls.end++;window.raidActive=false;window.openScreen('main');};
          window.openScreen=(name)=>{
            window.__calls.open.push(name);
            document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));
            document.getElementById('mainMenu').style.display=name==='main'?'block':'none';
          };
          window.fetch=async(input)=>{
            const url=String(input);
            if(url.includes('zone-map.webp.b64'))return new Response(window.__mapB64,{status:200,headers:{'Content-Type':'text/plain'}});
            return new Response('',{status:404});
          };
        }""",map_b64)
        await page.add_script_tag(content=js)
        await page.wait_for_function("window.BunkerMenu?.version==='1.5.0' && window.ZoneMap?.version==='0.1.0'")

        # Bunker door opens the map without starting a raid.
        await page.locator('#bunkerRaid').click()
        zone=page.locator('#zoneMapScreen')
        assert await zone.is_visible()
        assert await page.evaluate("window.__calls.start")==0
        await page.wait_for_function("document.getElementById('zoneMapArtwork')?.naturalWidth>0")
        size=await page.locator('#zoneMapArtwork').evaluate("(e)=>[e.naturalWidth,e.naturalHeight]")
        assert size==[600,1036],size
        assert await page.locator('#zoneMapPoints .zone-map-point').count()==0
        assert await page.locator('.zone-map-continue').inner_text()=='Войти в Зону'

        # Temporary fallback keeps the current raid playable until the annotated points arrive.
        await page.locator('.zone-map-continue').click()
        assert await page.evaluate("window.__calls.start")==1
        assert not await zone.is_visible()

        # Existing raid navigation is renamed and opens the same map without ending the raid.
        await page.evaluate("raidActive=true;document.getElementById('raidScreen').classList.add('active')")
        map_btn=page.locator('#raidMapBtn')
        assert await map_btn.inner_text()=='Открыть карту'
        await map_btn.click()
        assert await zone.is_visible()
        assert await page.evaluate("window.__calls.end")==0
        assert await page.locator('.zone-map-continue').inner_text()=='Вернуться в рейд'
        await page.locator('.zone-map-continue').click()
        assert await page.evaluate("window.__calls.back")==1

        # Typed point engine is ready for the user's later annotated coordinates.
        points=[
          {'id':'camp','kind':'camp','label':'Лагерь','x':10,'y':90,'icon':'C'},
          {'id':'enemy','kind':'enemy','label':'Враги','x':30,'y':55,'icon':'E'},
          {'id':'anomaly','kind':'anomaly','label':'Аномалия','x':50,'y':45,'icon':'A'},
          {'id':'mutant','kind':'mutant','label':'Мутанты','x':70,'y':35,'icon':'M'}
        ]
        await page.evaluate("(points)=>ZoneMap.setPoints(points)",points)
        assert await page.locator('#zoneMapPoints .zone-map-point').count()==4
        kinds=await page.locator('#zoneMapPoints .zone-map-point').evaluate_all("(xs)=>xs.map(x=>x.dataset.zoneKind)")
        assert kinds==['camp','enemy','anomaly','mutant'],kinds

        # Camp ends an active raid, which is the only route back to traders from the map.
        await page.evaluate("raidActive=true;ZoneMap.open('raid')")
        await page.locator('[data-zone-point=camp]').click()
        assert await page.evaluate("window.__calls.end")==1
        assert await page.locator('#mainMenu').is_visible()

        assert not errors,errors
        print(json.dumps({'status':'passed','map':size,'kinds':kinds,'calls':await page.evaluate('window.__calls')},ensure_ascii=False))
        await browser.close()

asyncio.run(main())
