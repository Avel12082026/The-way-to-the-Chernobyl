from pathlib import Path
R=Path(__file__).resolve().parents[1]
def once(s,a,b):
    assert s.count(a)==1,(a[:100],s.count(a))
    return s.replace(a,b,1)
j=(R/'ui/bunker-menu.js').read_text()
j=once(j,'const lowerHudHeight = width * 182 / 941;','// Match Cordon\'s vertical scale, not the artwork\'s natural aspect ratio.\n    const lowerHudHeight = h * 182 / 1672;')
for a,b in {
 'rostok-vital rostok-hunger':'rostok-vital rostok-hunger bunker-vital bunker-hunger',
 'rostok-vital rostok-thirst':'rostok-vital rostok-thirst bunker-vital bunker-thirst',
 'rostok-vital rostok-health':'rostok-vital rostok-health bunker-vital bunker-health',
 'class="rostok-vital-text"':'class="rostok-vital-text bunker-vital-text"',
 'class="rostok-resources"':'class="rostok-resources bunker-resources"',
 'class="rostok-resource"':'class="rostok-resource bunker-resource"',
 'class="rostok-read-book"':'class="rostok-read-book bunker-read-book"',
 'class="rostok-quick rostok-inventory"':'class="rostok-quick rostok-inventory bunker-hotspot"',
 'class="rostok-quick rostok-pda"':'class="rostok-quick rostok-pda bunker-hotspot"',
 'class="rostok-progress"':'class="rostok-progress bunker-progress"',
 'class="rostok-progress-text"':'class="rostok-progress-text bunker-progress-text"'
}.items():
    assert a in j,a
    j=j.replace(a,b)
j=once(j,'data-rostok-action="read" aria-label="Прочитать Опыт+"></button>','data-rostok-action="read" aria-label="Прочитать Опыт+">Прочитать</button>')
j=once(j,"    for (const el of main.querySelectorAll('.bunker-resource > span[id]')) {","    refreshRostokCamp();\n    for (const el of document.querySelectorAll('#mainMenu .bunker-resource > span[id], #rostokCampScreen .bunker-resource > span[id]')) {")
j=once(j,"    window.visualViewport?.addEventListener('resize', layoutRostokCamp);","    window.visualViewport?.addEventListener('resize', layoutRostokCamp);\n    window.Telegram?.WebApp?.onEvent?.('viewportChanged', layoutRostokCamp);")
j=j.replace("window.BunkerMenu = {version: '1.19.0'","window.BunkerMenu = {version: '1.20.0'")
(R/'ui/bunker-menu.js').write_text(j)
c=(R/'ui/bunker-menu.css').read_text()
i=c.index('/* Leonov first-person')
c=c[:i].replace('#mainMenu ',':is(#mainMenu,#rostokCampScreen) ')+c[i:]
c=once(c,'  place-items:center;background:#080a08;\n}', '''  place-items:center;background:#080a08!important;
  /* Generic .screen padding/borders used to move the scene 18px offscreen. */
  width:100%;height:100%;min-width:0;min-height:0;max-width:none;max-height:none;
  margin:0;padding:0;border:0!important;border-image:none!important;border-radius:0!important;
  box-shadow:none!important;box-sizing:border-box;isolation:isolate;
}''')
c=c.replace('calc(100vw * 182 / 941)','calc(100dvh * 182 / 1672)')
a=c.index('#rostokCampScreen .rostok-progress{');b=c.index('body.rostok-camp-visible',a)
c=c[:a]+'''/* Coordinates are the Cordon coordinates with the 1490px crop origin subtracted.
   The same CSS classes above draw all meters, labels, and the book button. */
#rostokCampScreen .rostok-vital{
  z-index:2;height:calc(20.5656 * var(--bunker-vunit));
}
#rostokCampScreen .rostok-hunger{top:calc(31.52 * var(--bunker-vunit));}
#rostokCampScreen .rostok-thirst{top:calc(73.4872 * var(--bunker-vunit));}
#rostokCampScreen .rostok-health{top:calc(115.4544 * var(--bunker-vunit));}
#rostokCampScreen .rostok-resources{
  z-index:2;top:calc(25.668 * var(--bunker-vunit));height:calc(119.548 * var(--bunker-vunit));
}
#rostokCampScreen button.rostok-read-book{
  z-index:3;top:calc(106.2584 * var(--bunker-vunit));height:calc(32.9384 * var(--bunker-vunit));
  pointer-events:auto;
}
#rostokCampScreen button.rostok-quick{
  z-index:3;top:calc(21.488 * var(--bunker-vunit));height:calc(130.416 * var(--bunker-vunit));
}
#rostokCampScreen .rostok-inventory{left:70%;width:13.9%;}
#rostokCampScreen .rostok-pda{left:84.1%;width:13.7%;}
#rostokCampScreen .rostok-camp-back:focus-visible{outline:2px solid #e4c477;outline-offset:-2px;}
'''+c[b:]
anchor=':is(#mainMenu,#rostokCampScreen) .bunker-progress-fill { position:absolute; inset:0 auto 0 0; height:100%; width:0; }'
c=once(c,anchor,anchor+'\n:is(#mainMenu,#rostokCampScreen) .bunker-progress .expBarFill { background:linear-gradient(90deg,#547332,#b2bb74); }\n:is(#mainMenu,#rostokCampScreen) .bunker-progress .radiationBarFill { background:linear-gradient(90deg,#aa8b3b,#a8522d); }')
(R/'ui/bunker-menu.css').write_text(c)
t=(R/'ui/trade-menu.js').read_text()
t=once(t,"    if (!response.ok) throw new Error('HTTP ' + response.status);\n    return response.json();",'''    const result = await response.json();
    // 4xx with success:false is a confirmed refusal, not an unconfirmed payment.
    // Keep the reason and queued item; do not block every other vendor afterwards.
    if (!response.ok && !(response.status >= 400 && response.status < 500 && result?.success === false)) {
      throw new Error('HTTP ' + response.status);
    }
    return result;''')
