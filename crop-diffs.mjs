import { readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { renderDiffGif } from "./render-diff.mjs";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const PAD = Number(flag("pad", "40"));
if (!Number.isFinite(PAD) || PAD < 0) throw new Error(`crop-diffs: bad --pad ${flag("pad")}`);

const out = "visual-diffs";
let count = 0;
const seen = new Set();

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith("-diff.png") ? [p] : [];
  });

const diffs = existsSync("test-results") ? walk("test-results").sort() : [];

for (const diffPath of diffs) {
  const dir = diffPath.slice(0, -diffPath.split("/").pop().length - 1);
  const name = basename(diffPath, "-diff.png");
  const project = basename(dir);
  if (seen.has(`${project}/${name}`)) continue;
  seen.add(`${project}/${name}`);
  const gif = await renderDiffGif({
    before: join(dir, `${name}-expected.png`),
    after: join(dir, `${name}-actual.png`),
    diff: diffPath,
    pad: PAD,
  });
  if (!gif) continue;
  mkdirSync(join(out, project), { recursive: true });
  writeFileSync(join(out, project, `${name}.gif`), gif);
  count++;
}
mkdirSync(out, { recursive: true });
console.log(`${count} visual diff(s)`);
