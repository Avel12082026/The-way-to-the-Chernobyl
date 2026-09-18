"""Patch the Telegram client only. Fail closed and remain safe to run twice."""
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
MARK = 'TRADE_HOLD_WAREHOUSE_FIX_V1'
LABELS = ('техник дизель', 'эколог леонов', 'выйти из склада')

CSS = '''
/* TRADE_HOLD_WAREHOUSE_FIX_V1 */
/* A trade cell owns the gesture, not the underlying image URL. */
#tradeMenu [data-trade-source],
#tradeMenu [data-trade-source] *,
#itemInfoModal {
  -webkit-touch-callout:none;
}
#tradeMenu [data-trade-source],
#tradeMenu [data-trade-source] *,
#itemInfoModal img {
  -webkit-user-select:none;
  user-select:none;
  -webkit-user-drag:none;
}
/* Override the generic clickable-item rule only here; inventory/PDA taps stay intact. */
#tradeMenu [data-trade-source] img,
#itemInfoModal img {
  pointer-events:none!important;
}
'''

JS = '''
/* TRADE_HOLD_WAREHOUSE_FIX_V1 */
(() => {
  'use strict';
  if (window.TradeItemContextGuard) return;
  // The information modal is a sibling of tradeMenu, not one of its children.
  // Capture also covers a contextmenu retargeted after the hold opens that modal.
  const scope = '#tradeMenu [data-trade-source], #itemInfoModal';
  function preventItemBrowserAction(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target?.closest(scope)) return;
    if (target.closest('input,textarea,[contenteditable="true"]')) return;
    event.preventDefault();
  }
  for (const type of ['contextmenu', 'dragstart']) {
    document.addEventListener(type, preventItemBrowserAction, {capture:true, passive:false});
  }
  // Do not cancel touchstart/pointerdown: taps, custom dragging and scrolling need them.
  window.TradeItemContextGuard = Object.freeze({version:'1.0.0'});
})();
'''

class Elements(HTMLParser):
    """Keep exact source offsets; never reserialize the rest of this large client."""
    VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0]
        for match in re.finditer('\n', source): self.lines.append(match.end())
        self.nodes, self.stack = [], []
        self.feed(source)
    def source_offset(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col
    def handle_starttag(self, tag, attrs):
        node = dict(tag=tag, attrs=dict(attrs), start=self.source_offset(), end=None,
                    parent=self.stack[-1] if self.stack else None, children=[])
        if self.stack: self.stack[-1]['children'].append(node)
        self.nodes.append(node)
        if tag not in self.VOID: self.stack.append(node)
        else: node['end'] = self.source_offset() + len(self.get_starttag_text())
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.stack.pop()['end'] = self.source_offset() + len(self.get_starttag_text())
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag:
                end = self.source.index('>', self.source_offset()) + 1
                self.stack[i]['end'] = end
                del self.stack[i:]
                break

def label(source, node):
    return ' '.join(unescape(re.sub(r'<[^>]*>', '', source[node['start']:node['end']])).split()).casefold()

def remove_warehouse_buttons(source):
    doc = Elements(source)
    warehouses = [n for n in doc.nodes if n['attrs'].get('id') == 'warehouseScreen']
    if len(warehouses) != 1 or warehouses[0]['end'] is None:
        raise SystemExit('Expected exactly one complete warehouseScreen')
    warehouse = warehouses[0]
    buttons = [n for n in doc.nodes if n['tag'] == 'button' and n['end'] is not None
               and warehouse['start'] < n['start'] < n['end'] < warehouse['end']]
    targets = [n for n in buttons if any(text in label(source, n) for text in LABELS)]
    counts = {text: sum(text in label(source, n) for n in targets) for text in LABELS}
    if not targets and ('<!-- ' + MARK + ' -->') in source:
        return source
    if any(value != 1 for value in counts.values()):
        print(source[warehouse['start']:warehouse['end']])
        raise SystemExit('Unexpected warehouse controls: ' + repr(counts))
    if not any(label(source, n) in ('назад', '← назад') for n in buttons):
        raise SystemExit('Refusing to remove navigation without keeping the top Back button')
    removals = list(targets)
    # Remove an empty navigation row too, rather than leaving its margins behind.
    for node in list(targets):
        parent = node['parent']
        if parent is None or parent is warehouse or parent['tag'] != 'div' or parent['end'] is None:
            continue
        children = parent['children']
        if children and all(any(c is t for t in targets) for c in children):
            remainder = source[parent['start']:parent['end']]
            for child in children:
                remainder = remainder.replace(source[child['start']:child['end']], '', 1)
            if not re.sub(r'<[^>]*>|\s+', '', remainder):
                removals = [n for n in removals if not any(n is c for c in children)]
                if not any(n is parent for n in removals): removals.append(parent)
    for node in sorted(removals, key=lambda n: n['start'], reverse=True):
        source = source[:node['start']] + source[node['end']:]
    source = source[:warehouse['start']] + '<!-- ' + MARK + ' -->\n' + source[warehouse['start']:]
    print('Removed warehouse buttons:', counts, '; retained top Back and transfer controls')
    return source

def main():
    path = ROOT / 'index.html'
    before = path.read_text(encoding='utf-8')
    after = remove_warehouse_buttons(before)
    updates = {}
    for suffix, addition in [('js', JS), ('css', CSS)]:
        asset = ROOT / 'ui' / ('trade-menu.' + suffix)
        content = asset.read_text(encoding='utf-8')
        if MARK not in content: content = content.rstrip() + '\n\n' + addition.lstrip()
        elif addition.strip() not in content: raise SystemExit('Conflicting existing guard: ' + str(asset))
        updates[asset] = content
    # Validate the warehouse and asset markers before touching any client file.
    for asset, content in updates.items(): asset.write_text(content, encoding='utf-8')
    path.write_text(after, encoding='utf-8')
    runpy.run_path(str(ROOT / 'tools/install_trade_menu.py'), run_name='__main__')
    print('Trade source/modal native-menu guard installed; no server or player-data changes')

if __name__ == '__main__': main()
