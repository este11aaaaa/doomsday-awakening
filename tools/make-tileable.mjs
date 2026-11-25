/**
 * tools/make-tileable.mjs — 把 AI 生成的"无缝纹理"变成真正的无缝纹理
 *
 * AI 画不出严格无缝，但可以用「四向镜像」强制无缝：
 * 取中心正方形 → 复制/翻转拼成 2×2 → 任何方向平铺都不会有接缝。
 * 代价是会出现对称感，但地面/沥青这种低对比纹理完全看不出来。
 *
 * 用法：
 *   node tools/make-tileable.mjs <输入图> <输出.png> [--size=512] [--crop=0.72] [--skipBR=0.14,0.86]
 *   --crop=0.72    取中心 72% 作为镜像源（默认 0.7，越小越不明显但细节越少）
 *   说明：取中心裁切，会自动裁掉角上的 AI 水印
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { withCanvas } from './headless-canvas.mjs';

const args = process.argv.slice(2);
const input = args[0];
const output = args[1];
const opt = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

if (!input || !output) {
  console.error('用法: node tools/make-tileable.mjs <输入图> <输出.png> [--size=512] [--crop=0.72]');
  process.exit(1);
}

const size = Number(opt.size || 512);
const crop = Number(opt.crop || 0.7);
const mime = extname(input).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const b64 = readFileSync(input).toString('base64');

const png = await withCanvas(async ({ evaluate }) => evaluate(`(async () => {
  const img = new Image();
  img.src = 'data:${mime};base64,${b64}';
  await img.decode();
  const W = img.width, H = img.height;

  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sctx = src.getContext('2d');
  sctx.drawImage(img, 0, 0);

  // 说明：中心裁切会自动裁掉右下角水印，无需额外处理

  // 取中心正方形
  const side = Math.floor(Math.min(W, H) * ${crop});
  const ox = Math.floor((W - side) / 2);
  const oy = Math.floor((H - side) / 2);

  const out = document.createElement('canvas');
  out.width = ${size}; out.height = ${size};
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  const half = ${size} / 2;

  // 四向镜像：左上原图，右上水平镜像，左下垂直镜像，右下双镜像
  octx.drawImage(src, ox, oy, side, side, 0, 0, half, half);
  octx.save();
  octx.translate(${size}, 0);
  octx.scale(-1, 1);
  octx.drawImage(src, ox, oy, side, side, 0, 0, half, half);
  octx.restore();
  octx.save();
  octx.translate(0, ${size});
  octx.scale(1, -1);
  octx.drawImage(src, ox, oy, side, side, 0, 0, half, half);
  octx.restore();
  octx.save();
  octx.translate(${size}, ${size});
  octx.scale(-1, -1);
  octx.drawImage(src, ox, oy, side, side, 0, 0, half, half);
  octx.restore();

  return out.toDataURL('image/png');
})()`));

writeFileSync(output, Buffer.from(png.split(',')[1], 'base64'));
console.log('已写入', output, `(${size}×${size}，四向镜像无缝)`);
process.exit(0);
