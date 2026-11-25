/**
 * entities/Boss.js — 巨型变异体（第一章 BOSS）
 *
 * 行为设计（有前摇、可躲避、有阶段变化）：
 *  - 近身重击：0.55s 前摇 → 25 伤害
 *  - 震地冲击：0.95s 前摇 + 地面预警圈 → 半径 230 内 35 伤害
 *  - 野蛮冲撞：0.6s 蓄力 → 高速直线冲撞，撞墙硬直
 *  - 血量低于 50% 进入狂暴：移速与技能频率提升
 */

import { Zombie } from './Zombie.js';
import { moveWithCollision } from '../core/Collision.js';
import { clamp } from '../core/MathUtils.js';

export class Boss extends Zombie {
  constructor(game, x, y) {
    super(game, 'boss', x, y);
    this.isBoss = true;
    this.spawnTimer = 1.5;          // 出场演出
    this.bossState = 'intro';
    this.stateTimer = 1.5;

    this.specialTimer = 5.0;
    this.chargeTimer = 8.5;
    this.attackTimer = 1.2;

    this.phase2 = false;
    this.telegraph = 0;             // 预警圈透明度（渲染用）
    this.chargeDir = 0;
    this.chargeTime = 0;
    this.chargeHit = false;
    this.slamFlash = 0;
  }

  get bossStateName() {
    return this.bossState;
  }

