import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useTargetBaseline } from './baseline.mjs';

const fixture = (run) => {
  const root = mkdtempSync(join(tmpdir(), 'visual-baseline-'));
  const head = join(root, 'head'), target = join(root, 'target');
  mkdirSync(join(head, 'chromium'), { recursive: true });
  mkdirSync(join(target, 'chromium'), { recursive: true });
  try { run({ root, head, target }); } finally { rmSync(root, { recursive: true, force: true }); }
};

test('compares against the target branch, not the PR\'s previous baselines', () => fixture(({ head, target }) => {
  writeFileSync(join(head, 'chromium', 'page.png'), 'previous PR screenshot');
  writeFileSync(join(target, 'chromium', 'page.png'), 'target screenshot');
  writeFileSync(join(target, 'removed.png'), 'removed scenario');
  assert.equal(useTargetBaseline(head, target), true);
  assert.equal(readFileSync(join(head, 'chromium', 'page.png'), 'utf8'), 'target screenshot');
  assert.equal(existsSync(join(head, 'removed.png')), false);
}));

test('unseeded or incomplete target leaves the PR baselines untouched', () => fixture(({ root, head, target }) => {
  assert.equal(useTargetBaseline(head, target), false, 'no PR baselines yet');
  writeFileSync(join(head, 'one.png'), 'head');
  writeFileSync(join(head, 'two.png'), 'head');
  assert.equal(useTargetBaseline(head, join(root, 'missing')), false);
  writeFileSync(join(target, 'one.png'), 'target');
  assert.equal(useTargetBaseline(head, target), false);
  assert.equal(readFileSync(join(head, 'one.png'), 'utf8'), 'head');
}));

test('refuses snapshot symlinks', () => fixture(({ head, target }) => {
  writeFileSync(join(target, 'page.png'), 'target');
  symlinkSync(join(target, 'page.png'), join(head, 'page.png'));
  assert.throws(() => useTargetBaseline(head, target), /symlink/);
}));
