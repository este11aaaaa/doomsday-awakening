/**
 * entities/Player.js — 主角「林夜」
 * 负责：移动（斜向归一化）、朝向、射击节流、换弹、受伤/无敌、武器背包、技能数值聚合。
 */

import { PLAYER, BALANCE } from '../config.js';
import { WEAPONS, DEFAULT_WEAPON, weaponBySlot } from '../data/weapons.js';
import { moveWithCollision } from '../core/Collision.js';
import { clamp, approachAngle } from '../core/MathUtils.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.reset();
  }

  reset() {
    const s = this.map.playerStart;
    this.x = s.x;
    this.y = s.y;
    this.radius = PLAYER.radius;
    this.speed = PLAYER.speed;
    this.angle = -Math.PI / 2;
    this.aimAngle = -Math.PI / 2;

    this.maxHp = PLAYER.maxHp;
    this.hp = PLAYER.maxHp;
    this.alive = true;
    this.invuln = 0;

    this.fireTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = 1;

    this.hurtFlash = 0;
    this.muzzleTimer = 0;
    this.recoil = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.footstepTimer = 0;
    this.switchLock = 0;

    // 武器背包
    this.slots = {};
    for (const id of Object.keys(WEAPONS)) {
      const w = WEAPONS[id];
      this.slots[id] = {
        owned: id === DEFAULT_WEAPON,
        mag: id === DEFAULT_WEAPON ? w.magSize : 0,
        reserve: id === DEFAULT_WEAPON ? w.reserve : 0
      };
    }
    this.currentWeaponId = DEFAULT_WEAPON;
    this.lastWeaponId = DEFAULT_WEAPON;
    this.refreshStats();
    this.hp = this.maxHp;
  }

  // ---------------- 数值（技能生效点） ----------------
  refreshStats() {
    const sk = this.game.skills;
    this.maxHp = PLAYER.maxHp + (sk ? sk.bonusMaxHp : 0);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  get weapon() {
    return WEAPONS[this.currentWeaponId];
  }

  get slot() {
    return this.slots[this.currentWeaponId];
  }

  getFireInterval() {
    const sk = this.game.skills;
    const mult = sk ? sk.fireRateMult : 1;
    return 1 / (this.weapon.rps * mult);
  }

  getDamage() {
    const sk = this.game.skills;
    return this.weapon.damage * (sk ? sk.damageMult : 1);
  }

  getReloadTime() {
    const sk = this.game.skills;
    const mult = sk ? sk.reloadMult : 1;
    return Math.max(0.3, this.weapon.reloadTime * mult);
  }

  getCritChance() {
    const sk = this.game.skills;
    return clamp(BALANCE.critChance + (sk ? sk.critChanceBonus : 0), 0, 0.85);
  }

  getCritMultiplier() {
    const sk = this.game.skills;
    return BALANCE.critMultiplier + (sk ? sk.critDamageBonus : 0);
  }

  // ---------------- 每帧更新 ----------------
  update(dt, input, camera) {
    if (!this.alive) return;

    // 计时器
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.switchLock = Math.max(0, this.switchLock - dt);

    // 换弹
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }

    // 移动
    const mv = input.getMoveVector();
    this.moving = mv.active;
    if (mv.active) {
      const dx = mv.x * this.speed * dt;
      const dy = mv.y * this.speed * dt;
      moveWithCollision(this, dx, dy, this.radius, this.map.obstacles);
      this.walkPhase += dt * 11;

      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.24;
        this.game.particles.dust(this.x, this.y + this.radius * 0.6, 1);
      }
    } else {
      this.walkPhase += dt * 2;
    }

    // 世界边界
    this.x = clamp(this.x, this.radius, this.map.width - this.radius);
    this.y = clamp(this.y, this.radius, this.map.height - this.radius);

    // 朝向跟随瞄准（触屏做平滑，鼠标即时）
    const aim = input.getAim(this.x, this.y, camera);
    if (aim.fromTouch) {
      this.aimAngle = approachAngle(this.aimAngle, aim.angle, 16 * dt);
    } else {
      this.aimAngle = aim.angle;
    }
    this.angle = this.aimAngle;
  }

  // ---------------- 射击 / 换弹 ----------------
  canFire() {
    if (!this.alive || this.reloading || this.switchLock > 0) return false;
    if (this.fireTimer > 0) return false;
    if (this.slot.mag <= 0) return false;
    return true;
  }

  /** 扣弹 + 设置射击间隔 + 后坐力；实际子弹由 CombatSystem 生成 */
  consumeShot() {
    this.slot.mag = Math.max(0, this.slot.mag - 1);
    this.fireTimer = this.getFireInterval();
    this.muzzleTimer = 0.06;
    this.recoil = 1;
    if (this.slot.mag === 0) {
      // 打空自动换弹（有备弹时）
      if (this.slot.reserve > 0) this.startReload();
      else this.game.audio.play('empty');
    }
  }

  startReload() {
    if (!this.alive || this.reloading) return false;
    const w = this.weapon;
    const s = this.slot;
    if (s.mag >= w.magSize || s.reserve <= 0) return false;
    this.reloading = true;
    this.reloadDuration = this.getReloadTime();
    this.reloadTimer = this.reloadDuration;
    this.game.audio.play('reload');
    return true;
  }

  finishReload() {
    const w = this.weapon;
    const s = this.slot;
    const need = w.magSize - s.mag;
    const take = Math.min(need, s.reserve);
    s.mag += take;
    s.reserve -= take;
    this.reloading = false;
    this.reloadTimer = 0;
    this.game.particles?.ring(this.x, this.y, this.radius + 10, '#6dfba4', 0.28);
  }

  switchWeapon(id) {
    if (!id || id === this.currentWeaponId) return false;
    if (!this.slots[id] || !this.slots[id].owned) return false;
    this.lastWeaponId = this.currentWeaponId;
    this.currentWeaponId = id;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireTimer = Math.max(this.fireTimer, 0.18);
    this.switchLock = 0.18;
    this.game.audio.play('switch');
    return true;
  }

  switchBySlot(slot) {
    const w = weaponBySlot(slot);
    return w ? this.switchWeapon(w.id) : false;
  }

  /** 左侧/右侧循环切换（触屏按钮使用） */
  cycleWeapon() {
    const owned = Object.keys(WEAPONS).filter((id) => this.slots[id].owned);
    if (owned.length <= 1) return false;
    const idx = owned.indexOf(this.currentWeaponId);
    return this.switchWeapon(owned[(idx + 1) % owned.length]);
  }

  giveWeapon(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    const s = this.slots[id];
    const isNew = !s.owned;
    s.owned = true;
    s.mag = w.magSize;
    s.reserve = Math.min(w.reserveMax, s.reserve + Math.round(w.reserve * 0.5));
    this.switchWeapon(id);
    return isNew;
  }

  addAmmo(amount, id = this.currentWeaponId) {
    const w = WEAPONS[id];
    const s = this.slots[id];
    if (!w || !s || !s.owned) return 0;
    const before = s.reserve;
    s.reserve = Math.min(w.reserveMax, s.reserve + amount);
    return s.reserve - before;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
    return this.hp - before;
  }

  // ---------------- 受伤 / 死亡 ----------------
  takeDamage(amount, game = this.game) {
    if (!this.alive || this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = PLAYER.invulnTime;
    this.hurtFlash = 0.35;
    game.onPlayerHurt(amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      game.onPlayerDeath();
    }
    return true;
  }

  /** 供 HUD 使用 */
  getSnapshot() {
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      mag: this.slot.mag,
      reserve: this.slot.reserve,
      weapon: this.weapon,
      reloading: this.reloading,
      reloadProgress: this.reloading ? 1 - this.reloadTimer / Math.max(0.001, this.reloadDuration) : 0
    };
  }
}
