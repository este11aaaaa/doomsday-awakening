/**
 * config.js — 全局配置（唯一的数值/常量出口）
 * 所有模块都从这里读取调参，避免数字散落在各处。
 */

/** 世界尺寸（世界坐标单位 = 1px @ zoom 1） */
export const WORLD = {
  width: 2400,
  height: 1800,
  name: '废弃超市'
};

/** 统一色板：末世暗色系 + 系统荧光绿 */
export const COLORS = {
  asphalt: '#151a18',
  asphaltLine: '#2a322d',
  floor: '#232b27',
  floorTile: '#2a332e',
  wall: '#3a433e',
  wallTop: '#4e5952',
  wallShadow: '#111614',
  shelf: '#4a4238',
  shelfTop: '#5d5346',
  metal: '#5a6660',
  metalDark: '#2c3430',
  blood: '#6d1512',
  bloodDark: '#3d0d0c',
  green: '#6dfba4',
  greenDim: '#2b7a4d',
  red: '#e54034',
  amber: '#ffb454',
  cyan: '#4fd6c8',
  bone: '#cfc7b4',
  zombieSkin: '#86a374',
  zombieSkinDark: '#4a5f42',
  runnerSkin: '#8a6b4a',
  spitterSkin: '#7c9a58',
  bossSkin: '#7d3a3a',
  playerCoat: '#4a7a63',
  playerSkin: '#d9b596',
  gun: '#2b3230'
};

/** 玩家基础属性 */
export const PLAYER = {
  radius: 15,
  speed: 220,
  maxHp: 100,
  invulnTime: 0.75,   // 受伤后无敌时间（秒）
  hpRegenDelay: 999,  // 不做自动回血（保留接口）
  startLevel: 1
};

/** 战斗通用平衡 */
export const BALANCE = {
  critChance: 0.12,      // 基础暴击率
  critMultiplier: 2.0,   // 基础暴击倍率
  headshotChance: 0.05,  // 额外处决概率（视觉表现用）
  knockbackBullet: 70,   // 子弹击退力度
  playerHitShake: 9,     // 玩家受伤震屏
  xpCrystalValue: 20
};

/** 渲染参数 */
export const RENDER = {
  desktopViewHeight: 640,  // 桌面端纵向可见世界单位
  touchViewHeight: 420,    // 触屏端纵向可见世界单位（看得少但更大）
  portraitViewHeight: 620,
  minZoom: 0.35,
  maxZoom: 2.4,
  cameraLerp: 9.5,         // 摄像机跟随平滑系数
  maxDpr: 2               // 限制 DPR，避免 4K 屏过度绘制
};

/** 对象数量上限：防止内存/性能失控 */
export const LIMITS = {
  bullets: 220,
  particlesDesktop: 420,
  particlesTouch: 240,
  damageTexts: 32,
  zombiesDesktop: 56,
  zombiesTouch: 40,
  loot: 26,
  enemyProjectiles: 40,
  hazards: 14
};

/** 丧尸 AI 通用参数 */
export const AI = {
  senseRadius: 1500,     // 感知半径（超过则休眠）
  loseSightRadius: 2400,
  separation: 26,        // 分离力度
  stuckCheckTime: 1.1,   // 卡住检测窗口
  stuckRetryTime: 0.55   // 绕行持续时间
};

/** 波次配置：三阶段 + Boss */
export const WAVES = [
  {
    id: 1,
    tag: '第一阶段',
    name: '尸潮初现',
    mission: '击杀 10 只丧尸',
    target: 10,
    maxAlive: 14,
    interval: 1.0,
    types: [['normal', 1]]
  },
  {
    id: 2,
    tag: '第二阶段',
    name: '猎手入场',
    mission: '击杀 15 只丧尸',
    target: 15,
    maxAlive: 18,
    interval: 0.95,
    types: [['normal', 0.62], ['runner', 0.38]]
  },
  {
    id: 3,
    tag: '第三阶段',
    name: '毒潮压境',
    mission: '击杀 20 只丧尸',
    target: 20,
    maxAlive: 26,
    interval: 0.78,
    types: [['normal', 0.48], ['runner', 0.34], ['spitter', 0.18]]
  }
];

/** Boss 阶段参数 */
export const BOSS_PHASE = {
  tag: '最终阶段',
  name: '巨型变异体',
  mission: '击败巨型变异体',
  spawnDelay: 1.6
};

/** 拾取物配置 */
export const LOOT = {
  pickupRadius: 46,
  bobSpeed: 2.4,
  despawnTime: 0,   // 0 = 永不消失（第一章保持简单）
  drops: {
    normal: [
      { type: 'ammo', chance: 0.13 },
      { type: 'medkit', chance: 0.05 },
      { type: 'xp', chance: 0.12 }
    ],
    runner: [
      { type: 'ammo', chance: 0.16 },
      { type: 'xp', chance: 0.16 }
    ],
    spitter: [
      { type: 'medkit', chance: 0.16 },
      { type: 'weapon', chance: 0.2 },
      { type: 'xp', chance: 0.2 }
    ],
    boss: [
      { type: 'weapon', chance: 1 },
      { type: 'medkit', chance: 1 },
      { type: 'xp', chance: 1 }
    ]
  }
};

/** 设备 / 性能档位判定（运行时只算一次） */
export const DEVICE = detectDevice();

function detectDevice() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const coarse = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const touch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || 'ontouchstart' in (typeof window !== 'undefined' ? window : {});
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
  const smallScreen = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) < 820 : false;
  const touchMode = coarse || (touch && (isMobileUA || smallScreen));
  const lowEnd = isMobileUA && !/iPad/i.test(ua);
  return {
    touch: touchMode,
    mobile: isMobileUA,
    lowEnd,
    dpr: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, RENDER.maxDpr) : 1
  };
}
