"""Remove only the five screenshot-matched decorative CSS banners from web index.html."""
from pathlib import Path
import hashlib
import re
import sys

TARGETS = ('warehouseScreen', 'technicianScreen', 'scientistsScreen', 'shopScreen', 'kpkScreen')
EXPECTED_SOURCE_BLOB = '2d61eace0d5df03c48a64c41ff96dce1a6e19eb4'

def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()

def patch(source: bytes) -> bytes:
    if git_blob_sha(source) != EXPECTED_SOURCE_BLOB:
        raise ValueError('Unexpected index.html revision; inspect the current file before applying.')
    text = source.decode('utf-8')
    # The warehouse caption belongs to the removed decoration, not to its real title.
    warehouse = re.compile(r'/\* warehouse atmosphere, made from CSS so it loads offline and never depends on a remote image \*/\n#warehouseScreen::before \{[^}]*\}\n#warehouseScreen::after \{[^}]*\}\n')
    text, count = warehouse.subn('', text)
    if count != 1:
        raise ValueError(f'Expected one warehouse decoration block, got {count}')
    old_group = '#technicianScreen::before,#scientistsScreen::before,#shopScreen::before,#marketScreen::before,#kpkScreen::before {'
    if text.count(old_group) != 1:
        raise ValueError('Expected one location banner selector group')
    text = text.replace(old_group, '#marketScreen::before {', 1)
    for screen in TARGETS[1:]:
        text, count = re.subn(r'#' + screen + r'::before \{background:[^\n]*\}\n', '', text)
        if count != 1:
            raise ValueError(f'Expected one decorative background for {screen}, got {count}')
    # Preserve all DOM markup, functional headings, item icons, scripts, and other styles.
    strip_styles = lambda s: re.sub(r'<style\b[^>]*>.*?</style>', '', s, flags=re.S | re.I)
    if strip_styles(text) != strip_styles(source.decode('utf-8')):
        raise ValueError('Unexpected non-CSS change')
    for screen in TARGETS:
        if re.search(r'#' + screen + r'::(?:before|after)\b', text):
            raise ValueError(f'Decorative pseudo-element remains on {screen}')
    for asset in ('warehouse', 'technician', 'scientists', 'kpk'):
        if f'/images/ui/{asset}.svg' in text:
            raise ValueError(f'Unused target asset still referenced: {asset}')
    if text.count('/images/ui/trader.svg') != 1:
        raise ValueError('Unrelated player market banner was altered')
    return text.encode('utf-8')

if __name__ == '__main__':
    path = Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
    before = path.read_bytes()
    after = patch(before)
    path.write_bytes(after)
    print(f'Patched {path}: {len(before)} -> {len(after)} bytes')
    print(f'BEFORE_BLOB={git_blob_sha(before)}')
    print(f'AFTER_BLOB={git_blob_sha(after)}')
