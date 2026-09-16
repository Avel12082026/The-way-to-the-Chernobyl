"""Regression checks for removed decorative section banners. Run from any directory."""
import importlib.util
import re
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
NAMES = ('technician', 'scientists', 'kpk', 'warehouse', 'trader')
SCREENS = ('technicianScreen', 'scientistsScreen', 'kpkScreen', 'warehouseScreen', 'shopScreen', 'marketScreen')
class SectionBanners(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / 'index.html').read_text(encoding='utf-8')
    def test_no_decorative_images_or_spacers(self):
        css = '\n'.join(re.findall(r'<style\b[^>]*>([\s\S]*?)</style>', self.html, re.I))
        for name in NAMES:
            self.assertNotIn('images/ui/' + name + '.svg', self.html)
        for screen in SCREENS:
            self.assertNotIn('#' + screen + '::before', css)
        self.assertNotIn('#warehouseScreen::after', css)
        self.assertNotIn('pz-location-panels', self.html)
    def test_screens_are_preserved(self):
        for screen in SCREENS:
            self.assertIn('id="' + screen + '"', self.html)
    def test_android_generated_client(self):
        path = ROOT / 'tools/build_mobile.py'
        if not path.exists():
            self.skipTest('Android builder is only on the Android branch')
        spec = importlib.util.spec_from_file_location('build_mobile', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        generated = module.transform(self.html)
        for name in NAMES:
            self.assertNotIn('images/ui/' + name + '.svg', generated)
        self.assertFalse(any(p.startswith('images/ui/') for p in module.static_requirements(self.html)))
if __name__ == '__main__':
    unittest.main()
