/**
 * entities/Zombie.js — 丧尸 AI（普通 / 疾跑 / 毒液）
 *
 * AI 结构：
 *  1. 距离判定 → 追击 / 保持距离 / 进入攻击前摇
 *  2. 转向：直线路径被障碍物挡住时，向两侧试探射线，选择可通行方向（简单绕行）
 *  3. 卡住检测：1.1 秒内位移过小 → 强制侧向绕行 0.55 秒
 *  4. 攻击有前摇与冷却，前摇期间不移动，给玩家反应时间
 */

import { AI } from '../config.js';
import { ZOMBIES } from '../data/zombies.js';
import { moveWithCollision, segmentObstacleHit } from '../core/Collision.js';
import { rand, clamp, approachAngle, TAU } from '../core/MathUtils.js';

export class Zombie {
  constructor(game, typeId, x, y) {
    this.game = game;
    this.init(typeId, x, y);
  }

  init(typeId, x, y) {
    const d = ZOMBIES[typeId] || ZOMBIES.normal;
    this.typeId = d.id;
    this.data = d;

    this.x = x;
    this.y = y;
    this.radius = d.radius;
    this.hp = d.hp;
    this.maxHp = d.hp;
    this.speed = d.speed;

    this.angle = rand(0, TAU);
    this.state = 'chase';

    this.attackTimer = rand(0.25, 1.0);
    this.windup = 0;
    this.windupMax = 0;

    this.spawnTimer = 0.5;      // 出生保护/渐显
    this.hitFlash = 0;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.dead = false;

    this.kx = 0;
    this.ky = 0;

    this.stuckTimer = 0;
    this.lastX = x;
    this.lastY = y;
    this.avoidTimer = 0;
    this.avoidSign = Math.random() < 0.5 ? -1 : 1;

    this.wobble = rand(0, TAU);
    this.walkPhase = rand(0, TAU);
    this.showHpTimer = 0;
  }

  get spawnProgress() {
    return 1 - clamp(this.spawnTimer / 0.5, 0, 1);
  }

  // ---------------- 主更新 ----------------
  update(dt) {
    if (this.dead) return;
    this.wobble += dt * 5;
    this.walkPhase += dt * 8;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.showHpTimer = Math.max(0, this.showHpTimer - dt);

    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      return;
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }

    // 击退位移
    if (Math.abs(this.kx) > 1 || Math.abs(this.ky) > 1) {
      moveWithCollision(this, this.kx * dt, this.ky * dt, this.radius, this.game.map.obstacles);
      this.kx *= 0.82;
      this.ky *= 0.82;
    } else {
      this.kx = 0;
      this.ky = 0;
    }

    const p = this.game.player;
    if (!p || !p.alive) {
      this.wander(dt);
      return;
    }

    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    if (d > AI.loseSightRadius) {
      this.wander(dt);
      return;
    }

    this.attackTimer -= dt;
    const spd = this.speed * this.slowFactor;

    // 跨区（店内 / 店外）时先奔向最近门口，避免对着墙体“顶墙”
    const nav = this.navTarget();
    if (nav.gate) {
      this.moveTowards(Math.atan2(nav.y - this.y, nav.x - this.x), dt, spd);
      this.state = 'chase';
      return;
    }

