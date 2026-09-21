#!/usr/bin/env python3
import importlib.util, sys, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
installer_path=ROOT/'tools/install_rostok_location.py'
spec=importlib.util.spec_from_file_location('rostok_server_only',installer_path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    (root/'ui').mkdir()
    (root/'server.js').write_text("console.log('fixture');\n",encoding='utf-8')
    map_file=root/'map.jpg';bar_file=root/'bar.png'
    map_file.write_bytes(b'map-fixture')
    bar_file.write_bytes(b'bar-fixture')

    # The test targets path requirements and --check control flow, not binary hashes.
    mod.validate_asset=lambda path,sha,size,kind: path.read_bytes()
    def fake_fetch(base,relative):
        if relative=='ui/bunker-menu.js':
            return "// 4:'Россток'\n// id:'transition-to-4'\n// id:'camp-4'\n".encode('utf-8')
        if relative=='ui/bunker-menu.css':
            return b"#rostokCampScreen.rostok-camp-screen{}\n"
        if relative=='tools/install_zone_map_routing_server.py':
            return ("# // ZONE_MAP_ROUTING_V4\n# "+mod.MAP_SHA+"\n# "+mod.BAR_SHA+"\n").encode()
        raise AssertionError(relative)
    mod.fetch=fake_fetch

    old=sys.argv[:]
    try:
        sys.argv=[
            'install_rostok_location.py','--base','unused','--root',str(root),
            '--map',str(map_file),'--bar',str(bar_file),'--server-only','--check'
        ]
        mod.main()
    finally:
        sys.argv=old

    assert not (root/'index.html').exists()
    assert not (root/'ui'/'bunker-menu.js').exists()
    assert not (root/'ui'/'bunker-menu.css').exists()
    assert (root/'server.js').read_text()=="console.log('fixture');\n"

print('PASS: Rostok --server-only --check accepts a VPS with no index.html/client files and makes no changes')
