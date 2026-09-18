"""Inventory long-press regression: item cells own touch; image URLs never own Android context menus."""
import asyncio,re,mimetypes,sys,json
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
TG="window.Telegram={WebApp:{initData:'offline-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
  state=dict(nickname='Тест',health=100,maxHealth=100,hunger=100,thirst=100,level=50,exp=0,radiation=0,
             coins=10000,breedCredits=0,inventory={'Аптечка армейская':5},warehouse={})
  errors=[]
  images={p.name:p for p in ROOT.rglob('*') if p.is_file() and p.suffix.lower() in ('.png','.webp','.jpg','.jpeg','.svg')}
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(args=['--no-sandbox','--disable-dev-shm-usage'])
    context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block')
    page=await context.new_page();page.set_default_timeout(8000);page.on('pageerror',lambda e:errors.append(str(e)))
    await page.evaluate(TG)
    await page.evaluate("""s=>{
      HTMLMediaElement.prototype.play=function(){return Promise.resolve()};
      window.fetch=async(input,init={})=>{
        const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
        let data={};
        if(path.endsWith('/api/player/private'))data=s;
        else if(path.endsWith('/api/named-artifacts'))data=[];
        else if(path.endsWith('/api/equipment/features'))data={artifactSlotTarget:true};
        else if(path.includes('/api/faction'))data={success:true,faction:null};
        else if(path.includes('/api/'))data={success:true};
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      };
    }""",state)
    async def resources(route):
      url=urlsplit(route.request.url);name=Path(unquote(url.path)).name
      local=images.get(name)
      if local:
        await route.fulfill(body=local.read_bytes(),content_type=mimetypes.guess_type(local.name)[0] or 'image/png');return
      if Path(name).suffix.lower() in ('.png','.jpg','.jpeg','.webp'):
        await route.fulfill(body=b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="gray"/></svg>',content_type='image/svg+xml');return
      await route.abort()
    await context.route('**/*',resources)

    html=(ROOT/'index.html').read_text()
    def inline_script(m):
      src=m[1].split('?')[0];f=ROOT/src
      code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
      if 'defer' in m[0]:code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
      return '<script>'+code+'</script>'
    html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline_script,html)
    html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text()+'</style>' if (ROOT/m[1].split('?')[0]).is_file() else '',html)
    await page.set_content(html,wait_until='domcontentloaded')
    await page.wait_for_function("typeof player==='object' && player.nickname==='Тест' && typeof window.InventoryDrag?.refresh==='function'")
    await page.evaluate("(s)=>{Object.assign(player,s);updateUI();openScreen('inventory');renderInventory();}",state)
    cell=page.locator('#inventoryGrid [data-drag-item]').filter(has=page.locator('img')).first
    await cell.wait_for(state='visible')
    name=await cell.get_attribute('data-drag-item')
    assert name

    async def cancelled(locator):
      return await locator.evaluate("e=>{const v=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});e.dispatchEvent(v);return v.defaultPrevented}")
    assert await cancelled(cell)
    img=cell.locator('img').first
    assert await img.count()
    assert await img.evaluate("e=>getComputedStyle(e).pointerEvents")=='none'
    assert await cancelled(img)

    # A real emulated touch hold starts only the in-game drag ghost.
    box=await cell.bounding_box();assert box
    x=box['x']+box['width']/2;y=box['y']+box['height']/2
    cdp=await context.new_cdp_session(page)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    await page.wait_for_timeout(300)
    assert await page.locator('.inventory-drag-ghost').count()==1
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await cdp.detach()
    await page.wait_for_timeout(100)
    assert await page.locator('.inventory-drag-ghost').count()==0
    assert not await page.locator('#itemInfoModal').is_visible()

    # Drag suppression expires and does not leave the page in a blocked/busy state.
    await page.wait_for_timeout(750)
    assert await page.evaluate("!document.querySelector('#inventoryScreen')?.getAttribute('aria-busy')")
    assert not errors,errors
    print(json.dumps({'status':'passed','item':name,'imagePointerEvents':'none','contextMenuBlocked':True},ensure_ascii=False))
    await browser.close()

asyncio.run(main())
