"""Move the existing chat widget to a dedicated PDA screen; never touch player data."""
from pathlib import Path
import hashlib
import re
import sys

EXPECTED_BLOB = '526e43e9211c7e6529e753b7b3322e415e8c6f3a'

CSS = '''
<style id="chat-pda-navigation-20260917">
/* The removed chat must not leave a reserved grid row on the main menu. */
#mainMenu.zr-menu {
  grid-template-rows:96px 66px auto 231px!important;
  height:auto!important;
  align-content:start!important;
}
@media (max-width:420px) {
  #mainMenu.zr-menu { grid-template-rows:88px 66px auto 215px!important; }
}
#chatScreen.active {
  display:flex;
  flex-direction:column;
  overflow:hidden;
  height:var(--chat-viewport-height,calc(100dvh - 16px));
  max-height:var(--chat-viewport-height,calc(100dvh - 16px));
}
#chatScreen > .zr-topbar { flex:0 0 auto; }
#chatScreen #embeddedChatWidget {
  height:auto!important;
  flex:1 1 auto;
  min-height:0;
  overflow:hidden;
}
#chatScreen #chatMessages { min-height:0!important; overscroll-behavior:contain; }
#chatScreen #chatInputRow { padding-bottom:env(safe-area-inset-bottom,0px)!important; }
#kpkChatBtn { grid-column:1 / -1; position:relative; }
#kpkChatUnreadDot {
  display:none; position:absolute; top:8px; right:14px;
  width:10px; height:10px; background:#e74c3c; border-radius:50%;
}
</style>
'''

CHAT_SCREEN_OPEN = '''<!-- One chat widget, permanently hosted in the PDA chat screen. -->
<div class="screen" id="chatScreen" aria-label="Телеграммка">
<div class="zr-topbar">
<h3 class="zr-title">Телеграммка</h3>
<button class="back-btn" id="chatBackToKpkBtn" type="button" onclick="openScreen('kpk')">Назат</button>
</div>
'''


