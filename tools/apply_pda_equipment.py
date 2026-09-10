"""Add read-only equipped weapon/detector icons to the reviewed PDA profile layout."""
from pathlib import Path
import hashlib

p = Path('index.html')
data = p.read_bytes()
expected = 'cbd7bb349845cf8988bfa403540f4738d4f79fde'
blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
if blob != expected:
    raise SystemExit(f'Client changed: expected {expected}, got {blob}; review before applying')
s = data.decode('utf-8')

def replace_once(old, new):
    global s
    if s.count(old) != 1:
        raise ValueError(f'Expected one patch anchor: {old[:100]!r}')
    s = s.replace(old, new, 1)

css = '''/* Read-only equipment of the viewed player; always two slots in one row. */
#kpkContent .pda-profile-equipment {
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
  align-items:start; gap:8px; width:100%; min-width:0;
}
#kpkContent .pda-profile-equipment-slot {
  margin:0; min-width:0; width:100%; text-align:center;
}
#kpkContent .pda-profile-equipment-image {
  position:relative; width:100%; aspect-ratio:1; box-sizing:border-box;
  display:flex; align-items:center; justify-content:center;
  border:1px solid #665b3b; border-radius:4px; background:#10140ecc;
}
#kpkContent .pda-profile-equipment-image img {
  position:absolute; inset:4px; display:block;
  width:calc(100% - 8px); height:calc(100% - 8px); max-width:none;
  object-fit:contain!important; object-position:center!important;
  border:0!important; border-radius:0!important; background:transparent!important;
  opacity:1!important; filter:none!important; box-shadow:none!important;
}
#kpkContent .pda-profile-equipment-image img[hidden],
#kpkContent .pda-profile-equipment-fallback[hidden] { display:none!important; }
#kpkContent .pda-profile-equipment-fallback {
  padding:4px; color:#aaa; font-size:10px; line-height:1.2;
}
#kpkContent .pda-profile-equipment-slot figcaption {
  margin-top:5px; color:#cdbd8f; font-size:10px; line-height:1.35;
  overflow-wrap:anywhere; white-space:normal;
}
#kpkContent .pda-profile-equipment-type { display:block; margin-bottom:2px; color:#99947f; }
#kpkContent .pda-profile-equipment-name { display:block; }
'''
replace_once('#kpkContent .pda-profile-armor {', css + '#kpkContent .pda-profile-armor {')
helper = '''    // These slots are informational: never read the local player's equipment here.
    function getProfileEquipmentVisual(data, slotType) {
        if (slotType !== 'weapon' && slotType !== 'detector') return null;
        const title = slotType === 'weapon' ? 'Оружие' : 'Детектор';
        const defaultName = slotType === 'weapon' ? DEFAULT_WEAPON.name : DEFAULT_DETECTOR.name;
        const item = data && data[slotType];
        const rawName = typeof item === 'string' ? item : (item && item.name);
        const name = typeof rawName === 'string' ? stripInvisibleSuffix(rawName).trim() : '';
        const baseName = parseGearName(name).baseName;
        const isEmpty = !baseName || baseName === defaultName;
        const hasIcon = Object.prototype.hasOwnProperty.call(ITEM_ICONS, baseName)
            && typeof ITEM_ICONS[baseName] === 'string';
        const file = isEmpty ? EMPTY_SLOT_ICONS[slotType] : (hasIcon ? ITEM_ICONS[baseName] : null);
        return {
            slotType, title, isEmpty,
            label: name || 'Не экипировано',
            src: file ? getIconUrl(file) : '',
            missingIcon: !file
        };
    }

    function handleProfileEquipmentImageError(img) {
        // Keep the item name visible even if its image is missing; never retry in a loop.
        img.onerror = null;
        img.hidden = true;
        const slot = img.closest('.pda-profile-equipment-slot');
        const fallback = slot && slot.querySelector('.pda-profile-equipment-fallback');
        if (fallback) fallback.hidden = false;
    }

    function renderProfileEquipment(data) {
        const attr = value => escapeHtml(value).replace(/"/g, '&quot;');
        const slots = ['weapon', 'detector'].map(slotType => {
            const item = getProfileEquipmentVisual(data, slotType);
            return `<figure class="pda-profile-equipment-slot" data-slot-type="${slotType}" title="${attr(item.title + ': ' + item.label)}">
                <div class="pda-profile-equipment-image">
                    ${item.src ? `<img src="${attr(item.src)}" alt="${attr(item.title + ': ' + item.label)}"
                        decoding="async" onerror="handleProfileEquipmentImageError(this)">` : ''}
                    <span class="pda-profile-equipment-fallback"${item.missingIcon ? '' : ' hidden'}>Нет иконки</span>
                </div>
                <figcaption><span class="pda-profile-equipment-type">${item.title}</span><span class="pda-profile-equipment-name">${escapeHtml(item.label)}</span></figcaption>
            </figure>`;
        }).join('');
        return `<div class="pda-profile-equipment" role="group" aria-label="Экипированное оружие и детектор">${slots}</div>`;
    }

'''
replace_once('    function renderProfileAppearance(data, avatarSrc, canChangeAvatar) {', helper + '    function renderProfileAppearance(data, avatarSrc, canChangeAvatar) {')
anchor = '''                ${canChangeAvatar ? `<button type="button" onclick="pickAndUploadAvatar()">📷 Сменить аватарку</button>` : ''}
'''
replace_once(anchor, anchor + '                ${renderProfileEquipment(data)}\n')
p.write_bytes(s.encode('utf-8'))
print('Added equipped weapon/detector slots below the avatar button in own and other PDA profiles.')
print('index SHA-256:', hashlib.sha256(p.read_bytes()).hexdigest())
