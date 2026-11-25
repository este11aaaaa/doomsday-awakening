/**
 * data/mapData.js — 第一章地图：废弃超市（固定布局，程序化绘制）
 * 世界尺寸 2400×1800。障碍物为轴对齐矩形，玩家/丧尸子弹都会被阻挡。
 */

const W = 34; // 墙体厚度

/** 建筑外墙（带 5 个缺口，丧尸可从缺口涌入） */
const WALLS = [
  // 上墙
  { x: 620, y: 420, w: 340, h: W, type: 'wall' },
  { x: 1120, y: 420, w: 660, h: W, type: 'wall' },
  // 下墙（两个入口）
  { x: 620, y: 1206, w: 280, h: W, type: 'wall' },
  { x: 1080, y: 1206, w: 320, h: W, type: 'wall' },
  { x: 1580, y: 1206, w: 200, h: W, type: 'wall' },
  // 左墙（一个缺口）
  { x: 620, y: 420, w: W, h: 280, type: 'wall' },
  { x: 620, y: 860, w: W, h: 380, type: 'wall' },
  // 右墙（一个缺口）
  { x: 1746, y: 420, w: W, h: 360, type: 'wall' },
  { x: 1746, y: 940, w: W, h: 300, type: 'wall' }
];

/** 超市内部货架 */
const SHELVES = [
  { x: 700, y: 500, w: 240, h: 30 },
  { x: 1060, y: 500, w: 220, h: 30 },
  { x: 1400, y: 500, w: 260, h: 30 },
  { x: 700, y: 630, w: 240, h: 30 },
  { x: 1400, y: 630, w: 260, h: 30 },
  { x: 700, y: 760, w: 180, h: 30 },
  { x: 1080, y: 760, w: 220, h: 30 },
  { x: 1460, y: 760, w: 200, h: 30 },
  { x: 700, y: 890, w: 200, h: 30 },
  { x: 1120, y: 890, w: 240, h: 30 },
  { x: 1460, y: 890, w: 200, h: 30 },
  { x: 760, y: 1010, w: 220, h: 30 },
  { x: 1380, y: 1010, w: 240, h: 30 }
].map((s) => ({ ...s, type: 'shelf', low: true }));

/** 收银台 */
const COUNTERS = [
  { x: 880, y: 1110, w: 180, h: 36, type: 'counter', low: true },
  { x: 1260, y: 1110, w: 180, h: 36, type: 'counter', low: true }
];

/** 室外：废弃汽车 / 路障 / 垃圾堆 / 板条箱 */
const OUTDOOR = [
  { x: 260, y: 1360, w: 150, h: 64, type: 'car' },
  { x: 480, y: 1560, w: 64, h: 140, type: 'car' },
  { x: 900, y: 1480, w: 150, h: 64, type: 'car' },
  { x: 1560, y: 1520, w: 64, h: 140, type: 'car' },
  { x: 1900, y: 1300, w: 150, h: 64, type: 'car' },
  { x: 2180, y: 1100, w: 64, h: 150, type: 'car' },

  { x: 700, y: 1330, w: 140, h: 26, type: 'barrier', low: true },
  { x: 1150, y: 1400, w: 180, h: 26, type: 'barrier', low: true },
  { x: 1450, y: 1320, w: 120, h: 26, type: 'barrier', low: true },

  { x: 380, y: 1100, w: 70, h: 60, type: 'trash', low: true },
  { x: 1980, y: 880, w: 80, h: 70, type: 'trash', low: true },
  { x: 1650, y: 1660, w: 90, h: 60, type: 'trash', low: true },
  { x: 240, y: 420, w: 60, h: 80, type: 'trash', low: true },

  { x: 2100, y: 1500, w: 70, h: 70, type: 'crate' },
  { x: 300, y: 700, w: 60, h: 60, type: 'crate' },
  { x: 2000, y: 300, w: 64, h: 64, type: 'crate' },
  { x: 680, y: 300, w: 58, h: 58, type: 'crate' }
];

