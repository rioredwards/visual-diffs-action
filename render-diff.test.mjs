import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderDiffGif, encodeFrames } from './render-diff.mjs';
const png = (background, width = 20, height = 10) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
const pixel = (data, width, x, y) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
test('three labeled frames retain Before/After content, 1000ms timing and infinite loop', async () => {
  const before = await png('white'), after = await png('black'), diff = await png('red');
  const original = Buffer.from(before);
  const gif = await renderDiffGif({ before, after, diff, pad: 0 });
  const meta = await sharp(gif, { animated: true }).metadata();
  assert.equal(meta.pages, 3); assert.deepEqual(meta.delay, [1000, 1000, 1000]); assert.equal(meta.loop, 0);
  const { data, info } = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(pixel(data, info.width, 10, 40), [255, 255, 255]);
  assert.deepEqual(pixel(data, info.width, 10, meta.pageHeight + 40), [0, 0, 0]);
  assert.deepEqual(before, original);
});
test('color-only and gray-mask differences remain visible; identical originals produce nothing', async () => {
  const before = await png('#ff0000'), after = await png('#004c00'), diff = await png('#eeeeee');
  const gif = await renderDiffGif({ before, after, diff, pad: 0 });
  assert.ok(gif); const meta = await sharp(gif, { animated: true }).metadata(); assert.equal(meta.pages, 3);
  const { data, info } = await sharp(gif, { page: 2 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const color = pixel(data, info.width, 10, 40); assert.ok(Math.max(...color) - Math.min(...color) > 80);
  assert.equal(await renderDiffGif({ before, after: before, diff }), null);
});
test('dimension-only differences pad original canvas without losing the added rows', async () => {
  const gif = await renderDiffGif({ before: await png('white', 20, 10), after: await png('white', 25, 15), diff: await png('#eee', 25, 15), pad: 40 });
  const meta = await sharp(gif, { animated: true }).metadata(); assert.equal(meta.width, 25); assert.equal(meta.pageHeight, 51);
});
test('encoding rejects incomplete or mismatched frame sets', async () => {
  await assert.rejects(encodeFrames([await png('red')]), /three/);
  await assert.rejects(encodeFrames([await png('red'), await png('green', 21), await png('blue')]), /canvas/);
});
test('foreground moves keep Before red and After teal on light and dark backgrounds', async () => {
  for (const [background, foreground] of [['white', 'black'], ['black', 'white']]) {
    const square = await png(foreground, 2, 2);
    const image = x => sharp({ create: { width: 32, height: 20, channels: 4, background } }).composite([{ input: square, left: x, top: 9 }]).png().toBuffer();
    const gif = await renderDiffGif({ before: await image(6), after: await image(22), diff: await png('red', 32, 20), pad: 0 });
    const { data, info } = await sharp(gif, { page: 2 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const old = pixel(data, info.width, 6, 45), next = pixel(data, info.width, 22, 45);
    assert.ok(old[0] > old[1] + 80, `${background}: old foreground must be red`);
    assert.ok(next[1] > next[0] + 80, `${background}: new foreground must be teal`);
  }
});
