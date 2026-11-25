/**
 * entities/Bullet.js — 子弹与敌方毒液弹（对象池复用，避免频繁 GC）
 *
 * 每颗子弹记录上一帧位置，命中判定使用线段扫掠，
 * 因此即使速度很高也不会“穿过”墙体或丧尸。
 */

import { segmentRectHit } from '../core/Collision.js';

export class Bullet {
  constructor() {
    this.active = false;
    this.x = 0; this.y = 0;
    this.px = 0; this.py = 0;
    this.vx = 0; this.vy = 0;
    this.damage = 0;
    this.radius = 3;
    this.range = 800;
    this.traveled = 0;
    this.color = '#fff';
    this.crit = false;
    this.life = 0;
    this.wallHit = false;
  }

  spawn(x, y, angle, speed, damage, range, radius, color, crit = false) {
    this.active = true;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.range = range;
    this.radius = radius;
    this.color = color;
    this.crit = crit;
    this.traveled = 0;
    this.life = 0;
    this.wallHit = false;
  }

  /** @returns {boolean} 是否仍然存活 */
  update(dt, obstacles) {
    if (!this.active) return false;
    this.px = this.x;
    this.py = this.y;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    this.life += dt;

    // 墙体命中（线段扫掠）
    for (let i = 0; i < obstacles.length; i++) {
      if (segmentRectHit(this.x, this.y, nx, ny, obstacles[i])) {
        this.x = nx;
        this.y = ny;
        this.active = false;
        this.wallHit = true;
        return false;
      }
    }

    const stepLen = Math.hypot(nx - this.x, ny - this.y);
    this.traveled += stepLen;
    this.x = nx;
    this.y = ny;

    if (this.traveled >= this.range) {
      this.active = false;
      return false;
    }
    return true;
  }

  deactivate() {
    this.active = false;
  }
}

/** 毒液弹：飞行至目标点/命中玩家后生成毒池 */
export class AcidGlob {
  constructor() {
    this.active = false;
    this.x = 0; this.y = 0;
    this.px = 0; this.py = 0;
    this.vx = 0; this.vy = 0;
    this.damage = 8;
    this.radius = 9;
    this.life = 3;
    this.spin = 0;
  }

  spawn(x, y, angle, speed, damage) {
    this.active = true;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.life = 3;
    this.spin = 0;
  }

  update(dt, obstacles) {
    if (!this.active) return false;
    this.px = this.x;
    this.py = this.y;
    this.life -= dt;
    this.spin += dt * 8;
    if (this.life <= 0) {
      this.active = false;
      return false;
    }
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    for (let i = 0; i < obstacles.length; i++) {
      if (segmentRectHit(this.x, this.y, nx, ny, obstacles[i])) {
        this.active = false;
        return false;
      }
    }
    this.x = nx;
    this.y = ny;
    if (this.x < 0 || this.y < 0 || this.x > 2400 || this.y > 1800) {
      this.active = false;
      return false;
    }
    return true;
  }
}