t=t.replace("version: '1.3.5'","version: '1.3.6'")
(R/'ui/trade-menu.js').write_text(t)
key='20260925-hud-trade1'
for name in ['index.html','tools/install_rostok_location.py','tests/rostok_location_installer.test.py','tests/rostok_barman_trade_client.test.cjs','tests/smoker_npc.test.cjs']:
    p=R/name;s=p.read_text().replace('20260923-rostok-hud4',key)
    if name in ('index.html','tests/rostok_barman_trade_client.test.cjs'):
        s=s.replace('ui/trade-menu.js?v=20260923-trader-stock1','ui/trade-menu.js?v='+key)
    s=s.replace("window.BunkerMenu = {version: '1.19.0'","window.BunkerMenu = {version: '1.20.0'")
    if name=='tests/rostok_barman_trade_client.test.cjs':s=s.replace("version: '1.3.5'","version: '1.3.6'")
    p.write_text(s)
p=R/'tests/zone_map_navigation.test.cjs';s=p.read_text().replace("window.BunkerMenu = {version: '1.19.0'","window.BunkerMenu = {version: '1.20.0'")
s=once(s,"assert(css.includes('.rostok-health{top:62.70%')&&css.includes('visibility:visible!important;opacity:1!important'),'Rostok health row must stay inside the lower HUD');","assert(css.includes('.rostok-health{top:calc(115.4544 * var(--bunker-vunit))'),'Rostok health must use the exact Cordon crop offset');")
s=s.replace('const lowerHudHeight = width * 182 / 941','const lowerHudHeight = h * 182 / 1672');p.write_text(s)
p=R/'tests/zone_map_navigation.browser.py';s=p.read_text().replace("window.BunkerMenu?.version==='1.19.0'","window.BunkerMenu?.version==='1.20.0'")
s=once(s,"assert abs((lower_box['width']/lower_box['height'])-(941/182))<0.04,lower_box","assert abs(lower_box['height']-scene_box['height']*182/1672)<0.1,lower_box");p.write_text(s)
p=R/'.github/workflows/zone-map-navigation.yml';s=p.read_text().replace("      - 'tests/zone_map_navigation*'","      - 'tests/zone_map_navigation*'\n      - 'tests/rostok_trade_regression.browser.py'")
s=once(s,'      - name: Existing raid regression', '''      - name: Full-client Rostok HUD and trade regression
        run: |
          mkdir -p .validation/rostok-trade
          curl --fail --silent --show-error --max-time 25 --retry 1 https://213-176-92-184.sslip.io/api/zone-camp/4 -o .validation/rostok-trade/rostok-bar.png
          python tests/rostok_trade_regression.browser.py
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: rostok-hud-trade-regression
          retention-days: 7
          path: .validation/rostok-trade/
      - name: Existing raid regression''');p.write_text(s)
print('Applied HUD coordinate/style and confirmed-trade-rejection fixes.')
