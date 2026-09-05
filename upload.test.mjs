import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, truncateSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replaceSection, upload } from './upload.mjs';

test('replaces only its section, preserving surrounding text exactly', () => {
  const first = replaceSection('User text\n', 'old');
  assert.equal(replaceSection(first + '\nFooter', 'new'), 'User text\n\n\n<!-- visual-evidence:start -->\nnew\n<!-- visual-evidence:end -->\nFooter');
  for (const body of ['<!-- visual-evidence:start -->', first + first]) {
    assert.throws(() => replaceSection(body, 'new'), /markers/);
  }
});

test('uploads through gh, rejects stale heads and missing images, surfaces CLI failure', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pr-images-')));
  const calls = [];
  const event = { repository: { full_name: 'owner/repo' }, pull_request: { number: 2, head: { sha: 'abc', repo: { full_name: 'owner/repo' } } } };
  const options = { dir, event, run: (args, input) => {
    calls.push({ args, input });
    return args[1] === 'view' ? JSON.stringify({ body: 'Original', headRefOid: 'abc' }) : '';
  } };
  try {
    assert.throws(() => upload({ ...options, dir: '' }), /images input is required/);
    assert.throws(() => upload(options), /No images/);
    upload({ ...options, allowEmpty: true });
    assert.equal(calls.length, 0);
    writeFileSync(join(dir, 'screen.png'), 'fixture');
    upload(options);
    const edit = calls.at(-1);
    assert.ok(edit.args.includes('--attach'));
    assert.match(edit.input, /^Original\n\n<!-- visual-evidence:start -->/);
    assert.match(edit.input, /screen\.png/);
    let edited = false;
    upload({ ...options, run: (args) => {
      if (args[1] === 'edit') edited = true;
      return JSON.stringify({ body: edit.input, headRefOid: 'baseline-bot-commit' });
    } });
    assert.equal(edited, false);
    assert.throws(() => upload({ ...options, run: () => JSON.stringify({ headRefOid: 'new' }) }), /head changed/);
    assert.throws(() => upload({ ...options, run: (args) => {
      if (args[1] === 'edit') throw Error('upload failed');
      return JSON.stringify({ body: 'Original', headRefOid: 'abc' });
    } }), /upload failed/);
    truncateSync(join(dir, 'screen.png'), 10 * 1024 * 1024 + 1);
    assert.throws(() => upload(options), /exceeds 10 MB/);
    writeFileSync(join(dir, 'screen.png'), 'fixture');
    for (let i = 0; i < 50; i++) writeFileSync(join(dir, `extra-${i}.png`), 'fixture');
    assert.throws(() => upload(options), /At most 50/);
    for (let i = 0; i < 50; i++) rmSync(join(dir, `extra-${i}.png`));
    symlinkSync(join(dir, 'screen.png'), join(dir, 'linked.png'));
    assert.throws(() => upload(options), /symlink/);
    mkdirSync(join(dir, 'real', 'images'), { recursive: true });
    writeFileSync(join(dir, 'real', 'images', 'screen.png'), 'fixture');
    symlinkSync(join(dir, 'real'), join(dir, 'alias'));
    assert.throws(() => upload({ ...options, dir: join(dir, 'alias', 'images') }), /symlink/);
    event.pull_request.head.repo.full_name = 'fork/repo';
    assert.throws(() => upload(options), /same-repository/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
