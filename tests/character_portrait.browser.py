"""Offline Chromium regression: all HTTP requests are intercepted; no live player writes.
Run: python tests/character_portrait.browser.py [index.html] [asset-directory] [report-directory]
"""
import asyncio
import json
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

INDEX = Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
ASSETS = Path(sys.argv[2] if len(sys.argv) > 2 else 'icons')
OUT = Path(sys.argv[3] if len(sys.argv) > 3 else '.validation/portraits')
OUT.mkdir(parents=True, exist_ok=True)
# Preserve the whole client and its handlers. Only offline origins/SDK are substituted.
HTML = re.sub(r'<script\b[^>]*src=[^>]*></script>', '', INDEX.read_text())
HTML = HTML.replace('<head>', '<head><base href="http://127.0.0.1:8765/">')
HTML = HTML.replace('https://213-176-92-184.sslip.io', 'http://127.0.0.1:8765')

async def main():
    reports = []
    async with async_playwright() as p:
        executable = shutil.which('chromium') or shutil.which('chromium-browser')
        browser = await p.chromium.launch(**({'executable_path': executable} if executable else {}), args=['--no-sandbox'])
        async def session(width=390, fail_count=0, fallback=False):
            page = await browser.new_page(viewport={'width': width, 'height': 844})
            state = {'fail_count': fail_count, 'requests': [], 'errors': [], 'fallback': fallback}
            page.on('pageerror', lambda e: state['errors'].append(str(e)))
            async def route(r):
                url = urlparse(r.request.url)
                filename = Path(url.path).name
                if '/api/' in url.path:
                    return await r.fulfill(content_type='application/json', body=json.dumps({'nickname': 'QA'} if '/private' in url.path else []))
                if filename.startswith('armor_char_') or filename == 'character_portrait.png':
                    state['requests'].append(r.request.url)
                    if filename == 'armor_char_1.webp' and state['fail_count'] > 0:
                        state['fail_count'] -= 1
                        return await r.abort('failed')
                    if filename == 'character_portrait.png' and state['fallback']:
                        # Default portrait is a fixture here, not a new production asset.
                        return await r.fulfill(path=str(ASSETS / 'armor_char_1.webp'))
                candidate = ASSETS / filename
                if candidate.is_file():
                    return await r.fulfill(path=str(candidate))
                return await r.abort('failed')
            await page.route('**/*', route)
            await page.evaluate('window.Telegram={WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}}')
            await page.set_content(HTML, wait_until='domcontentloaded')
            await page.wait_for_selector('#app', state='visible')
            await page.locator('button[onclick="openScreen(\'inventory\')"]').first.click()
            return page, state

        async def loaded(page):
            await page.wait_for_function('''() => {
                const i=document.getElementById('characterPortraitImg');
                return i.complete && i.naturalWidth > 0 && getComputedStyle(i).visibility === 'visible';
            }''')
            return await page.locator('#characterPortraitImg').evaluate('''i => {
                const b=i.getBoundingClientRect(), p=i.parentElement.getBoundingClientRect();
                return {src:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight,
                    objectFit:getComputedStyle(i).objectFit,opacity:getComputedStyle(i).opacity,
                    fitsStage:b.left>=p.left && b.right<=p.right && b.top>=p.top && b.bottom<=p.bottom};
            }''')

        for width in [320, 390, 768]:
            page, state = await session(width)
            await loaded(page)
            for _ in range(10):
                await page.locator('#inventoryScreen button[onclick="closeInventoryScreen()"]').click()
                await page.locator('button[onclick="openScreen(\'inventory\')"]').first.click()
                info = await loaded(page)
                assert info['fitsStage'] and info['objectFit'] == 'contain' and info['opacity'] == '1', info
            armor_requests = [u for u in state['requests'] if 'armor_char_1.webp' in u]
            assert len(armor_requests) == 1, armor_requests
            assert not state['errors'], state['errors']
            await page.screenshot(path=str(OUT / f'inventory_{width}.png'))
            reports.append({'scenario': '10 inventory/back/reopen cycles', 'viewport': width, 'image': info, 'armorRequests': len(armor_requests), 'pageErrors': state['errors']})
            await page.close()

        page, state = await session(fail_count=1)
        info = await loaded(page)
        assert 'portrait_retry=' in info['src'], info
        assert len([u for u in state['requests'] if 'armor_char_1.webp' in u]) == 2
        assert await page.locator('#characterPortraitStatus').is_hidden()
        reports.append({'scenario': 'first request fails; bounded automatic retry recovers', 'image': info})
        await page.close()

        page, state = await session(fail_count=2, fallback=True)
        await page.wait_for_function("characterPortraitRequest.status === 'fallback'")
        assert await page.locator('#characterPortraitStatus button').is_visible()
        assert 'запасной' in await page.locator('#characterPortraitStatus').inner_text()
        await page.locator('#characterPortraitStatus button').click()
        await page.wait_for_function("characterPortraitRequest.status === 'loaded'")
        info = await loaded(page)
        assert 'armor_char_1.webp' in info['src']
        reports.append({'scenario': 'fallback is labelled; retry button restores equipped armor', 'image': info})
        await page.close()

        for recovery in ['reopen', 'online']:
            page, state = await session(fail_count=20)
            await page.wait_for_function("characterPortraitRequest.status === 'failed'")
            before = len(state['requests'])
            await page.evaluate('updateUI(); updateUI(); updateUI()')
            await page.wait_for_timeout(1000)
            assert len(state['requests']) == before
            await page.screenshot(path=str(OUT / f'network_failure_{recovery}.png'))
            state['fail_count'] = 0
            if recovery == 'reopen':
                await page.locator('#inventoryScreen button[onclick="closeInventoryScreen()"]').click()
                await page.locator('button[onclick="openScreen(\'inventory\')"]').first.click()
            else:
                await page.evaluate("window.dispatchEvent(new Event('online'))")
            info = await loaded(page)
            assert await page.locator('#characterPortraitStatus').is_hidden()
            assert not state['errors'], state['errors']
            reports.append({'scenario': f'all requests fail; {recovery} recovers after network restored', 'image': info, 'pageErrors': state['errors']})
            await page.screenshot(path=str(OUT / f'recovered_{recovery}.png'))
            await page.close()

        # A server-state update uses the same sync path; fixture only, no equip endpoint call.
        page, state = await session()
        await loaded(page)
        await page.evaluate("player.armor={name:'Комбинезон Долг +3\\u200B'};updateUI()")
        await page.wait_for_function("characterPortraitRequest.status==='loaded' && characterPortraitRequest.primary.includes('armor_char_12.webp')")
        info = await loaded(page)
        assert 'armor_char_12.webp' in info['src']
        reports.append({'scenario': 'server-state UI refresh updates equipped armor without reopening', 'image': info})
        await page.close()
        await browser.close()
    report = {'mode': 'offline full-client Chromium; all HTTP intercepted', 'playerDataChanged': False,
              'source': str(INDEX), 'passed': len(reports), 'scenarios': reports}
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))

asyncio.run(main())
