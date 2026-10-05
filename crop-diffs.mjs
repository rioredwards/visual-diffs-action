import { readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";
import sharp from "sharp";

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
  const crop = async (f) => {
    const file = join(dir, `${name}-${f}.png`);
    const meta = await sharp(file).metadata();
    const padded = await sharp(file).extend({ top: 0, left: 0, right: info.width - meta.width,
      bottom: info.height - meta.height, background: "white" }).png().toBuffer();
    return sharp(padded).extract(band).toBuffer();
  };
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
  count++;
}
mkdirSync(out, { recursive: true });
console.log(`${count} visual diff(s)`);
