#!/usr/bin/env python3
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_rostok_location.py'
spec=importlib.util.spec_from_file_location('rostok_installer',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

assert mod.CACHE_KEY=='20260923-rostok-hud3'
assert mod.MAP_SHA=='017f3b41e187a44f33505bd007374ae3a2281c2cefc7bdda1c1ab0bc69ac22aa'
assert mod.BAR_SHA=='bf138d0c05afc2c4d65c504a135d35a1b3af3ecf74ebe8e740d7c3be5b17054c'
assert mod.MAP_SIZE==(865,1536)
assert mod.BAR_SIZE==(941,1672)

sample='<link href="ui/bunker-menu.css?v=old"><script src="ui/bunker-menu.js?v=old"></script>'
sample=mod.bump_cache(sample,'bunker-menu.css')
sample=mod.bump_cache(sample,'bunker-menu.js')
assert 'ui/bunker-menu.css?v=20260923-rostok-hud3' in sample
assert 'ui/bunker-menu.js?v=20260923-rostok-hud3' in sample

source=path.read_text(encoding='utf-8')
assert 'PIL' not in source and 'ImageMagick' not in source and 'convert ' not in source
assert "write_atomic(ui/'zone-map4.jpg',map_data)" in source
assert "write_atomic(ui/'rostok-bar.png',bar_data)" in source
assert 'API вернул изменённое изображение' in source
assert 'без пережатия' in source
assert "ap.add_argument('--server-only'" in source
assert "if not args.server_only:" in source
assert "// PLAYER_WORLD_POSITION_V1" in source

print('PASS: Rostok installer preserves exact approved map/bar bytes and bumps client cache atomically')