    if (this.typeId === 'spitter') this.updateSpitter(dt, d, ang, spd);
    else this.updateMelee(dt, d, ang, spd);
  }

  /** 是否位于超市建筑内部 */
  isInsideBuilding(x = this.x, y = this.y) {
    const b = this.game.map.building;
    return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
  }

  /**
   * 导航目标：与玩家不在同一区域时先前往最近门口。
   * @returns {{x:number,y:number,gate:boolean}}
   */
  navTarget() {
    const p = this.game.player;
    if (this.isInsideBuilding() !== this.isInsideBuilding(p.x, p.y)) {
      const gates = this.game.map.gates || [];
      let best = null;
      let bd = Infinity;
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        const d = (g.x - this.x) * (g.x - this.x) + (g.y - this.y) * (g.y - this.y);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (best) return { x: best.x, y: best.y, gate: true };
    }
    return { x: p.x, y: p.y, gate: false };
  }

  wander(dt) {
    this.angle += Math.sin(this.wobble * 0.6) * dt * 0.6;
    const spd = this.speed * 0.25 * this.slowFactor;
    this.moveTowards(this.angle, dt, spd);
  }

  // ---------------- 近战 AI ----------------
  updateMelee(dt, d, ang, spd) {
    const p = this.game.player;
    const contact = this.data.attackRange + p.radius;

    if (this.state === 'windup') {
      this.windup -= dt;
      if (this.windup <= 0) {
        const dd = Math.hypot(p.x - this.x, p.y - this.y);
        if (dd <= contact + 12 && p.alive) {
          p.takeDamage(this.data.damage, this.game);
          this.game.particles.blood(p.x, p.y, 5, ang);
          this.game.audio.play('zombieHit');
        }
        this.state = 'chase';
        this.attackTimer = this.data.attackCooldown;
      }
      return;
    }

    if (d <= contact) {
      this.angle = approachAngle(this.angle, ang, 12 * dt);
      if (this.attackTimer <= 0) {
        this.state = 'windup';
        this.windupMax = this.data.attackWindup;
        this.windup = this.windupMax;
      }
    } else {
      this.moveTowards(ang, dt, spd);
    }
  }

  // ---------------- 远程 AI（毒液丧尸） ----------------
  updateSpitter(dt, d, ang, spd) {
    const p = this.game.player;

    if (this.state === 'windup') {
      this.windup -= dt;
      if (this.windup <= 0) {
        if (p.alive) {
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          this.game.combat.spawnAcid(this.x + Math.cos(a) * (this.radius + 6), this.y + Math.sin(a) * (this.radius + 6), a, this.data.projectileSpeed, this.data.projectileDamage);
          this.game.audio.play('spit');
        }
        this.state = 'chase';
        this.attackTimer = this.data.attackCooldown;
      }
      return;
    }

    const keep = this.data.keepDistance;
    if (d < keep * 0.7) {
      // 太近 → 后退
      this.moveTowards(ang + Math.PI, dt, spd * 1.05);
    } else if (d > this.data.attackRange) {
      this.moveTowards(ang, dt, spd);
    } else if (this.attackTimer <= 0) {
      this.state = 'windup';
      this.windupMax = this.data.attackWindup;
      this.windup = this.windupMax;
      this.angle = ang;
      this.game.particles.ring(this.x, this.y, this.radius + 14, '#a6ff6a', 0.3);
    } else {
      // 侧向游走，避免站桩
      this.moveTowards(ang + Math.PI / 2 * this.avoidSign, dt, spd * 0.7);
    }
  }

  // ---------------- 移动与绕行 ----------------
  moveTowards(desiredAngle, dt, speed) {
    const dir = this.steer(desiredAngle, dt);
    const step = speed * dt;
    const ox = this.x;
    const oy = this.y;
    moveWithCollision(this, Math.cos(dir) * step, Math.sin(dir) * step, this.radius, this.game.map.obstacles);
    this.angle = approachAngle(this.angle, dir, 9 * dt);

    // 卡住检测
    this.stuckTimer += dt;
    if (this.stuckTimer >= AI.stuckCheckTime) {
      const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
      if (moved < 16) {
        this.avoidTimer = AI.stuckRetryTime;
        this.avoidSign = Math.random() < 0.5 ? -1 : 1;
      }
      this.stuckTimer = 0;
      this.lastX = this.x;
      this.lastY = this.y;
    }
    if (ox === this.x && oy === this.y) {
      // 完全被挡住，缩短检测窗口
      this.stuckTimer += dt * 1.5;
    }
  }

  /** 直线被墙挡住时向两侧试探（最多 10 次射线） */
  steer(desiredAngle, dt) {
    if (this.avoidTimer > 0) {
      this.avoidTimer -= dt;
      desiredAngle += this.avoidSign * Math.PI * 0.5;
    }

    const look = this.radius + 52;
    if (!this.rayBlocked(desiredAngle, look)) return desiredAngle;

    const offsets = [0.38, -0.38, 0.75, -0.75, 1.15, -1.15, 1.55, -1.55, 1.95, -1.95];
    for (let i = 0; i < offsets.length; i++) {
      const a = desiredAngle + offsets[i];
      if (!this.rayBlocked(a, look * 0.9)) return a;
    }
    return desiredAngle + this.avoidSign * 1.3;
  }

  rayBlocked(angle, len) {
    const x2 = this.x + Math.cos(angle) * len;
    const y2 = this.y + Math.sin(angle) * len;
    return segmentObstacleHit(this.x, this.y, x2, y2, this.game.map.obstacles) !== null;
  }

  // ---------------- 受伤 ----------------
  /**
   * @returns {boolean} 是否致死
   */
  takeDamage(amount, crit = false, angle = 0) {
    if (this.dead || this.spawnTimer > 0) return false;
    this.hp -= amount;
    this.hitFlash = 0.16;
    this.showHpTimer = 1.6;

    const kb = clamp(amount * 0.8, 8, 60);
    this.kx += Math.cos(angle) * kb * (crit ? 1.5 : 1);
    this.ky += Math.sin(angle) * kb * (crit ? 1.5 : 1);

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  applySlow(factor, time) {
    this.slowFactor = Math.min(this.slowFactor, factor);
    this.slowTimer = Math.max(this.slowTimer, time);
  }
}
