"""Inventory long-press regression: item cells own touch; image URLs never own Android context menus."""
import os,asyncio,re,mimetypes,sys,json
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
    browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--disable-dev-shm-usage'])
    context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block')
    page=await context.new_page();page.set_default_timeout(8000);page.on('pageerror',lambda e:errors.append(str(e)))
    await page.evaluate(TG)
    await page.evaluate("""s=>{
      HTMLMediaElement.prototype.play=function(){return Promise.resolve()};window.__writes=[];
      window.fetch=async(input,init={})=>{
        const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
        let data={};
        if(path.endsWith('/api/player/private'))data=s;
        else if(path.endsWith('/api/equipment/features'))data={artifactSlotTarget:true};
        else if(path.endsWith('/api/named-artifacts'))data=[];
        else if(path.includes('/api/faction'))data={success:true,faction:null};
        else if(path.endsWith('/api/quickslots/set')){
          const b=JSON.parse(init.body);window.__writes.push({path,payload:b});
          s.quickSlots=s.quickSlots||[null,null,null,null];s.quickSlots[b.index]=b.itemName;
          data={success:true,quickSlots:s.quickSlots};
        }else if(path.endsWith('/api/warehouse/transfer')){
          const b=JSON.parse(init.body);window.__writes.push({path,payload:b});
          const from=b.direction==='deposit'?s.inventory:s.warehouse,to=b.direction==='deposit'?s.warehouse:s.inventory;
          if((from[b.item]||0)<b.qty)data={success:false,error:'not enough'};
          else{from[b.item]-=b.qty;if(!from[b.item])delete from[b.item];to[b.item]=(to[b.item]||0)+b.qty;data={success:true,inventory:s.inventory,warehouse:s.warehouse,quickSlots:s.quickSlots};}
        }
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
    # Short tap still opens the game's information dialog after a cancelled drag.
    await cell.tap();await page.locator('#itemActionModal').wait_for(state='visible')
    assert name in (await page.locator('#itemActionTitle').text_content())
    assert await page.locator('#itemActionModal button[onclick*=applyInventoryItem]').is_visible()
    assert await cancelled(page.locator('#itemActionModal img').first)
    await page.locator('#itemActionModal button[onclick*=closeItemActionModal]').click()
    await page.wait_for_timeout(750)
    # Emulated touch drag to a real quick slot submits one real-shaped API request.
    await cell.scroll_into_view_if_needed()
    a=await cell.bounding_box();b=await page.locator('#quickSlotsGrid [data-drop-kind="quick"]').first.bounding_box()
    cdp=await context.new_cdp_session(page)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':a['x']+a['width']/2,'y':a['y']+a['height']/2}]})
    await page.wait_for_timeout(280)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':b['x']+b['width']/2,'y':b['y']+b['height']/2}]})
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    await page.wait_for_function("window.__writes.length===1 && player.quickSlots[0]==='Аптечка армейская'")
    assert not await page.locator('#itemInfoModal').is_visible()
    assert await page.locator('.inventory-drag-ghost').count()==0
    await page.wait_for_timeout(750)
    # Trading hold remains info-only; it must not add the item to the purchase basket.
    await page.evaluate("TradeMenu.open('zhuchara')")
    stock=page.locator('#tradeStock [data-trade-source]').first
    await stock.scroll_into_view_if_needed();b=await stock.bounding_box()
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':b['x']+b['width']/2,'y':b['y']+b['height']/2}]})
    await page.wait_for_timeout(1600)
    assert await page.locator('#itemInfoModal').is_visible()
    assert await cancelled(page.locator('#itemInfoModal img').first)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});await cdp.detach()
    assert await page.locator('#tradeBuySlots [data-trade-name]').count()==0
    assert await page.evaluate('window.__writes.length')==1
    assert not errors,errors
    report={'status':'passed','item':name,'checks':['inventory and image contextmenu blocked','img pointer-events none','220ms hold drag ghost','cancel cleans ghost','short tap preserves item info and use actions','quick-slot drop exactly one API request','trade 1600ms hold still info without purchase'],'page_errors':errors,'live_player_writes':0,'physical_android_tested':False}
    out=ROOT/'.validation/inventory-native-menu';out.mkdir(parents=True,exist_ok=True);(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'status':'passed','item':name,'imagePointerEvents':'none','contextMenuBlocked':True},ensure_ascii=False))
    await browser.close()

asyncio.run(main())
