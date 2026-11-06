import sharp from 'sharp';

const HEADER = 36;
const MAX_BYTES = 10 * 1024 * 1024;
export async function encodeFrames(frames) {
  if (frames.length !== 3) throw Error('GIF requires exactly three frames');
  const sizes = await Promise.all(frames.map(frame => sharp(frame).metadata()));
  if (sizes.some(size => size.width !== sizes[0].width || size.height !== sizes[0].height || (size.pages ?? 1) !== 1))
    throw Error('GIF frames must share one canvas');
  const gif = await sharp(frames, { join: { animated: true } }).gif({ delay: [1000, 1000, 1000], loop: 0 }).toBuffer();
  const meta = await sharp(gif, { animated: true }).metadata();
  if (meta.pages !== 3 || meta.delay.some(delay => delay !== 1000)) throw Error('GIF did not preserve three one-second frames');
  if (gif.length > MAX_BYTES) throw Error('GIF exceeds 10 MB; reduce evidence dimensions');
  return gif;
}

export async function renderDiffGif({ before, after, diff, pad = 40 }) {
  if (!Number.isInteger(pad) || pad < 0) throw Error('Diff padding must be a nonnegative integer');
  const sources = await Promise.all([before, after, diff].map(async input => {
    const { data, info } = await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, ...info };
  }));
  const [old, next, mask] = sources;
  const width = Math.max(...sources.map(source => source.width)), height = Math.max(...sources.map(source => source.height));
  const pixel = (source, x, y) => x < source.width && y < source.height
    ? source.data.subarray((y * source.width + x) * 4, (y * source.width + x) * 4 + 4) : Buffer.from([255, 255, 255, 255]);
  const changed = new Uint8Array(width * height), rawChanged = new Uint8Array(width * height);
  let any = false, hasMask = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, a = pixel(old, x, y), b = pixel(next, x, y), m = pixel(mask, x, y);
    const dimensions = (x < old.width && y < old.height) !== (x < next.width && y < next.height);
    rawChanged[i] = Number(dimensions || !a.equals(b)); any ||= Boolean(rawChanged[i]);
    changed[i] = Number(m[0] > 200 && m[1] < 100); hasMask ||= Boolean(changed[i]);
    if (dimensions) changed[i] = 1;
  }
  if (!any) return null;
  // Pixelmatch owns the threshold. Gray-only mismatch images still need inspectable evidence.
  if (!hasMask) changed.set(rawChanged);
  let top = height, bottom = -1;
  for (let y = 0; y < height; y++) if (changed.subarray(y * width, (y + 1) * width).some(Boolean)) {
    top = Math.min(top, y); bottom = y;
  }
  top = Math.max(0, top - pad); bottom = Math.min(height - 1, bottom + pad);
  const cropHeight = bottom - top + 1;
  const buffers = [Buffer.alloc(width * cropHeight * 4), Buffer.alloc(width * cropHeight * 4), Buffer.alloc(width * cropHeight * 4)];
  const luminance = p => .2126 * p[0] + .7152 * p[1] + .0722 * p[2];
  for (let y = top; y <= bottom; y++) for (let x = 0; x < width; x++) {
    const a = pixel(old, x, y), b = pixel(next, x, y), offset = ((y - top) * width + x) * 4;
    a.copy(buffers[0], offset); b.copy(buffers[1], offset);
    const neighbors = [];
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) {
      const nx = Math.max(0, Math.min(width - 1, x + dx)), ny = Math.max(0, Math.min(height - 1, y + dy));
      neighbors.push(luminance(pixel(old, nx, ny)), luminance(pixel(next, nx, ny)));
    }
    neighbors.sort((a, b) => a - b);
    const background = (neighbors[3] + neighbors[4]) / 2;
    const delta = Math.abs(luminance(a) - background) - Math.abs(luminance(b) - background);
    const context = Math.round((luminance(a) + luminance(b)) * .275 + 13);
    // Equal-brightness color changes retain both colors instead of disappearing.
    const color = changed[y * width + x] ? (Math.abs(delta) < 4 ? ((x + y) % 2 ? [255, 73, 70] : [0, 216, 170])
      : delta > 0 ? [255, 73, 70] : [0, 216, 170]) : [context, context, context];
    buffers[2].set([...color, 255], offset);
  }
  const scale = Math.min(1, 1600 / width, 2400 / cropHeight), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(cropHeight * scale));
  const frames = await Promise.all(buffers.map(async (buffer, index) => {
    const colors = ['#ff4946', '#00d8aa', '#aaaaaa'], labels = ['Before', 'After', 'Diff'];
    const legend = index === 2 && w > 260 ? `<text x="${w - 132}" y="24" fill="#ff4946">Before</text><text x="${w - 66}" y="24" fill="#00d8aa">After</text>` : '';
    const label = Buffer.from(`<svg width="${w}" height="${HEADER}"><rect width="100%" height="100%" fill="#101114"/><rect width="4" height="100%" fill="${colors[index]}"/><g font-family="sans-serif" font-size="17" fill="#f5f5f5"><text x="12" y="24">${labels[index]}</text>${legend}</g></svg>`);
    const content = await sharp(buffer, { raw: { width, height: cropHeight, channels: 4 } }).resize(w, h).png().toBuffer();
    return sharp({ create: { width: w, height: h + HEADER, channels: 4, background: '#101114' } })
      .composite([{ input: label, top: 0, left: 0 }, { input: content, top: HEADER, left: 0 }]).png().toBuffer();
  }));
  return encodeFrames(frames);
}