  update(dt) {
    if (this.dead) return;

    this.wobble += dt * 3.2;
    this.walkPhase += dt * 5;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.showHpTimer = Math.max(0, this.showHpTimer - dt);
    this.slamFlash = Math.max(0, this.slamFlash - dt);

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }

    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) this.bossState = 'chase';
      return;
    }

    // 阶段切换
    if (!this.phase2 && this.hp <= this.maxHp * 0.5) {
      this.phase2 = true;
      this.speed *= 1.4;
      this.specialTimer = Math.min(this.specialTimer, 1.4);
      this.chargeTimer = Math.min(this.chargeTimer, 2.5);
      this.game.audio.play('bossRoar');
      this.game.particles.ring(this.x, this.y, this.radius + 60, '#ff6a55', 0.6);
      this.game.camera.shake(14, 0.5);
      this.game.hud.banner('变异体进入狂暴状态', '#ff6a55');
    }

    // 震屏 / 击退位移
    if (Math.abs(this.kx) > 1 || Math.abs(this.ky) > 1) {
      moveWithCollision(this, this.kx * dt, this.ky * dt, this.radius, this.game.map.obstacles);
      this.kx *= 0.75;
      this.ky *= 0.75;
    }

    const p = this.game.player;
    if (!p || !p.alive) {
      this.wander(dt);
      return;
    }

    this.specialTimer -= dt;
    this.chargeTimer -= dt;
    this.attackTimer -= dt;
    this.stateTimer -= dt;

    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    switch (this.bossState) {
      case 'intro':
        if (this.stateTimer <= 0) this.bossState = 'chase';
        break;
      case 'chase':
        this.chase(dt, d, ang);
        break;
      case 'attackWindup':
        this.angle = ang;
        if (this.stateTimer <= 0) this.doMelee(d, ang);
        break;
      case 'specialWindup':
        this.telegraph = clamp(this.stateTimer / this.data.specialWindup, 0, 1);
        this.angle = ang;
        if (this.stateTimer <= 0) this.doSlam();
        break;
      case 'chargeWindup':
        this.angle = ang;
        if (this.stateTimer <= 0) {
          this.bossState = 'charge';
          this.chargeTime = 0.55;
          this.chargeDir = ang;
          this.chargeHit = false;
          this.game.camera.shake(6, 0.2);
        }
        break;
      case 'charge':
        this.updateCharge(dt);
        break;
      case 'recover':
        if (this.stateTimer <= 0) this.bossState = 'chase';
        break;
      default:
        this.bossState = 'chase';
        break;
    }
  }

  chase(dt, d, ang) {
    const p = this.game.player;
    const contact = this.data.attackRange + p.radius;

    // 与玩家分处建筑内外时先走到门口
    const nav = this.navTarget();
    if (nav.gate) {
      this.moveTowards(Math.atan2(nav.y - this.y, nav.x - this.x), dt, this.speed);
      return;
    }

    if (this.specialTimer <= 0 && d < 430) {
      this.bossState = 'specialWindup';
      this.stateTimer = this.data.specialWindup;
      this.telegraph = 1;
      this.angle = ang;
      this.game.audio.play('bossCharge');
      return;
    }

    if (this.chargeTimer <= 0 && d > 240 && d < 780) {
      this.bossState = 'chargeWindup';
      this.stateTimer = 0.6;
      this.angle = ang;
      this.game.audio.play('bossCharge');
      return;
    }

    if (d <= contact) {
      this.angle = ang;
      if (this.attackTimer <= 0) {
        this.bossState = 'attackWindup';
        this.stateTimer = this.data.attackWindup;
      }
    } else {
      this.moveTowards(ang, dt, this.speed);
    }
  }

  doMelee(d, ang) {
    const p = this.game.player;
    const contact = this.data.attackRange + p.radius + 20;
    const dd = Math.hypot(p.x - this.x, p.y - this.y);
    if (dd <= contact && p.alive) {
      p.takeDamage(this.data.damage, this.game);
      this.game.camera.shake(8, 0.25);
      this.game.particles.blood(p.x, p.y, 8, ang);
      this.game.audio.play('bossHit');
    }
    this.attackTimer = this.data.attackCooldown;
    this.bossState = 'recover';
    this.stateTimer = 0.4;
  }

  doSlam() {
    this.telegraph = 0;
    this.slamFlash = 0.35;
    this.game.combat.bossSlam(this, this.data.specialRadius, this.data.specialDamage);
    this.specialTimer = this.data.specialCooldown * (this.phase2 ? 0.75 : 1);
    this.bossState = 'recover';
    this.stateTimer = 0.65;
  }

  updateCharge(dt) {
    const p = this.game.player;
    this.chargeTime -= dt;
    const spd = this.data.chargeSpeed;
    const before = { x: this.x, y: this.y };
    const res = moveWithCollision(
      this, Math.cos(this.chargeDir) * spd * dt, Math.sin(this.chargeDir) * spd * dt,
      this.radius, this.game.map.obstacles
    );
    this.angle = this.chargeDir;

    // 撞墙 → 硬直 + 震屏
    if (res.hitX || res.hitY) {
      this.game.camera.shake(13, 0.35);
      this.game.particles.debris(before.x, before.y, 10);
      this.game.audio.play('bossHit');
      this.chargeTimer = this.data.chargeCooldown * (this.phase2 ? 0.8 : 1);
      this.bossState = 'recover';
      this.stateTimer = 0.9;
      return;
    }

    // 冲撞命中
    const rr = this.radius + p.radius;
    const ddx = p.x - this.x;
    const ddy = p.y - this.y;
    if (!this.chargeHit && p.alive && ddx * ddx + ddy * ddy < rr * rr) {
      this.chargeHit = true;
      p.takeDamage(this.data.damage + 5, this.game);
      this.game.camera.shake(12, 0.3);
    }

    if (this.chargeTime <= 0) {
      this.chargeTimer = this.data.chargeCooldown * (this.phase2 ? 0.8 : 1);
      this.bossState = 'recover';
      this.stateTimer = 0.6;
    }
  }

  takeDamage(amount, crit = false, angle = 0) {
    const died = super.takeDamage(amount, crit, angle);
    // Boss 抗性：击退减半（super 已按伤害给击退，这里衰减）
    this.kx *= 0.35;
    this.ky *= 0.35;
    if (!died) this.game.camera.shake(2.5, 0.1);
    return died;
  }
}
