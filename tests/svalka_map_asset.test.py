#!/usr/bin/env python3
from pathlib import Path
import hashlib, importlib.util

ROOT=Path(__file__).resolve().parents[1]
asset=ROOT/'ui/zone-map2-v13.jpg'
installer=ROOT/'tools/install_svalka_map2.py'

spec=importlib.util.spec_from_file_location('svalka_installer',installer)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

raw=asset.read_bytes()
assert hashlib.sha256(raw).hexdigest()==mod.EXPECTED_SHA256
assert mod.jpeg_size(raw)==(864,1536)
assert len(raw)>250_000
assert raw[:2]==b'\xff\xd8'

js=(ROOT/'ui/bunker-menu.js').read_text(encoding='utf-8')
assert "2: {path:'/api/zone-map/2', width:864, height:1536}" in js
assert "id:'transition-to-1'" in js and "label:'Переход на Кордон'" in js
assert "x:62.82,y:71.62,targetLocation:1" in js
assert "x:10.50,y:47.49,targetLocation:3" in js
assert "id:'transition-future-top'" in js and "future:true" in js
assert '20260921-map13' in js

print('PASS: full-resolution 864x1536 Svalka artwork, hotspots and inactive top transition verified')
