"""Five-fix UI regression: actual client, mocked data APIs; no production gameplay writes."""
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
TG="window.Telegram={WebApp:{initData:'offline-five',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"
async def main():
    state=dict(nickname='Тест',health=100,maxHealth=100,hunger=100,thirst=100,level=160,exp=100,radiation=20,coins=10000,breedCredits=10,inventory={},warehouse={})
    qs=[dict(id='q1',vendor='leonov',title='Артефакт для исследований',itemName='Медуза',qty=1,reward=400),dict(id='q2',vendor='zhuchara',title='Броня для заказа',itemName='Комбинезон Комбат',qty=1,reward=800),dict(id='q3',vendor='diesel',title='Оружие для мастерской',itemName='ПМ',qty=1,reward=200)]
    active=[];errors=[];writes=[]
    async def fixture(path,body):
        nonlocal active
        if path.endswith('/player/private'):return state
        if path.endswith('/equipment/features'):return {'artifactSlotTarget':True}
        if path.endswith('/named-artifacts'):return []
        if path.endswith('/api/market'):return [dict(item='Медуза',quantity=2,price=100,currency='bytes'),dict(item='Медуза',quantity=1,price=100,currency='bytes'),dict(item='Медуза',quantity=1,price=3,currency='stalkcoins')]
        if '/quests/' in path:
            if path.endswith('/activate'):
                writes.append(body);ids=body.get('questIds',[body.get('questId')]);active=list(dict.fromkeys(active+ids))
            if path.endswith('/deactivate'):active=[i for i in active if i!=body.get('questId')]
            return dict(success=True,accepted=qs,activeIds=active,activeId=active[0] if active else None,completed=[],completedCount=0)
        if '/faction' in path:return dict(success=True,faction=None)
        return {'success':True}
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
        page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)))
        await page.evaluate(TG)
        await page.expose_function('__fixture',fixture)
        await page.evaluate("""()=>{
          HTMLMediaElement.prototype.play=function(){return Promise.resolve()};
          window.fetch=async(input,init={})=>{
            const path=new URL(typeof input==='string'?input:input.url,'http://offline.test').pathname;
            const data=await window.__fixture(path,init.body?JSON.parse(init.body):{});
            return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }""")
        html=(ROOT/'index.html').read_text()
        def inline(m):
            src=m[1].split('?')[0];f=ROOT/src
            code=TG if 'telegram-web-app.js' in src else f.read_text() if f.is_file() else ''
            if 'defer' in m[0]:code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});"
            return '<script>'+code+'</script>'
        html=re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>',inline,html)
        html=re.sub(r'<link\b[^>]*href="([^"]+)"[^>]*>',lambda m:'<style>'+(ROOT/m[1].split('?')[0]).read_text()+'</style>' if (ROOT/m[1].split('?')[0]).is_file() else '',html)
        await page.set_content(html,wait_until='domcontentloaded')
        await page.wait_for_function("typeof player==='object'&&player.nickname==='Тест'&&window.ItemReference")
        if not await page.evaluate('!!window.GameBalanceTuning'):await page.add_script_tag(content=(ROOT/'ui/balance-tuning.js').read_text())
        if not await page.evaluate('!!window.QuestSystem'):
            await page.add_style_tag(content=(ROOT/'ui/quests.css').read_text())
            await page.add_script_tag(content=(ROOT/'ui/quests.js').read_text())
        await page.evaluate('QuestSystem.sync()')
        assert await page.locator('#activeQuestRaidTracker').is_hidden()
        await page.evaluate('QuestSystem.openPda()')
        await page.locator('#questPdaList [data-quest-id="q1"]').click()
        await page.locator('#questPdaDetails [data-quest-action=activate]').click()
        await page.wait_for_function("QuestSystem.state.activeIds.length===1")
        await page.locator('[data-quest-tab=accepted]').click()
        await page.locator('[data-quest-action=activate-all]').click()
        await page.wait_for_function("QuestSystem.state.activeIds.length===3")
        assert await page.locator('#questPdaList .quest-card').count()==3
        await page.evaluate('QuestSystem.sync()');assert await page.evaluate('QuestSystem.state.activeIds.length')==3
        await page.evaluate("QuestSystem.closePda();openScreen('raid');raidActive=true;raidSessionToken='offline-five';currentEnemy=null;currentAnomaly=null;clearBattleUiAndRestoreNav();RaidKpkPolish.apply();updateUI()")
        tracker=page.locator('#activeQuestRaidTracker');await tracker.wait_for(state='visible')
        assert await tracker.locator('.raid-quest-entry').count()==3
        report=await tracker.evaluate("e=>({scroll:e.scrollHeight,height:e.clientHeight,overflow:getComputedStyle(e).overflowY})")
        assert report['scroll']>report['height'] and report['overflow']=='auto',report
        await tracker.evaluate('e=>{e.scrollTop=20}')
        await page.evaluate("player.inventory['Медуза']=1;updateUI()")
        await page.wait_for_timeout(150)
        assert await tracker.evaluate('e=>e.scrollTop')>=19
        assert await tracker.locator('[data-quest-id=q1]').evaluate("e=>e.classList.contains('quest-ready')")
        assert not await tracker.locator('[data-quest-id=q2]').evaluate("e=>e.classList.contains('quest-ready')")
        # Actual green fill (not just the numeric label) must grow; scene geometry is unchanged.
        for width,height in [(320,720),(390,844),(430,932)]:
            await page.set_viewport_size(dict(width=width,height=height))
            for pct in [0,25,75,100]:
                await page.evaluate("pct=>{player.exp=expNeededForLevel(player.level)*pct/100;updateUI()}",pct)
                await page.wait_for_timeout(350)
                meter=await page.locator('#raidExpTrack>.expBarFill').evaluate("e=>{const r=e.getBoundingClientRect();return {w:r.width,parent:e.parentElement.clientWidth,h:r.height,display:getComputedStyle(e).display}}")
                assert meter['display']!='none' and meter['h']>0,meter
                assert abs(meter['w']/meter['parent']*100-pct)<1,(pct,meter)
            stage=await page.locator('#raidVisualStage').evaluate('e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}}')
            assert abs(stage['w']/stage['h']-1.5)<.03,stage
            assert await page.locator('#raidScreen').evaluate('e=>e.scrollTop')==0
        await page.set_viewport_size(dict(width=390,height=844))
        out=ROOT/'.validation/raid-five';out.mkdir(parents=True,exist_ok=True)
        await page.screenshot(path=str(out/'multi-quests-exp.png'))
        await page.evaluate("showItemInfoModal('Медуза')")
        modal=page.locator('#itemInfoModal');await modal.wait_for(state='visible')
        await page.wait_for_function("document.querySelector('#itemInfoModal .item-reference-market')?.textContent.includes('66,67')")
        txt=await modal.locator('.item-reference').inner_text();assert 'сталкоинов' in txt and 'сталбайтов' in txt and 'Уровень использования: 1' in txt,txt
        await modal.locator('button').last.click()
        suit=await page.evaluate("armorItems.find(a=>a.isResearchSuit&&!a.adminOnly&&a.tier===4).name")
        await page.evaluate("n=>{player.inventory[n]=1;openItemActions(n)}",suit)
        item=page.locator('#itemActionModal');await item.wait_for(state='visible')
        assert '135' in await item.locator('.item-reference-level').text_content()
        assert await item.locator('.item-reference').count()==1
        await page.screenshot(path=str(out/'item-reference.png'))
        assert not errors,errors
        report={'status':'passed','multiActive':3,'scroll':report,'exp':'0/25/75/100% at 3 mobile sizes','item':'use level + separate-currency weighted mean + inventory modal','mutations':len(writes)}
        (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
        await browser.close()
asyncio.run(main())
