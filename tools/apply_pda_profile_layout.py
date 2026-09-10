"""Apply the PDA avatar/armor layout to the verified client, without changing game data."""
from pathlib import Path
import hashlib

EXPECTED_BLOB = '5caafacd7ddfd9cd235e98dc847535e980afaf95'
p = Path('index.html')
data = p.read_bytes()
if b'id="pda-profile-layout"' in data:
    raise SystemExit('PDA layout already installed; refusing to apply twice')
blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
if blob != EXPECTED_BLOB:
    raise SystemExit(f'Client changed: expected {EXPECTED_BLOB}, got {blob}; review before applying')
s = data.decode('utf-8')

def replace_once(old, new):
    global s
    if s.count(old) != 1:
        raise ValueError(f'Expected one patch anchor: {old[:100]!r}')
    s = s.replace(old, new, 1)

css = '''<style id="pda-profile-layout">
/* PDA only: avatar on the left, the viewed player's equipped armor on the right. */
#kpkContent .pda-profile-visuals {
  display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:12px; align-items:start; width:100%; margin:0 0 14px;
}
#kpkContent .pda-profile-avatar {
  min-width:0; width:100%; max-width:146px; justify-self:start;
  display:flex; flex-direction:column; align-items:flex-start; gap:10px;
}
#kpkContent .pda-profile-avatar-frame {
  width:100%; aspect-ratio:1; border:3px solid #8a7a4a;
  border-radius:50%; overflow:hidden; background:#141711;
}
#kpkContent .pda-profile-avatar-frame img {
  display:block; width:100%; height:100%; border:0!important;
  border-radius:50%!important; object-fit:cover!important; box-shadow:none!important;
}
#kpkContent .pda-profile-avatar button {
  width:100%; min-width:0; padding:7px 5px; margin:0;
  font-size:11px; line-height:1.3; white-space:normal; overflow-wrap:anywhere;
}
#kpkContent .pda-profile-armor {
  min-width:0; width:100%; max-width:220px; margin:0; justify-self:end;
  text-align:center; background:transparent;
}
#kpkContent .pda-profile-armor img {
  display:block; width:100%; height:clamp(190px,58vw,310px); max-width:100%;
  object-fit:contain!important; object-position:center!important;
  background:transparent!important; border:0!important; border-radius:0!important;
  opacity:1!important; filter:none!important; box-shadow:none!important;
}
#kpkContent .pda-profile-armor figcaption {
  margin-top:6px; color:#cdbd8f; font-size:12px; line-height:1.35; overflow-wrap:anywhere;
}
#kpkContent .pda-profile-armor-label { display:block; margin-bottom:3px; color:#99947f; font-size:10px; }
#kpkContent .pda-profile-armor-warning { display:block; margin-top:4px; color:#aaa; font-size:10px; }
#kpkContent .pda-profile-armor-warning[hidden] { display:none; }
</style>
'''
replace_once('</head>', css + '</head>')
helper = '''    // Always use the viewed profile, never the local player's armor.
    function getProfileArmorVisual(data) {
        const armor = data && data.armor;
        const rawName = typeof armor === 'string' ? armor : (armor && armor.name);
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        const parsed = parseGearName(name || DEFAULT_ARMOR.name);
        const hasImage = Object.prototype.hasOwnProperty.call(ARMOR_CHAR_IMAGES, parsed.baseName);
        const file = hasImage ? ARMOR_CHAR_IMAGES[parsed.baseName] : DEFAULT_CHARACTER_PORTRAIT;
        return {
            src: getIconUrl(file),
            fallbackSrc: getIconUrl(DEFAULT_CHARACTER_PORTRAIT),
            label: name ? stripInvisibleSuffix(name) : 'Броня не указана',
            unavailable: Boolean(name && parsed.baseName !== DEFAULT_ARMOR.name && !hasImage)
        };
    }

    function handleProfileArmorError(img) {
        // One fallback only; a failed default image must not cause an error loop.
        const figure = img.closest('.pda-profile-armor');
        const warning = figure && figure.querySelector('.pda-profile-armor-warning');
        if (warning) { warning.hidden = false; warning.textContent = 'Изображение брони недоступно'; }
        const fallback = img.dataset.fallbackSrc;
        if (fallback && img.getAttribute('src') !== fallback && !img.dataset.fallbackTried) {
            img.dataset.fallbackTried = '1';
            img.src = fallback;
        } else {
            img.onerror = null;
            img.style.display = 'none';
        }
    }

    function renderProfileAppearance(data, avatarSrc, canChangeAvatar) {
        const visual = getProfileArmorVisual(data);
        const attr = value => escapeHtml(value).replace(/"/g, '&quot;');
        return `<div class="pda-profile-visuals">
            <div class="pda-profile-avatar">
                ${avatarSrc ? `<div class="pda-profile-avatar-frame">
                    <img src="${attr(avatarSrc)}" alt="Аватар игрока" data-player-avatar onerror="this.style.display='none'">
                </div>` : ''}
                ${canChangeAvatar ? `<button type="button" onclick="pickAndUploadAvatar()">📷 Сменить аватарку</button>` : ''}
            </div>
            <figure class="pda-profile-armor">
                <img src="${attr(visual.src)}" data-fallback-src="${attr(visual.fallbackSrc)}"
                    alt="Персонаж: ${attr(visual.label)}" decoding="async" onerror="handleProfileArmorError(this)">
                <figcaption><span class="pda-profile-armor-label">Надетая броня</span>${escapeHtml(visual.label)}</figcaption>
                <span class="pda-profile-armor-warning"${visual.unavailable ? '' : ' hidden'}>Визуал этой брони пока недоступен</span>
            </figure>
        </div>`;
    }

'''
replace_once('    function renderPlayerStatsCard(data, titleText, playerId) {', helper + '    function renderPlayerStatsCard(data, titleText, playerId) {')
start = s.index('                ${avatarSrc ? `<div style="text-align:center; margin-bottom:10px;">', s.index('    function renderPlayerStatsCard'))
end = s.index('                ${(data.nickname || data.username)', start)
s = s[:start] + '                ${renderProfileAppearance(data, avatarSrc, isAdminProfile && isOwnProfile)}\n' + s[end:]
# Prevent an older profile response from replacing the player the viewer just selected.
replace_once("    let kpkTab = 'info';", "    let kpkTab = 'info';\n    let kpkProfileRequestId = 0;")
replace_once('    function openKpkTab(tab) {\n        kpkTab = tab;', '    function openKpkTab(tab) {\n        kpkProfileRequestId++;\n        kpkTab = tab;')
replace_once("        kpkTab = 'profile';\n        const content", "        kpkTab = 'profile';\n        const requestId = ++kpkProfileRequestId;\n        const content")
replace_once("            fetch(`${SERVER_URL}/api/player/${playerId}`).then(res => res.json()).catch(() => null),", "            fetch(`${SERVER_URL}/api/player/${encodeURIComponent(String(playerId))}`, { cache: 'no-store' })\n                .then(res => res.ok ? res.json() : null).catch(() => null),")
replace_once("            if (kpkTab !== 'profile') return; // пользователь уже ушёл на другую вкладку — не перезаписываем её", "            if (kpkTab !== 'profile' || requestId !== kpkProfileRequestId) return;")
p.write_bytes(s.encode('utf-8'))
print('PDA avatar/armor layout applied; no image assets or player data changed.')
print('index SHA-256:', hashlib.sha256(p.read_bytes()).hexdigest())