/** 丧尸出生点（沿地图外圈与街道，出生前会做占用/距离校验） */
const SPAWN_POINTS = [
  { x: 140, y: 150 }, { x: 1200, y: 120 }, { x: 2260, y: 150 },
  { x: 110, y: 900 }, { x: 2290, y: 760 }, { x: 150, y: 1660 },
  { x: 1150, y: 1700 }, { x: 2260, y: 1690 }, { x: 420, y: 300 },
  { x: 1950, y: 260 }, { x: 2010, y: 1250 }, { x: 1000, y: 1460 },
  { x: 1350, y: 1660 }, { x: 600, y: 1620 }, { x: 1820, y: 1600 },
  { x: 780, y: 260 }, { x: 1650, y: 180 }, { x: 300, y: 1000 },
  { x: 2150, y: 520 }, { x: 1200, y: 1320 }, { x: 440, y: 1250 },
  { x: 1860, y: 1080 },
  // 超市内部出生点（保证开局就有近距离交战，而不是全部堵在门外）
  { x: 760, y: 560 }, { x: 1560, y: 560 }, { x: 720, y: 960 }, { x: 1660, y: 960 }
];

/** 建筑缺口（门口）中心点：丧尸跨区时会先奔向最近门口，避免贴墙卡死 */
const GATES = [
  { x: 990, y: 1223 },   // 下方左入口
  { x: 1490, y: 1223 },  // 下方右入口
  { x: 1040, y: 437 },   // 上方坍塌缺口
  { x: 637, y: 780 },    // 左侧缺口
  { x: 1763, y: 860 }    // 右侧缺口
];

/** 预置物资点 */
const LOOT_SPOTS = [
  { x: 830, y: 572, type: 'ammo' },
  { x: 1520, y: 700, type: 'medkit' },
  { x: 1000, y: 566, type: 'xp' },
  { x: 862, y: 952, type: 'weapon' },
  { x: 1550, y: 952, type: 'ammo' },
  { x: 452, y: 1430, type: 'medkit' },
  { x: 1900, y: 1540, type: 'xp' },
  { x: 1250, y: 1300, type: 'ammo' },
  { x: 500, y: 820, type: 'weapon' }
];

export const MAP = {
  name: '废弃超市',
  width: 2400,
  height: 1800,
  playerStart: { x: 1180, y: 1068 },
  building: { x: 620, y: 420, w: 1160, h: 820 },
  obstacles: [...WALLS, ...SHELVES, ...COUNTERS, ...OUTDOOR],
  spawnPoints: SPAWN_POINTS,
  gates: GATES,
  lootSpots: LOOT_SPOTS,
  exitZone: { x: 150, y: 1520, w: 180, h: 140 },
  /** 装饰点位：地面裂缝/血迹/纸箱等（仅渲染） */
  decor: [
    { x: 840, y: 700, r: 46, kind: 'blood' },
    { x: 1250, y: 830, r: 62, kind: 'blood' },
    { x: 1600, y: 1060, r: 40, kind: 'blood' },
    { x: 1000, y: 1180, r: 34, kind: 'blood' },
    { x: 700, y: 1150, r: 52, kind: 'paper' },
    { x: 1450, y: 560, r: 44, kind: 'paper' },
    { x: 1150, y: 700, r: 60, kind: 'crack' },
    { x: 900, y: 400, r: 70, kind: 'crack' },
    { x: 1300, y: 1450, r: 80, kind: 'crack' },
    { x: 500, y: 1250, r: 70, kind: 'crack' },
    { x: 1800, y: 800, r: 60, kind: 'crack' },
    { x: 2000, y: 1650, r: 90, kind: 'rubble' },
    { x: 380, y: 1580, r: 60, kind: 'rubble' },
    { x: 1600, y: 200, r: 80, kind: 'rubble' }
  ]
};
