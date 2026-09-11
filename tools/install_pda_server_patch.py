"""Apply the reviewed PDA patch to the exact supplied server version. No database writes."""
import hashlib,json,os,shutil,subprocess,sys,tempfile,time
from pathlib import Path
if len(sys.argv)!=3:raise SystemExit('Usage: python3 install_pda_server_patch.py SERVER_JS PATCH_JSON')
server=Path(sys.argv[1]).resolve();patch=json.loads(Path(sys.argv[2]).read_text());old=server.read_bytes();digest=hashlib.sha256(old).hexdigest()
if digest==patch['target_sha256']:print('Already installed');raise SystemExit(0)
if digest!=patch['source_sha256']:raise SystemExit('STOP: server.js changed since review. No files changed; send the current server.js.')
text=old.decode()
for edit in patch['replacements']:
 if text.count(edit['old'])!=1:raise SystemExit('STOP: patch anchor is not unique')
 text=text.replace(edit['old'],edit['new'],1)
new=text.encode();assert hashlib.sha256(new).hexdigest()==patch['target_sha256']
fd,name=tempfile.mkstemp(prefix='pda-patch-',suffix='.js',dir=server.parent);temp=Path(name)
try:
 with os.fdopen(fd,'wb') as f:f.write(new)
 subprocess.run(['node','--check',str(temp)],check=True)
 shutil.copystat(server,temp)
 backup=server.with_name(server.name+'.before-pda-'+str(time.time_ns()));shutil.copy2(server,backup)
 os.replace(temp,server)
 print('Installed. Backup:',backup)
finally:
 if temp.exists():temp.unlink()
