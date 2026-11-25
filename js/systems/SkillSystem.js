/**
 * systems/SkillSystem.js — 技能等级、属性聚合、EMP 主动技能
 * 技能效果必须真实作用于战斗数值（玩家/武器读取这里的系数）。
 */

import { SKILLS, SKILL_IDS, EMP, EMP_DAMAGE, EMP_RADIUS } from '../data/skills.js';
import { shuffle } from '../core/MathUtils.js';

export class SkillSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.levels = {};
    for (const id of SKILL_IDS) this.levels[id] = 0;
    this.empCooldown = 0;
    this.empReadyFlash = 0;
    this.recompute();
  }

  get totalLevels() {
    return SKILL_IDS.reduce((sum, id) => sum + this.levels[id], 0);
  }

  canLevel(id) {
    const def = SKILLS[id];
    if (!def) return false;
    return this.levels[id] < def.maxLevel;
  }

  /** 随机抽取 n 个可升级技能（不重复） */
  rollChoices(n = 3) {
    const pool = SKILL_IDS.filter((id) => this.canLevel(id));
    shuffle(pool);
    return pool.slice(0, n);
  }

  /** 应用技能：真实数值变化 */
  apply(id) {
    if (!this.canLevel(id)) return false;
    this.levels[id] += 1;
    const lv = this.levels[id];
    this.recompute();

    // 即时效果
    if (id === 'vitality') {
      this.game.player.refreshStats();
      this.game.player.heal(30);
    }
    if (id === 'emp' && lv === 1) {
      this.game.hud.toast('Q 技能已解锁：电磁脉冲', '#4fd6c8');
    }
    this.game.audio.play('levelup');
    this.game.player.refreshStats();
    return true;
  }

  /** 把等级换算成战斗系数（被 Player / Combat 读取） */
  recompute() {
    const L = this.levels;
    this.fireRateMult = 1 + 0.2 * L.rapid;
    this.damageMult = 1 + 0.25 * L.ammo;
    this.critDamageBonus = 0.5 * L.crit;
    this.critChanceBonus = 0.02 * L.crit;
    this.reloadMult = Math.pow(0.7, L.reload);
    this.bonusMaxHp = 30 * L.vitality;
    this.empLevel = L.emp;
    this.empDamage = EMP_DAMAGE(L.emp);
    this.empRadius = EMP_RADIUS(L.emp);
  }

  update(dt) {
    if (this.empCooldown > 0) this.empCooldown = Math.max(0, this.empCooldown - dt);
    if (this.empReadyFlash > 0) this.empReadyFlash = Math.max(0, this.empReadyFlash - dt);
  }

  /** 释放 EMP（Q） */
  tryCastEmp() {
    if (this.empLevel <= 0) {
      this.game.hud.toast('尚未解锁电磁脉冲（升级时选择）', '#8fa294');
      return false;
    }
    if (this.empCooldown > 0) {
      this.game.hud.toast(`电磁脉冲冷却中 ${this.empCooldown.toFixed(1)}s`, '#8fa294');
      return false;
    }
    this.empCooldown = EMP.cooldown;
    const p = this.game.player;
    this.game.combat.empBurst(p.x, p.y, this.empRadius, this.empDamage, EMP.slowFactor, EMP.slowTime);
    return true;
  }
}
