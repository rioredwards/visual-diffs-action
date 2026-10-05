import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useTargetBaseline, restoreHead } from './baseline.mjs';

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
