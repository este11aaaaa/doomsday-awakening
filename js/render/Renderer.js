/**
 * render/Renderer.js — 程序化美术渲染器
 *
 * 结构：
 *  1. 静态地图层：整张地图（2400×1800）只在开局绘制一次到离屏 Canvas，
 *     每帧只把可视区域 blit 过来，保证大地图也有稳定帧率。
 *  2. 动态层：物资、丧尸、Boss、玩家、子弹、粒子、伤害数字。
 *  3. 世界空间 UI：准星、Boss 预警圈、拾取标记。
 *
 * 所有美术均为 Canvas 程序化绘制；如需替换为 PNG/WebP 精灵，
 * 通过 AssetManager.getSprite(key) 读取即可（当前已为物资图标提供精灵缓存）。
 */

import { COLORS, WORLD, DEVICE } from '../config.js';
import { MAP } from '../data/mapData.js';
import { clamp, TAU, lerp } from '../core/MathUtils.js';

/** 确定性随机（保证每次进入地图细节一致） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 角色精灵的世界尺寸（图片按“躯干居中、朝向 +X”导出，见 tools/import-sprite.mjs） */
const PLAYER_SPRITE_SIZE = 64;
const ZOMBIE_SPRITE_SIZE = { normal: 62, runner: 58, spitter: 68 };
const BOSS_SPRITE_SIZE = 150;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas, game, assets) {
    this.canvas = canvas;
    this.game = game;
    this.assets = assets;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.staticLayer = null;
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.quality = DEVICE.lowEnd ? 'low' : 'high';
    this.sprites = {};
    this._buildSprites();
  }

  /** 尺寸变化：设置真实像素，保证高清屏不模糊 */
  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, Math.floor(cssW));
    this.cssH = Math.max(1, Math.floor(cssH));
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.cssW * dpr);
    this.canvas.height = Math.floor(this.cssH * dpr);
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    if (!this.staticLayer) this.buildStaticLayer();
  }

  // ---------------- 精灵缓存 ----------------
  _buildSprites() {
    const mk = (key, size, fn) => {
      const c = this.assets.makeSprite(key, size, size, fn);
      this.sprites[key] = c;
    };

    // 通用光晕
    ['#6dfba4', '#ffb454', '#4fd6c8', '#ff6a55', '#ffffff'].forEach((color) => {
      const key = 'glow_' + color.replace('#', '');
      mk(key, 96, (ctx, w) => {
        const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, color);
        g.addColorStop(0.45, color + '66');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, w);
      });
      this.sprites[key + '_key'] = key;
    });

    // 玩家手电光锥（预渲染，避免每帧创建渐变）
    this.sprites.cone = this.assets.makeSprite('fx_cone', 320, 320, (ctx, w, h) => {
      const cx = 12;
      const cy = h / 2;
      try { ctx.filter = 'blur(9px)'; } catch (err) { /* 不支持则忽略 */ }
      const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, w - 12);
      g.addColorStop(0, 'rgba(255,246,220,0.55)');
      g.addColorStop(0.35, 'rgba(255,242,205,0.2)');
      g.addColorStop(0.7, 'rgba(255,238,195,0.07)');
      g.addColorStop(1, 'rgba(255,235,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, w - 14, -0.38, 0.38);
      ctx.closePath();
      ctx.fill();
      try { ctx.filter = 'none'; } catch (err) { /* ignore */ }
    });

    // 物资图标
    mk('loot_ammo', 44, (ctx) => {
      ctx.fillStyle = '#2c3a2e';
      roundRect(ctx, 8, 13, 28, 20, 3); ctx.fill();
      ctx.fillStyle = '#4d6b4a'; ctx.fillRect(8, 13, 28, 5);
      ctx.fillStyle = '#ffb454';
      for (let i = 0; i < 3; i++) ctx.fillRect(12 + i * 7, 22, 4, 8);
      ctx.strokeStyle = '#8fae86'; ctx.lineWidth = 1.5;
      roundRect(ctx, 8, 13, 28, 20, 3); ctx.stroke();
    });
    mk('loot_medkit', 44, (ctx) => {
      ctx.fillStyle = '#e6efe8';
      roundRect(ctx, 7, 12, 30, 22, 4); ctx.fill();
      ctx.fillStyle = '#c9302c';
      ctx.fillRect(19, 16, 6, 14);
      ctx.fillRect(14, 20, 16, 6);
      ctx.strokeStyle = '#8fa79a'; ctx.lineWidth = 1.4;
      roundRect(ctx, 7, 12, 30, 22, 4); ctx.stroke();
    });
    mk('loot_xp', 44, (ctx) => {
      ctx.translate(22, 22);
      ctx.rotate(Math.PI / 4);
      const g = ctx.createLinearGradient(-10, -10, 10, 10);
      g.addColorStop(0, '#c9fff8'); g.addColorStop(0.5, '#4fd6c8'); g.addColorStop(1, '#1c7f76');
      ctx.fillStyle = g;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = '#c9fff8'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-9, -9, 18, 18);
    });
    mk('loot_weapon', 44, (ctx) => {
      ctx.fillStyle = '#3a2f26';
      roundRect(ctx, 7, 14, 30, 20, 3); ctx.fill();
      ctx.strokeStyle = '#8a6b4a'; ctx.lineWidth = 2;
      roundRect(ctx, 7, 14, 30, 20, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, 16); ctx.lineTo(34, 32); ctx.moveTo(34, 16); ctx.lineTo(10, 32);
      ctx.strokeStyle = '#6b5238'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#ff6a55'; ctx.fillRect(18, 19, 8, 3);
    });
  }

  _glow(colorKey, x, y, size, alpha) {
    const sprite = this.sprites['glow_' + colorKey];
    if (!sprite) return;
    const prev = this.ctx.globalAlpha;
    this.ctx.globalAlpha = prev * alpha;
    this.ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    this.ctx.globalAlpha = prev;
  }

  // ---------------- 静态地图 ----------------
  /** 资源（贴图）晚于首帧加载完成时，重建静态层 */
  refreshStaticLayer() {
    this.staticLayer = null;
    this.buildStaticLayer();
  }

  buildStaticLayer() {
    if (typeof document === 'undefined' || !document.createElement) return;
    const layer = document.createElement('canvas');
    layer.width = WORLD.width;
    layer.height = WORLD.height;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const rnd = mulberry32(20351107);

    // 1. 沥青地面（有贴图则叠一层，保留暗色底）
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    const asphaltTex = this.assets.getSprite('asphalt_tile');
    if (asphaltTex) {
      const apat = ctx.createPattern(asphaltTex, 'repeat');
      if (apat && apat.setTransform && typeof DOMMatrix !== 'undefined') {
        const k = 360 / 512;
        apat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      }
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = apat;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      ctx.restore();
    }

    // 沥青纹理斑点
    for (let i = 0; i < 1700; i++) {
      const x = rnd() * WORLD.width;
      const y = rnd() * WORLD.height;
      const r = 1 + rnd() * 3.4;
      ctx.fillStyle = rnd() > 0.55 ? 'rgba(70,80,74,0.16)' : 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    // 道路标线（底部横向道路 + 左侧纵向道路）
    ctx.strokeStyle = 'rgba(190,190,160,0.13)';
    ctx.lineWidth = 5;
    ctx.setLineDash([48, 40]);
    ctx.beginPath();
    ctx.moveTo(0, 1520);
    ctx.lineTo(WORLD.width, 1520);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(140, 0);
    ctx.lineTo(140, WORLD.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // 停车场车位线
    ctx.strokeStyle = 'rgba(200,200,170,0.1)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const x = 220 + i * 130;
      ctx.beginPath();
      ctx.moveTo(x, 1330);
      ctx.lineTo(x, 1430);
      ctx.stroke();
    }

    // 2. 超市地砖
    const b = MAP.building;
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // 1.5 室内地面贴图（AI 无缝纹理；一张 512 贴图 = 4×4 块 62 单位地砖）
    const floorTex = this.assets.getSprite('floor_tile');
    if (floorTex) {
      const pat = ctx.createPattern(floorTex, 'repeat');
      if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') {
        const k = (62 * 2) / 512;
        pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      }
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = pat || '#232b27';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // 压暗：保留纹理细节，但维持末世压抑的整体明度
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(16,22,19,0.52)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }

    const tile = 62;
    for (let y = b.y; y < b.y + b.h; y += tile) {
      for (let x = b.x; x < b.x + b.w; x += tile) {
        const shade = 0.012 + rnd() * 0.045;
        ctx.fillStyle = `rgba(255,255,255,${shade})`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        // 砖缝
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, tile, tile);
      }
    }

    // 地砖污渍
    for (let i = 0; i < 60; i++) {
      const x = b.x + rnd() * b.w;
      const y = b.y + rnd() * b.h;
      const r = 8 + rnd() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(10,14,12,0.28)');
      g.addColorStop(1, 'rgba(10,14,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 2.5 顶灯光池：让室内有节奏明暗，不再是一整块灰
    for (let lx = b.x + 170; lx < b.x + b.w - 60; lx += 330) {
      for (let ly = b.y + 140; ly < b.y + b.h - 40; ly += 300) {
        const lg = ctx.createRadialGradient(lx, ly, 12, lx, ly, 200);
        lg.addColorStop(0, 'rgba(255,240,205,0.07)');
        lg.addColorStop(0.55, 'rgba(255,236,196,0.028)');
        lg.addColorStop(1, 'rgba(255,236,196,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(lx - 200, ly - 200, 400, 400);
        // 灯罩
        ctx.fillStyle = 'rgba(40,48,44,0.85)';
        ctx.fillRect(lx - 26, ly - 9, 52, 18);
        ctx.fillStyle = 'rgba(255,246,214,0.42)';
        ctx.fillRect(lx - 21, ly - 5, 42, 10);
      }
    }

    // 3. 装饰：裂缝 / 血迹 / 纸屑 / 瓦砾
    for (const d of MAP.decor) {
      if (d.kind === 'blood') {
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, 'rgba(88,16,14,0.55)');
        g.addColorStop(0.6, 'rgba(65,12,10,0.32)');
        g.addColorStop(1, 'rgba(50,10,8,0)');
        ctx.fillStyle = g;
        ctx.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = 'rgba(70,13,11,0.35)';
          ctx.beginPath();
          ctx.arc(d.x + (rnd() - 0.5) * d.r * 1.6, d.y + (rnd() - 0.5) * d.r * 1.6, 2 + rnd() * 4, 0, TAU);
          ctx.fill();
        }
      } else if (d.kind === 'crack') {
        ctx.strokeStyle = 'rgba(0,0,0,0.34)';
        ctx.lineWidth = 1.6;
        let px = d.x;
        let py = d.y;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let i = 0; i < 7; i++) {
          px += (rnd() - 0.5) * d.r * 0.7;
          py += (rnd() - 0.5) * d.r * 0.7;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (d.kind === 'paper') {
        for (let i = 0; i < 7; i++) {
          ctx.save();
          ctx.translate(d.x + (rnd() - 0.5) * d.r, d.y + (rnd() - 0.5) * d.r);
          ctx.rotate(rnd() * TAU);
          ctx.fillStyle = `rgba(200,196,175,${0.12 + rnd() * 0.18})`;
          ctx.fillRect(-6, -4, 12, 8);
          ctx.restore();
        }
      } else if (d.kind === 'rubble') {
        for (let i = 0; i < 14; i++) {
          const x = d.x + (rnd() - 0.5) * d.r * 2;
          const y = d.y + (rnd() - 0.5) * d.r * 2;
          ctx.fillStyle = `rgba(${70 + rnd() * 30 | 0},${74 + rnd() * 30 | 0},${70 + rnd() * 26 | 0},0.55)`;
          ctx.beginPath();
          ctx.arc(x, y, 2 + rnd() * 6, 0, TAU);
          ctx.fill();
        }
      }
    }

    // 4. 出口区域
    const ex = MAP.exitZone;
    const eg = ctx.createRadialGradient(ex.x + ex.w / 2, ex.y + ex.h / 2, 10, ex.x + ex.w / 2, ex.y + ex.h / 2, ex.w * 0.8);
    eg.addColorStop(0, 'rgba(53,224,122,0.22)');
    eg.addColorStop(1, 'rgba(53,224,122,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(ex.x - 40, ex.y - 40, ex.w + 80, ex.h + 80);
    ctx.strokeStyle = 'rgba(109,251,164,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.strokeRect(ex.x, ex.y, ex.w, ex.h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(109,251,164,0.45)';
    ctx.font = '700 15px "Cascadia Mono", Consolas, monospace';
    ctx.fillText('EXIT · 安全通道', ex.x + 14, ex.y + 26);

    // 5. 障碍物
    for (const o of MAP.obstacles) this._drawObstacle(ctx, o, rnd);

    this.staticLayer = layer;
  }

  _shadow(ctx, x, y, w, h, blur = 18) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(x + 6, y + 7, w, h);
  }

  _drawObstacle(ctx, o, rnd) {
    switch (o.type) {
      case 'wall': {
        // 俯视角伪高度：投影 → 侧面（高度面）→ 顶面 → 顶边高光 → 表面细节
        const vertical = o.h > o.w;
        const depth = 7;
        // 落地投影
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(o.x + 4, o.y + 6, o.w, o.h);
        // 高度面
        ctx.fillStyle = '#20261f';
        if (vertical) ctx.fillRect(o.x + o.w - depth, o.y, depth, o.h);
        else ctx.fillRect(o.x, o.y + o.h - depth, o.w, depth);
        // 顶面
        const topH = vertical ? o.h : o.h - depth;
        const topW = vertical ? o.w - depth : o.w;
        const wallGrad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + Math.max(1, topH));
        wallGrad.addColorStop(0, COLORS.wallTop);
        wallGrad.addColorStop(0.35, COLORS.wall);
        wallGrad.addColorStop(1, '#2c332e');
        ctx.fillStyle = wallGrad;
        ctx.fillRect(o.x, o.y, topW, topH);
        // 顶边受光
        ctx.fillStyle = 'rgba(190,210,195,0.16)';
        ctx.fillRect(o.x, o.y, topW, 1.6);
        // 混凝土斑驳
        const spots = Math.max(3, Math.round((topW * topH) / 3200));
        for (let i = 0; i < spots; i++) {
          const x = o.x + rnd() * topW;
          const y = o.y + rnd() * topH;
          ctx.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.1})`;
          ctx.fillRect(x, y, 3 + rnd() * 16, 2 + rnd() * 4);
        }
        // 浇筑分块缝
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        if (!vertical) {
          for (let sx = o.x + 120; sx < o.x + topW; sx += 120) {
            ctx.beginPath(); ctx.moveTo(sx, o.y + 2); ctx.lineTo(sx, o.y + topH - 2); ctx.stroke();
          }
        } else {
          for (let sy = o.y + 120; sy < o.y + topH; sy += 120) {
            ctx.beginPath(); ctx.moveTo(o.x + 2, sy); ctx.lineTo(o.x + topW - 2, sy); ctx.stroke();
          }
        }
        // 裂缝 + 掉角
        ctx.strokeStyle = 'rgba(0,0,0,0.34)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let px = o.x + topW * (0.2 + rnd() * 0.4);
        let py = o.y;
        ctx.moveTo(px, py);
        for (let i = 0; i < 3; i++) {
          px += (rnd() - 0.5) * 18;
          py += topH / 3;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
        if (rnd() < 0.5) {
          ctx.fillStyle = 'rgba(18,22,19,0.55)';
          ctx.beginPath();
          ctx.moveTo(o.x + topW * 0.8, o.y);
          ctx.lineTo(o.x + topW * 0.92, o.y);
          ctx.lineTo(o.x + topW * 0.86, o.y + 6);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'shelf': {
        const shelfImg = this.assets.getSprite('shelf');
        if (shelfImg) {
          // 货架贴图按单元横向重复，避免拉伸变形
          const segH = o.h;
          const segW = segH * (shelfImg.width / shelfImg.height);
          ctx.save();
          ctx.beginPath();
          ctx.rect(o.x, o.y, o.w, o.h);
          ctx.clip();
          for (let sx = o.x; sx < o.x + o.w; sx += segW) {
            ctx.drawImage(shelfImg, sx, o.y, segW, segH);
          }
          ctx.restore();
          break;
        }
        this._shadow(ctx, o.x, o.y, o.w, o.h, 8);
        // 侧板（金属架体）
        ctx.fillStyle = '#2a2620';
        ctx.fillRect(o.x, o.y + 5, o.w, o.h);
        // 台面
        ctx.fillStyle = COLORS.shelfTop;
        ctx.fillRect(o.x, o.y, o.w, o.h - 4);
        // 顶边高光 + 底边暗线，让它像个货架而不是色块
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(o.x, o.y, o.w, 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(o.x, o.y + o.h - 5, o.w, 3);
        // 商品（带小投影，按 12px 一格摆放，随机留空）
        for (let x = o.x + 7; x < o.x + o.w - 10; x += 12) {
          if (rnd() < 0.2) continue;
          const hh = 4 + rnd() * 8;
          const ww = 5 + rnd() * 4;
          const colors = ['#8a5a3a', '#6f7f5a', '#8a3a3a', '#5a6f8a', '#7f6a3a', '#4d5f52', '#a08a52'];
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(x + 1, o.y + 4, ww, hh);
          ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
          ctx.fillRect(x, o.y + 3, ww, hh);
        }
        // 层板分隔（金属横档）
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(o.x + 4, o.y + Math.round(o.h * 0.5), o.w - 8, 1.2);
        // 每隔一段一根竖向立柱
        for (let sx = o.x + 64; sx < o.x + o.w - 8; sx += 64) {
          ctx.fillStyle = 'rgba(20,18,15,0.55)';
          ctx.fillRect(sx, o.y + 2, 1.6, o.h - 4);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(sx + 1.6, o.y + 2, 0.8, o.h - 4);
        }
        // 价签条（前缘）
        for (let sx = o.x + 10; sx < o.x + o.w - 14; sx += 26) {
          ctx.fillStyle = rnd() < 0.5 ? 'rgba(220,205,150,0.5)' : 'rgba(200,215,205,0.35)';
          ctx.fillRect(sx, o.y + o.h - 6, 9, 2.4);
        }
        // 两端立柱
        ctx.fillStyle = '#1c1916';
        ctx.fillRect(o.x, o.y - 1, 4, o.h + 1);
        ctx.fillRect(o.x + o.w - 4, o.y - 1, 4, o.h + 1);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
        break;
      }
      case 'counter': {
        // 收银台：台面 + 前挡板 + 收银机 + 塑料袋
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(o.x + 3, o.y + 5, o.w, o.h);
        // 前挡板（高度面）
        ctx.fillStyle = '#241f1b';
        roundRect(ctx, o.x, o.y + o.h - 10, o.w, 12, 3);
        ctx.fill();
        // 台面
        const cGrad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        cGrad.addColorStop(0, '#5b4e3f');
        cGrad.addColorStop(0.6, '#463a2f');
        cGrad.addColorStop(1, '#3a3027');
        ctx.fillStyle = cGrad;
        roundRect(ctx, o.x, o.y, o.w, o.h - 6, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 木纹
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        for (let i = 0; i < 4; i++) {
          const yy = o.y + 4 + rnd() * (o.h - 16);
          ctx.beginPath();
          ctx.moveTo(o.x + 4, yy);
          ctx.lineTo(o.x + o.w - 4, yy + (rnd() - 0.5) * 2);
          ctx.stroke();
        }
        // 收银机
        const rx = o.x + 12;
        const ry = o.y + 8;
        ctx.fillStyle = '#20241f';
        roundRect(ctx, rx, ry, 30, 18, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(109,251,164,0.28)';
        ctx.fillRect(rx + 3, ry + 3, 16, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (let i = 0; i < 3; i++) ctx.fillRect(rx + 3, ry + 13 + i * 1.6, 24, 0.8);
        // 塑料袋
        ctx.fillStyle = 'rgba(210,215,205,0.22)';
        roundRect(ctx, o.x + o.w - 42, o.y + 6, 16, 12, 3);
        ctx.fill();
        roundRect(ctx, o.x + o.w - 48, o.y + 16, 12, 9, 2);
        ctx.fill();
        break;
      }
      case 'car': {
        const horizontal = o.w > o.h;
        const carImg = this.assets.getSprite('car_h');
        if (carImg) {
          if (horizontal) {
            ctx.drawImage(carImg, o.x, o.y, o.w, o.h);
          } else {
            ctx.save();
            ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(carImg, -o.h / 2, -o.w / 2, o.h, o.w);
            ctx.restore();
          }
          break;
        }
        this._shadow(ctx, o.x, o.y, o.w, o.h, 16);
        // 车身
        const bodyColors = ['#4a3a35', '#33403f', '#3d3a2b', '#42323a'];
        const col = bodyColors[Math.floor((o.x + o.y) % bodyColors.length)];
        ctx.fillStyle = col;
        roundRect(ctx, o.x, o.y, o.w, o.h, 12);
        ctx.fill();
        // 车顶/车窗
        ctx.fillStyle = 'rgba(20,26,28,0.85)';
        if (horizontal) {
          roundRect(ctx, o.x + o.w * 0.26, o.y + 8, o.w * 0.44, o.h - 16, 5);
        } else {
          roundRect(ctx, o.x + 8, o.y + o.h * 0.26, o.w - 16, o.h * 0.44, 5);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,180,175,0.16)';
        ctx.lineWidth = 1.6;
        roundRect(ctx, o.x + 1, o.y + 1, o.w - 2, o.h - 2, 11);
        ctx.stroke();
        // 锈迹
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = 'rgba(120,60,30,0.22)';
          ctx.beginPath();
          ctx.arc(o.x + rnd() * o.w, o.y + rnd() * o.h, 2 + rnd() * 6, 0, TAU);
          ctx.fill();
        }
        // 轮胎
        ctx.fillStyle = '#141816';
        if (horizontal) {
          ctx.fillRect(o.x + 10, o.y - 3, 18, 6);
          ctx.fillRect(o.x + o.w - 28, o.y - 3, 18, 6);
          ctx.fillRect(o.x + 10, o.y + o.h - 3, 18, 6);
          ctx.fillRect(o.x + o.w - 28, o.y + o.h - 3, 18, 6);
        } else {
          ctx.fillRect(o.x - 3, o.y + 10, 6, 18);
          ctx.fillRect(o.x - 3, o.y + o.h - 28, 6, 18);
          ctx.fillRect(o.x + o.w - 3, o.y + 10, 6, 18);
          ctx.fillRect(o.x + o.w - 3, o.y + o.h - 28, 6, 18);
        }
        break;
      }
      case 'barrier': {
        this._shadow(ctx, o.x, o.y, o.w, o.h, 6);
        // 支脚
        ctx.fillStyle = '#20241f';
        ctx.fillRect(o.x + 2, o.y + o.h - 4, 10, 8);
        ctx.fillRect(o.x + o.w - 12, o.y + o.h - 4, 10, 8);
        // 挡板底
        ctx.fillStyle = '#8d2f18';
        ctx.fillRect(o.x, o.y + 3, o.w, o.h);
        // 斜条纹
        ctx.save();
        ctx.beginPath();
        ctx.rect(o.x, o.y, o.w, o.h - 2);
        ctx.clip();
        ctx.fillStyle = '#c9bda0';
        ctx.fillRect(o.x, o.y, o.w, o.h - 2);
        ctx.fillStyle = '#cf6a2f';
        for (let i = -o.h; i < o.w + o.h; i += 26) {
          ctx.beginPath();
          ctx.moveTo(o.x + i, o.y + o.h);
          ctx.lineTo(o.x + i + 13, o.y + o.h);
          ctx.lineTo(o.x + i + 13 + o.h, o.y);
          ctx.lineTo(o.x + i + o.h, o.y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        // 顶边高光 + 边框
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(o.x, o.y, o.w, 1.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 3);
        break;
      }
      case 'trash': {
        const trashImg = this.assets.getSprite('trash');
        if (trashImg) {
          ctx.drawImage(trashImg, o.x - 5, o.y - 5, o.w + 10, o.h + 10);
          break;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2 + 4, o.w * 0.55, o.h * 0.45, 0, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = `rgba(${40 + rnd() * 30 | 0},${44 + rnd() * 26 | 0},${38 + rnd() * 24 | 0},0.9)`;
          ctx.beginPath();
          ctx.ellipse(
            o.x + rnd() * o.w, o.y + rnd() * o.h,
            7 + rnd() * 12, 6 + rnd() * 10, rnd() * TAU, 0, TAU
          );
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(180,175,150,0.14)';
        ctx.fillRect(o.x + 6, o.y + 8, 8, 5);
        ctx.fillRect(o.x + o.w * 0.55, o.y + o.h * 0.6, 10, 4);
        break;
      }
      case 'crate': {
        const crateImg = this.assets.getSprite('crate');
        if (crateImg) {
          this._shadow(ctx, o.x, o.y, o.w, o.h);
          ctx.drawImage(crateImg, o.x, o.y, o.w, o.h);
          break;
        }
        this._shadow(ctx, o.x, o.y, o.w, o.h);
        ctx.fillStyle = '#4a3b2a';
        roundRect(ctx, o.x, o.y, o.w, o.h, 3);
        ctx.fill();
        ctx.strokeStyle = '#6d573c';
        ctx.lineWidth = 2.5;
        roundRect(ctx, o.x + 2, o.y + 2, o.w - 4, o.h - 4, 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(o.x + 4, o.y + 4);
        ctx.lineTo(o.x + o.w - 4, o.y + o.h - 4);
        ctx.moveTo(o.x + o.w - 4, o.y + 4);
        ctx.lineTo(o.x + 4, o.y + o.h - 4);
        ctx.stroke();
        break;
      }
      default:
        ctx.fillStyle = '#2a2f2c';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        break;
    }
  }

  // ---------------- 每帧渲染 ----------------
  render() {
    const ctx = this.ctx;
    const cam = this.game.camera;
    const game = this.game;

    // 背景（世界外区域）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a08';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    cam.apply(ctx);

    // 静态地图（只 blit 可视区域）
    if (this.staticLayer) {
      const sx = Math.max(0, Math.floor(cam.x - 4));
      const sy = Math.max(0, Math.floor(cam.y - 4));
      const sw = Math.min(this.staticLayer.width - sx, Math.ceil(cam.viewW + 8));
      const sh = Math.min(this.staticLayer.height - sy, Math.ceil(cam.viewH + 8));
      if (sw > 0 && sh > 0) {
        ctx.drawImage(this.staticLayer, sx, sy, sw, sh, sx, sy, sw, sh);
      }
    }

    // 地面层：毒池 / Boss 预警
    this.drawHazards(ctx);
    this.drawTelegraph(ctx);
    this.drawLoot(ctx);

    // 实体层
    const zombies = game.zombies;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.dead) continue;
      if (!cam.isVisible(z.x - z.radius, z.y - z.radius, z.radius * 2, z.radius * 2, 60)) continue;
      if (z.isBoss) this.drawBoss(ctx, z);
      else this.drawZombie(ctx, z);
    }

    this.drawPlayer(ctx, game.player);
    this.drawAcids(ctx);
    this.drawBullets(ctx);

    // 特效层
    this.drawParticles(ctx);
    this.drawTexts(ctx);
    this.drawCrosshair(ctx);

    // 还原变换（供后续 DOM 层使用，避免状态泄漏）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------------- 物资 ----------------
  drawLoot(ctx) {
    const list = this.game.loot;
    const t = this.game.elapsed;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (l.picked) continue;
      if (!this.game.camera.isVisible(l.x - 30, l.y - 40, 60, 80, 40)) continue;

      const bob = Math.sin(l.bob) * 3;
      const y = l.y + bob;
      const meta = l.meta;
      const colorKey = meta.color.replace('#', '');

      this._glow(colorKey, l.x, y, 62 + Math.sin(l.bob * 1.4) * 8, 0.3 + Math.sin(l.bob * 1.4) * 0.06);

      // 地面投影
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(l.x, l.y + 14, 15, 6, 0, 0, TAU);
      ctx.fill();

      const sprite = this.assets.getSprite('loot_' + l.type) || this.sprites['loot_' + l.type];
      const scale = l.spawnScale * (1 + Math.sin(l.bob * 1.4) * 0.04);
      if (sprite) {
        ctx.save();
        ctx.translate(l.x, y - 4);
        ctx.scale(scale, scale);
        ctx.drawImage(sprite, -22, -22, 44, 44);
        ctx.restore();
      } else {
        ctx.fillStyle = meta.color;
        ctx.fillRect(l.x - 10, y - 14, 20, 20);
      }

      // 类型小标
      if (this.game.state === 'playing') {
        ctx.fillStyle = 'rgba(8,14,11,0.72)';
        const w = 46;
        roundRect(ctx, l.x - w / 2, y + 16, w, 14, 3);
        ctx.fill();
        ctx.fillStyle = meta.color;
        ctx.font = '700 9px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.label, l.x, y + 23.5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ---------------- 毒池 ----------------
  drawHazards(ctx) {
    const hs = this.game.combat.hazards;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (!this.game.camera.isVisible(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2, 40)) continue;
      const fade = Math.min(1, h.life / 1.2);
      const pulse = 1 + Math.sin(h.pulse) * 0.06;
      ctx.save();
      ctx.globalAlpha = 0.42 * fade;
      const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r * pulse);
      g.addColorStop(0, '#b6ff62');
      g.addColorStop(0.55, '#5b9c22');
      g.addColorStop(1, 'rgba(40,70,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * pulse, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = '#c6ff86';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * pulse * 0.92, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- Boss 预警 ----------------
  drawTelegraph(ctx) {
    const boss = this.game.spawner && this.game.spawner.boss;
    if (!boss || boss.dead) return;
    if (boss.bossState === 'specialWindup') {
      const k = 1 - clamp(boss.telegraph, 0, 1);
      const r = boss.data.specialRadius;
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.3 * k;
      const g = ctx.createRadialGradient(boss.x, boss.y, r * 0.3, boss.x, boss.y, r);
      g.addColorStop(0, 'rgba(255,70,50,0.05)');
      g.addColorStop(0.8, 'rgba(255,70,50,0.28)');
      g.addColorStop(1, 'rgba(255,70,50,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,90,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (boss.bossState === 'chargeWindup') {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#ff7a5a';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(boss.x, boss.y);
      ctx.lineTo(boss.x + Math.cos(boss.angle) * 460, boss.y + Math.sin(boss.angle) * 460);
      ctx.stroke();
      ctx.restore();
      ctx.lineCap = 'butt';
    }
  }

  // ---------------- 丧尸 ----------------
  drawZombie(ctx, z) {
    const d = z.data;
    const r = z.radius;
    const alpha = z.spawnTimer > 0 ? 0.25 + 0.75 * z.spawnProgress : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(z.x, z.y);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.5, r * 0.95, r * 0.45, 0, 0, TAU);
    ctx.fill();

    ctx.rotate(z.angle);

    // ---- 美术资源优先：有对应精灵则直接绘制 ----
    const zombieSprite = this.assets.getSprite('zombie_' + z.typeId);
    if (zombieSprite) {
      const S = ZOMBIE_SPRITE_SIZE[z.typeId] || 62;
      // AI 精灵偏暗，给一圈很淡的地面光，避免糊进地板
      const glowKey = z.typeId === 'runner' ? 'ffb454' : z.typeId === 'spitter' ? '4fd6c8' : '6dfba4';
      this._glow(glowKey, 0, 0, S * 1.6, z.typeId === 'spitter' ? 0.07 : 0.09);
      ctx.drawImage(zombieSprite, -S / 2, -S / 2, S, S);
      if (z.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, z.hitFlash * 4) * 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, S * 0.42, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
      if (z.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(79,214,200,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, S * 0.46, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      this._drawZombieHpBar(ctx, z);
      return;
    }

    const sway = Math.sin(z.walkPhase) * 0.22;
    const windupK = z.state === 'windup' && z.windupMax > 0
      ? 1 - clamp(z.windup / z.windupMax, 0, 1)
      : 0;

    // 手臂（前摇时抬起）
    ctx.strokeStyle = d.clothColor;
    ctx.lineWidth = Math.max(3, r * 0.34);
    ctx.lineCap = 'round';
    const armLen = r * (0.95 + windupK * 0.55);
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.55);
    ctx.lineTo(r * 0.1 + armLen, -r * 0.45 + sway * 6);
    ctx.moveTo(r * 0.1, r * 0.55);
    ctx.lineTo(r * 0.1 + armLen * 0.92, r * 0.4 - sway * 6);
    ctx.stroke();

    // 爪子
    ctx.fillStyle = d.bodyColor;
    ctx.beginPath();
    ctx.arc(r * 0.1 + armLen, -r * 0.45 + sway * 6, r * 0.22, 0, TAU);
    ctx.arc(r * 0.1 + armLen * 0.92, r * 0.4 - sway * 6, r * 0.2, 0, TAU);
    ctx.fill();

    // 身体
    ctx.fillStyle = d.clothColor;
    roundRect(ctx, -r * 0.62, -r * 0.68, r * 1.24, r * 1.36, r * 0.42);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,9,0.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, -r * 0.62, -r * 0.68, r * 1.24, r * 1.36, r * 0.42);
    ctx.stroke();

    // 破烂衣服纹路
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-r * 0.5, -r * 0.1, r * 0.9, r * 0.16);

    // 头
    ctx.fillStyle = d.headColor;
    ctx.beginPath();
    ctx.arc(r * 0.28, 0, r * 0.66, 0, TAU);
    ctx.fill();
    // 头部阴影
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(r * 0.32, r * 0.16, r * 0.5, 0, TAU);
    ctx.fill();

    // 眼睛（带光晕，提升辨识度）
    const eyeColor = z.typeId === 'spitter' ? '#d4ff6a' : '#ff5a4a';
    ctx.fillStyle = eyeColor;
    ctx.globalAlpha = alpha * 0.28;
    ctx.beginPath();
    ctx.arc(r * 0.64, 0, r * 0.42, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(r * 0.66, -r * 0.22, r * 0.14, 0, TAU);
    ctx.arc(r * 0.66, r * 0.22, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath();
    ctx.arc(r * 0.7, -r * 0.22, r * 0.05, 0, TAU);
    ctx.arc(r * 0.7, r * 0.22, r * 0.05, 0, TAU);
    ctx.fill();

    // 受击白闪
    if (z.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, z.hitFlash * 5) * 0.75;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -r * 0.62, -r * 0.68, r * 1.24, r * 1.36, r * 0.42);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // 减速（EMP）标记
    if (z.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(79,214,200,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();

    // 血条（受伤后短时间显示）
    this._drawZombieHpBar(ctx, z);
  }

  /** 丧尸血条（矢量 / 精灵两种绘制路径共用） */
  _drawZombieHpBar(ctx, z) {
    if (!(z.showHpTimer > 0 && z.hp < z.maxHp)) return;
    const r = z.radius;
    const w = r * 2.1;
    const x = z.x - w / 2;
    const y = z.y - r - 11;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, w, 4.5);
    ctx.fillStyle = z.typeId === 'spitter' ? '#a6e05a' : '#e54034';
    ctx.fillRect(x, y, w * clamp(z.hp / z.maxHp, 0, 1), 4.5);
  }

  // ---------------- Boss ----------------
  drawBoss(ctx, boss) {
    const r = boss.radius;
    const alpha = boss.spawnTimer > 0 ? 0.3 + 0.7 * (1 - boss.spawnTimer / 1.5) : 1;
    const pulse = 1 + Math.sin(boss.wobble * 1.4) * 0.02;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(boss.x, boss.y);

    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.55, r * 1.05, r * 0.5, 0, 0, TAU);
    ctx.fill();

    // 狂暴光环
    if (boss.phase2) {
      this._glow('ff6a55', 0, 0, r * 4, 0.22 + Math.sin(boss.wobble * 3) * 0.05);
    } else {
      this._glow('ff6a55', 0, 0, r * 3.2, 0.14);
    }

    ctx.rotate(boss.angle);
    ctx.scale(pulse, pulse);

    const bossSprite = this.assets.getSprite('boss');
    if (bossSprite) {
      const S = BOSS_SPRITE_SIZE;
      ctx.drawImage(bossSprite, -S / 2, -S / 2, S, S);
      if (boss.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, boss.hitFlash * 3) * 0.3;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, S * 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    const windupK = boss.bossState === 'attackWindup' || boss.bossState === 'specialWindup'
      ? 1 - clamp(boss.stateTimer / Math.max(0.001, boss.data.attackWindup), 0, 1)
      : 0;

    // 背刺（骨白色，强化“变异体”辨识度）
    ctx.fillStyle = '#b8a68c';
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.rotate(i * 0.28);
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, 0);
      ctx.lineTo(-r * 0.95, -r * 0.14);
      ctx.lineTo(-r * 0.15, r * 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 手臂
    ctx.strokeStyle = '#6b3232';
    ctx.lineWidth = r * 0.36;
    ctx.lineCap = 'round';
    const reach = r * (0.8 + windupK * 0.75);
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.62);
    ctx.lineTo(r * 0.1 + reach, -r * 0.5);
    ctx.moveTo(r * 0.1, r * 0.62);
    ctx.lineTo(r * 0.1 + reach * 0.9, r * 0.48);
    ctx.stroke();

    // 躯干
    const bodyGrad = ctx.createRadialGradient(r * 0.2, -r * 0.1, r * 0.2, 0, 0, r * 1.15);
    bodyGrad.addColorStop(0, '#a9564f');
    bodyGrad.addColorStop(0.55, '#7d3a3a');
    bodyGrad.addColorStop(1, '#4a2222');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 1.02, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,6,6,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 发光裂纹
    ctx.strokeStyle = `rgba(255,120,90,${0.35 + Math.sin(boss.wobble * 3) * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.5);
    ctx.lineTo(-r * 0.05, -r * 0.15);
    ctx.lineTo(-r * 0.35, r * 0.1);
    ctx.lineTo(-r * 0.02, r * 0.45);
    ctx.stroke();

    // 外骨骼纹路
    ctx.strokeStyle = 'rgba(30,12,12,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-r * 0.1, 0, r * (0.4 + i * 0.22), -1.1, 1.1);
      ctx.stroke();
    }

    // 头
    ctx.fillStyle = '#9c4a45';
    ctx.beginPath();
    ctx.arc(r * 0.45, 0, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3a1512';
    ctx.beginPath();
    ctx.arc(r * 0.55, 0, r * 0.4, 0, TAU);
    ctx.fill();

    // 核心眼
    const eyeGlow = 0.55 + Math.sin(boss.wobble * 4) * 0.25;
    ctx.fillStyle = `rgba(255,${boss.phase2 ? 90 : 150},70,${eyeGlow})`;
    ctx.beginPath();
    ctx.arc(r * 0.62, 0, r * 0.17, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffe9c9';
    ctx.beginPath();
    ctx.arc(r * 0.66, 0, r * 0.07, 0, TAU);
    ctx.fill();

    // 受击闪白
    if (boss.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, boss.hitFlash * 4) * 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.97, r * 1.04, 0, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // 震地余波
    if (boss.slamFlash > 0) {
      ctx.save();
      ctx.globalAlpha = boss.slamFlash * 1.8;
      ctx.strokeStyle = '#ff8a6a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.data.specialRadius * (1 - boss.slamFlash * 2), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- 玩家 ----------------
  drawPlayer(ctx, p) {
    if (!p) return;
    const r = p.radius;

    // 无敌闪烁
    if (p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    // 瞄准辅助细线（触屏始终显示，桌面端开火时显示）
    const showAimLine = this.game.state === 'playing' &&
      (this.game.input.isTouchMode || this.game.input.isFiring());
    if (showAimLine) {
      ctx.save();
      ctx.globalAlpha = this.game.input.isTouchMode ? 0.16 : 0.1;
      ctx.strokeStyle = '#6dfba4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 12]);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.aimAngle) * (r + 16), p.y + Math.sin(p.aimAngle) * (r + 16));
      ctx.lineTo(p.x + Math.cos(p.aimAngle) * 320, p.y + Math.sin(p.aimAngle) * 320);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.6, r * 0.95, r * 0.45, 0, 0, TAU);
    ctx.fill();

    // 手电光锥（跟随瞄准方向）
    if (this.sprites.cone) {
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.aimAngle);
      ctx.drawImage(this.sprites.cone, 10, -160, 320, 320);
      ctx.restore();
    }

    // 脚下微光（系统激活感，保持克制避免遮挡角色）
    this._glow('6dfba4', p.x, p.y, 58, 0.14);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aimAngle);

    // ---- 美术资源优先：assets/images/characters/player.png 已加载则直接绘制精灵 ----
    const playerSprite = this.assets.getSprite('player');
    if (playerSprite) {
      const S = PLAYER_SPRITE_SIZE;
      // 深色角色压在深色地面上容易糊，给一圈系统绿描边光提升辨识度
      ctx.shadowColor = 'rgba(109,251,164,0.55)';
      ctx.shadowBlur = 13;
      ctx.drawImage(playerSprite, -S / 2, -S / 2, S, S);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.restore();
      this._drawMuzzle(ctx, p, r);
      ctx.globalAlpha = 1;
      return;
    }

    const step = p.moving ? Math.sin(p.walkPhase) : 0;

    // 腿
    ctx.strokeStyle = '#1b2a22';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, -7);
    ctx.lineTo(-3 + step * 7, -8);
    ctx.moveTo(-3, 7);
    ctx.lineTo(-3 - step * 7, 8);
    ctx.stroke();

    // 身体（夹克）
    const coat = ctx.createLinearGradient(-r * 0.6, -r * 0.5, r * 0.4, r * 0.6);
    coat.addColorStop(0, '#5d9479');
    coat.addColorStop(0.55, '#3d6a55');
    coat.addColorStop(1, '#26443a');
    ctx.fillStyle = coat;
    roundRect(ctx, -r * 0.62, -r * 0.68, r * 1.2, r * 1.36, r * 0.42);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,11,0.7)';
    ctx.lineWidth = 2;
    roundRect(ctx, -r * 0.62, -r * 0.68, r * 1.2, r * 1.36, r * 0.42);
    ctx.stroke();

    // 战术背心
    ctx.fillStyle = '#1b2721';
    ctx.fillRect(-r * 0.3, -r * 0.42, r * 0.5, r * 0.84);
    ctx.fillStyle = '#6dfba4';
    ctx.fillRect(-r * 0.26, -r * 0.3, r * 0.1, r * 0.14);
    ctx.fillRect(-r * 0.26, -r * 0.05, r * 0.1, r * 0.14);
    ctx.strokeStyle = 'rgba(109,251,164,0.5)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-r * 0.3, -r * 0.42, r * 0.5, r * 0.84);

    // 手臂 + 枪
    const gunRecoil = p.recoil * 4;
    ctx.strokeStyle = '#2f4a3d';
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.42);
    ctx.lineTo(r * 0.72 - gunRecoil, -r * 0.16);
    ctx.moveTo(r * 0.1, r * 0.42);
    ctx.lineTo(r * 0.66 - gunRecoil, r * 0.1);
    ctx.stroke();

    // 枪身
    const w = p.weapon;
    const gunLen = w.id === 'shotgun' ? r * 1.5 : w.id === 'pistol' ? r * 0.95 : r * 1.3;
    ctx.fillStyle = '#151b19';
    ctx.fillRect(r * 0.55 - gunRecoil, -r * 0.17, gunLen, r * 0.34);
    ctx.fillStyle = '#5a6a63';
    ctx.fillRect(r * 0.6 - gunRecoil, -r * 0.13, gunLen * 0.5, r * 0.1);
    ctx.fillStyle = '#0c0f0e';
    ctx.fillRect(r * 0.55 + gunLen * 0.78 - gunRecoil, -r * 0.1, gunLen * 0.24, r * 0.2);
    ctx.fillStyle = '#ffb454';
    ctx.fillRect(r * 0.62 - gunRecoil, -r * 0.02, r * 0.12, r * 0.1);

    // 背包
    ctx.fillStyle = '#243a30';
    roundRect(ctx, -r * 0.95, -r * 0.34, r * 0.42, r * 0.68, 3);
    ctx.fill();

    // 头 + 战术头盔
    ctx.fillStyle = '#e2c0a0';
    ctx.beginPath();
    ctx.arc(r * 0.18, 0, r * 0.48, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2b3a33';
    ctx.beginPath();
    ctx.arc(r * 0.12, 0, r * 0.5, Math.PI * 0.46, Math.PI * 1.54);
    ctx.fill();
    // 护目镜（荧光绿，和系统主题呼应）
    ctx.fillStyle = '#6dfba4';
    ctx.fillRect(r * 0.34, -r * 0.26, r * 0.2, r * 0.52);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(r * 0.36, -r * 0.2, r * 0.06, r * 0.2);

    ctx.restore();

    // 枪口火焰
    this._drawMuzzle(ctx, p, r);

    ctx.globalAlpha = 1;
  }

  /** 枪口火焰（矢量绘制，两种角色美术路径共用） */
  _drawMuzzle(ctx, p, r) {
    if (p.muzzleTimer <= 0) return;
    // 使用精灵图时枪管更短（枪口约在 26 单位处），火焰位置相应前移
    const dist = this.assets.getSprite('player') ? r + 13 : r + 18;
    const mx = p.x + Math.cos(p.aimAngle) * dist;
    const my = p.y + Math.sin(p.aimAngle) * dist;
    this._glow('ffb454', mx, my, 52, 0.75);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(p.aimAngle);
    ctx.fillStyle = 'rgba(255,240,190,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, -6);
    ctx.lineTo(24, 0);
    ctx.lineTo(16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------------- 子弹 ----------------
  drawBullets(ctx) {
    const bullets = this.game.combat.bullets;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) continue;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.crit ? b.radius * 1.5 : b.radius;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = b.radius * 3;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
  }

  drawAcids(ctx) {
    const acids = this.game.combat.acids;
    for (let i = 0; i < acids.length; i++) {
      const g = acids[i];
      if (!g.active) continue;
      this._glow('4fd6c8', g.x, g.y, 42, 0.4);
      ctx.fillStyle = '#a6e05a';
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(240,255,200,0.85)';
      ctx.beginPath();
      ctx.arc(g.x - 2, g.y - 2, g.radius * 0.4, 0, TAU);
      ctx.fill();
      // 拖尾
      ctx.strokeStyle = 'rgba(166,224,90,0.35)';
      ctx.lineWidth = g.radius * 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.px, g.py);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  // ---------------- 粒子 ----------------
  drawParticles(ctx) {
    const ps = this.game.particles;
    const pool = ps.pool;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      const k = clamp(p.life / p.max, 0, 1);
      const alpha = p.type === 'ring' ? k * 0.9 : Math.min(1, k * 1.6);

      ctx.globalAlpha = alpha;
      switch (p.type) {
        case 'spark': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * k;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
          break;
        }
        case 'blood': {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
          ctx.fill();
          break;
        }
        case 'smoke': {
          ctx.fillStyle = p.color;
          const size = lerp(p.size, p.size2, 1 - k);
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
          break;
        }
        case 'debris': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
          break;
        }
        case 'shell': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-2.5, -1, 5, 2.2);
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 + 3 * k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'glow': {
          ctx.globalAlpha = alpha * 0.8;
          ctx.drawImage(this.sprites.glow_ffb454, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        }
        default: {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- 伤害数字 ----------------
  drawTexts(ctx) {
    const texts = this.game.particles.texts;
    if (!texts.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const k = clamp(t.life / t.max, 0, 1);
      const alpha = t.life > 0.25 ? 1 : k * 4;
      const size = t.crit ? 22 : t.label ? 15 : 15;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.font = `700 ${size}px "Cascadia Mono", Consolas, monospace`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const y = t.y - (1 - k) * 8;
      ctx.strokeText(t.text, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, y);
      // 暴击描边光
      if (t.crit) {
        ctx.globalAlpha = ctx.globalAlpha * 0.5;
        ctx.strokeStyle = 'rgba(255,209,102,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeText(t.text, t.x, y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ---------------- 准星 ----------------
  drawCrosshair(ctx) {
    const game = this.game;
    if (game.state !== 'playing') return;
    const input = game.input;
    const p = game.player;
    if (!p || !p.alive) return;

    let x;
    let y;
    if (input.isTouchMode) {
      x = p.x + Math.cos(p.aimAngle) * 150;
      y = p.y + Math.sin(p.aimAngle) * 150;
    } else {
      if (!input.mouse.seen || !input.mouse.inside) return;
      const w = game.camera.screenToWorld(input.mouse.x, input.mouse.y);
      x = w.x;
      y = w.y;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(109,251,164,0.85)';
    ctx.lineWidth = 1.6;
    const gap = 5;
    const len = 8;
    ctx.beginPath();
    ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
    ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
    ctx.stroke();
    ctx.fillStyle = 'rgba(109,251,164,0.7)';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  }
}
