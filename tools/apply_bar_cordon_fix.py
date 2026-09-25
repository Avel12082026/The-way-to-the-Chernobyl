#!/usr/bin/env python3
"""Share Cordon HUD geometry with Rostok and preserve confirmed trade rejections.
Only client files are changed. No server, player data, artwork, or APK changes.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CACHE = '20260925-cordon-hud-trade1'


def once(text, old, new):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError('Unsupported source: ' + old[:100])
    if text.count(old) != 1:
        raise RuntimeError('Ambiguous source: ' + old[:100])
    return text.replace(old, new, 1)


def patch_css(s):
    if '/* SHARED_CORDON_ROSTOK_HUD_V1 */' in s:
        return s
    split = s.index('/* Leonov first-person')
    shared = s[:split].replace('#mainMenu ', ':is(#mainMenu,#rostokCampScreen) ')
    shared = once(shared, 'text-transform:none; letter-spacing:0; text-shadow:none; touch-action:manipulation;',
                  'text-transform:none; letter-spacing:0; text-shadow:none; touch-action:manipulation; pointer-events:auto;')
    s = '/* SHARED_CORDON_ROSTOK_HUD_V1 */\n' + shared + s[split:]
    s = once(s, '''  display:none;position:fixed;inset:0;z-index:1660;overflow:hidden;
  place-items:center;background:#080a08;''', '''  display:none;position:fixed;inset:0;z-index:1660;overflow:hidden;
  place-items:center;width:100%;height:100%;min-height:0;max-height:none;
  min-width:0;max-width:none;margin:0;padding:0;box-sizing:border-box;
  /* The generic .screen theme adds a frame, padding and a shorter height. */
  border:0!important;border-image:none!important;border-radius:0!important;
  box-shadow:none!important;background:#080a08!important;''')
    s = once(s, '''  position:absolute;z-index:3;left:0;right:0;bottom:0;width:100%;
  height:var(--rostok-hud-height,calc(100vw * 182 / 941));
  overflow:hidden;pointer-events:none;''', '''  /* Full-scene coordinates: every control uses the Cordon CSS unchanged. */
  position:absolute;z-index:3;inset:0;width:100%;height:100%;
  overflow:hidden;pointer-events:none;''')
    s = once(s, '''  position:absolute;inset:0;z-index:0;display:block;width:100%;height:100%;
  object-fit:fill;object-position:center;''', '''  /* Only the existing 941 x 182 crop is painted, not the Cordon scene. */
  position:absolute;inset:auto 0 0;z-index:0;display:block;width:100%;
  height:var(--rostok-hud-height,10.8851674641%);
  object-fit:fill;object-position:center;''')
    start = s.index('#rostokCampScreen .rostok-hub-shell')
    end = s.index('body.rostok-camp-visible', start)
    s = s[:start] + '''/* Geometry and control styling come from the shared .bunker-* rules above. */
#rostokCampScreen .rostok-progress-row{z-index:5;}
#rostokCampScreen .rostok-camp-back:focus-visible{outline:2px solid #e4c477;outline-offset:-2px;}
''' + s[end:]
    return s


def patch_bunker(s):
    s = once(s, "  function refresh() {\n    if (typeof player !== 'object' || !player) return;",
             "  function refresh() {\n    if (typeof player !== 'object' || !player) return;\n    refreshRostokCamp();")
    if 'function layoutCampScene(target)' in s:
        return s
    start = s.index('  function layout() {')
    end = s.index('  function scheduleLayout()', start)
    s = s[:start] + '''  function layoutCampScene(target) {
    // One coordinate system for both camps, including Telegram viewport resizes.
    const viewport = window.visualViewport;
    const w = Math.max(1, viewport ? viewport.width : window.innerWidth);
    const h = Math.max(1, viewport ? viewport.height : window.innerHeight);
    const width = w <= h ? w : h * 941 / 1672;
    target.style.width = width + 'px';
    target.style.height = h + 'px';
    target.style.setProperty('--bunker-unit', width / 941 + 'px');
    target.style.setProperty('--bunker-vunit', h / 1672 + 'px');
    // The original Cordon scene stretches vertically; its crop must do the same.
    target.style.setProperty('--rostok-hud-height', h * 182 / 1672 + 'px');
  }

  function layout() {
    frame = 0;
    const visible = main.style.display !== 'none';
    document.body.classList.toggle('bunker-menu-visible', visible);
    if (!visible) return;
    layoutCampScene(scene);
    refresh();
  }

''' + s[end:]
    start = s.index('    const screenBox = rostokCampScreen.getBoundingClientRect();')
    end = s.index('    refreshRostokCamp();', start)
    s = s[:start] + '    layoutCampScene(campScene);\n' + s[end:]
    classes = {
        'rostok-vital rostok-hunger':'rostok-vital rostok-hunger bunker-vital bunker-hunger',
        'rostok-vital rostok-thirst':'rostok-vital rostok-thirst bunker-vital bunker-thirst',
        'rostok-vital rostok-health':'rostok-vital rostok-health bunker-vital bunker-health',
        'rostok-vital-text':'rostok-vital-text bunker-vital-text',
        'rostok-resources':'rostok-resources bunker-resources',
        'rostok-resource':'rostok-resource bunker-resource',
        'rostok-read-book':'rostok-read-book bunker-read-book',
        'rostok-progress-row':'rostok-progress-row bunker-progress-row',
        'rostok-progress':'rostok-progress bunker-progress',
        'rostok-progress-text':'rostok-progress-text bunker-progress-text',
    }
    for old, new in classes.items():
        needle = 'class="' + old + '"'
        if needle not in s:
            raise RuntimeError('Missing HUD class ' + old)
        s = s.replace(needle, 'class="' + new + '"')
    s = once(s, 'aria-label="Прочитать Опыт+"></button>', 'aria-label="Прочитать Опыт+">Использовать</button>')
    s = once(s, 'class="rostok-quick rostok-inventory"', 'class="rostok-quick rostok-inventory bunker-hotspot" style="left:70%;top:90.4%;width:13.9%;height:7.8%"')
    s = once(s, 'class="rostok-quick rostok-pda"', 'class="rostok-quick rostok-pda bunker-hotspot" style="left:84.1%;top:90.4%;width:13.7%;height:7.8%"')
    anchor = "    text('rostokKnowledgeBooks', books);"
    s = once(s, anchor, anchor + '''
    for (const el of rostokCampScreen.querySelectorAll('.bunker-resource > span[id]')) {
      const size = Math.max(11, 21 - Math.max(0, el.textContent.length - 6) * 1.5);
      el.style.fontSize = `calc(${size} * var(--bunker-unit))`;
    }''')
    s = once(s, "window.BunkerMenu = {version: '1.19.0'", "window.BunkerMenu = {version: '1.20.0'")
    return s


def patch_trade(s):
    s = once(s, '''    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();''', '''    // A JSON 4xx rejection is a confirmed refusal, not a lost transaction.
    // Preserve its reason and basket; do not lock every vendor behind resync.
    // Transport errors, malformed replies and 5xx remain ambiguous: no retry.
    const result = await response.json();
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && result?.success === false) return result;
      throw new Error('HTTP ' + response.status);
    }
    return result;''')
    s = once(s, "version: '1.3.5'", "version: '1.3.6'")
    return s


def main():
    planned = {}
    for name, fn in [('ui/bunker-menu.css',patch_css),('ui/bunker-menu.js',patch_bunker),('ui/trade-menu.js',patch_trade)]:
        p = ROOT/name
        planned[p] = fn(p.read_text(encoding='utf-8'))
    p = ROOT/'index.html'
    s = p.read_text(encoding='utf-8')
    for name in ('bunker-menu.css','bunker-menu.js','trade-menu.js'):
        s, n = re.subn(r'(ui/' + re.escape(name) + r'\?v=)[^"\']+', lambda m:m.group(1)+CACHE, s)
        if n != 1:
            raise RuntimeError('Expected one asset reference: '+name)
    planned[p] = s
    # Keep integration tests aligned with the shared geometry and cache keys.
    for name in ('tests/rostok_barman_trade_client.test.cjs','tests/zone_map_navigation.test.cjs','tests/zone_map_navigation.browser.py'):
        p = ROOT/name
        s = p.read_text(encoding='utf-8')
        s = s.replace("version: '1.3.5'", "version: '1.3.6'").replace("version: '1.19.0'", "version: '1.20.0'")
        s = s.replace("version==='1.19.0'", "version==='1.20.0'")
        s = s.replace('20260923-rostok-hud4',CACHE).replace('20260923-trader-stock1',CACHE)
        if name == 'tests/zone_map_navigation.test.cjs':
            replacements = [
                ("assert(css.includes('.rostok-health')&&css.includes('.rostok-hunger')&&css.includes('.rostok-thirst'),'Rostok survival meters missing');",
                 "assert(['health','hunger','thirst'].every(k=>js.includes('rostok-'+k+' bunker-vital bunker-'+k)&&css.includes('.bunker-'+k)), 'Rostok survival meters must share Cordon rules');"),
                ("assert(css.includes('.rostok-lower-hud-artwork')&&css.includes('.rostok-resources')&&css.includes('.rostok-quick'),'Rostok clean lower hub styling missing');",
                 "assert(css.includes('.rostok-lower-hud-artwork')&&js.includes('rostok-resources bunker-resources')&&js.includes('rostok-quick rostok-inventory bunker-hotspot'), 'Rostok lower hub must reuse Cordon styling');"),
                ("assert(css.includes('bottom:calc(var(--rostok-hud-height'),'Upper meters must be a separate overlay directly above the lower HUD');",
                 "assert(css.includes('.rostok-progress-row{z-index:5;}')&&js.includes('rostok-progress-row bunker-progress-row'), 'Upper meters must overlay the lower HUD in Cordon coordinates');"),
                ("assert(css.includes('.rostok-health{top:62.70%')&&css.includes('visibility:visible!important;opacity:1!important'),'Rostok health row must stay inside the lower HUD');",
                 "assert(css.includes(':is(#mainMenu,#rostokCampScreen) .bunker-health { top:96.02%; }'), 'Both camps must keep health at the identical visible position');"),
                ("assert(js.includes('const lowerHudHeight = width * 182 / 941'),'Rostok lower HUD must follow the approved menu aspect ratio');",
                 "assert(js.includes(\"target.style.setProperty('--rostok-hud-height', h * 182 / 1672 + 'px')\")&&js.includes('layoutCampScene(scene);')&&js.includes('layoutCampScene(campScene);'), 'HUD crop must follow the same vertical scaling as Cordon');")
            ]
            for old, new in replacements:
                s = once(s, old, new)
        planned[p] = s
    changed = []
    for p, s in planned.items():
        if s != p.read_text(encoding='utf-8'):
            p.write_text(s,encoding='utf-8');changed.append(str(p.relative_to(ROOT)))
    print('Changed: '+', '.join(changed) if changed else 'Already applied; no changes.')

if __name__ == '__main__':
    main()