def apply(source: str) -> str:
    def replace(old: str, new: str, count: int = 1) -> None:
        nonlocal source
        found = source.count(old)
        if found != count:
            raise ValueError(f'Expected {count} anchors, found {found}: {old[:120]!r}')
        source = source.replace(old, new)

    replace('<section aria-label="Игровой чат" id="mainMenuChatSlot"></section>', '')
    replace('<div id="raidChatSlot" style="flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden;"></div>\n', '')
    old_comment = '''<!-- Единый виджет чата — общий и для главного меню, и для экрана рейда. При входе в рейд
         переносится JS'ом в #raidChatSlot (под кнопки "Идти дальше"/"Вернуться с рейда"), при
         возврате в главное меню — обратно в #mainMenuChatSlot. Это один и тот же DOM-элемент,
         поэтому чат гарантированно синхронизирован между обоими режимами -->
'''
    replace(old_comment, CHAT_SCREEN_OPEN)
    replace('<div class="screen" id="starsShopScreen">', '</div>\n<div class="screen" id="starsShopScreen">')
    replace('<div class="zr-pda-tabs" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">',
            '<div class="zr-pda-tabs" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">\n'
            '<button id="kpkChatBtn" aria-label="Телеграммка" type="button" onclick="openScreen(\'chat\')">Телеграммка<span id="kpkChatUnreadDot" aria-hidden="true"></span></button>')

    replace('''        document.getElementById('mainMenuChatSlot').appendChild(document.getElementById('embeddedChatWidget'));
        document.getElementById('embeddedChatWidget').style.display = 'flex';
        openChatTab(chatTab);''',
            '''        // Do not open a channel or mark a private dialogue read on the main menu.
        document.getElementById('embeddedChatWidget').style.display = 'none';''')
    replace('''        document.getElementById('mainMenu').style.display = 'none';
        
        if (screen === 'main') {''',
            '''        document.getElementById('mainMenu').style.display = 'none';
        const chatWidget = document.getElementById('embeddedChatWidget');
        chatWidget.style.display = 'none';
        if (screen !== 'chat') {
            if (chatWidget.contains(document.activeElement)) document.activeElement.blur();
            document.getElementById('dmListModal').classList.remove('active');
            document.getElementById('chatPlayerActionsModal').classList.remove('active');
        }

        if (screen === 'main') {''')
    replace('''            document.getElementById('mainMenuChatSlot').appendChild(document.getElementById('embeddedChatWidget'));
            document.getElementById('embeddedChatWidget').style.display = 'flex';
            openChatTab(chatTab); // чат общий для главного меню и рейда — обновляем при каждом возврате
''', '')
    replace('''        // Любой другой экран (кроме главного меню и рейда) — чат скрываем, там для него нет места
        document.getElementById('embeddedChatWidget').style.display = 'none';

''', '')
    replace("            target.classList.add('active');\n            if (screen === 'raid')", '''            target.classList.add('active');
            if (screen === 'chat') {
                chatWidget.style.display = 'flex';
                openChatTab(chatTab);
                adjustChatMessagesHeight();
                requestAnimationFrame(adjustChatMessagesHeight);
            }
            if (screen === 'raid')''')

    replace('''            document.getElementById('raidChatSlot').appendChild(document.getElementById('embeddedChatWidget'));
            document.getElementById('embeddedChatWidget').style.display='flex';
            openChatTab(chatTab);''',
            "            document.getElementById('embeddedChatWidget').style.display = 'none';")
    replace('''        document.getElementById('raidChatSlot').appendChild(document.getElementById('embeddedChatWidget'));
        document.getElementById('embeddedChatWidget').style.display = 'flex';
        openChatTab(chatTab);''',
            "        document.getElementById('embeddedChatWidget').style.display = 'none';")
    replace('''    // на главное меню (там живёт чат) и сразу открываем диалог именно с этим игроком
''',
            '''    // на «Телеграммку» в КПК и сразу открываем диалог именно с этим игроком
''')
    replace("        chatDmPartnerId = String(playerId);\n        openScreen('main');", "        chatDmPartnerId = String(playerId);\n        openScreen('chat');")
    replace("            if (dot) dot.style.display = hasUnread ? 'block' : 'none';", "            if (dot) dot.style.display = hasUnread ? 'block' : 'none';\n            const pdaDot = document.getElementById('kpkChatUnreadDot');\n            if (pdaDot) pdaDot.style.display = hasUnread ? 'block' : 'none';")
    replace("        const scrollToBottom = () => {\n            if (typeof adjustChatMessagesHeight", "        const scrollToBottom = () => {\n            if (!document.getElementById('chatScreen').classList.contains('active')) return;\n            if (typeof adjustChatMessagesHeight")

    # Main-menu height no longer depends on an input row belonging to another screen.
    start = source.index('    // ===== ТОЧНАЯ ВЫСОТА ФОНОВОЙ ПАНЕЛИ ГЛАВНОГО МЕНЮ =====')
    end = source.index('    // ===== ИНИЦИАЛИЗАЦИЯ =====', start)
    source = source[:start] + '''    // Fit only the visible chat to the viewport, including the on-screen keyboard.
    function adjustChatMessagesHeight() {
        const screen = document.getElementById('chatScreen');
        if (!screen || !screen.classList.contains('active') || screen.offsetParent === null) return;
        const viewport = window.visualViewport;
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const top = Math.max(0, screen.getBoundingClientRect().top);
        const padding = parseFloat(getComputedStyle(document.body).paddingBottom) || 8;
        const height = Math.max(160, Math.floor(bottom - top - padding)) + 'px';
        if (screen.style.getPropertyValue('--chat-viewport-height') !== height) {
            const messages = document.getElementById('chatMessages');
            const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
            screen.style.setProperty('--chat-viewport-height', height);
            if (nearBottom) messages.scrollTop = messages.scrollHeight;
        }
    }
    window.addEventListener('resize', adjustChatMessagesHeight);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', adjustChatMessagesHeight);
        window.visualViewport.addEventListener('scroll', adjustChatMessagesHeight);
    }

''' + source[end:]
    # Obsolete slots no longer reserve space or have decorative frames.
    source = re.sub(r'^[^{}\n]*(?:#mainMenuChatSlot|#raidChatSlot)[^{}\n]*\{[^}]*\}\n?', '', source, flags=re.M)
    replace('/* Main screen: game sections and embedded chat. */', '/* Main screen: game sections; chat is available from the PDA. */')
    replace('</head>', CSS + '</head>')
    assert 'mainMenuChatSlot' not in source and 'raidChatSlot' not in source
    assert source.count('id="embeddedChatWidget"') == 1
    assert source.count('id="chatScreen"') == 1
    assert source.count('id="kpkChatBtn"') == 1
    return source


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
    data = path.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if blob != EXPECTED_BLOB:
        raise SystemExit(f'Refusing to patch an unreviewed client: {blob}')
    updated = apply(data.decode('utf-8'))
    path.write_text(updated, encoding='utf-8')
    print('Moved existing chat to PDA; removed both embedded slots.')

if __name__ == '__main__':
    main()
