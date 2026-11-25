/**
 * core/Collision.js — 碰撞检测与解算（圆 vs 轴对齐矩形 / 圆 vs 圆 / 线段 vs 矩形）
 * 地图障碍物数量有限（约 40 个），直接遍历即可，无需空间划分。
 */

/** 圆与矩形是否相交 */
export function circleRectOverlap(cx, cy, r, rect) {
  const nx = cx < rect.x ? rect.x : cx > rect.x + rect.w ? rect.x + rect.w : cx;
  const ny = cy < rect.y ? rect.y : cy > rect.y + rect.h ? rect.y + rect.h : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** 点是否在矩形内 */
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** 圆与圆 */
export function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/**
 * 把圆形物体从所有相交矩形中推出（单轴解算）
 * axis: 'x' | 'y'
 */
function pushOutAxis(obj, radius, obstacles, axis) {
  for (let i = 0; i < obstacles.length; i++) {
    const rect = obstacles[i];
    if (!circleRectOverlap(obj.x, obj.y, radius, rect)) continue;
    if (axis === 'x') {
      const cx = rect.x + rect.w * 0.5;
      obj.x = obj.x < cx ? rect.x - radius - 0.01 : rect.x + rect.w + radius + 0.01;
    } else {
      const cy = rect.y + rect.h * 0.5;
      obj.y = obj.y < cy ? rect.y - radius - 0.01 : rect.y + rect.h + radius + 0.01;
    }
  }
}

/**
 * 带碰撞的位移：分轴解算，支持沿墙滑动。
 * obj 需要 x / y 属性，函数会直接修改。
 * 通过子步长限制，避免高速穿墙。
 * @returns {{hitX:boolean, hitY:boolean}}
 */
export function moveWithCollision(obj, dx, dy, radius, obstacles) {
  let hitX = false;
  let hitY = false;
  const maxStep = 9;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;

  for (let s = 0; s < steps; s++) {
    if (sx !== 0) {
      obj.x += sx;
      for (let i = 0; i < obstacles.length; i++) {
        if (circleRectOverlap(obj.x, obj.y, radius, obstacles[i])) {
          pushOutAxis(obj, radius, obstacles, 'x');
          hitX = true;
          break;
        }
      }
    }
    if (sy !== 0) {
      obj.y += sy;
      for (let i = 0; i < obstacles.length; i++) {
        if (circleRectOverlap(obj.x, obj.y, radius, obstacles[i])) {
          pushOutAxis(obj, radius, obstacles, 'y');
          hitY = true;
          break;
        }
      }
    }
  }
  return { hitX, hitY };
}

/** 圆是否卡在障碍物里（用于出生点校验） */
export function isBlocked(x, y, r, obstacles) {
  for (let i = 0; i < obstacles.length; i++) {
    if (circleRectOverlap(x, y, r, obstacles[i])) return true;
  }
  return false;
}

/** 点到矩形最近距离平方（AI 绕行判断用） */
export function pointRectDist2(px, py, rect) {
  const nx = px < rect.x ? rect.x : px > rect.x + rect.w ? rect.x + rect.w : px;
  const ny = py < rect.y ? rect.y : py > rect.y + rect.h ? rect.y + rect.h : py;
  const dx = px - nx;
  const dy = py - ny;
  return dx * dx + dy * dy;
}

/**
 * 线段与矩形相交（Liang-Barsky 裁剪）
 * 用于高速子弹的“扫掠”检测，防止穿墙。
 */
export function segmentRectHit(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // 平行且在外侧
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/** 线段与所有障碍物的最近命中（返回命中点或 null） */
export function segmentObstacleHit(x1, y1, x2, y2, obstacles) {
  for (let i = 0; i < obstacles.length; i++) {
    if (segmentRectHit(x1, y1, x2, y2, obstacles[i])) {
      return { x: x2, y: y2, rect: obstacles[i] };
    }
  }
  return null;
}
