/**
 * systems/CombatSystem.js — 战斗核心：射击、子弹、命中判定、伤害数字、毒液、EMP、Boss 震地
 * 子弹与敌方弹体全部使用对象池，上限见 config.LIMITS。
 */

import { Bullet, AcidGlob } from '../entities/Bullet.js';
import { LIMITS } from '../config.js';
import { ZOMBIES } from '../data/zombies.js';
import { rand, TAU, dist } from '../core/MathUtils.js';

/** 线段与圆是否相交（用于高速子弹的连续碰撞） */
function segCircleHit(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0.0001) t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  const ddx = cx - px;
  const ddy = cy - py;
  return ddx * ddx + ddy * ddy <= r * r;
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.bullets = new Array(LIMITS.bullets);
    for (let i = 0; i < LIMITS.bullets; i++) this.bullets[i] = new Bullet();
    this.bulletCursor = 0;

    this.acids = new Array(LIMITS.enemyProjectiles);
    for (let i = 0; i < LIMITS.enemyProjectiles; i++) this.acids[i] = new AcidGlob();
    this.acidCursor = 0;

    this.hazards = [];

    this.stats = this._freshStats();
    this.hitSfxTimer = 0;
  }

  _freshStats() {
    return { shots: 0, hits: 0, crits: 0, kills: 0, damage: 0 };
  }

  reset() {
    for (const b of this.bullets) b.active = false;
    for (const a of this.acids) a.active = false;
    this.hazards.length = 0;
    this.bulletCursor = 0;
    this.acidCursor = 0;
    this.stats = this._freshStats();
    this.hitSfxTimer = 0;
  }

  /** 取一颗子弹（池满时覆盖最旧） */
  _getBullet() {
    const arr = this.bullets;
    for (let i = 0; i < arr.length; i++) {
      const idx = (this.bulletCursor + i) % arr.length;
      if (!arr[idx].active) {
        this.bulletCursor = (idx + 1) % arr.length;
        return arr[idx];
      }
    }
    const b = arr[this.bulletCursor];
    this.bulletCursor = (this.bulletCursor + 1) % arr.length;
    return b;
  }

  // ---------------- 玩家射击 ----------------
  fireWeapon(player, angle) {
    if (!player.alive) return;
    if (player.reloading) return;
    if (player.slot.mag <= 0) {
      player.startReload();
      return;
    }
    if (!player.canFire()) return;

    const w = player.weapon;
    player.consumeShot();

    const muzzleDist = player.radius + 13;
    const mx = player.x + Math.cos(angle) * muzzleDist;
    const my = player.y + Math.sin(angle) * muzzleDist;

    const baseDamage = player.getDamage();
    const critChance = player.getCritChance();
    const critMult = player.getCritMultiplier();

    for (let i = 0; i < w.pellets; i++) {
      const crit = Math.random() < critChance;
      const dmg = Math.max(1, Math.round(baseDamage * (crit ? critMult : 1)));
      const a = angle + rand(-w.spread, w.spread);
      const b = this._getBullet();
      b.spawn(
        mx, my, a,
        w.bulletSpeed * rand(0.96, 1.04),
        dmg,
        w.range * rand(0.94, 1.06),
        w.bulletRadius,
        w.tracer,
        crit
      );
      this.stats.shots++;
    }

    this.game.particles.muzzle(mx, my, angle, w.muzzle);
    this.game.camera.shake(w.shake * (this.game.device.touch ? 0.55 : 1), 0.1);
    this.game.audio.play(w.sfx);
  }

  // ---------------- 每帧更新 ----------------
  update(dt) {
    const game = this.game;
    const player = game.player;
    const obstacles = game.bulletBlockers || game.map.obstacles;
    this.hitSfxTimer = Math.max(0, this.hitSfxTimer - dt);

    // ---- 玩家子弹 ----
    const bullets = this.bullets;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) continue;

      const alive = b.update(dt, obstacles);
      if (b.wallHit) {
        game.particles.spark(b.x, b.y, 3, Math.atan2(-b.vy, -b.vx), 0.9);
        b.wallHit = false;
        continue;
      }
      if (!alive) continue;

      // 与丧尸碰撞（先做廉价包围盒剔除）
      const zombies = game.zombies;
      for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        if (z.dead || z.spawnTimer > 0) continue;
        const rr = z.radius + b.radius + 2;
        if (Math.abs(z.x - b.x) > rr + 40 && Math.abs(b.px - b.x) > 40) {
          if (Math.abs(z.x - b.x) > rr + Math.abs(b.x - b.px)) continue;
        }
        if (!segCircleHit(b.px, b.py, b.x, b.y, z.x, z.y, rr)) continue;

        const hitAngle = Math.atan2(b.vy, b.vx);
        const died = z.takeDamage(b.damage, b.crit, hitAngle);
        this.stats.hits++;
        this.stats.damage += b.damage;
        if (b.crit) this.stats.crits++;

        game.particles.blood(b.x, b.y, b.crit ? 9 : 4, hitAngle);
        game.particles.damageText(z.x, z.y - z.radius * 0.8, b.damage, b.crit);
        if (b.crit) game.particles.ring(b.x, b.y, 24, '#ffd166', 0.22);

        if (this.hitSfxTimer <= 0) {
          game.audio.play('flesh');
          this.hitSfxTimer = 0.05;
        }

        b.active = false;
        if (died) game.onZombieKilled(z);
        break;
      }
    }

    // ---- 毒液弹 ----
    const acids = this.acids;
    for (let i = 0; i < acids.length; i++) {
      const g = acids[i];
      if (!g.active) continue;
      const wasAlive = g.update(dt, obstacles);
      if (g.active && player.alive && segCircleHit(g.px, g.py, g.x, g.y, player.x, player.y, player.radius + g.radius)) {
        player.takeDamage(g.damage, game);
        g.active = false;
        game.particles.acidSplash(g.x, g.y);
        this.spawnHazard(g.x, g.y);
        continue;
      }
      if (!wasAlive) {
        game.particles.acidSplash(g.x, g.y);
        this.spawnHazard(g.x, g.y);
      }
    }

    // ---- 毒池 ----
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.hazards.splice(i, 1);
        continue;
      }
      h.tick -= dt;
      h.pulse += dt * 3;
      if (h.tick <= 0) {
        h.tick = 0.65;
        if (player.alive && dist(player.x, player.y, h.x, h.y) < h.r + player.radius * 0.6) {
          player.takeDamage(ZOMBIES.spitter.poolDamage, game);
          game.particles.blood(player.x, player.y, 3, rand(0, TAU));
        }
      }
    }
  }

  spawnAcid(x, y, angle, speed, damage) {
    const arr = this.acids;
    for (let i = 0; i < arr.length; i++) {
      const idx = (this.acidCursor + i) % arr.length;
      if (!arr[idx].active) {
        this.acidCursor = (idx + 1) % arr.length;
        arr[idx].spawn(x, y, angle, speed, damage);
        return arr[idx];
      }
    }
    const g = arr[this.acidCursor];
    this.acidCursor = (this.acidCursor + 1) % arr.length;
    g.spawn(x, y, angle, speed, damage);
    return g;
  }

  spawnHazard(x, y) {
    const cfg = ZOMBIES.spitter;
    if (this.hazards.length >= LIMITS.hazards) this.hazards.shift();
    this.hazards.push({
      x, y, r: cfg.poolRadius, life: cfg.poolLife, max: cfg.poolLife,
      tick: 0.2, pulse: 0
    });
    this.game.particles.ring(x, y, cfg.poolRadius, '#a6e05a', 0.45);
    this.game.audio.play('acid');
  }

  // ---------------- 主动技能：EMP ----------------
  empBurst(x, y, radius, damage, slowFactor, slowTime) {
    const game = this.game;
    const zombies = game.zombies;
    let hits = 0;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.dead) continue;
      const d = dist(x, y, z.x, z.y);
      if (d > radius + z.radius) continue;
      const a = Math.atan2(z.y - y, z.x - x);
      z.applySlow(slowFactor, slowTime);
      z.kx += Math.cos(a) * 120;
      z.ky += Math.sin(a) * 120;
      const died = z.takeDamage(damage, false, a);
      game.particles.damageText(z.x, z.y - z.radius, damage, false, '#8ff0ff');
      game.particles.spark(z.x, z.y, 4, a, 1.4);
      hits++;
      if (died) game.onZombieKilled(z);
    }

    game.particles.ring(x, y, radius, '#4fd6c8', 0.55);
    game.particles.ring(x, y, radius * 0.6, '#c9fff8', 0.35);
    game.particles.spark(x, y, 22, rand(0, TAU), Math.PI);
    game.camera.shake(11, 0.35);
    game.audio.play('emp');
    game.hud.banner(hits > 0 ? `电磁脉冲命中 ${hits} 个目标` : '电磁脉冲释放', '#4fd6c8');
    return hits;
  }

  // ---------------- Boss 震地 ----------------
  bossSlam(boss, radius, damage) {
    const game = this.game;
    game.particles.explosion(boss.x, boss.y, radius * 0.75);
    game.particles.ring(boss.x, boss.y, radius, '#ff5a45', 0.5);
    game.camera.shake(16, 0.45);
    game.audio.play('bossSlam');

    const p = game.player;
    if (p.alive && dist(p.x, p.y, boss.x, boss.y) < radius) {
      p.takeDamage(damage, game);
    }
  }

  /** 当前活跃子弹数（HUD/测试用） */
  get activeBulletCount() {
    let n = 0;
    for (const b of this.bullets) if (b.active) n++;
    return n;
  }
}
