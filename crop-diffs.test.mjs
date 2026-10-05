import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const script = new URL('./crop-diffs.mjs', import.meta.url);
test('only changed images produce before/after/diff strips, including different heights', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'visual-comparison-')));
  const run = () => execFileSync(process.execPath, [script.pathname, '--pad', '0'], { cwd: dir });
  try {
    run();
    assert.deepEqual(readdirSync(join(dir, 'visual-diffs')), []);
    const results = join(dir, 'test-results', 'arbitrary-test-name');
    mkdirSync(results, { recursive: true });
    const png = (name, height, background) => sharp({ create: {width: 12, height, channels: 4, background} }).png().toFile(join(results, name));
    await png('screen-expected.png', 10, 'white');
    await png('screen-actual.png', 12, 'blue');
    await png('screen-diff.png', 12, 'red');
    run();
    const result = await sharp(join(dir, 'visual-diffs', 'arbitrary-test-name', 'screen.png')).metadata();
    assert.equal(result.width, 12);
    assert.equal(result.height, 12 * 3 + 32);
    // Playwright can produce an all-gray diff when no pixels exceed its threshold.
    await png('quiet-expected.png', 12, 'white');
    await png('quiet-actual.png', 12, 'white');
    await png('quiet-diff.png', 12, '#eeeeee');
    run();
    assert.deepEqual(readdirSync(join(dir, 'visual-diffs', 'arbitrary-test-name')), ['screen.png']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
