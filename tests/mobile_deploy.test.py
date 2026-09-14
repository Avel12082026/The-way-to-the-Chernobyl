import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tools/mobile_deploy_template.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
class DeployTests(unittest.TestCase):
 def test_rejects_unreviewed_source_before_process_or_database_access(self):
  with tempfile.TemporaryDirectory() as folder:
   server=Path(folder)/'server.js';server.write_text('unreviewed live server')
   with patch.object(deploy,'SERVER',server),patch.object(deploy,'SPEC',{'source_sha256':'0'*64,'target_sha256':'1'*64}),patch.object(deploy,'MODULE','module'),patch.object(deploy.os,'geteuid',return_value=0),patch.object(deploy,'run') as run,patch.object(deploy.sqlite3,'connect') as connect:
    with self.assertRaisesRegex(RuntimeError,'изменился после проверки'):deploy.deploy()
    run.assert_not_called();connect.assert_not_called();self.assertEqual(server.read_text(),'unreviewed live server')
 def test_verified_existing_installation_is_no_op(self):
  with tempfile.TemporaryDirectory() as folder:
   server=Path(folder)/'server.js';server.write_text('already installed');(Path(folder)/'mobile-auth.cjs').write_text('module')
   config={'source_sha256':'0'*64,'target_sha256':hashlib.sha256(server.read_bytes()).hexdigest()}
   with patch.object(deploy,'SERVER',server),patch.object(deploy,'SPEC',config),patch.object(deploy,'MODULE','module'),patch.object(deploy.os,'geteuid',return_value=0),patch.object(deploy,'status',return_value=True),patch.object(deploy,'run') as run,patch.object(deploy.sqlite3,'connect') as connect:
    deploy.deploy();run.assert_not_called();connect.assert_not_called()
 def test_partial_installation_does_not_overwrite_or_restart(self):
  with tempfile.TemporaryDirectory() as folder:
   server=Path(folder)/'server.js';server.write_text('already installed')
   config={'source_sha256':'0'*64,'target_sha256':hashlib.sha256(server.read_bytes()).hexdigest()}
   with patch.object(deploy,'SERVER',server),patch.object(deploy,'SPEC',config),patch.object(deploy,'MODULE','module'),patch.object(deploy.os,'geteuid',return_value=0),patch.object(deploy,'run') as run:
    with self.assertRaisesRegex(RuntimeError,'уже обновлён'):deploy.deploy()
    run.assert_not_called()

class TransactionTests(unittest.TestCase):
 def exercise(self,healthy):
  import sqlite3
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);server=root/'server.js';server.write_bytes(b'original');database=root/'game.db'
   db=sqlite3.connect(database);db.execute('PRAGMA journal_mode=WAL');db.execute('CREATE TABLE players(id TEXT,data TEXT)');db.execute('INSERT INTO players VALUES(?,?)',('veteran','saved progress'));db.commit()
   config={'source_sha256':hashlib.sha256(b'original').hexdigest(),'target_sha256':hashlib.sha256(b'updated').hexdigest(),'replacements':[{'old':'original','new':'updated'}]}
   with patch.object(deploy,'SERVER',server),patch.object(deploy,'SPEC',config),patch.object(deploy,'MODULE','module code'),patch.object(deploy.os,'geteuid',return_value=0),patch.object(deploy,'find_process',return_value=(7,database,root)),patch.object(deploy,'run') as run,patch.object(deploy,'status',return_value=healthy),patch.object(deploy.time,'sleep'):
    if healthy:deploy.deploy()
    else:
     with self.assertRaisesRegex(RuntimeError,'Старый код восстановлен'):deploy.deploy()
    self.assertEqual(server.read_bytes(),b'updated' if healthy else b'original')
    self.assertEqual((root/'mobile-auth.cjs').exists(),healthy)
    backups=list(root.glob('BACKUP_BEFORE_MOBILE_*'));self.assertEqual(len(backups),1)
    with sqlite3.connect(backups[0]/'game.db') as snapshot:self.assertEqual(snapshot.execute('SELECT data FROM players').fetchone()[0],'saved progress')
    self.assertEqual(db.execute('SELECT data FROM players').fetchone()[0],'saved progress')
    restarts=[x for x in run.call_args_list if x.args[0][:2]==['pm2','restart']];self.assertEqual(len(restarts),1 if healthy else 2)
   db.close()
 def test_success_backs_up_wal_database_before_restarting(self):self.exercise(True)
 def test_failed_health_restores_code_without_rolling_back_player_data(self):self.exercise(False)

if __name__=='__main__':unittest.main()
