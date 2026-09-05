import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const START = '<!-- visual-evidence:start -->';
const END = '<!-- visual-evidence:end -->';
export function replaceSection(body, section) {
  const block = `${START}\n${section}\n${END}`;
  const start = body.indexOf(START), end = body.indexOf(END);
  if (start === -1 && end === -1) return `${body}\n\n${block}`;
  if (start < 0 || end < start || body.indexOf(START, start + 1) !== -1 || body.indexOf(END, end + 1) !== -1)
    throw Error('Malformed or duplicate visual evidence markers; repair the PR description.');
  return body.slice(0, start) + block + body.slice(end + END.length);
}

function images(dir) {
  const files = readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw Error(`Refusing symlink: ${path}`);
    if (stat.isDirectory()) return images(path);
    if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return [];
    if (!/^[\w./-]+$/.test(path)) throw Error(`Image paths must use letters, digits, dots, slashes, underscores or hyphens: ${path}`);
    if (!stat.isFile() || stat.size === 0 || stat.size > 10 * 1024 * 1024) throw Error(`Invalid image or exceeds 10 MB: ${path}`);
    return [path];
  });
  return files;
}

export function upload({ dir, event, run = (args, input) => execFileSync('gh', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) }) {
  const pr = event.pull_request, repo = event.repository.full_name;
  if (!pr || pr.head.repo.full_name !== repo) throw Error('Requires a same-repository pull request.');
  const root = resolve(dir);
  if (lstatSync(root).isSymbolicLink()) throw Error('Refusing image directory symlink.');
  const files = images(root);
  if (!files.length) throw Error(`No images found in ${root}`);
  if (files.length > 50) throw Error('At most 50 images may be attached per run.');
  const current = JSON.parse(run(['pr', 'view', String(pr.number), '--repo', repo, '--json', 'body,headRefOid']));
  if (current.headRefOid !== pr.head.sha) throw Error('PR head changed; rerun against the latest commit.');
  const section = `### Visual evidence\n\nCommit: ${pr.head.sha}\n\n` + files.map(file => `![${relative(root, file)}](${file})`).join('\n\n');
  const body = replaceSection(current.body ?? '', section);
  run(['pr', 'edit', String(pr.number), '--repo', repo, '--body-file', '-', ...files.flatMap(file => ['--attach', file])], body);
  console.log(`Attached ${files.length} image(s) to the PR description.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.GH_TOKEN) throw Error('GH_TOKEN is required; use a user token supporting gh --attach.');
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') throw Error('Only pull_request events are supported.');
  upload({ dir: process.env.IMAGES_PATH, event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) });
}
