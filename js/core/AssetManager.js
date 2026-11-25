/**
 * core/AssetManager.js — 统一资源接口
 *
 * 本项目美术全部为 Canvas 程序化绘制，但保留完整的外部资源通道：
 *  1. 若 assets/images 下将来放入同名 PNG/WebP，只需在 IMAGE_MANIFEST 里加一行，
 *     Renderer 会优先使用图片（见 Renderer.getSprite）。
 *  2. 图片加载失败不会抛错，会自动回退到程序化绘制，保证游戏可运行。
 *  3. makeSprite() 用于缓存程序化精灵，避免每帧重复路径绘制，同时统一替换入口。
 */

const IMAGE_MANIFEST = {
  // 角色精灵：用 tools/import-sprite.mjs 从白底 AI 图导出（锚点=躯干中心，朝右）
  player: 'assets/images/characters/player.png',
  zombie_normal: 'assets/images/characters/zombie_normal.png',
  zombie_runner: 'assets/images/characters/zombie_runner.png',
  zombie_spitter: 'assets/images/characters/zombie_spitter.png',
  boss: 'assets/images/characters/boss.png',
  // 场景贴图（AI 生成，四向镜像做成无缝）
  floor_tile: 'assets/images/tiles/floor_tile.png',
  asphalt_tile: 'assets/images/tiles/asphalt_tile.png',
  car_h: 'assets/images/props/car_h.png',
  // 'shelf': 'assets/images/props/shelf.png',  // 俯视货架贴图偏浅、按 30 单位厚度拉伸会变形，暂用程序化绘制
  // 'wall_h': 'assets/images/props/wall_h.png', // 同上
  // 物资图标（登记即生效）
  loot_ammo: 'assets/images/loot/loot_ammo.png',
  loot_medkit: 'assets/images/loot/loot_medkit.png',
  loot_xp: 'assets/images/loot/loot_xp.png',
  loot_weapon: 'assets/images/loot/loot_weapon.png',
  // 场景道具
  crate: 'assets/images/props/crate.png',
  trash: 'assets/images/props/trash.png',
  // UI
  portrait_linye: 'assets/images/ui/portrait_linye.png',
  skill_rapid: 'assets/images/ui/skill_rapid.png',
  skill_ammo: 'assets/images/ui/skill_ammo.png',
  skill_crit: 'assets/images/ui/skill_crit.png',
  skill_vitality: 'assets/images/ui/skill_vitality.png',
  skill_reload: 'assets/images/ui/skill_reload.png',
  skill_emp: 'assets/images/ui/skill_emp.png',
  menu_bg: 'assets/images/ui/menu_bg.jpg',
  // 物资图标（登记即生效）
  loot_ammo: 'assets/images/loot/loot_ammo.png',
  loot_medkit: 'assets/images/loot/loot_medkit.png',
  loot_xp: 'assets/images/loot/loot_xp.png',
  loot_weapon: 'assets/images/loot/loot_weapon.png',
  // 场景道具
  crate: 'assets/images/props/crate.png',
  trash: 'assets/images/props/trash.png',
  // UI
  portrait_linye: 'assets/images/ui/portrait_linye.png',
  skill_rapid: 'assets/images/ui/skill_rapid.png',
  skill_ammo: 'assets/images/ui/skill_ammo.png',
  skill_crit: 'assets/images/ui/skill_crit.png',
  skill_vitality: 'assets/images/ui/skill_vitality.png',
  skill_reload: 'assets/images/ui/skill_reload.png',
  skill_emp: 'assets/images/ui/skill_emp.png',
  menu_bg: 'assets/images/ui/menu_bg.jpg',
};

export class AssetManager {
  constructor() {
    this.images = new Map();
    this.sprites = new Map();
    this.buffers = new Map();
    this.failed = [];
    this.ready = false;
  }

  /** 预加载图片（失败仅记录，不阻塞游戏） */
  async preload(manifest = IMAGE_MANIFEST) {
    const entries = Object.entries(manifest);
    await Promise.all(entries.map(([key, url]) => this.loadImage(key, url)));
    this.ready = true;
  }

  loadImage(key, url) {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        this.failed.push({ key, url, reason: 'no Image API' });
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.images.set(key, img);
        resolve(img);
      };
      img.onerror = () => {
        this.failed.push({ key, url, reason: 'load error' });
        resolve(null);
      };
      img.src = url;
    });
  }

  getImage(key) {
    return this.images.get(key) || null;
  }

  /** 获取（必要时生成并缓存）程序化精灵画布 */
  makeSprite(key, w, h, drawFn) {
    if (this.sprites.has(key)) return this.sprites.get(key);
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      drawFn(ctx, canvas.width, canvas.height);
      ctx.restore();
    }
    this.sprites.set(key, canvas);
    return canvas;
  }

  /**
   * 取用于绘制的资源：优先外部图片，其次程序化精灵。
   * @returns {CanvasImageSource|null}
   */
  getSprite(key) {
    return this.getImage(key) || this.sprites.get(key) || null;
  }

  /** 音频：本项目默认使用程序化合成，如有外部音频则优先使用 */
  async loadAudio(key, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.arrayBuffer();
      this.buffers.set(key, arr);
      return arr;
    } catch (err) {
      this.failed.push({ key, url, reason: String(err && err.message) });
      return null;
    }
  }

  getAudio(key) {
    return this.buffers.get(key) || null;
  }

  /** 供设置面板 / 测试报告使用的资源状态 */
  report() {
    return {
      images: [...this.images.keys()],
      sprites: [...this.sprites.keys()],
      failed: this.failed.slice()
    };
  }
}
