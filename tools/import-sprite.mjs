/**
 * tools/import-sprite.mjs — 把 AI 生成的角色图处理成游戏可用的透明精灵
 *
 * 做四件事：
 *   1. 白底抠图（软边）；如果输入本来就是透明底，则保留原 alpha 直接过
 *   2. 可选：清掉右下角的 AI 水印区域（仅白底图）
 *   3. 以「角色躯干中心」为锚点裁正方形（保证旋转绕身体转，而不是绕图片中心转）
 *   4. 缩放到目标尺寸并输出 PNG
 *
 * 自带临时 headless Chrome 做 Canvas 运算（tools/headless-canvas.mjs），无需提前启动浏览器。
 *
 * 用法：
 *   node tools/import-sprite.mjs <输入图> <输出.png> [选项]
 *   --anchor=0.51,0.53   锚点（图片宽高的比例，默认图片中心）
 *   --size=384           输出边长（默认 384）
 *   --key=236            白色阈值：min(r,g,b) ≥ 该值 → 完全透明
 *   --soft=205           软边起点：介于 soft~key 之间按比例半透明
 *   --pad=0.05           四周额外留白比例
 *   --clearBR=0.72,0.92  清空右下角区域（x,y 起始比例），用于去水印
 *   --crop=0.4           固定裁切：以锚点为中心裁「短边 × 该比例」的正方形（做头像用）
 *   --rotate=-90         先把图旋转若干度（AI 常把朝向画成朝下，用 -90 转成朝右）
 *   --bright=1.12        导出前提亮/加饱和（AI 图在暗场景里容易糊）
 *   --dehaze             去掉线稿/发光图标周围的白色雾边（低饱和亮像素转为透明）
 *   --bbox               按内容包围盒裁切（保持原始长宽比），适合墙/货架/车这类长条物件
 *   --maxw=512           配合 --bbox：输出最大宽度（等比缩放）
 *   --report             只打印测量结果，不写文件
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

if (!input || (!output && !opt.report)) {
  console.error('用法: node tools/import-sprite.mjs <输入图> <输出.png> [--anchor=0.5,0.5] [--size=384]');
  process.exit(1);
}

const anchor = String(opt.anchor || '0.5,0.5').split(',').map(Number);
const size = Number(opt.size || 384);
const key = Number(opt.key || 236);
const soft = Number(opt.soft || 205);
const pad = Number(opt.pad || 0.05);
const clearBR = opt.clearBR ? String(opt.clearBR).split(',').map(Number) : null;
const fixedCrop = opt.crop ? Number(opt.crop) : null;
const rotDeg = opt.rotate ? Number(opt.rotate) : 0;
const bright = opt.bright ? Number(opt.bright) : 0;

const mime = extname(input).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const b64 = readFileSync(input).toString('base64');

const result = await withCanvas(async ({ evaluate }) => evaluate(`(async () => {
  const img = new Image();
  img.src = 'data:${mime};base64,${b64}';
  await img.decode();
  const OW = img.width, OH = img.height;

  // 预旋转（AI 常把朝向画成朝下，-90 可转成朝右）
  const RAD = ${rotDeg} * Math.PI / 180;
  const cosA = Math.abs(Math.cos(RAD)), sinA = Math.abs(Math.sin(RAD));
  const W = Math.ceil(OW * cosA + OH * sinA);
  const H = Math.ceil(OW * sinA + OH * cosA);
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sctx = src.getContext('2d');
  sctx.translate(W / 2, H / 2);
  sctx.rotate(RAD);
  sctx.drawImage(img, -OW / 2, -OH / 2);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  const idata = sctx.getImageData(0, 0, W, H);
  const d = idata.data;

  // 0) 检测是否本来就是透明底
  let opaquePx = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) opaquePx++;
  const alreadyTransparent = opaquePx < (W * H) * 0.45;

  // 1) 白底抠图（软边）；透明底图跳过
  if (!alreadyTransparent) {
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.min(d[i], d[i + 1], d[i + 2]);
      if (m >= ${key}) d[i + 3] = 0;
      else if (m > ${soft}) d[i + 3] = Math.round(255 * (${key} - m) / (${key} - ${soft}));
    }
  }

  // 1.5) 去雾：低饱和度的高亮像素（白雾/灰底残留）直接透明化，保留高饱和线稿
  if (${opt.dehaze ? 'true' : 'false'}) {
    for (let i = 0; i < d.length; i += 4) {
      const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
      const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0);
      if (mx - mn < 55 && mx > 120) d[i + 3] = 0;
    }
  }

  // 2) 清掉右下角水印区域（仅白底图）
  ${clearBR ? `if (!alreadyTransparent) {
    const cx0 = Math.floor(W * ${clearBR[0]});
    const cy0 = Math.floor(H * ${clearBR[1]});
    for (let y = cy0; y < H; y++) {
      for (let x = cx0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 0) d[i + 3] = 0;
      }
    }
  }` : ''}

  sctx.putImageData(idata, 0, 0);

  // 3) 内容包围盒（alpha > 16）
  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (${opt.bbox ? 'true' : 'false'}) {
    const padX = Math.round((maxX - minX) * ${pad});
    const padY = Math.round((maxY - minY) * ${pad});
    const bx = Math.max(0, minX - padX);
    const by = Math.max(0, minY - padY);
    const bw = Math.min(W - bx, (maxX - minX) + padX * 2);
    const bh = Math.min(H - by, (maxY - minY) + padY * 2);
    const scale = Math.min(1, ${opt.maxw ? Number(opt.maxw) : 512} / bw);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(bw * scale));
    out.height = Math.max(1, Math.round(bh * scale));
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    ${opt.bright ? `octx.filter = 'brightness(${opt.bright}) saturate(1.06)';` : ''}
    octx.drawImage(src, bx, by, bw, bh, 0, 0, out.width, out.height);
    ${opt.bright ? `octx.filter = 'none';` : ''}
    return {
      bboxMode: true,
      size: { w: out.width, h: out.height },
      png: out.toDataURL('image/png')
    };
  }

  const ax = Math.round(W * ${anchor[0]});
  const ay = Math.round(H * ${anchor[1]});
  const autoHalf = Math.max(ax - minX, maxX - ax, ay - minY, maxY - ay) * (1 + ${pad});
  const half = ${fixedCrop ? `Math.round(Math.min(W, H) * ${fixedCrop} / 2)` : 'Math.ceil(autoHalf)'};
  const sx = ax - half, sy = ay - half;

  // 4) 输出
  const out = document.createElement('canvas');
  out.width = ${size}; out.height = ${size};
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  ${bright ? `octx.filter = 'brightness(${bright}) saturate(1.06)';` : ''}
  octx.drawImage(src, sx, sy, half * 2, half * 2, 0, 0, ${size}, ${size});
  ${bright ? `octx.filter = 'none';` : ''}

  return {
    alreadyTransparent,
    src: { w: W, h: H },
    bbox: { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY },
    anchor: { x: ax, y: ay },
    crop: { x: sx, y: sy, size: half * 2 },
    contentRatio: +(count / (W * H)).toFixed(3),
    png: out.toDataURL('image/png')
  };
})()`));

if (result.bboxMode) {
  console.log('包围盒模式输出:', `${result.size.w}×${result.size.h}`);
  if (!opt.report) {
    writeFileSync(output, Buffer.from(result.png.split(',')[1], 'base64'));
    console.log('已写入   :', output);
  }
  process.exit(0);
}
console.log('原图尺寸 :', result.src.w + '×' + result.src.h);
console.log('输入模式 :', result.alreadyTransparent ? '透明底（保留原 alpha）' : '白底（已抠图）');
console.log('内容包围盒:', `x ${result.bbox.minX}..${result.bbox.maxX}  y ${result.bbox.minY}..${result.bbox.maxY}  (${result.bbox.w}×${result.bbox.h})`);
console.log('锚点     :', `(${result.anchor.x}, ${result.anchor.y})`);
console.log('裁剪窗口 :', `${result.crop.size}×${result.crop.size} @ (${result.crop.x}, ${result.crop.y})`);

if (!opt.report) {
  writeFileSync(output, Buffer.from(result.png.split(',')[1], 'base64'));
  console.log('已写入   :', output, `(${size}×${size})`);
}
process.exit(0);
