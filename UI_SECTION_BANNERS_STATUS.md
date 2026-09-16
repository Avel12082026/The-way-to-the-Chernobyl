# Section banner cleanup

Removed the five decorative illustrations from technician, scientists, PDA, warehouse and trader screens. The trader illustration also appeared on the player market; it is removed there too.

The location-panel stylesheet and warehouse ::before / ::after rules were removed, including their frames, reserved heights, margins and decorative caption. Normal screen titles, buttons, item icons, equipment, drag-and-drop, character portraits and JavaScript are unchanged.

Validation: non-style HTML and all JavaScript are byte-identical to each branch's parent; regression tests pass; Chromium checks cover six screens at widths 320, 390 and 768 in the Telegram HTML and the generated Android game.html. Static requirements no longer include the five banner SVGs.

The Android source and generated web client are fixed. No new signed APK was produced by this cleanup job; an already installed APK needs rebuilding and updating. No server or player database changes are required.
