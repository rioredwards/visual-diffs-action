import { appendFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function pngs(root, dir = root) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Snapshot symlinks are not supported: ${path}`);
    if (entry.isDirectory()) return pngs(root, path);
    return entry.name.endsWith('.png') ? [relative(root, path)] : [];
  });
}

// Copies the target branch's baselines over the PR's for the comparison pass.
// All or nothing: a PR baseline missing from the target means the target is unseeded.
export function useTargetBaseline(head, target) {
  const expected = pngs(head), available = new Set(pngs(target));
  if (!expected.length || !expected.every(file => available.has(file))) return false;
  for (const file of expected) copyFileSync(join(target, file), join(head, file));
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [head, target] = process.argv.slice(2);
  if (!head || !target) throw Error('Usage: node baseline.mjs <pr-screenshots-dir> <target-screenshots-dir>');
  const ready = useTargetBaseline(head, target);
  appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
  if (!ready) {
    const message = 'Target branch lacks some of this PR\'s screenshots (unseeded, or new in this PR); visual comparison was skipped. Seed an unseeded target with "Run workflow".';
    console.log(`::warning::${message}`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  }
}
