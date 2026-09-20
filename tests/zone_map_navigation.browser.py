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
          window.__calls={start:0,back:0,end:0,open:[],alerts:[],fetches:[]};
          window.raidActive=false;
          window.currentEnemy=null;
          window.currentAnomaly=null;
          window.player={level:1};
          window.weapons=[
            {name:'starter',starterGear:true,unlockLevel:1},
            ...Array.from({length:9},(_,i)=>({name:'p'+i,unlockLevel:20+i*20})),
            {name:'Дробовик test',unlockLevel:220}
          ];
          window.armorItems=Array.from({length:10},(_,i)=>({name:'a'+i,unlockLevel:1+i*10}));
          window.getShopCatalog=()=>[
            ...weapons.slice(0,11).map(x=>({...x,category:'weapon'})),
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
            const url=String(input);
            if(url.includes('zone-map.webp.b64'))return new Response(window.__mapB64,{status:200,headers:{'Content-Type':'text/plain'}});
            window.__calls.fetches.push({url,body:init.body?JSON.parse(init.body):null});
            return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }""",map_b64)
        await page.add_script_tag(content=js)
        await page.wait_for_function("window.BunkerMenu?.version==='1.6.0' && window.ZoneMap?.version==='0.2.0'")

        # Bunker door opens the annotated map without starting a raid.
        await page.locator('#bunkerRaid').click()
        zone=page.locator('#zoneMapScreen')
        assert await zone.is_visible()
        assert await page.evaluate("window.__calls.start")==0
        await page.wait_for_function("document.getElementById('zoneMapArtwork')?.naturalWidth>0")
        size=await page.locator('#zoneMapArtwork').evaluate("(e)=>[e.naturalWidth,e.naturalHeight]")
        assert size==[600,1036],size
        assert await page.locator('#zoneMapPoints .zone-map-point').count()==11
        assert await page.locator('.zone-map-continue').count()==0
        kinds=await page.locator('#zoneMapPoints .zone-map-point').evaluate_all("(xs)=>xs.map(x=>x.dataset.zoneKind)")
        assert kinds.count('enemy')==4 and kinds.count('mutant')==3 and kinds.count('anomaly')==2 and kinds.count('camp')==1 and kinds.count('transition')==1,kinds
        invis=await page.locator('[data-zone-point=enemy-1]').evaluate("(e)=>({bg:getComputedStyle(e).backgroundColor,opacity:getComputedStyle(e).opacity})")
        assert invis['bg']=='rgba(0, 0, 0, 0)' and float(invis['opacity'])<0.01,invis

        # Enemy point starts a raid and selects human-enemy-only routing.
        await page.locator('[data-zone-point=enemy-1]').click()
        assert await page.evaluate("window.__calls.start")==1
        assert await page.evaluate("ZoneMap.routeKind")=='enemy'
        assert not await zone.is_visible()

        # Open map from an active raid, switch to mutants, and resume the same raid.
        await page.evaluate("document.getElementById('raidScreen').classList.add('active')")
        map_btn=page.locator('#raidMapBtn')
        assert await map_btn.inner_text()=='Открыть карту'
        await map_btn.click()
        assert await zone.is_visible()
        await page.locator('[data-zone-point=mutant-1]').click()
        assert await page.evaluate("ZoneMap.routeKind")=='mutant'
        assert await page.evaluate("window.__calls.back")==1
        assert await page.evaluate("window.__calls.end")==0

        # Routed raid steps go to the dedicated server endpoint and carry the marker type.
        await page.evaluate("""()=>fetch('/api/raid/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raidToken:'r'})})""")
        routed=await page.evaluate("window.__calls.fetches.at(-1)")
        assert routed['url'].endswith('/api/raid/zone-step'),routed
        assert routed['body']['zoneKind']=='mutant',routed

        # Transition remains locked while there is only one location.
        await page.evaluate("ZoneMap.open('raid')")
        await page.locator('[data-zone-point=transition-1]').click()
        assert await zone.is_visible()
        assert (await page.evaluate("window.__calls.alerts.at(-1)"))=='Локация ещё не открыта сталкерами.'

        # Current location merchant catalogue is capped to first ten weapons and armor.
        catalog=await page.evaluate("getShopCatalog()")
        weapon_count=sum(1 for x in catalog if x.get('category')=='weapon')
        armor_count=sum(1 for x in catalog if x.get('category')=='armor')
        assert weapon_count==10 and armor_count==10,(weapon_count,armor_count)

        # Camp ends an active raid and returns to the trader hub.
        await page.locator('[data-zone-point=camp-1]').click()
        assert await page.evaluate("window.__calls.end")==1
        assert await page.locator('#mainMenu').is_visible()
        assert await page.evaluate("ZoneMap.routeKind")==''

        assert not errors,errors
        print(json.dumps({'status':'passed','map':size,'kinds':kinds,'calls':await page.evaluate('window.__calls')},ensure_ascii=False))
        await browser.close()

asyncio.run(main())
