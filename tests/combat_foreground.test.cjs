const assert = require('node:assert/strict');
const path = require('node:path');
const {createCanvas, loadImage} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/@napi-rs/canvas');
const {drawForeground} = require('../images/combat/layout.js');
const root = path.resolve(__dirname, '..');
(async () => {
  const gun = await loadImage(path.join(root, 'images/combat/pistols/87.png'));
  const canvas = createCanvas(1536, 1024), ctx = canvas.getContext('2d');
  const cuffs = new Set();
  for (let armor = 1; armor <= 96; armor++) {
    const sleeve = await loadImage(path.join(root, `images/anomaly/hands/${armor}_right.webp`));
    ctx.clearRect(0, 0, 1536, 1024);
    assert.equal(drawForeground(ctx, gun, sleeve, 87), true);
    const left = ctx.getImageData(0, 0, 768, 1024).data;
    for (let i = 3; i < left.length; i += 4) assert.equal(left[i], 0, `Unexpected left hand, armor ${armor}`);
    const wrist = ctx.getImageData(1320, 945, 1, 1).data;
    assert.ok(wrist[3] > 245, `Transparent wrist seam, armor ${armor}`);
    cuffs.add(Buffer.from(ctx.getImageData(1390, 970, 40, 40).data).toString('base64'));
  }
  assert.equal(cuffs.size, 96, 'All 96 equipped sleeves must remain visually distinct');
  console.log('96 armor combinations: right hand only, opaque wrist overlap, distinct sleeves');
})().catch(error => {console.error(error); process.exitCode = 1;});
