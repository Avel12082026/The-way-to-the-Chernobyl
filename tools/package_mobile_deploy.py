"""Produce a standalone installer without including the source server or secrets."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from install_mobile_server import patched
if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Usage: package_mobile_deploy.py REVIEWED_SERVER_JS OUTPUT_PY')
    source=Path(sys.argv[1]).read_bytes();target=patched(source)
    spec=json.loads((ROOT/'mobile/server/patch.json').read_text());spec['target_sha256']=hashlib.sha256(target).hexdigest()
    module=(ROOT/'mobile/server/mobile-auth.cjs').read_text()
    template=(ROOT/'tools/mobile_deploy_template.py').read_text()
    output=template.replace('SPEC = None  # EMBED_SPEC','SPEC = '+repr(spec)).replace('MODULE = None  # EMBED_MODULE','MODULE = '+repr(module))
    Path(sys.argv[2]).write_text(output)
    print('Packaged installer SHA256:',hashlib.sha256(output.encode()).hexdigest())
