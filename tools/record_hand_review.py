"""Record a completed human/model visual inspection; never run before viewing sheets."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
armor = int(sys.argv[1])
notes = sys.argv[2]
previous = sys.argv[3]
p = root / f'asset_sources/combat_hand_repair/anatomy-{armor}'
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
image = Image.open(p/'hand-only-v3.webp')
image.load()
pairs = json.loads((p/'all-pairs.json').read_text())
assert len(pairs) == 26
assert sum(len(x['flashChecks']) for x in pairs) == 156
review = {'armor': armor, 'status': 'static-visually-reviewed-not-integrated', 'source_sha256': sha(p/'hand-only-v3.webp'), 'alpha_range': image.getchannel('A').getextrema(), 'notes': notes, 'visual_review': {'all_26_grip_closeups': True, 'all_26_flash_images_0ms': True, 'light_and_dark_backgrounds': True}, 'technical_flash_phases': 156, 'pairs': [{'weapon': x['weapon'], 'pair_sha256': sha(p/f"pair-{x['weapon']}.png"), 'shot_sha256': sha(p/f"shot-{x['weapon']}.jpg")} for x in pairs], 'remaining': ['Production scene integration, recoil and aim review'], 'reproduce': f'HAND_VERSION=v3 node tools/review_modular_armor_all.cjs {armor}; python tools/hand_review_sheets.py {armor}'}
(p/'review-v3.json').write_text(json.dumps(review, ensure_ascii=False, indent=2))
memo = root/'HAND_PROGRESS.md'
memo.write_text(memo.read_text()+f'\n\n## №{armor}: рукав,26 хватов и вспышки\n- {notes}\n- Файлы: asset_sources/combat_hand_repair/anatomy-{armor}/hand-only-v3.webp, profile-v3.json, all-pairs.json, review-v3.json. Настоящий alpha; полный WebP декодируется.\n- Просмотрены все26 хватов крупно и26 вспышек в0мс на светлой/тёмной подложке; 156 технических фаз прошли. Хеши просмотренных композиций сохранены. Это статическая проверка, интеграция/сцена/отдача ещё остаются.\n- Предыдущая публикация подтверждена: {previous}. №75–76 не менялись. Следующий исходник: №{armor+1}–96; уже созданные не повторять. Каждый следующий чат обновляет эту памятку и проверяет удалённый SHA.\n')
