import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useTargetBaseline, restoreHead, prepareNewScreenshots, copyNewScreenshots } from './baseline.mjs';

const fixture = (run) => {
  const root = mkdtempSync(join(tmpdir(), 'visual-baseline-'));
  const head = join(root, 'head'), target = join(root, 'target'), backup = join(root, 'backup');
  mkdirSync(join(head, 'chromium'), { recursive: true });
  mkdirSync(join(target, 'chromium'), { recursive: true });
  try { run({ root, head, target, backup }); } finally { rmSync(root, { recursive: true, force: true }); }
};

test('compares against the target branch, not the PR\'s previous baselines', () => fixture(({ head, target, backup }) => {
  writeFileSync(join(head, 'chromium', 'page.png'), 'previous PR screenshot');
  writeFileSync(join(target, 'chromium', 'page.png'), 'target screenshot');
  writeFileSync(join(target, 'removed.png'), 'removed scenario');
  assert.deepEqual(useTargetBaseline(head, target, backup), { ready: true, added: [] });
  assert.equal(readFileSync(join(head, 'chromium', 'page.png'), 'utf8'), 'target screenshot');
  assert.equal(existsSync(join(head, 'removed.png')), false);
}));

test('PR-only screenshots are new: left untouched, reported, others still compared', () => fixture(({ head, target, backup }) => {
  writeFileSync(join(head, 'old.png'), 'head');
  writeFileSync(join(head, 'new.png'), 'head new');
  writeFileSync(join(target, 'old.png'), 'target');
  assert.deepEqual(useTargetBaseline(head, target, backup), { ready: true, added: ['new.png'] });
  assert.equal(readFileSync(join(head, 'old.png'), 'utf8'), 'target');
  assert.equal(readFileSync(join(head, 'new.png'), 'utf8'), 'head new');
}));

test('restoreHead puts the PR baselines back after the target copy', () => fixture(({ head, target, backup }) => {
  writeFileSync(join(head, 'chromium', 'page.png'), 'PR change');
  writeFileSync(join(head, 'new.png'), 'PR new');
  writeFileSync(join(target, 'chromium', 'page.png'), 'target');
  useTargetBaseline(head, target, backup);
  assert.equal(readFileSync(join(head, 'chromium', 'page.png'), 'utf8'), 'target');
  restoreHead(head, backup);
  assert.equal(readFileSync(join(head, 'chromium', 'page.png'), 'utf8'), 'PR change');
  assert.equal(readFileSync(join(head, 'new.png'), 'utf8'), 'PR new');
}));

test('missing or empty target is unseeded and leaves the PR baselines untouched', () => fixture(({ root, head, target, backup }) => {
  writeFileSync(join(head, 'one.png'), 'head');
  assert.deepEqual(useTargetBaseline(head, join(root, 'missing'), backup), { ready: false, added: [] });
  assert.deepEqual(useTargetBaseline(head, target, backup), { ready: false, added: [] });
  assert.equal(readFileSync(join(head, 'one.png'), 'utf8'), 'head');
}));

test('refuses snapshot symlinks', () => fixture(({ head, target, backup }) => {
  writeFileSync(join(target, 'page.png'), 'target');
  symlinkSync(join(target, 'page.png'), join(head, 'page.png'));
  assert.throws(() => useTargetBaseline(head, target, backup), /symlink/);
}));

test('publishes only fresh new screenshots across reruns, preserving skipped baselines without evidence', () => fixture(({ root, head, target, backup }) => {
  const out = join(root, 'evidence');
  writeFileSync(join(head, 'chromium', 'existing.png'), 'changed existing screen');
  writeFileSync(join(target, 'chromium', 'existing.png'), 'target screen');
  writeFileSync(join(head, 'chromium', 'picker.png'), 'previous new screen');
  writeFileSync(join(head, 'chromium', 'skipped.png'), 'skipped or removed test');
  prepareNewScreenshots(head, target, backup);
  assert.equal(existsSync(join(head, 'chromium', 'picker.png')), false);
  writeFileSync(join(head, 'chromium', 'picker.png'), 'captured new screen');
  const expected = ['chromium/picker.png'];
  assert.deepEqual(copyNewScreenshots(head, target, out, backup), expected);
  assert.equal(readFileSync(join(out, 'chromium', 'picker.png'), 'utf8'), 'captured new screen');
  assert.equal(existsSync(join(out, 'chromium', 'existing.png')), false);
  assert.equal(existsSync(join(out, 'chromium', 'skipped.png')), false);
  assert.equal(readFileSync(join(head, 'chromium', 'skipped.png'), 'utf8'), 'skipped or removed test');
  prepareNewScreenshots(head, target, backup);
  writeFileSync(join(head, 'chromium', 'picker.png'), 'captured again');
  assert.deepEqual(copyNewScreenshots(head, target, out, backup), expected);
  assert.equal(readFileSync(join(out, 'chromium', 'picker.png'), 'utf8'), 'captured again');
  writeFileSync(join(target, 'chromium', 'picker.png'), 'now on target');
  prepareNewScreenshots(head, target, backup);
  assert.deepEqual(copyNewScreenshots(head, target, join(root, 'next-run'), backup), []);
}));

test('publishes the first screens when the target has no baselines', () => fixture(({ root, head, target, backup }) => {
  writeFileSync(join(head, 'chromium', 'first.png'), 'first screen');
  const out = join(root, 'evidence');
  assert.deepEqual(copyNewScreenshots(head, target, out, backup), ['chromium/first.png']);
  assert.equal(readFileSync(join(out, 'chromium', 'first.png'), 'utf8'), 'first screen');
}));
