/**
 * data/weapons.js — 武器数据表（集中管理，便于数值调优）
 * 单位：伤害/点，时间/秒，速度/世界单位每秒，散布/弧度
 */

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: '制式手枪',
    shortName: '手枪',
    slot: 1,
    magSize: 12,
    damage: 25,
    rps: 3,
    reloadTime: 1.2,
    pellets: 1,
    spread: 0.018,
    bulletSpeed: 1380,
    range: 760,
    bulletRadius: 3.6,
    pierce: 0,
    reserve: 72,
    reserveMax: 144,
    ammoPickup: 24,
    shake: 2.4,
    recoil: 26,
    tracer: '#ffd27a',
    muzzle: 16,
    sfx: 'pistol',
    desc: '精准稳定，弹药充足，节奏可靠。'
  },

  rifle: {
    id: 'rifle',
    name: '突击步枪',
    shortName: '步枪',
    slot: 2,
    magSize: 30,
    damage: 18,
    rps: 8,
    reloadTime: 1.5,
    pellets: 1,
    spread: 0.038,
    bulletSpeed: 1560,
    range: 900,
    bulletRadius: 3.2,
    pierce: 0,
    reserve: 120,
    reserveMax: 300,
    ammoPickup: 45,
    shake: 3.1,
    recoil: 22,
    tracer: '#fff0b8',
    muzzle: 19,
    sfx: 'rifle',
    desc: '高射速全自动，尸群收割主力。'
  },

  shotgun: {
    id: 'shotgun',
    name: '战术霰弹枪',
    shortName: '霰弹枪',
    slot: 3,
    magSize: 6,
    damage: 12,
    pellets: 5,
    rps: 1,
    reloadTime: 2,
    spread: 0.2,
    bulletSpeed: 1240,
    range: 520,
    bulletRadius: 4.2,
    pierce: 0,
    reserve: 24,
    reserveMax: 60,
    ammoPickup: 10,
    shake: 8.5,
    recoil: 90,
    tracer: '#ffc07a',
    muzzle: 28,
    sfx: 'shotgun',
    desc: '近距离爆发极高，一发撕开整排丧尸。'
  }
};

/** 武器解锁/切换顺序 */
export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun'];

/** 默认武器（开局） */
export const DEFAULT_WEAPON = 'rifle';

/** 按 slot 键位查找武器 */
export function weaponBySlot(slot) {
  return WEAPON_ORDER.find((id) => WEAPONS[id].slot === slot) || null;
}
