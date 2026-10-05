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
// Screenshots only the PR has are new: left alone, so they compare clean, and listed in `added`.
// Screenshots only the target has (deleted tests) are ignored. A target with no baselines at all is unseeded.
export function useTargetBaseline(head, target) {
  const available = new Set(pngs(target));
  if (!available.size) return { ready: false, added: [] };
  const added = [];
  for (const file of pngs(head)) {
    if (available.has(file)) copyFileSync(join(target, file), join(head, file));
    else added.push(file);
  }
  return { ready: true, added };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [head, target] = process.argv.slice(2);
  if (!head || !target) throw Error('Usage: node baseline.mjs <pr-screenshots-dir> <target-screenshots-dir>');
  const { ready, added } = useTargetBaseline(head, target);
  appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
  if (!ready) {
    const message = 'Target branch has no baseline screenshots (unseeded); visual comparison was skipped. Seed it with "Run workflow".';
    console.log(`::warning::${message}`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  } else if (added.length) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `New screenshots in this PR (not compared, no target baseline):\n${added.map(file => `- ${file}\n`).join('')}`);
  }
}
