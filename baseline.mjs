import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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
// The PR's own copies go to `backup` first, so restoreHead can put them back before the capture pass.
// Screenshots only the PR has are new: left alone, so they compare clean, and listed in `added`.
// Screenshots only the target has (deleted tests) are ignored. A target with no baselines at all is unseeded.
export function useTargetBaseline(head, target, backup) {
  const available = new Set(pngs(target));
  if (!available.size) return { ready: false, added: [] };
  const added = [];
  for (const file of pngs(head)) {
    if (!available.has(file)) { added.push(file); continue; }
    mkdirSync(dirname(join(backup, file)), { recursive: true });
    copyFileSync(join(head, file), join(backup, file));
    copyFileSync(join(target, file), join(head, file));
  }
  return { ready: true, added };
}

// Undoes the target copy, so tests skipped during the capture pass keep the PR's baselines.
export function restoreHead(head, backup) {
  for (const file of pngs(backup)) copyFileSync(join(backup, file), join(head, file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--restore') {
    const [, head, backup] = args;
    if (!head || !backup) throw Error('Usage: node baseline.mjs --restore <pr-screenshots-dir> <backup-dir>');
    restoreHead(head, backup);
    process.exit(0);
  }
  const [head, target, backup] = args;
  if (!head || !target || !backup) throw Error('Usage: node baseline.mjs <pr-screenshots-dir> <target-screenshots-dir> <backup-dir>');
  const { ready, added } = useTargetBaseline(head, target, backup);
  appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
  if (!ready) {
    const message = 'Target branch has no baseline screenshots (unseeded); visual comparison was skipped. Seed it with "Run workflow".';
    console.log(`::warning::${message}`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  } else if (added.length) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `New screenshots in this PR (no target baseline to compare against):\n${added.map(file => `- ${file}\n`).join('')}`);
  }
}
