"""Local browser verification. All API responses are mocked; no live player writes."""
import asyncio,importlib.util,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_mobile',ROOT/'tools/build_mobile.py');build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
PROFILE={'health':100,'maxHealth':100,'coins':5000,'breedCredits':25,'nickname':'Тест','level':1,'inventory':{},'warehouse':{},'stats':{},'artifactSlots':[None]*6,'quickSlots':[None]*4,'weapon':{'name':'Beretta 21A Bobcat','tier':1,'dmg':80},'armor':{'name':'Комбинезон Юность','tier':1},'detector':{'name':'РИПЕР','tier':1}}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}));page=await browser.new_page(viewport={'width':412,'height':915})
  errors=[];private=[];remotes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   from urllib.parse import urlparse,unquote
   u=urlparse(r.request.url)
   if u.netloc=='213-176-92-184.sslip.io':
    if u.path.startswith('/api/'):
     headers=r.request.headers
     if u.path=='/api/mobile/login':data={'success':True,'token':'a'*64,'expiresAt':9999999999999,'user':{'id':'mtest'}}
     elif u.path=='/api/player/private':private.append(headers.get('authorization'));data=PROFILE
     elif u.path=='/api/mobile/shop':data={'success':True,'items':[{'id':'knowledge_book','title':'Книга знаний','desc':'Знания','price':20}]}
     elif u.path=='/api/factions/me':data={'success':True,'factionName':None}
     else:data=[]
     await r.fulfill(json=data);return
    # User avatars are deliberately server-backed.
    if u.path.startswith('/avatars/'):await r.fulfill(status=404);return
    remotes.append(r.request.url);await r.abort();return
   relative=unquote(u.path).removeprefix('/assets/')
   if relative=='game.html':await r.fulfill(body=build.transform((ROOT/'index.html').read_text()),content_type='text/html');return
   if relative in ('index.html','session.js'):file=ROOT/'mobile/web'/relative
   else:file=ROOT/relative
   if not file.is_file():file=ROOT/'.mobile-assets'/relative
   if file.is_file():await r.fulfill(path=str(file))
   else:await r.fulfill(status=404)
  await page.route('**/*',route)
  await page.goto('https://appassets.androidplatform.net/assets/index.html')
  await page.fill('#login','tester');await page.fill('#password','long-secure-password');await page.click('#submit')
  await page.wait_for_url('**/game.html');await page.wait_for_function("document.getElementById('app').style.display === 'block'")
  await page.evaluate("openScreen('starsShop')");await page.get_by_text('Купить за 20 жетонов сталкера').wait_for()
  assert private and all(h=='Bearer '+'a'*64 for h in private),private
  assert not errors,errors
  assert not remotes,remotes
  out=ROOT/'.validation/mobile';out.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(out/'shop.png'))
  await page.evaluate("openScreen('raid')")
  loaded=await page.evaluate("CombatScene.show({enemy:{...COMBAT_ASSETS.entries[0],hp:100,battleToken:'offline-test'},weaponId:COMBAT_ASSETS.pistols.find(p=>p.ready).id,armor:1})")
  assert loaded, 'Combat images failed to load'
  assert not errors,errors
  assert not remotes,remotes
  await page.screenshot(path=str(out/'combat.png'))
  await page.goto('https://appassets.androidplatform.net/assets/index.html');await page.screenshot(path=str(out/'login.png'))
  print('Native login, authenticated profile load, shop, and no remote static requests: PASS')
  await browser.close()
asyncio.run(main())
