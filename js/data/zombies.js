/**
 * data/zombies.js — 敌人数据表
 * hp/speed/damage/xp 为策划基础值；radius 为碰撞半径（世界单位）
 */

export const ZOMBIES = {
  normal: {
    id: 'normal',
    name: '普通丧尸',
    hp: 45,
    speed: 65,
    damage: 10,
    xp: 10,
    radius: 15,
    attackRange: 30,
    attackCooldown: 1.05,
    attackWindup: 0.32,
    bodyColor: '#7d9a6a',
    headColor: '#9cb887',
    clothColor: '#464e48',
    rageSpeed: 1.0,
    score: 1
  },

  runner: {
    id: 'runner',
    name: '疾跑丧尸',
    hp: 35,
    speed: 140,
    damage: 15,
    xp: 20,
    radius: 13,
    attackRange: 28,
    attackCooldown: 0.8,
    attackWindup: 0.2,
    bodyColor: '#a07a52',
    headColor: '#bd9368',
    clothColor: '#64432f',
    rageSpeed: 1.08,
    score: 1
  },

  spitter: {
    id: 'spitter',
    name: '毒液丧尸',
    hp: 90,
    speed: 45,
    damage: 8,
    xp: 50,
    radius: 16,
    attackRange: 330,       // 远程攻击距离
    keepDistance: 230,      // 保持距离
    attackCooldown: 2.6,
    attackWindup: 0.5,
    projectileSpeed: 300,
    projectileDamage: 8,
    poolDamage: 7,          // 毒池每秒伤害
    poolRadius: 62,
    poolLife: 4.5,
    bodyColor: '#8aa860',
    headColor: '#a9c87a',
    clothColor: '#485430',
    rageSpeed: 1.0,
    score: 2
  },

  boss: {
    id: 'boss',
    name: '巨型变异体',
    hp: 1800,
    speed: 55,
    damage: 25,
    xp: 200,
    radius: 46,
    attackRange: 78,
    attackCooldown: 1.5,
    attackWindup: 0.55,
    specialDamage: 35,
    specialRadius: 230,
    specialCooldown: 6.5,
    specialWindup: 0.95,
    chargeSpeed: 260,
    chargeCooldown: 9,
    score: 10,
    bodyColor: '#7d3a3a',
    headColor: '#9c4a45',
    clothColor: '#2f2626'
  }
};

/** 敌人出场顺序/权重在 config.WAVES 中定义，这里只提供查询 */
export function getZombieType(id) {
  return ZOMBIES[id] || ZOMBIES.normal;
}
