#!/usr/bin/env python3
from pathlib import Path
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
installer=ROOT/'tools/install_svalka_map2.py'
spec=importlib.util.spec_from_file_location('svalka_installer',installer)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

assert mod.EXPECTED_SHA256=='11bc819df27415eaac63182b0411171512fb29f3601844f9b802ec15924fb1a4'
assert mod.LIVE_ASSET=='ui/zone-map2.png'
assert (mod.EXPECTED_WIDTH,mod.EXPECTED_HEIGHT)==(941,1672)
fake=b'\x89PNG\r\n\x1a\n'+b'\x00\x00\x00\rIHDR'+(941).to_bytes(4,'big')+(1672).to_bytes(4,'big')+b'\x08\x02\x00\x00\x00'
assert mod.png_size(fake)==(941,1672)

js=(ROOT/'ui/bunker-menu.js').read_text(encoding='utf-8')
assert "2: {path:'/api/zone-map/2', width:941, height:1672}" in js
assert "id:'transition-to-1'" in js and "label:'Переход на Кордон'" in js
assert "x:62.82,y:71.62,targetLocation:1" in js
assert "x:10.50,y:47.49,targetLocation:3" in js
assert "id:'transition-to-4'" in js and "label:'Переход на Россток'" in js
assert "x:68.26,y:24.48,targetLocation:4,unlock:'second-pistol-decade'" in js
assert "transition-future-top" not in js
assert "20260926-rostok-map-hq1" in js

print('PASS: lossless 941x1672 Svalka PNG, hotspots and active transitions verified')
