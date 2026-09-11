"""Offline full-client PDA layout and item-dialog regression; no live player writes."""
import asyncio,json,re,sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.validation/pda-loadout';OUT.mkdir(parents=True,exist_ok=True)
HTML=re.sub(r'<script\b[^>]*src=[^>]*></script>','',(ROOT/'index.html').read_text()).replace('<head>','<head><base href="http://127.0.0.1:8765/">')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=sys.argv[1] if len(sys.argv)>1 else '/tmp/pda-chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  reports=[]
  for width in [320,390,768]:
   page=await browser.new_page(viewport={'width':width,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    f=Path(urlparse(r.request.url).path).name
    if '/api/' in r.request.url:return await r.fulfill(content_type='application/json',body='[]')
    path=ROOT/'icons'/f
    if not path.is_file():path=OUT/'assets'/f
    if '/avatars/' in r.request.url:path=ROOT/'icons/armor_char_1.webp'
    if path.is_file():return await r.fulfill(path=str(path))
    return await r.abort('failed')
   await page.route('**/*',route)
   await page.evaluate('window.Telegram={WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}}')
   await page.set_content(HTML,wait_until='domcontentloaded')
   await page.evaluate('''() => {
    document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));
    document.getElementById('kpkScreen').classList.add('active');
    window.fixture={armor:{name:'Плащ тёмного сталкера'},weapon:weapons[20],detector:detectors[3],armorUpgradeData:{},artifactSlots:[artifacts[0].name,null,artifacts[1].name,null,null,artifacts[2].name]};
    document.getElementById('kpkContent').innerHTML=renderPlayerStatsCard(fixture,'Инфо о персонаже','other');
   }''')
   await page.wait_for_timeout(300)
   slots=page.locator('#kpkContent .pda-profile-equipment-image');assert await slots.count()==8
   rects=await slots.evaluate_all('(xs)=>xs.map(x=>{let r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
   assert max(x['w'] for x in rects)-min(x['w'] for x in rects)<1,rects
   assert all(abs(x['w']-x['h'])<1 for x in rects),rects
   arts=rects[2:];assert len({round(x['y']) for x in arts})==2,arts
   assert len({round(x['y']) for x in arts[:3]})==1
   assert len({round(x['y']) for x in arts[3:]})==1
   assert await page.locator('.pda-profile-artifacts img').count()==3
   assert await page.locator('.pda-profile-artifacts [aria-label*="Пустой слот"]').count()==3
   for button in await page.locator('#kpkContent [data-profile-item]').all():
    await button.click();assert await page.locator('#profileItemModal').is_visible()
    assert await page.locator('#profileItemBody').inner_text()
    await page.locator('#profileItemClose').click();assert not await page.locator('#profileItemModal').is_visible()
   assert 'Экипировка:' not in await page.locator('#kpkContent').inner_text()
   await page.screenshot(path=str(OUT/f'pda_{width}.png'))
   await page.evaluate("fixture.artifactSlots=[null,null,null,null,null,null];document.getElementById('kpkContent').innerHTML=renderPlayerStatsCard(fixture,'Пустой пояс','other')")
   assert await page.locator('.pda-profile-artifacts [aria-label*="Пустой слот"]').count()==6
   assert not errors,errors
   reports.append(dict(width=width,slots=rects,dialogs=9,errors=errors))
   await page.close()
  await browser.close();(OUT/'report.json').write_text(json.dumps(reports,indent=2));print('PASS: three viewports, equal slot sizes, two artifact rows, 27 dialog open/close cycles, empty slots, no page errors')
asyncio.run(main())
