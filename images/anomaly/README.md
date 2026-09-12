# Anomaly hands

96 independently layered costume hands, nine detector cutouts, and 75 artifact visual entries. Sources are the game's inventory artwork and reviewed costume sleeve assets. All item and hand layers use alpha; the clearing has no vehicle tracks. Anomaly effects are separate CSS layers over a replaceable background list in assets.js.

`index.html` derives the sleeve from the equipped armor mapping. Searching clears the previous reward hand; only a successful search response's actual `found` names reveal the left hand. Leaving, death, and a new encounter hide it. Duplicate search requests are suppressed, and late responses from an abandoned encounter are ignored.

Open `anomaly-preview.html` to fit each costume, detector and artifact. This preview simulates finds; it does not contact the game API. The client itself continues to use the existing server API without backend changes.

Validation: `node --test tests/*.test.js`; `CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node tests/anomaly_scene.browser.cjs` (Playwright required). Browser tests intercept API calls and cover misses/finds, exit/reset, late responses, duplicate searches, 320/390/768 px layouts, all 96 sleeve images, nine detectors and all artifact images. No write requests reach a live account.

Deploy index.html, anomaly-preview.html, images/anomaly/ and icons/serdce_zony.webp together to the existing static client host. No game server restart or database changes are required.

Animation: transparent canvas layers animate the anomaly and the fitted screen/needle of each detector at up to 30 fps. Scanning continues during an unresolved encounter and stops on a find or resolution. Artifact motion preserves the palm anchor; energy artifacts pulse more strongly. Hidden scenes and background tabs stop requesting frames; reduced-motion mode renders a static effect. No animation changes drop chances or invents a detector distance reading.
