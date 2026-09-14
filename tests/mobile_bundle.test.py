import importlib.util,re,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_mobile',ROOT/'tools/build_mobile.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BundleTests(unittest.TestCase):
 def test_native_has_no_telegram_login_or_remote_static_paths(self):
  html=m.transform((ROOT/'index.html').read_text())
  self.assertNotIn('https://telegram.org/js/',html)
  self.assertNotIn('window.Telegram.WebApp.initDataUnsafe',html)
  self.assertNotIn('${SERVER_URL}/icons/',html)
  self.assertNotIn('${SERVER_URL}/images/',html)
  self.assertNotIn('/api/shop/create-invoice',html)
  self.assertIn('GameSession.ensure()',html)
  self.assertIn('GameSession.renderShop()',html)
  self.assertNotIn('mobile/account-link.js',html)
 def test_required_static_files(self):
  required=m.static_requirements((ROOT/'index.html').read_text())
  for file in ['icons/armor_icon_1.webp','icons/character_portrait.png','icons/empty_slot_inventory.png','images/main-menu-bg.jpg','images/ui/warehouse.svg']:
   self.assertIn(file,required)
  self.assertGreater(len(required),400)
if __name__=='__main__':unittest.main()
