/**
 * data/skills.js — 技能数据表
 * 每个技能都有真实数值效果，由 SkillSystem 聚合为玩家增益。
 * desc(level) 返回该等级下的效果描述（用于卡片展示“选择后”的数值）。
 */

export const SKILLS = {
  rapid: {
    id: 'rapid',
    name: '狂暴射击',
    icon: '射',
    theme: 'green',
    maxLevel: 5,
    tagline: 'FIRE RATE',
    desc: (lv) => `射速提升 ${lv * 20}%，弹幕更密集。`,
    applyText: (lv) => `射速 +${lv * 20}%`
  },

  ammo: {
    id: 'ammo',
    name: '强化弹药',
    icon: '弹',
    theme: 'amber',
    maxLevel: 5,
    tagline: 'DAMAGE',
    desc: (lv) => `子弹伤害提升 ${lv * 25}%，尸群瞬间融化。`,
    applyText: (lv) => `伤害 +${lv * 25}%`
  },

  crit: {
    id: 'crit',
    name: '致命爆头',
    icon: '暴',
    theme: 'red',
    maxLevel: 5,
    tagline: 'CRIT',
    desc: (lv) => `暴击伤害提升 ${lv * 50}%（基础暴击率 12%）。`,
    applyText: (lv) => `暴击伤害 +${lv * 50}%`
  },

  vitality: {
    id: 'vitality',
    name: '生命强化',
    icon: '命',
    theme: 'green',
    maxLevel: 5,
    tagline: 'VITALITY',
    desc: () => '最大生命值 +30，并立即恢复 30 点生命。',
    applyText: () => '最大生命 +30 / 回血 30'
  },

  reload: {
    id: 'reload',
    name: '快速换弹',
    icon: '换',
    theme: 'cyan',
    maxLevel: 5,
    tagline: 'RELOAD',
    desc: (lv) => `换弹时间缩短 ${Math.round((1 - Math.pow(0.7, lv)) * 100)}%。`,
    applyText: (lv) => `换弹 -${Math.round((1 - Math.pow(0.7, lv)) * 100)}%`
  },

  emp: {
    id: 'emp',
    name: '电磁脉冲',
    icon: '磁',
    theme: 'cyan',
    maxLevel: 3,
    tagline: 'Q · ACTIVE',
    desc: (lv) => `解锁/强化 Q 技能：范围 ${EMP_RADIUS(lv)} 内造成 ${EMP_DAMAGE(lv)} 伤害并减速 45%。`,
    applyText: (lv) => `范围伤害 ${EMP_DAMAGE(lv)}`
  }
};

/** 电磁脉冲数值曲线 */
export function EMP_DAMAGE(level) {
  return [0, 70, 120, 190][Math.min(level, 3)] || 0;
}
export function EMP_RADIUS(level) {
  return [0, 190, 230, 280][Math.min(level, 3)] || 0;
}

/** EMP 通用参数 */
export const EMP = {
  cooldown: 14,
  slowFactor: 0.45,
  slowTime: 2.6,
  knockback: 140
};

/** 可选技能 id 列表（用于随机抽取） */
export const SKILL_IDS = Object.keys(SKILLS);
