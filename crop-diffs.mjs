// Crops Playwright visual-test diffs to the changed band and writes a PR comment.
// Input:  test-results/**/<name>-{expected,actual,diff}.png (from a non-updating run)
// Output: visual-diffs/<project>/<name>.png (before / after / diff stacked) + visual-diffs/comment.md
// Usage:  node crop-diffs.mjs <baseUrl> [--pad N] [--mode inline|link]
//   inline: embed images with ![](baseUrl/...) — baseUrl should be a raw.githubusercontent.com prefix
//   link:   plain links to baseUrl/... — for private repos, where raw images can't render inline
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, basename } from "path";
import sharp from "sharp";

const args = process.argv.slice(2);
const baseUrl = args[0] && !args[0].startsWith("--") ? args[0] : "";
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const PAD = Number(flag("pad", "40"));
const MODE = flag("mode", "inline");
if (!baseUrl) throw new Error("crop-diffs: missing <baseUrl> argument");
if (!["inline", "link"].includes(MODE)) throw new Error(`crop-diffs: bad --mode ${MODE}`);
if (!Number.isFinite(PAD) || PAD < 0) throw new Error(`crop-diffs: bad --pad ${flag("pad")}`);

const out = "visual-diffs";
const rows = [];
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
  // Playwright result dirs look like visual-<name>-visual-<project>[-retryN]
  const dirName = basename(dir);
  if (!/^visual-.+-visual-/.test(dirName))
    throw new Error(
      `Unexpected result dir "${dirName}" — spec must be visual.spec.ts with "@visual" in each test title (see README)`,
    );
  const project = dirName.replace(/^visual-.*-visual-/, "").replace(/-retry\d+$/, "");
  if (seen.has(`${project}/${name}`)) continue; // retry dirs duplicate results
  seen.add(`${project}/${name}`);
  const { data, info } = await sharp(diffPath).raw().toBuffer({ resolveWithObject: true });
  let top = -1,
    bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] < 100) {
        // pixelmatch red
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  if (top < 0) continue;
  top = Math.max(0, top - PAD);
  bottom = Math.min(info.height - 1, bottom + PAD);
  const band = { left: 0, top, width: info.width, height: bottom - top + 1 };
  const crop = (f) => sharp(join(dir, `${name}-${f}.png`)).extract(band).toBuffer();
  const [before, after, diff] = await Promise.all(["expected", "actual", "diff"].map(crop));
  const gap = 16;
  mkdirSync(join(out, project), { recursive: true });
  const h = band.height;
  await sharp({
    create: { width: info.width, height: h * 3 + gap * 2, channels: 4, background: "#888" },
  })
    .composite([
      { input: before, left: 0, top: 0 },
      { input: after, left: 0, top: h + gap },
      { input: diff, left: 0, top: (h + gap) * 2 },
    ])
    .png()
    .toFile(join(out, project, `${name}.png`));
  const url = `${baseUrl}/${project}/${name}.png`;
  rows.push(
    MODE === "inline"
      ? `**${name}** · ${project} · rows ${top}–${bottom}\n\n![${name} ${project}](${url})`
      : `**${name}** · ${project} · rows ${top}–${bottom} · [📎 view](${url})`,
  );
}

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "comment.md"),
  rows.length
    ? `### 📸 Visual changes (before / after / diff)\n\n${rows.join("\n\n")}\n`
    : "### 📸 Visual changes\n\nNone detected.\n",
);
console.log(`${rows.length} visual diff(s)`);
