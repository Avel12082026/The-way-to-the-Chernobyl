"""Raid quick-slot gesture regression: tap consumes immediately, deliberate hold opens info only."""
import asyncio,re,mimetypes,json
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
TG="window.Telegram={WebApp:{initData:'offline-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
  state=dict(nickname='Тест',health=80,maxHealth=100,hunger=90,thirst=90,level=20,exp=0,radiation=0,
             coins=1000,breedCredits=3,inventory={'Аптечка армейская':2},warehouse={},
             quickSlots=['Аптечка армейская',None,None,None])
  writes=[];errors=[]
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(args=['--no-sandbox','--disable-dev-shm-usage'])
    context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block')
    page=await context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)))
    await page.evaluate(TG)
    async def fixture(path,payload):
      if path.endswith('/api/player/private'):return state
      if path.endswith('/api/named-artifacts'):return []
      if path.endswith('/api/equipment/features'):return {'artifactSlotTarget':True}
      if path.endswith('/api/items/use-consumable'):
        writes.append((path,payload.get('itemName')))
        return {'success':True}
      if '/api/faction' in path:return {'success':True,'faction':None}
      if path.endswith('/api/quests/state'):return {'success':True,'accepted':[],'activeId':None,'completed':[],'completedCount':0}
      if '/api/' in path:return {'success':True}
      return {}
    await page.expose_function('__fixture',fixture)
    await page.evaluate("""s=>{
      HTMLMediaElement.prototype.play=function(){return Promise.resolve()};
      window.fetch=async(input,init={})=>{
        const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
        let payload={};try{payload=init.body?JSON.parse(init.body):{}}catch(_){}
        const data=await window.__fixture(path,payload);
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      };
    }""",state)
    images={p.name:p for p in ROOT.rglob('*') if p.is_file() and p.suffix.lower() in ('.png','.webp','.jpg','.jpeg','.svg')}
    async def resources(route):
      url=urlsplit(route.request.url);name=Path(unquote(url.path)).name
      local=images.get(name)
      if local:
        await route.fulfill(body=local.read_bytes(),content_type=mimetypes.guess_type(local.name)[0] or 'image/png');return
      if Path(name).suffix.lower() in ('.png','.jpg','.jpeg','.webp'):
        await route.fulfill(body=b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>',content_type='image/svg+xml');return
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
    await page.wait_for_function("typeof player==='object' && window.TraderHubs?.version==='1.3.0' && window.RaidKpkPolish")
    await page.evaluate("(s)=>{Object.assign(player,s);openScreen('raid');renderQuickSlots();RaidKpkPolish.apply();}",state)
    slot=page.locator('#quickSlots .quick-slot').first
    await slot.wait_for(state='visible')

    # Normal tap must use the medkit and must not open information.
    await slot.tap()
    await page.wait_for_function("window.__quickTapDone===true",{timeout:1000}) if False else None
    await page.wait_for_timeout(180)
    assert len(writes)==1,writes
    assert writes[0][1]=='Аптечка армейская'
    assert not await page.locator('#itemInfoModal').is_visible()

    # A deliberate hold (800 ms threshold) opens information but must not consume another item.
    box=await slot.bounding_box();assert box
    cdp=await context.new_cdp_session(page)
    x=box['x']+box['width']/2;y=box['y']+box['height']/2
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    await page.wait_for_timeout(900)
    await page.locator('#itemInfoModal').wait_for(state='visible')
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    await page.wait_for_timeout(120)
    await cdp.detach()
    assert len(writes)==1,writes

    # Screenshot layout invariants.
    assert await page.locator('#raidVisualStage').count()==1
    assert await page.locator('#raidUtilityButtons > button').count()==2
    labels=[x.strip() for x in await page.locator('#raidUtilityButtons > button').all_text_contents()]
    assert 'Рюкзак' in labels[0] and labels[1]=='Телеграммка',labels
    assert not errors,errors
    print(json.dumps({'status':'passed','tapUses':writes,'holdMs':800,'utilityButtons':labels},ensure_ascii=False))
    await browser.close()

asyncio.run(main())
