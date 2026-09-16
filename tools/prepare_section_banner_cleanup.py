import importlib.util, json, os, re, shutil, subprocess, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = 'Avel12082026/The-way-to-the-Chernobyl'
API = 'https://api.github.com/repos/' + REPO
OUT = Path('validation'); OUT.mkdir(exist_ok=True)
SCREENS = ['technicianScreen', 'scientistsScreen', 'kpkScreen', 'warehouseScreen', 'shopScreen', 'marketScreen']
NAMES = ['technician', 'scientists', 'kpk', 'warehouse', 'trader']
STYLE = re.compile(r'<style\b[^>]*>[\s\S]*?</style>', re.I)
SCRIPT = re.compile(r'<script\b[^>]*>[\s\S]*?</script>', re.I)

def api(path, data=None):
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(API + path, data=body, headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def raw(ref, path):
    with urllib.request.urlopen('https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + path, timeout=40) as response:
        return response.read().decode('utf-8')

def patch(html):
    panels = re.compile(r'<style id="pz-location-panels">[\s\S]*?</style>')
    old = panels.findall(html)
    assert len(old) == 1, 'Location style block changed; stop instead of guessing'
    assert all('images/ui/' + name + '.svg' in old[0] for name in NAMES if name != 'warehouse')
    result = panels.sub('', html)
    counts = {'before': 0, 'after': 0}
    def clean(match):
        block = match[0]
        for pseudo in counts:
            pattern = re.compile(r'#warehouseScreen::' + pseudo + r'\s*\{[^{}]*\}')
            def remove(rule):
                guard = 'images/ui/warehouse.svg' if pseudo == 'before' else 'СКЛАД НА БАЗЕ • СНАРЯЖЕНИЕ В БЕЗОПАСНОСТИ'
                assert guard in rule[0], 'Warehouse rule changed; stop instead of guessing'
                counts[pseudo] += 1
                return ''
            block = pattern.sub(remove, block)
        block = block.replace('/* warehouse atmosphere, made from CSS so it loads offline and never depends on a remote image */', '')
        return block
    result = STYLE.sub(clean, result)
    assert counts == {'before': 1, 'after': 1}, counts
    assert STYLE.sub('', html) == STYLE.sub('', result), 'Non-style HTML must remain byte-identical'
    assert SCRIPT.findall(html) == SCRIPT.findall(result), 'All JavaScript must remain byte-identical'
    assert all('images/ui/' + name + '.svg' not in result for name in NAMES)
    return result

TEST = '''"""Regression checks for removed decorative section banners. Run from any directory."""
import importlib.util
import re
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
NAMES = ('technician', 'scientists', 'kpk', 'warehouse', 'trader')
SCREENS = ('technicianScreen', 'scientistsScreen', 'kpkScreen', 'warehouseScreen', 'shopScreen', 'marketScreen')
class SectionBanners(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / 'index.html').read_text(encoding='utf-8')
    def test_no_decorative_images_or_spacers(self):
        css = '\\n'.join(re.findall(r'<style\\b[^>]*>([\\s\\S]*?)</style>', self.html, re.I))
        for name in NAMES:
            self.assertNotIn('images/ui/' + name + '.svg', self.html)
        for screen in SCREENS:
            self.assertNotIn('#' + screen + '::before', css)
        self.assertNotIn('#warehouseScreen::after', css)
        self.assertNotIn('pz-location-panels', self.html)
    def test_screens_are_preserved(self):
        for screen in SCREENS:
            self.assertIn('id="' + screen + '"', self.html)
    def test_android_generated_client(self):
        path = ROOT / 'tools/build_mobile.py'
        if not path.exists():
            self.skipTest('Android builder is only on the Android branch')
        spec = importlib.util.spec_from_file_location('build_mobile', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        generated = module.transform(self.html)
        for name in NAMES:
            self.assertNotIn('images/ui/' + name + '.svg', generated)
        self.assertFalse(any(p.startswith('images/ui/') for p in module.static_requirements(self.html)))
if __name__ == '__main__':
    unittest.main()
'''

prepared = []; variants = {}
for label, branch in [('telegram', 'main'), ('android', 'feature/android-local-assets')]:
    base = api('/git/ref/heads/' + branch)['object']['sha']
    original = raw(base, 'index.html')
    changed = patch(original)
    directory = OUT / label; (directory / 'tests').mkdir(parents=True, exist_ok=True)
    (directory / 'index.before.html').write_text(original, encoding='utf-8')
    (directory / 'index.html').write_text(changed, encoding='utf-8')
    (directory / 'tests/section_banners.test.py').write_text(TEST, encoding='utf-8')
    before, after = original, changed
    if label == 'android':
        (directory / 'tools').mkdir()
        builder = directory / 'tools/build_mobile.py'
        builder.write_text(raw(base, 'tools/build_mobile.py'), encoding='utf-8')
        spec = importlib.util.spec_from_file_location('build_mobile', builder)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        before, after = module.transform(original), module.transform(changed)
        removed = set(module.static_requirements(original)) - set(module.static_requirements(changed))
        assert removed == {'images/ui/' + n + '.svg' for n in NAMES}, removed
        (directory / 'game.html').write_text(after, encoding='utf-8')
    subprocess.run(['python3', str(directory / 'tests/section_banners.test.py')], check=True)
    variants[label] = (before, after)
    prepared.append({'label': label, 'branch': branch, 'base': base, 'html': changed})
    print('SOURCE_OK', label, 'removed_bytes', len(original.encode()) - len(changed.encode()), flush=True)

browser_results = []
chrome = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
assert chrome, 'A real Chromium browser is required before preparing commits'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome, headless=True, args=['--no-sandbox'])
    for label, (before, after) in variants.items():
        controls = {}
        for state, html in [('before', before), ('after', after)]:
            for width in ([390] if state == 'before' else [320, 390, 768]):
                page = browser.new_page(viewport={'width': width, 'height': 844})
                page.route('**/*', lambda route: route.abort())
                page.set_content(SCRIPT.sub('', html), wait_until='domcontentloaded')
                for screen in SCREENS:
                    data = page.evaluate('''id => {
                        document.querySelectorAll('.screen').forEach(n => n.style.setProperty('display','none','important'));
                        const el = document.getElementById(id);
                        if (!el) throw new Error('Missing screen: ' + id);
                        for (let n=el;n;n=n.parentElement) n.style.setProperty('display','block','important');
                        el.scrollTop=0;
                        const a=getComputedStyle(el,'::before'), b=getComputedStyle(el,'::after');
                        return {content:a.content, background:a.backgroundImage, after:b.content,
                            controls:el.querySelectorAll('button,input,select,textarea').length,
                            height:el.getBoundingClientRect().height};
                    }''', screen)
                    assert data['height'] > 0, (label, screen, 'Screen hidden')
                    if state == 'before':
                        assert data['content'] not in ('none', 'normal'), (label, screen, data)
                        controls[screen] = data['controls']
                    else:
                        assert data['content'] in ('none', 'normal'), (label, screen, data)
                        assert data['background'] == 'none', (label, screen, data)
                        assert data['controls'] == controls[screen], (label, screen, 'Controls changed')
                        if screen == 'warehouseScreen': assert data['after'] in ('none', 'normal'), data
                        if width == 390:
                            page.locator('#' + screen).screenshot(path=str(OUT / label / (screen + '.png')))
                    browser_results.append({'client':label, 'state':state, 'width':width, 'screen':screen, **data})
                page.close()
    browser.close()
(OUT / 'browser-results.json').write_text(json.dumps(browser_results, ensure_ascii=False, indent=2), encoding='utf-8')
print('BROWSER_OK', len(browser_results), 'screen/viewport checks', flush=True)

status = '''# Section banner cleanup

Removed the five decorative illustrations from technician, scientists, PDA, warehouse and trader screens. The trader illustration also appeared on the player market; it is removed there too.

The location-panel stylesheet and warehouse ::before / ::after rules were removed, including their frames, reserved heights, margins and decorative caption. Normal screen titles, buttons, item icons, equipment, drag-and-drop, character portraits and JavaScript are unchanged.

Validation: non-style HTML and all JavaScript are byte-identical to each branch's parent; regression tests pass; Chromium checks cover six screens at widths 320, 390 and 768 in the Telegram HTML and the generated Android game.html. Static requirements no longer include the five banner SVGs.

The Android source and generated web client are fixed. No new signed APK was produced by this cleanup job; an already installed APK needs rebuilding and updating. No server or player database changes are required.
'''
for item in prepared:
    base_tree = api('/git/commits/' + item['base'])['tree']['sha']
    files = {'index.html':item['html'], 'tests/section_banners.test.py':TEST, 'UI_SECTION_BANNERS_STATUS.md':status}
    entries = []
    for path, content in files.items():
        blob = api('/git/blobs', {'content':content, 'encoding':'utf-8'})
        entries.append({'path':path, 'mode':'100644', 'type':'blob', 'sha':blob['sha']})
    tree = api('/git/trees', {'base_tree':base_tree, 'tree':entries})
    commit = api('/git/commits', {'message':'Remove decorative section banners and empty spacing (' + item['label'] + ')', 'tree':tree['sha'], 'parents':[item['base']]})
    item['commit'] = commit['sha']; del item['html']
    print('PREPARED_COMMIT', json.dumps(item), flush=True)
(OUT / 'commits.json').write_text(json.dumps(prepared, indent=2), encoding='utf-8')
