"""Browser-level quest UI regression using the real client with mocked server quest state."""
import asyncio,json,re,mimetypes
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
TG="window.Telegram={WebApp:{initData:'offline-test',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"

async def main():
  player_state=dict(nickname='Тест',health=100,maxHealth=100,hunger=100,thirst=100,level=160,exp=0,radiation=0,
                    coins=10000,breedCredits=0,inventory={},warehouse={})
  accepted=[
    dict(id='q1',vendor='leonov',title='Артефакт для исследований',itemName='Медуза',qty=1,reward=400,acceptedAt=1),
    dict(id='q2',vendor='diesel',title='Оружие для мастерской',itemName='ПМ',qty=1,reward=300,acceptedAt=1)
  ]
  qstate=dict(accepted=accepted,activeIds=['q2'],activeId='q2',completed=[dict(id='done1',vendor='diesel',title='Оружие для заказа',itemName='ПМ',qty=1,reward=300)],completedCount=1)
  offers={
    'leonov':[dict(id='lo1',vendor='leonov',title='Образец мутанта',itemName='Ухо слепого пса',qty=1,reward=800)],
    'zhuchara':[dict(id='zh1',vendor='zhuchara',title='Броня для заказа',itemName='Комбинезон Комбат',qty=1,reward=1200)],
    'diesel':[dict(id='di1',vendor='diesel',title='Оружие для заказа',itemName='Автомат АК-74',qty=1,reward=900)]
  }
  errors=[]
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(args=['--no-sandbox','--disable-dev-shm-usage'])
    context=await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block')
    page=await context.new_page();page.set_default_timeout(9000);page.on('pageerror',lambda e:errors.append(str(e)))
    await page.evaluate(TG)
    async def fixture(path,payload):
      nonlocal qstate
      if path.endswith('/player/private'):return player_state
      if path.endswith('/equipment/features'):return {'artifactSlotTarget':True}
      if '/faction' in path:return {'success':True,'faction':None}
      if path.endswith('/quests/state'):return {'success':True,**qstate}
      if path.endswith('/quests/offers'):return {'success':True,'offers':offers.get(payload.get('vendor'),[])}
      if path.endswith('/quests/activate'):
        qid=payload.get('questId');qstate.setdefault('activeIds',[])
        if qid not in qstate['activeIds']: qstate['activeIds'].append(qid)
        qstate['activeId']=qstate['activeIds'][0] if qstate['activeIds'] else None
        return {'success':True,**qstate}
      if path.endswith('/quests/accept'):
        vendor=payload.get('vendor');found=next((x for x in offers.get(vendor,[]) if x['id']==payload.get('questId')),None)
        if found and not any(x['id']==found['id'] for x in qstate['accepted']):qstate['accepted'].append(found.copy())
        return {'success':True,**qstate}
      if path.endswith('/quests/abandon'):
        qstate['accepted']=[x for x in qstate['accepted'] if x['id']!=payload.get('questId')]
        qstate['activeIds']=[x for x in qstate.get('activeIds',[]) if x!=payload.get('questId')]
        qstate['activeId']=qstate['activeIds'][0] if qstate['activeIds'] else None
        return {'success':True,**qstate}
      if path.endswith('/quests/turn-in'):
        q=next(x for x in qstate['accepted'] if x['id']==payload.get('questId'))
        qstate['accepted']=[x for x in qstate['accepted'] if x['id']!=q['id']]
        qstate['completed'].append(q);qstate['completedCount']+=1
        qstate['activeIds']=[x for x in qstate.get('activeIds',[]) if x!=q['id']]
        qstate['activeId']=qstate['activeIds'][0] if qstate['activeIds'] else None
        player_state['inventory'].pop(q['itemName'],None);player_state['coins']+=q['reward']
        return {'success':True,'reward':q['reward'],'coins':player_state['coins'],'inventory':player_state['inventory'],**qstate}
      if '/api/' in path:return {'success':True}
      return {}
    await page.expose_function('__fixture',fixture)
    await page.evaluate("""s=>{
      HTMLMediaElement.prototype.play=function(){return Promise.resolve()};
      window.fetch=async(input,init={})=>{
        const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
        const payload=init.body?JSON.parse(init.body):{};
        const data=await window.__fixture(path,payload);
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      };
    }""",player_state)

    html=(ROOT/'index.html').read_text()
    def inline_script(m):
      src=m[1].split('?')[0];f=ROOT/src
      code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
      if 'defer' in m[0]:code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
      return '<script>'+code+'</script>'
    html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline_script,html)
    html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text()+'</style>' if (ROOT/m[1].split('?')[0]).is_file() else '',html)
    await page.set_content(html,wait_until='domcontentloaded')
    await page.wait_for_function("typeof player==='object' && player.nickname==='Тест' && window.TraderHubs?.openZhuchara")

    # Inject modules explicitly; trader-hubs' dynamic <script> is intentionally network-isolated here.
    if not await page.evaluate("!!window.GameBalanceTuning"):
      await page.add_script_tag(content=(ROOT/'ui/balance-tuning.js').read_text())
    if not await page.evaluate("!!window.QuestSystem"):
      await page.add_style_tag(content=(ROOT/'ui/quests.css').read_text())
      await page.add_script_tag(content=(ROOT/'ui/quests.js').read_text())
    await page.wait_for_function("window.QuestSystem?.version==='1.3.0'")
    await page.evaluate("QuestSystem.sync()")
    await page.wait_for_timeout(80)

    # PDA button and 3 requested tabs.
    await page.evaluate("openScreen('kpk');RaidKpkPolish.apply()")
    assert await page.locator('#kpkScreen .zr-pda-banner').count()==0
    kpk_buttons=page.locator('#kpkScreen .zr-pda-tabs > button')
    assert await kpk_buttons.count()%2==0
    button=page.locator('#kpkQuestsBtn');await button.wait_for(state='visible');assert (await button.text_content()).strip()=='Задания'
    await button.click()
    tabs=[(x or '').strip() for x in await page.locator('#questPdaScreen [data-quest-tab]').all_text_contents()]
    assert tabs[0]=='Взятые' and tabs[1]=='Активные' and tabs[2].startswith('Выполненные')
    assert await page.locator('#questCompletedCount').text_content()=='1'

    # Accepted quest -> activate -> active priority.
    card=page.locator('#questPdaList [data-quest-id="q1"]');await card.click()
    activate=page.locator('#questPdaDetails [data-quest-action="activate"]');assert await activate.is_visible();await activate.click()
    await page.wait_for_timeout(80)
    await page.locator('[data-quest-tab="active"]').click()
    assert await page.locator('#questPdaList [data-quest-id="q1"]').count()==1
    assert await page.locator('#questPdaList [data-quest-id="q2"]').count()==1
    assert await page.evaluate("QuestSystem.state.activeIds.length")==2

    # Tracker appears below the quick slots; combat history is below the tracker.
    await page.evaluate("document.querySelector('[data-quest-action=pda-back]').click();openScreen('raid');renderBattleButtons();RaidKpkPolish.apply()")
    tracker=page.locator('#activeQuestRaidTracker');await tracker.wait_for(state='visible')
    assert await tracker.evaluate("e=>e.previousElementSibling?.id")=='quickSlots'
    assert await tracker.evaluate("e=>e.nextElementSibling?.id")=='raidLog'
    assert await tracker.locator('.raid-quest-track-item').count()==2
    assert await tracker.evaluate("e=>getComputedStyle(e).overflowY") in ('auto','scroll')
    assert not await tracker.evaluate("e=>e.classList.contains('quest-ready')")
    await page.evaluate("player.inventory['Медуза']=1;updateUI()");await page.wait_for_timeout(80)
    assert await tracker.locator('.raid-quest-track-item[data-quest-id="q1"]').evaluate("e=>e.classList.contains('quest-ready')")
    await page.evaluate("delete player.inventory['Медуза'];updateUI()");await page.wait_for_timeout(80)
    assert not await tracker.locator('.raid-quest-track-item[data-quest-id="q1"]').evaluate("e=>e.classList.contains('quest-ready')")

    # Trader talk opens the STALKER-like dialogue and category-specific offer.
    await page.evaluate("TraderHubs.openZhuchara()")
    talk=page.locator('#zhucharaHubScreen [data-trader-action="talk"]');await talk.click()
    dialog=page.locator('#traderQuestDialogue');await dialog.wait_for(state='visible')
    assert 'Жучара' in (await page.locator('#traderDialogueName').text_content())
    assert await dialog.get_by_role('button',name='Торговля').count()==0
    work=page.get_by_role('button',name='Какая у тебя есть работа?');await work.click();await page.wait_for_timeout(80)
    assert await dialog.get_by_text('Комбинезон Комбат').count()>=1
    # The requested item already exists before accepting the quest.
    await page.evaluate("player.inventory['Комбинезон Комбат']=1;updateUI()")
    take=dialog.get_by_role('button',name='Взять задание');await take.click();await page.wait_for_timeout(80)
    assert await page.evaluate("QuestSystem.state.accepted.some(q=>q.id==='zh1')")
    await dialog.get_by_role('button',name='Назад').click();await page.wait_for_timeout(50)
    ready=dialog.get_by_role('button',name='Я принёс то, что ты просил.')
    assert await ready.is_visible()
    await ready.click();await page.wait_for_timeout(40)
    give=dialog.get_by_role('button',name='Отдать и получить награду')
    assert await give.is_visible()
    await give.click();await page.wait_for_timeout(80)
    assert not await page.evaluate("QuestSystem.state.accepted.some(q=>q.id==='zh1')")
    assert await page.evaluate("player.inventory['Комбинезон Комбат']||0")==0
    # Quest feedback modal must be above the still-open dialogue.
    alert=page.locator('#gameAlertModal')
    assert await alert.is_visible()
    z=await page.evaluate("""()=>[Number(getComputedStyle(document.getElementById('gameAlertModal')).zIndex)||0,Number(getComputedStyle(document.getElementById('traderQuestDialogue')).zIndex)||0]""")
    assert z[0]>z[1],z
    await alert.locator('button').click()

    # Completed tab count/list remains available.
    await page.evaluate("QuestSystem.closeDialogue();QuestSystem.openPda()");await page.wait_for_timeout(50)
    await page.locator('[data-quest-tab="completed"]').click()
    assert await page.locator('#questPdaList [data-quest-id="done1"]').count()==1

    # Tier-9 artifacts are not changed by the regular rarity model.
    assert await page.evaluate("GameBalanceTuning.artifactModel.every(x=>x.tier>=1&&x.tier<=8)")
    assert not errors,errors
    print(json.dumps({'status':'passed','tabs':tabs,'tracker':'live green/white','dialogue':'zhuchara quest offer'},ensure_ascii=False))
    await browser.close()

asyncio.run(main())
