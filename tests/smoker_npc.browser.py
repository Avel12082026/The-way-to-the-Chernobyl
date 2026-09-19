#!/usr/bin/env python3
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation'/'smoker-npc'
OUT.mkdir(parents=True,exist_ok=True)

async def main():
    js=(ROOT/'ui/bunker-menu.js').read_text(encoding='utf-8')
    css=(ROOT/'ui/bunker-menu.css').read_text(encoding='utf-8')
    portrait=(ROOT/'ui/smoker-portrait.webp.b64').read_text(encoding='utf-8').strip()
    errors=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        page=await browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda exc: errors.append(str(exc)))
        await page.set_content('''<!doctype html><html><head></head><body>
          <section id="mainMenu" style="display:block">
            <div id="bunkerScene">
              <img id="bunkerArtwork" alt="">
              <button id="bunkerSmoker" type="button" onclick="BunkerMenu.openSmoker()" style="position:absolute;left:20px;top:300px;width:150px;height:180px">smoker</button>
            </div>
          </section>
        </body></html>''')
        await page.add_style_tag(content=css)
        await page.evaluate("""(b64)=>{
          window.__portrait=b64;
          window.openScreen=(name)=>{
            window.__openedScreen=name;
            document.getElementById('mainMenu').style.display=name==='main'?'block':'none';
          };
          window.fetch=async(input)=>{
            const url=String(input);
            if(url.includes('smoker-portrait.webp.b64')){
              return new Response(window.__portrait,{status:200,headers:{'Content-Type':'text/plain'}});
            }
            return new Response('',{status:404});
          };
        }""",portrait)
        await page.add_script_tag(content=js)

        await page.locator('#bunkerSmoker').click()
        await page.wait_for_timeout(120)
        hub=page.locator('#smokerHubScreen')
        assert await hub.is_visible()
        await page.wait_for_function("document.getElementById('smokerHubArtwork')?.naturalWidth>0")
        size=await page.locator('#smokerHubArtwork').evaluate("(e)=>[e.naturalWidth,e.naturalHeight]")
        assert size[0]>0 and size[1]>0,size

        buttons=page.locator('#smokerHubScreen .smoker-actions button')
        actions=await buttons.evaluate_all("(xs)=>xs.map(x=>x.dataset.smokerAction)")
        labels=await buttons.evaluate_all("(xs)=>xs.map(x=>x.textContent.trim())")
        assert actions==['talk','back'],actions
        assert labels==['Говорить','Назад'],labels
        boxes=[await buttons.nth(i).bounding_box() for i in range(2)]
        assert all(boxes),boxes
        assert abs(boxes[0]['y']-boxes[1]['y'])<2,boxes
        assert boxes[0]['y']>700,boxes

        await page.locator('[data-smoker-action="talk"]').click()
        bubble=page.locator('#smokerTalkBubble')
        assert await bubble.is_visible()
        assert 'Я слушаю' in await bubble.inner_text()

        await page.screenshot(path=str(OUT/'smoker-open.png'),full_page=True)
        await page.locator('[data-smoker-action="back"]').click()
        await page.wait_for_timeout(30)
        assert not await hub.is_visible()
        assert await page.locator('#mainMenu').is_visible()
        assert await page.evaluate("window.__openedScreen")=='main'
        assert not errors,errors
        print({'status':'passed','portrait':size,'actions':actions,'labels':labels})
        await browser.close()

asyncio.run(main())
