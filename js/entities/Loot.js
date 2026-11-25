/**
 * entities/Loot.js — 地面物资（弹药箱 / 医疗包 / 经验晶体 / 武器箱）
 * 拾取逻辑集中在 apply()，保证 UI 提示与实际效果一致。
 */

import { LOOT, BALANCE } from '../config.js';
import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js';
import { pick } from '../core/MathUtils.js';

export const LOOT_META = {
  ammo: { label: '弹药箱', color: '#ffb454', glow: 'rgba(255,180,84,', hint: '补充备用弹药' },
  medkit: { label: '医疗包', color: '#6dfba4', glow: 'rgba(109,251,164,', hint: '恢复 40 点生命' },
  xp: { label: '经验晶体', color: '#4fd6c8', glow: 'rgba(79,214,200,', hint: '获得 20 点经验' },
  weapon: { label: '武器箱', color: '#ff6a55', glow: 'rgba(255,106,85,', hint: '随机获得一把武器' }
};

export class Loot {
  constructor(game, type, x, y) {
    this.game = game;
    this.type = LOOT_META[type] ? type : 'ammo';
    this.x = x;
    this.y = y;
    this.bob = Math.random() * Math.PI * 2;
    this.age = 0;
    this.spawnScale = 0;
    this.picked = false;
    this.radius = 16;
  }

  get meta() {
    return LOOT_META[this.type];
  }

  update(dt) {
    this.age += dt;
    this.bob += dt * LOOT.bobSpeed;
    if (this.spawnScale < 1) this.spawnScale = Math.min(1, this.spawnScale + dt * 3.5);
  }

  get canPickup() {
    return !this.picked && this.spawnScale > 0.35;
  }

  /**
   * 执行拾取，返回给玩家的提示文本。
   */
  apply(game = this.game) {
    if (this.picked) return null;
    this.picked = true;
    const player = game.player;
    let text = '';

    switch (this.type) {
      case 'ammo': {
        const w = player.weapon;
        const got = player.addAmmo(w.ammoPickup);
        if (got <= 0) {
          // 该武器备弹已满 → 退化为少量经验，避免完全浪费
          game.level.addXp(5);
          text = `${w.name}备弹已满 · +5 经验`;
        } else {
          text = `弹药 +${got} · ${w.name}`;
        }
        break;
      }
      case 'medkit': {
        const healed = player.heal(40);
        text = healed > 0 ? `生命 +${Math.round(healed)}` : '生命已满 · 医疗包已回收';
        if (healed <= 0) game.level.addXp(5);
        break;
      }
      case 'xp': {
        game.level.addXp(BALANCE.xpCrystalValue);
        text = `经验 +${BALANCE.xpCrystalValue}`;
        break;
      }
      case 'weapon': {
        const id = pick(WEAPON_ORDER);
        const w = WEAPONS[id];
        const isNew = !player.slots[id].owned;
        player.giveWeapon(id);
        text = isNew ? `获得武器：${w.name}` : `重复武器 · ${w.name} 弹药补充`;
        break;
      }
      default:
        text = '拾取成功';
        break;
    }

    game.audio.play('pickup');
    game.particles.ring(this.x, this.y, 28, this.meta.color, 0.4);
    game.hud.toast(text, this.meta.color);
    return text;
  }
}

/** 按概率表掉落（击杀时调用） */
export function rollDrops(game, zombieType, x, y) {
  const table = LOOT.drops[zombieType] || LOOT.drops.normal;
  for (const entry of table) {
    if (Math.random() < entry.chance) {
      game.spawnLoot(entry.type, x + (Math.random() - 0.5) * 26, y + (Math.random() - 0.5) * 26);
    }
  }
}
