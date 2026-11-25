/**
 * systems/LevelSystem.js — 经验与升级曲线
 * 升级所需经验：50 / 100 / 160 / 230 / 320 / 430 / 560 / 710 / 880，之后按 1.15 递增。
 * 每次升级进入“待选择技能”队列，由 Game 暂停游戏并弹出升级面板。
 */

const XP_TABLE = [0, 50, 100, 160, 230, 320, 430, 560, 710, 880];
const MAX_LEVEL = 30;

export function xpNeeded(level) {
  if (level < XP_TABLE.length) return XP_TABLE[level];
  return Math.round(XP_TABLE[XP_TABLE.length - 1] * Math.pow(1.15, level - (XP_TABLE.length - 1)));
}

export class LevelSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this.totalXp = 0;
    this.pendingLevelUps = 0;
    this.maxLevelReached = false;
  }

  get xpToNext() {
    return xpNeeded(this.level);
  }

  get progress() {
    return Math.min(1, this.xp / this.xpToNext);
  }

  addXp(amount) {
    if (amount <= 0) return;
    this.xp += amount;
    this.totalXp += amount;

    while (this.level < MAX_LEVEL && this.xp >= xpNeeded(this.level)) {
      this.xp -= xpNeeded(this.level);
      this.level += 1;
      this.pendingLevelUps += 1;
    }

    if (this.level >= MAX_LEVEL) {
      this.level = MAX_LEVEL;
      this.xp = Math.min(this.xp, xpNeeded(MAX_LEVEL));
    }

    if (this.pendingLevelUps > 0) {
      this.game.requestUpgrade();
    }
  }

  /** 玩家确认选择技能后调用 */
  consumeLevelUp() {
    if (this.pendingLevelUps > 0) this.pendingLevelUps -= 1;
    return this.pendingLevelUps;
  }

  get hasPending() {
    return this.pendingLevelUps > 0;
  }
}
