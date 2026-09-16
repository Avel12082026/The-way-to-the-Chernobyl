"""Install additive mobile authentication on the reviewed server version only."""
import hashlib,json,os,shutil,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def patched(raw):
    spec=json.loads((ROOT/'mobile/server/patch.json').read_text())
    if hashlib.sha256(raw).hexdigest()!=spec['source_sha256']:
        raise ValueError('Server differs from reviewed version. No changes made. Supply current server.js for review.')
    text=raw.decode()
    for edit in spec['replacements']:
        if text.count(edit['old'])!=1:raise ValueError('Patch anchor is not unique')
        text=text.replace(edit['old'],edit['new'],1)
    return text.encode()
def main():
    if len(sys.argv)!=2:raise SystemExit('Usage: python3 tools/install_mobile_server.py /path/to/server.js')
    server=Path(sys.argv[1]).resolve();new=patched(server.read_bytes())
    module=ROOT/'mobile/server/mobile-auth.cjs';dest=server.parent/'mobile-auth.cjs'
    if dest.exists() and dest.read_bytes()!=module.read_bytes():raise SystemExit('Existing mobile-auth.cjs differs. No changes made.')
    fd,name=tempfile.mkstemp(suffix='.js',dir=server.parent);temp=Path(name)
    try:
        with os.fdopen(fd,'wb') as f:f.write(new)
        subprocess.run(['node','--check',str(temp)],check=True)
        subprocess.run(['node','--check',str(module)],check=True)
        backup=server.with_name(server.name+'.before-mobile-'+str(time.time_ns()))
        shutil.copy2(server,backup);shutil.copystat(server,temp)
        shutil.copy2(module,dest);os.replace(temp,server)
        print('Installed. Restart server after backing up game.db. Original server:',backup)
    finally:
        if temp.exists():temp.unlink()
if __name__=='__main__':main()
