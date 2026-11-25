/**
 * systems/ParticleSystem.js — 粒子 / 伤害数字 / 视觉特效（对象池，数量受控）
 * 所有特效都从固定池中取用，超出上限时覆盖最旧粒子，杜绝无限增长。
 */

import { LIMITS, DEVICE } from '../config.js';
import { rand, TAU } from '../core/MathUtils.js';

export class ParticleSystem {
  constructor(game) {
    this.game = game;
    this.cap = DEVICE.lowEnd ? LIMITS.particlesTouch : LIMITS.particlesDesktop;
    this.pool = new Array(this.cap);
    for (let i = 0; i < this.cap; i++) {
      this.pool[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, max: 1, size: 2, size2: 2, color: '#fff',
        type: 'spark', drag: 0.9, gravity: 0, rot: 0, rotSpeed: 0,
        alpha: 1, glow: false
      };
    }
    this.cursor = 0;
    this.activeCount = 0;

    this.texts = [];
    this.textCap = LIMITS.damageTexts;
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) this.pool[i].active = false;
    this.cursor = 0;
    this.activeCount = 0;
    this.texts.length = 0;
  }

  _take() {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  _emit(x, y, opts = {}) {
    const p = this._take();
    p.active = true;
    p.x = x; p.y = y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.max = opts.life || 0.4;
    p.life = p.max;
    p.size = opts.size || 2;
    p.size2 = opts.size2 || p.size;
    p.color = opts.color || '#ffffff';
    p.type = opts.type || 'spark';
    p.drag = opts.drag === undefined ? 3.5 : opts.drag;
    p.gravity = opts.gravity || 0;
    p.rot = opts.rot || 0;
    p.rotSpeed = opts.rotSpeed || 0;
    p.glow = !!opts.glow;
    return p;
  }

  // ---------------- 组合特效 ----------------

  muzzle(x, y, angle, size = 16) {
    for (let i = 0; i < 4; i++) {
      const a = angle + rand(-0.28, 0.28);
      const sp = rand(90, 300);
      this._emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.06, 0.13), size: rand(2, 4.5) * (size / 16),
        color: i === 0 ? '#fff6d0' : '#ffb454', type: 'spark', drag: 6
      });
    }
    this._emit(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, {
      life: 0.09, size: size * 0.9, color: '#ffd489', type: 'glow', drag: 1
    });
    // 抛壳
    const sa = angle + Math.PI / 2 + rand(-0.2, 0.2);
    this._emit(x, y, {
      vx: Math.cos(sa) * rand(60, 130), vy: Math.sin(sa) * rand(60, 130),
      life: rand(0.35, 0.6), size: 3, color: '#d9a95c', type: 'shell',
      drag: 2.4, gravity: 260, rotSpeed: rand(-14, 14)
    });
  }

  spark(x, y, count = 5, angle = 0, spread = 1.2) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread, spread);
      const sp = rand(80, 330);
      this._emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.12, 0.3), size: rand(1.4, 3), color: i % 3 === 0 ? '#fff3c4' : '#ffc061',
        type: 'spark', drag: 5
      });
    }
  }

  blood(x, y, count = 6, angle = 0) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.9, 0.9);
      const sp = rand(40, 220);
      this._emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7), size: rand(2, 5.5),
        color: Math.random() < 0.5 ? '#8e1c16' : '#5c0f0c',
        type: 'blood', drag: 3, gravity: 40
      });
    }
  }

  dust(x, y, n = 1) {
    for (let i = 0; i < n; i++) {
      this._emit(x + rand(-6, 6), y + rand(-3, 3), {
        vx: rand(-26, 26), vy: rand(-30, -6),
        life: rand(0.3, 0.6), size: rand(3, 7), size2: rand(8, 14),
        color: 'rgba(150,165,150,0.32)', type: 'smoke', drag: 2
      });
    }
  }

  debris(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(60, 260);
      this._emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7), size: rand(2, 5), color: '#565f58', type: 'debris',
        drag: 3.2, gravity: 220, rotSpeed: rand(-10, 10)
      });
    }
  }

  ring(x, y, radius, color = '#6dfba4', duration = 0.35) {
    this._emit(x, y, {
      life: duration, size: radius * 0.35, size2: radius, color, type: 'ring', drag: 0, glow: true
    });
  }

  acidSplash(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 170);
      this._emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6), size: rand(2, 5), color: '#a6e05a', type: 'blood', drag: 3
      });
    }
    this.ring(x, y, 34, '#a6e05a', 0.3);
  }

  explosion(x, y, radius = 80) {
    this.ring(x, y, radius * 1.5, '#ffb454', 0.45);
    this.ring(x, y, radius, '#fff0c0', 0.28);
    this.spark(x, y, 18, rand(0, TAU), Math.PI);
    for (let i = 0; i < 10; i++) {
      this._emit(x + rand(-14, 14), y + rand(-14, 14), {
        vx: rand(-60, 60), vy: rand(-90, -10),
        life: rand(0.5, 1.0), size: rand(8, 18), size2: rand(22, 40),
        color: 'rgba(90,80,70,0.42)', type: 'smoke', drag: 1.4
      });
    }
  }

  // ---------------- 伤害数字 ----------------
  damageText(x, y, value, crit = false, color = null) {
    if (this.texts.length >= this.textCap) this.texts.shift();
    this.texts.push({
      x: x + rand(-8, 8), y: y - 12,
      vy: crit ? -78 : -56,
      vx: rand(-16, 16),
      life: crit ? 0.95 : 0.75,
      max: crit ? 0.95 : 0.75,
      text: crit ? `${value}!` : `${value}`,
      crit,
      color: color || (crit ? '#ffd166' : '#ffffff')
    });
  }

  /** 屏幕空间飘字（升级、拾取等），世界坐标 */
  label(x, y, text, color = '#6dfba4') {
    if (this.texts.length >= this.textCap) this.texts.shift();
    this.texts.push({
      x, y, vy: -42, vx: 0, life: 1.1, max: 1.1,
      text, crit: false, color, label: true
    });
  }

  update(dt) {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      count++;
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotSpeed * dt;
      if (p.type === 'ring') {
        p.size += (p.size2 - p.size) * Math.min(1, dt * 16);
      }
    }
    this.activeCount = count;

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.vy *= 1 - 2.4 * dt;
    }
  }
}
