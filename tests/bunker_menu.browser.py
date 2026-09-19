"""Full-client offline regression. No live player writes.
Run: python tests/bunker_menu.browser.py [/path/to/chromium]
"""
import asyncio, base64, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.validation' / 'bunker-menu'
OUT.mkdir(parents=True, exist_ok=True)
TG = "window.Telegram={WebApp:{initData:'offline-test-only',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
 async with async_playwright() as p:
  exe = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('CHROMIUM_EXECUTABLE_PATH')
  browser = await p.chromium.launch(executable_path=exe or None, args=['--no-sandbox','--disable-dev-shm-usage'])
  page = await browser.new_page(viewport={'width':390, 'height':844}, device_scale_factor=1)
  errors = []; calls = []; mode = {'raid':'ok', 'book':'ok', 'books':3}
  page.on('pageerror', lambda e: errors.append(str(e)))
  async def api_fixture(path):
   calls.append(path)
   if path.endswith('/player/private'):
    return {'nickname':'Тестовый сталкер','health':89,'maxHealth':150,'hunger':66,'thirst':42,'coins':6891,'breedCredits':7,'level':6,'exp':123,'radiation':18,'inventory':{'Книга знаний':3},'weapon':{'name':'Beretta 21A Bobcat','tier':1,'dmg':80},'armor':{'name':'Комбинезон Юность','tier':1,'armor':5,'hitAbsorption':3},'detector':{'name':'РИПЕР','tier':1}}
   if path.endswith('/raid/start'):
    await asyncio.sleep(.15)
    return {'success':False,'error':'Проверка отказа сервера'} if mode['raid']=='reject' else {'success':True,'raidToken':'offline-token','state':{},'event':{'type':'none'}}
   if path.endswith('/items/use-knowledge-book'):
    await asyncio.sleep(.15)
    if mode['book']=='network': raise RuntimeError('Simulated offline connection')
    mode['books'] -= 1
    return {'success':True,'level':7,'inventory':{'Книга знаний':mode['books']}}
   if '/faction' in path: return {'success':True,'faction':None}
   return []
  await page.expose_function('__apiFixture', api_fixture)
  await page.evaluate(TG)
  smoker_b64=(ROOT/'ui/smoker-portrait.webp.b64').read_text().strip()
  await page.evaluate('(b64)=>{window.__smokerPortraitB64=b64}',smoker_b64)
  await page.evaluate("() => { window.fetch = async(input,init) => { const url = new URL(typeof input === 'string' ? input : input.url, 'http://offline.test'); if(url.pathname.endsWith('/ui/smoker-portrait.webp.b64')||url.pathname.endsWith('/smoker-portrait.webp.b64')) return new Response(window.__smokerPortraitB64,{status:200,headers:{'Content-Type':'text/plain'}}); const data = url.pathname.includes('/api/') ? await window.__apiFixture(url.pathname) : {}; return new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}}); }; }")
  # Inline local modules/styles/artwork; no external navigation or API access.
  html=(ROOT/'index.html').read_text()
  def script(m):
   src=m[1].split('?')[0]; f=ROOT/src
   code = TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
   if 'defer' in m[0]: code = "document.addEventListener('DOMContentLoaded',()=>{" + code + "},{once:true});"
   return '<script>'+code+'</script>'
  html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',script,html)
  def css(m):
   f=ROOT/m[1].split('?')[0]
   return '<style>'+f.read_text()+'</style>' if f.is_file() else ''
  html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',css,html)
  png=base64.b64encode((ROOT/'file_000000002bb08210800056ebfb1dce1f.png').read_bytes()).decode()
  html=html.replace('file_000000002bb08210800056ebfb1dce1f.png?v=0503d3b544d1','data:image/png;base64,'+png)
  await page.set_content(html,wait_until='domcontentloaded')
  try:
   await page.wait_for_function("window.BunkerMenu && document.getElementById('coins').textContent === '6891'",timeout=5000)
  except Exception:
   print('INIT ERRORS',errors)
   await page.screenshot(path=str(OUT/'init-error.png'))
   raise
  assert await page.locator('#bunkerArtwork').evaluate('(e)=>e.naturalWidth') == 941
  assert await page.locator('#mainMenu .bunker-hotspot').count() == 9
  assert await page.locator('#mainMenu .zr-nav, #mainMenu .zr-main-header').count() == 0
  assert not await page.locator('#embeddedChatWidget').is_visible()
  assert not await page.locator('#menuMusicPanel').is_visible()
  assert not await page.locator('#menuMusicButton').is_visible()
  assert await page.locator('#bunkerHealth').get_attribute('aria-valuemax') == '150'
  assert await page.locator('#bunkerHealth').get_attribute('aria-valuenow') == '89'
  assert '123 /' in await page.locator('#bunkerExperienceText').inner_text()
  # Leonov has his own two-choice overlay instead of opening scientistsScreen directly.
  await page.locator('#bunkerLeonov').click()
  assert await page.locator('#leonovHubScreen').is_visible()
  await page.locator('#leonovHubScreen [data-leonov-action="back"]').click()
  await page.wait_for_timeout(40)
  assert await page.locator('#mainMenu').is_visible()

  # Zhuchara and Diesel also open portrait hubs before their trade screens.
  for button, hub in [('bunkerZhuchara','zhucharaHubScreen'),('bunkerDiesel','dieselHubScreen')]:
   await page.locator('#'+button).click()
   assert await page.locator('#'+hub).is_visible(), hub
   await page.locator('#'+hub+' [data-trader-action="back"]').click()
   await page.wait_for_timeout(40)
   assert await page.locator('#mainMenu').is_visible()

  destinations = [('bunkerArena','arena'),('bunkerWarehouse','warehouse'),('bunkerInventory','inventory'),('bunkerPda','kpk')]
  for button, screen in destinations:
   await page.locator('#'+button).click()
   assert await page.locator('#'+screen+'Screen').is_visible(), screen
   assert not await page.locator('#mainMenu').is_visible()
   await page.evaluate("openScreen('main')")
   await page.wait_for_timeout(40)
  await page.locator('#bunkerSmoker').click()
  await page.wait_for_timeout(120)
  assert await page.locator('#smokerHubScreen').is_visible()
  assert await page.locator('#smokerHubArtwork').evaluate('(e)=>e.naturalWidth') > 0
  smoker_buttons=page.locator('#smokerHubScreen .smoker-actions button')
  smoker_actions=await smoker_buttons.evaluate_all("(xs)=>xs.map(x=>x.dataset.smokerAction)")
  smoker_labels=await smoker_buttons.evaluate_all("(xs)=>xs.map(x=>x.textContent.trim())")
  assert smoker_actions==['talk','back'],smoker_actions
  assert smoker_labels==['Говорить','Назад'],smoker_labels
  await page.locator('#smokerHubScreen [data-smoker-action="talk"]').click()
  assert await page.locator('#smokerTalkBubble').is_visible()
  assert 'Я слушаю' in await page.locator('#smokerTalkBubble').inner_text()
  await page.locator('#smokerHubScreen [data-smoker-action="back"]').click()
  await page.wait_for_timeout(40)
  assert await page.locator('#mainMenu').is_visible()
  assert not await page.locator('#smokerHubScreen').is_visible()
  await page.locator('#bunkerPda').click()
  await page.locator('#kpkChatBtn').click()
  assert await page.locator('#chatScreen').is_visible()
  await page.locator('#chatBackToKpkBtn').click()
  assert await page.locator('#kpkScreen').is_visible()
  await page.evaluate("openScreen('main')")
  mode['raid']='reject'
  await page.evaluate("BunkerMenu.enterRaid(); BunkerMenu.enterRaid()")
  await page.wait_for_timeout(350)
  assert calls.count('/api/raid/start') == 1
  assert await page.locator('#mainMenu').is_visible()
  assert not await page.locator('#bunkerRaid').is_disabled()
  await page.evaluate("document.getElementById('gameAlertModal').classList.remove('active')")
  mode['raid']='ok'
  await page.locator('#bunkerRaid').click()
  await page.wait_for_timeout(350)
  assert await page.locator('#raidScreen').is_visible()
  assert calls.count('/api/raid/start') == 2
  await page.evaluate("raidActive=false;openScreen('main')")
  await page.evaluate("BunkerMenu.readBook(); BunkerMenu.readBook()")
  await page.wait_for_timeout(350)
  assert calls.count('/api/items/use-knowledge-book') == 1
  assert await page.locator('#knowledgeBooksHeader').inner_text() == '2'
  assert await page.evaluate('player.level') == 7
  mode['book']='network'
  await page.locator('#bunkerReadBook').click()
  await page.wait_for_timeout(350)
  assert await page.locator('#knowledgeBooksHeader').inner_text() == '2'
  assert not await page.locator('#bunkerReadBook').is_disabled()
  await page.evaluate("document.getElementById('gameAlertModal').classList.remove('active');player.inventory['Книга знаний']=0;updateUI()")
  n = calls.count('/api/items/use-knowledge-book')
  await page.locator('#bunkerReadBook').click()
  assert calls.count('/api/items/use-knowledge-book') == n
  assert 'нет книг' in await page.locator('#gameAlertText').inner_text()
  await page.evaluate("document.getElementById('gameAlertModal').classList.remove('active')")
  await page.evaluate("Object.assign(player,{health:0,hunger:0,thirst:0,radiation:0,exp:0,coins:0,breedCredits:0});updateUI()")
  for id in ['bunkerHealth','bunkerHunger','bunkerThirst','bunkerExperience','bunkerRadiation']:
   assert await page.locator('#'+id+' > div').evaluate('(e)=>e.style.width') == '0%'
  assert await page.locator('#coins').inner_text() == '0'
  await page.screenshot(path=str(OUT/'zero-values.png'))
  await page.evaluate("Object.assign(player,{health:150,hunger:100,thirst:100,radiation:100,exp:expNeededForLevel(player.level),coins:1234567890,breedCredits:4567});updateUI()")
  for id in ['bunkerHealth','bunkerHunger','bunkerThirst','bunkerExperience','bunkerRadiation']:
   assert await page.locator('#'+id+' > div').evaluate('(e)=>e.style.width') == '100%'
  assert await page.locator('#coins').inner_text() == '1234567890'
  await page.screenshot(path=str(OUT/'full-values.png'))
  await page.evaluate("Object.assign(player,{health:89,hunger:66,thirst:42,radiation:18,exp:123,coins:6891,breedCredits:7});player.inventory['Книга знаний']=3;updateUI()")
  reports=[]
  for width,height in [(320,568),(360,800),(390,844),(412,915),(768,1024),(915,412)]:
   await page.set_viewport_size({'width':width,'height':height})
   await page.wait_for_timeout(100)
   result=await page.evaluate('''() => {
    const s=document.getElementById('bunkerScene').getBoundingClientRect();
    const keys=[...document.querySelectorAll('.bunker-hotspot')];
    const buttons=keys.map(b=>{const r=b.getBoundingClientRect(),cs=getComputedStyle(b);return {id:b.id,x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id,bg:cs.backgroundColor}});
    const exp=document.getElementById('bunkerExperience').getBoundingClientRect(),rad=document.getElementById('bunkerRadiation').getBoundingClientRect();
    return {scene:{x:s.x,y:s.y,w:s.width,h:s.height},buttons,experienceY:exp.y,radiationY:rad.y,overflow:document.documentElement.scrollWidth>innerWidth};
   }''')
   assert not result['overflow'],result
   assert abs(result['scene']['h']-height)<1,result
   assert abs(result['scene']['w']-(width if width<=height else height*941/1672))<1,result
   assert abs(result['experienceY']-result['radiationY'])<.5,result
   for b in result['buttons']:
    assert b['id']==b['hit'],b
    assert b['bg']=='rgba(0, 0, 0, 0)',b
    assert b['x']>=-1 and b['y']>=-1 and b['x']+b['w']<=width+1 and b['y']+b['h']<=height+1,b
   for i,a in enumerate(result['buttons']):
    for b in result['buttons'][i+1:]:
     overlap=min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])>0 and min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])>0
     assert not overlap,(a,b)
   await page.screenshot(path=str(OUT/f'menu-{width}x{height}.png'))
   reports.append({'width':width,'height':height,**result})
  assert not errors,errors
  await page.set_viewport_size({'width':390,'height':844})
  await page.wait_for_timeout(100)
  read=await page.locator('#bunkerReadBook').bounding_box()
  assert read and read['height']<25 and read['y']+read['height']<844,read
  result={'status':'passed','offline':True,'live_player_writes':0,'navigation_destinations':9,'viewports':reports,'raid_requests':2,'book_requests':2,'page_errors':errors,'checks':['nine transparent non-overlapping hotspots','PDA chat and return','server rejection','raid double-tap guard','book success/zero/network failure/double-tap guard','zero and full meters','maxHealth=150','large balances','same-row XP/radiation','portrait and landscape']}
  (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  print('PASS: full-client bunker menu; 9 hotspots including smoking stalker portrait; 6 viewports; live HUD; server-authoritative books and raid; 0 page errors')
  await browser.close()
asyncio.run(main())
