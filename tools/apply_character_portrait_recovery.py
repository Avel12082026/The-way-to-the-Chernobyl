"""Patch only portrait loading in the verified client; never change saved equipment."""
from pathlib import Path
import hashlib

p = Path('index.html')
data = p.read_bytes()
expected = 'e60cf4195c35142003b84c7f83cef8d161c91fa2'
actual = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
if actual != expected:
    raise SystemExit(f'Client changed: expected {expected}, got {actual}; review before applying')
s = data.decode('utf-8')

def replace_once(old, new):
    global s
    if s.count(old) != 1:
        raise ValueError(f'Expected one patch anchor: {old[:120]!r}')
    s = s.replace(old, new, 1)

old = '''    function updateCharacterPortrait() {
        const img = document.getElementById('characterPortraitImg');
        if (!img) return;
        const parsed = parseGearName(player.armor.name);
        const file = ARMOR_CHAR_IMAGES[parsed.baseName] || DEFAULT_CHARACTER_PORTRAIT;
        const newSrc = getIconUrl(file);
        if (img.getAttribute('src') !== newSrc) img.src = newSrc;
    }
'''
new = '''    // A failed <img> keeps the same src: comparing URLs alone never retries it.
    // One automatic retry, then one explicit fallback; reopening/online can retry again.
    let characterPortraitRequest = null;
    function setCharacterPortraitStatus(text, canRetry = false) {
        const status = document.getElementById('characterPortraitStatus');
        if (!status) return;
        status.hidden = !text;
        status.querySelector('span').textContent = text;
        status.querySelector('button').hidden = !canRetry;
    }

    function updateCharacterPortrait(retryFailed = true) {
        const img = document.getElementById('characterPortraitImg');
        if (!img) return;
        const visual = getProfileArmorVisual(player);
        const previous = characterPortraitRequest;
        if (previous && previous.img === img && previous.primary === visual.src) {
            if (previous.status === 'loading') return;
            if (previous.status === 'loaded' && img.complete && img.naturalWidth > 0) {
                img.style.visibility = '';
                img.style.display = '';
                return;
            }
            // Frequent stat updates must not restart failed requests indefinitely.
            if (!retryFailed) return;
        }
        if (previous) clearTimeout(previous.timer);
        const state = { img, primary: visual.src, current: '', status: 'loading',
            attempt: 0, timer: null, usingFallback: false };
        characterPortraitRequest = state;
        img.alt = 'Персонаж: ' + visual.label;
        img.style.display = '';
        const active = () => characterPortraitRequest === state && img.isConnected;
        const fail = () => {
            if (!active() || state.status !== 'loading') return;
            clearTimeout(state.timer);
            if (state.attempt === 0) {
                state.status = 'loading';
                setCharacterPortraitStatus('Повторная загрузка персонажа…');
                state.timer = setTimeout(() => {
                    if (!active()) return;
                    const join = state.primary.includes('?') ? '&' : '?';
                    load(state.primary + join + 'portrait_retry=' + Date.now(), 1);
                }, 750);
            } else if (!state.usingFallback && visual.fallbackSrc !== state.primary) {
                state.usingFallback = true;
                load(visual.fallbackSrc, 2);
            } else {
                state.status = 'failed';
                img.onload = img.onerror = null;
                img.style.visibility = 'hidden';
                setCharacterPortraitStatus('Не удалось загрузить персонажа. Экипировка не изменена.', true);
            }
        };
        const load = (src, attempt) => {
            if (!active()) return;
            clearTimeout(state.timer);
            state.attempt = attempt;
            state.current = src;
            state.status = 'loading';
            img.onload = () => {
                if (!active() || img.getAttribute('src') !== src || !img.complete || !img.naturalWidth) return;
                clearTimeout(state.timer);
                state.status = state.usingFallback ? 'fallback' : 'loaded';
                img.style.visibility = '';
                img.style.display = '';
                setCharacterPortraitStatus(state.usingFallback
                    ? 'Временно показан запасной портрет: изображение надетой брони недоступно.' : '', state.usingFallback);
            };
            img.onerror = () => {
                if (active() && img.getAttribute('src') === src && img.complete && !img.naturalWidth) fail();
            };
            // A stalled request also has a bounded recovery path, not an endless empty stage.
            state.timer = setTimeout(fail, 8000);
            img.src = src;
        };
        if (!img.complete || !img.naturalWidth) img.style.visibility = 'hidden';
        setCharacterPortraitStatus('Загрузка персонажа…');
        load(state.primary, 0);
    }
    window.addEventListener('online', () => updateCharacterPortrait(true));
'''
replace_once(old, new)
old_img = '<img id="characterPortraitImg" src="https://213-176-92-184.sslip.io/icons/character_portrait.png" style="max-height:220px; max-width:100%; object-fit:contain;"/>'
new_img = '''<img id="characterPortraitImg" alt="Персонаж в надетой броне" style="max-height:220px; max-width:100%; object-fit:contain;"/>
<div id="characterPortraitStatus" role="status" aria-live="polite" hidden><span></span><button type="button" onclick="updateCharacterPortrait(true)" hidden>Повторить загрузку</button></div>'''
replace_once(old_img, new_img)
css = '''<style id="character-portrait-recovery">
#characterPortraitStatus { position:absolute; z-index:2; left:8px; right:8px; bottom:24px;
  padding:6px; background:#0c100ee8; color:#cdbd8f; font-size:11px; line-height:1.35; text-align:center; }
#characterPortraitStatus[hidden], #characterPortraitStatus button[hidden] { display:none!important; }
#characterPortraitStatus button { display:block; width:auto; min-height:32px; margin:5px auto 0; font-size:11px; }
</style>
'''
replace_once('</head>', css + '</head>')
replace_once('    function updateUI() {\n        sanitizePlayerNumbers();',
             '    function updateUI() {\n        sanitizePlayerNumbers();\n        updateCharacterPortrait(false); // Sync armor after server refresh, without retry loops.')
p.write_bytes(s.encode('utf-8'))
print('Applied bounded character portrait recovery; saved equipment and all asset bytes unchanged.')
print('index SHA-256:', hashlib.sha256(p.read_bytes()).hexdigest())
