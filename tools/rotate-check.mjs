/**
 * tools/rotate-check.mjs — 旋转体检：把精灵按 0/90/180/270 度渲染成对照图
 *
 * 用途：任何角色图接进游戏前先跑一遍，判断它到底是「可旋转的俯视精灵」
 * 还是「站立立绘（转起来像纸片翻身）」。
 *
 * 用法：
 *   node tools/rotate-check.mjs 输出.png 精灵1.png [精灵2.png ...]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { withCanvas } from './headless-canvas.mjs';

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) {
  console.error('用法: node tools/rotate-check.mjs 输出.png 精灵1.png [精灵2.png ...]');
  process.exit(1);
}

const CELL = 280;
const LABEL = 96;
const HEADER = 74;
const W = LABEL + CELL * 4;
const H = HEADER + CELL * inputs.length;

const images = inputs.map((p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`);

const png = await withCanvas(async ({ evaluate }) => evaluate(`(async () => {
  const W = ${W}, H = ${H}, CELL = ${CELL}, LABEL = ${LABEL}, HEADER = ${HEADER};
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // 背景：模拟游戏地面
  x.fillStyle = '#1b221e';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(140,190,165,0.10)';
  x.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 40) { x.beginPath(); x.moveTo(gx, HEADER); x.lineTo(gx, H); x.stroke(); }
  for (let gy = HEADER; gy < H; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }

  x.fillStyle = '#eafff1';
  x.font = '700 18px "Microsoft YaHei", sans-serif';
  x.fillText('旋转体检：同一张图按 0° / 90° / 180° / 270° 旋转', 20, 28);
  const labels = ['朝右 (0°)', '朝下 (90°)', '朝左 (180°)', '朝上 (270°)'];
  x.font = '600 13px "Microsoft YaHei", sans-serif';
  labels.forEach((t, i) => {
    x.fillStyle = '#6dfba4';
    x.fillText(t, LABEL + i * CELL + 16, HEADER - 16);
  });

  const srcs = ${JSON.stringify(images)};
  for (let r = 0; r < srcs.length; r++) {
    const img = new Image();
    img.src = srcs[r];
    await img.decode();
    const cy = HEADER + r * CELL + CELL / 2;

    // 行标签
    x.fillStyle = 'rgba(219,231,221,0.85)';
    x.font = '600 12px "Microsoft YaHei", sans-serif';
    x.fillText('图 ' + (r + 1), 16, cy - 8);
    x.fillStyle = 'rgba(150,175,160,0.6)';
    x.font = '11px Consolas, monospace';
    x.fillText('384×384', 16, cy + 10);

    for (let a = 0; a < 4; a++) {
      const cx = LABEL + a * CELL + CELL / 2;
      x.save();
      x.translate(cx, cy);
      // 脚下椭圆影子（游戏里由代码画，这里模拟）
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.beginPath();
      x.ellipse(0, 46, 34, 13, 0, 0, Math.PI * 2);
      x.fill();
      // 碰撞圈（半径 15 世界单位 ≈ 视觉参考）
      x.strokeStyle = 'rgba(109,251,164,0.35)';
      x.setLineDash([4, 4]);
      x.beginPath();
      x.arc(0, 0, 42, 0, Math.PI * 2);
      x.stroke();
      x.setLineDash([]);
      // 精灵
      x.rotate(a * Math.PI / 2);
      x.drawImage(img, -112, -112, 224, 224);
      x.restore();
      // 朝向箭头
      x.save();
      x.translate(cx, cy);
      x.rotate(a * Math.PI / 2);
      x.fillStyle = 'rgba(255,180,84,0.85)';
      x.beginPath();
      x.moveTo(64, 0); x.lineTo(52, -6); x.lineTo(52, 6);
      x.closePath(); x.fill();
      x.restore();
    }
  }
  return c.toDataURL('image/png');
})()`));

writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
console.log('已写入', out, `(${W}×${H})`);
process.exit(0);
