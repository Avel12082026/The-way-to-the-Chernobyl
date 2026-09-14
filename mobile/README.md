# Android migration — test version

The Android app bundles the existing game, combat/anomaly assets, armor, icons and audio. A restricted `WebViewClient` serves them directly from Android assets under an HTTPS origin. Only API requests and player avatars may reach the game server; static asset requests cannot fall back to GitHub. The Telegram client remains supported.

## Build

Requires Java 17, Gradle 8.11.1, Android SDK platform 35 and build-tools 35.0.0.

```sh
python3 tools/build_mobile.py --download
gradle -p android assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
This is a test APK, signed with the build machine's debug key. A stable private release signing key is required before distributing future production updates.

The build downloads missing static icons/backgrounds from the existing game server into `.mobile-assets`, then copies everything into the APK. No database, server source, bot secret or credentials are bundled. A missing required file stops the build. Rebuild the APK to distribute new static content. User-uploaded avatars remain server-backed.

## Server update

`mobile/server/mobile-auth.cjs` adds register/login/logout, account binding, and token-shop routes to the existing SQLite-backed server. Credentials are salted and hashed with scrypt; the database stores only hashes of random expiring session tokens. Passwords are never stored by the client. Sessions live in sessionStorage until logout, expiry or the WebView session ends. Existing routes resolve the authenticated account's player ID; request-body player IDs never establish identity.

`tools/install_mobile_server.py` applies an exact-source-hash guarded patch to the reviewed `server-current.js` supplied on 2026-09-11. It syntax-checks the result and preserves an original-server backup. It intentionally refuses to patch a newer/unknown server. Back up the live SQLite database using its backup API before restarting the patched server: migration adds tables on startup and does not replace player data.

```sh
python3 tools/install_mobile_server.py /actual/path/to/server.js
```

The running server is not updated by building the APK. Until this server patch is installed, APK login/registration cannot succeed. If the version guard refuses the file, obtain the current server source and review a new patch instead of bypassing the guard.

## Existing players

After the server and Telegram client changes are deployed, open КПК → «Вход в Android» in a freshly opened Telegram game and choose a login/password. This binds the same player row to the Android account, retaining inventory, currency and progress. Binding requires a valid Telegram signature no older than ten minutes. New players can register directly in the APK. Registration does not import an existing profile by nickname or ID.

## Token shop

Uses the existing `breedCredits` balance (Жетоны сталкера). Prices for the first test are separate, explicit server values: knowledge book 20, nickname-change token 20, ВИЗИРЬ 100, premium armor 81–84 200 each. These draft prices need economy review before production. No Telegram Stars invoice is created in the APK. Existing token/byte exchange remains at the game's existing rate. A token-for-token SKU is excluded. Purchase requests carry an idempotency ID; debiting and granting the item occur in one transaction.

## Validation

```sh
node --test tests/mobile_server.test.cjs
python3 tests/mobile_bundle.test.py
python3 tests/mobile_browser.py
node tests/combat_assets.test.cjs
node tests/combat_scene_exclusion.test.cjs
```

The server tests use Node 24's temporary in-memory SQLite database. Browser verification uses Playwright with mocked API responses and never modifies live players. Device playtesting and validation against the actual deployed server remain required before production release.

Implementation references: [Android local content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [AGP compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes).

## Result of this build (2026-09-14)

- Debug APK built successfully; APK Signature Scheme v2 verified.
- 910 bundled files verified byte-for-byte against SHA-256 manifest.
- Server authentication/binding/shop tests: 4 passing; bundle tests: 2 passing.
- Existing combat catalog/assets and combat/anomaly exclusion checks pass.
- Bundled JavaScript syntax checks pass.
- Browser visual verification was not completed: the provided browser could not access the local preview. The Playwright test is included for an environment with a working local browser. No Android device/emulator test has been performed.
- Live server has not been modified. Source-hash guard must match before installation.

Local build used the SDK's aapt2 via `-Pandroid.aapt2FromMavenOverride=/path/to/sdk/build-tools/35.0.0/aapt2` when the Maven copy was unavailable; this is a build-environment option, not a change to the app's runtime network or TLS policy.
