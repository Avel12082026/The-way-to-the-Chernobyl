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
    assert labels[0]=='' and labels[1]=='',labels
    assert await page.locator('#raidUtilityButtons .raid-utility-label').count()==0
    pseudo_labels=await page.locator('#raidUtilityButtons>button').evaluate_all("""xs=>xs.map(e=>getComputedStyle(e,'::before').content.replace(/^['"]|['"]$/g,''))""")
    assert pseudo_labels==['Рюкзак','Телеграммка'],pseudo_labels
    vital_count=await page.locator('.raid-vital-chip').count()
    assert vital_count==3,vital_count
    vital_tops=await page.locator('.raid-vital-chip').evaluate_all('(xs)=>xs.map(x=>Math.round(x.getBoundingClientRect().top))')
    assert max(vital_tops)-min(vital_tops)<=1,vital_tops
    vital_bottom=await page.locator('.raid-vital-chip').first.evaluate('e=>e.getBoundingClientRect().bottom')
    meters_top=await page.locator('#raidMetersRow').evaluate('e=>e.getBoundingClientRect().top')
    assert 0 <= meters_top-vital_bottom <= 4,(vital_bottom,meters_top)
    head_bg=await page.locator('.raid-vitals-row').evaluate("e=>getComputedStyle(e).backgroundImage")
    assert head_bg=='none',head_bg
    initial_log_h=await page.locator('#raidLog').evaluate('e=>Math.round(e.getBoundingClientRect().height)')
    assert 82 <= initial_log_h <= 230,initial_log_h

    # The whole raid viewport is fixed: only the combat history itself may scroll.
    overflow=await page.locator('#raidScreen').evaluate("e=>getComputedStyle(e).overflowY")
    assert overflow=='hidden',overflow
    await page.evaluate("document.getElementById('raidScreen').scrollTop=120;RaidKpkPolish.apply()")
    assert await page.locator('#raidScreen').evaluate("e=>e.scrollTop")==0

    # Default navigation stays as before when there is no encounter.
    await page.evaluate("document.getElementById('itemInfoModal').classList.remove('active');currentEnemy=null;currentAnomaly=null;clearBattleUiAndRestoreNav();RaidKpkPolish.apply()")
    idle_visual=await page.locator('#raidVisualStage').evaluate("""e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {w:Math.round(r.width),h:Math.round(r.height),bg:s.backgroundImage}}""")
    assert idle_visual['h']>0,idle_visual
    assert abs(idle_visual['w']/idle_visual['h']-1.5)<0.03,idle_visual
    assert 'background.jpg' in idle_visual['bg'],idle_visual
    idle_log_h=await page.locator('#raidLog').evaluate('e=>Math.round(e.getBoundingClientRect().height)')
    assert 82 <= idle_log_h <= 230,idle_log_h
    nav=page.locator('#raidNavButtons')
    assert await nav.evaluate("e=>getComputedStyle(e).display")!='none'
    nav_labels=[x.strip() for x in await nav.locator('button').all_text_contents()]
    assert any('Идти дальше' in x for x in nav_labels) and any('Вернуться с рейда' in x for x in nav_labels),nav_labels

    # Anomaly replaces the two navigation buttons with the original search/bypass actions.
    await page.evaluate("""()=>{
      currentEnemy=null;
      const a=anomalies[0];
      currentAnomaly={...a,attemptsUsed:0,resolved:false,_foundNames:[],_searchPending:false};
      renderAnomalyButtons();RaidKpkPolish.apply();
    }""")
    assert await nav.evaluate("e=>getComputedStyle(e).display")=='none'
    anomaly_labels=[x.strip() for x in await page.locator('#battleButtonsContainer button').all_text_contents()]
    assert any('Поиск артефакта' in x for x in anomaly_labels) and any('Обойти аномалию' in x for x in anomaly_labels),anomaly_labels
    bypass=page.locator('#battleButtonsContainer button').filter(has_text='Обойти аномалию').first
    backpack=page.locator('#raidUtilityButtons>button').first
    style_js="e=>{const s=getComputedStyle(e);return [s.backgroundImage,s.backgroundColor,s.borderTopColor,s.borderTopWidth,s.fontFamily,s.fontSize,s.fontWeight,s.textTransform]}"
    assert await backpack.evaluate(style_js)==await bypass.evaluate(style_js)
    await page.evaluate("updateAnomalyScene();RaidKpkPolish.apply()")
    await page.wait_for_timeout(50)
    if await page.locator('#anomalyScene').is_visible():
      native_scene=await page.evaluate("""()=>{
        const v=document.getElementById('raidVisualStage').getBoundingClientRect();
        const s=document.getElementById('anomalyScene').getBoundingClientRect();
        const hand=document.querySelector('#anomalyScene .anomaly-hand');
        const hs=hand?getComputedStyle(hand):null;
        return {
          stageH:Math.round(v.height),sceneH:Math.round(s.height),sceneW:Math.round(s.width),
          top:Math.round(s.top-v.top),handObjectFit:hs?.objectFit||null
        };
      }""")
      assert abs(native_scene['stageH']-native_scene['sceneH'])<=2,native_scene
      assert abs(native_scene['top'])<=2,native_scene
      assert abs(native_scene['sceneW']/native_scene['sceneH']-1.5)<0.03,native_scene
      assert native_scene['handObjectFit'] in (None,'contain'),native_scene
      log_h=await page.locator('#raidLog').evaluate('e=>Math.round(e.getBoundingClientRect().height)')
      assert 82 <= log_h <= 230,log_h

    # Combat likewise replaces navigation with the original attack/escape pair.
    await page.evaluate("""()=>{
      currentAnomaly=null;
      currentEnemy={name:'Тушкан',tier:1,hp:100,maxHp:100,battleToken:'test-battle',friendly:false};
      battleTurn=0;renderBattleButtons();RaidKpkPolish.apply();
    }""")
    assert await nav.evaluate("e=>getComputedStyle(e).display")=='none'
    combat_labels=[x.strip() for x in await page.locator('#battleButtonsContainer button').all_text_contents()]
    assert any('Атаковать' in x for x in combat_labels) and any('Сбежать' in x for x in combat_labels),combat_labels
    assert await page.locator('#raidScreen').evaluate("e=>e.scrollTop")==0

    # Leaving a friendly NPC trader must never erase the persistent Backpack/Telegram labels.
    await page.evaluate("""async()=>{
      currentEnemy=null;currentAnomaly=null;isFriendlyEncounterActive=false;
      startFriendlyEncounter({name:'Макс Скай',faction:{name:'Свобода'}});
      RaidKpkPolish.apply();
      await leaveFriendlyPeacefully();
      RaidKpkPolish.apply();
    }""")
    after_npc=await page.locator('#raidUtilityButtons>button').evaluate_all("""xs=>xs.map(e=>{const s=getComputedStyle(e,'::before');return [s.content.replace(/^['"]|['"]$/g,''),s.display,s.visibility,s.opacity,s.color]})""")
    assert [x[0] for x in after_npc]==['Рюкзак','Телеграммка'],after_npc
    assert all(x[1]!='none' and x[2]=='visible' and float(x[3])>0 for x in after_npc),after_npc

    # Ending/clearing a combat encounter must keep the same labels visible.
    await page.evaluate("""()=>{
      currentEnemy={name:'Тушкан',tier:1,hp:100,maxHp:100,battleToken:'label-regression',friendly:false};
      battleTurn=0;renderBattleButtons();RaidKpkPolish.apply();
      currentEnemy=null;battleTurn=0;clearBattleUiAndRestoreNav();RaidKpkPolish.apply();
    }""")
    after_battle=await page.locator('#raidUtilityButtons>button').evaluate_all("""xs=>xs.map(e=>{const s=getComputedStyle(e,'::before');return [s.content.replace(/^['"]|['"]$/g,''),s.display,s.visibility,s.opacity,s.color]})""")
    assert [x[0] for x in after_battle]==['Рюкзак','Телеграммка'],after_battle
    assert all(x[1]!='none' and x[2]=='visible' and float(x[3])>0 for x in after_battle),after_battle

    assert not errors,errors
    print(json.dumps({'status':'passed','tapUses':writes,'holdMs':800,'utilityButtons':labels,'anomalyButtons':anomaly_labels,'combatButtons':combat_labels,'raidOverflow':overflow},ensure_ascii=False))
    await browser.close()

asyncio.run(main())
