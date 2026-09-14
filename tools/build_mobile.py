"""Build an offline web bundle. --download fetches missing static server assets at BUILD time."""
import argparse, concurrent.futures, hashlib, json, re, shutil, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SERVER='https://213-176-92-184.sslip.io'
OUT=ROOT/'android/app/src/main/assets'
CACHE=ROOT/'.mobile-assets'

def static_requirements(html):
    # All literal image filenames in the icon dictionary and portrait lookup.
    start=html.index('const ITEM_ICONS')
    # Include weapon mappings appearing before armor mappings.
    start=html.rfind('const ',0,start+1)
    block=html[start:html.index('const CLIENT_ICON_VERSIONS')]
    icons=set(re.findall(r"['\"]([^'\"/]+\.(?:jpg|png|webp|svg))['\"]",block))
    icons.update(re.findall(r'\$\{SERVER_URL\}/icons/([a-zA-Z0-9_.-]+)',html))
    icons.update(re.findall(r"['\"](empty_slot_[^'\"]+\.png|character_portrait\.png)['\"]",html))
    result={'icons/'+f for f in icons}
    result.update(re.findall(re.escape(SERVER)+r'/(images/[^\s\'"?)]+)',html))
    result.update(re.findall(r'\$\{SERVER_URL\}/(images/[^\s\'"?`)]+)',html))
    return sorted(result)

def transform(html):
    html=html.replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>','<script src="session.js"></script>')
    html=html.replace('<script defer src="mobile/account-link.js"></script>', '')
    html=re.sub(r'<link[^>]+href="https://fonts.googleapis.com[^>]+>','',html)
    for prefix in ('icons','images'):
        html=html.replace('${SERVER_URL}/'+prefix+'/', './'+prefix+'/').replace(SERVER+'/'+prefix+'/', './'+prefix+'/')
    html=html.replace('window.Telegram.WebApp.initDataUnsafe?.user','window.GameSession.user')
    html=html.replace('if(!initData) return null;','if(!window.GameSession.user) return null;')
    a=html.index('    function renderStarsShop() {');b=html.index('    // ===== БОЙ =====',a)
    html=html[:a]+'    function renderStarsShop() { return GameSession.renderShop(); }\n\n'+html[b:]
    html=html.replace('⭐ Магазин Байт','🧬 Магазин жетонов сталкера').replace('МАГАЗИН БАЙТ','МАГАЗИН ЖЕТОНОВ СТАЛКЕРА').replace('Магазин Байт','Магазин жетонов сталкера')
    html=html.replace('Особый предмет за Telegram Stars.','Предмет из магазина жетонов сталкера.')
    html=html.replace('    loadGame();\n    initChatOnFirstLoad();','    if (GameSession.ensure()) { loadGame(); initChatOnFirstLoad(); }\n    //')
    # Never show a default playable profile when server authentication/load fails.
    start=html.index('    function loadGame() {');end=html.index('    // Однократная инициализация чата',start)
    part=html[start:end].replace('.then(res => res.json())',".then(res => {if(!res.ok)throw new Error('Не удалось загрузить профиль');return res.json();})")
    part=part.replace("document.getElementById('app').style.display = 'block';\n            });", "document.getElementById('app').style.display = 'none';\n                location.replace('index.html');\n            });")
    html=html[:start]+part+html[end:]
    html=html.replace('</body>','''<script>
const mobileMenu=document.getElementById('mainMenu');
if(mobileMenu){
const controls=document.createElement('div');controls.style.cssText='display:grid;gap:10px;padding:16px';
const exit=document.createElement('button');exit.textContent='Выход из игры';exit.onclick=()=>GameSession.exit();
const logout=document.createElement('button');logout.textContent='Выйти из аккаунта';logout.onclick=()=>{if(confirm('Выйти из аккаунта и удалить сохранённый вход?'))GameSession.logout();};
controls.append(exit,logout);mobileMenu.append(controls);
}
</script></body>''')
    return html

def build(download=False):
    html=(ROOT/'index.html').read_text()
    required=static_requirements(html)
    CACHE.mkdir(exist_ok=True)
    def fetch(relative):
        target=CACHE/relative
        if (ROOT/relative).is_file() or target.is_file():return None
        if not download:return relative
        try:
            with urllib.request.urlopen(SERVER+'/'+relative,timeout=25) as response:
                content=response.read();mime=response.headers.get_content_type()
            if not mime.startswith('image/') or not content:raise ValueError('Not an image')
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
            return None
        except Exception as e:return relative+' ('+str(e)+')'
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:missing=list(filter(None,pool.map(fetch,required)))
    if missing:
        (CACHE/'missing.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2))
        raise SystemExit(f'Missing {len(missing)} static assets; see .mobile-assets/missing.json. No incomplete APK bundle produced.')
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for folder in ('images','icons','audio','inventory'):
        shutil.copytree(ROOT/folder,OUT/folder)
    for relative in required:
        if not (ROOT/relative).is_file():
            (OUT/relative).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(CACHE/relative,OUT/relative)
    for file in (ROOT/'mobile/web').iterdir():shutil.copy2(file,OUT/file.name)
    (OUT/'game.html').write_text(transform(html))
    shutil.copy2(ROOT/'android/app/src/main/res/drawable-nodpi/game_logo.png',OUT/'game-logo.png')
    entries=[]
    for p in sorted(OUT.rglob('*')):
        if p.is_file():entries.append({'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    manifest={'files':entries,'totalBytes':sum(x['bytes'] for x in entries)}
    (OUT/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'files':len(entries),'totalBytes':manifest['totalBytes']}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--download',action='store_true');build(parser.parse_args().download)
