/**
 * core/MathUtils.js — 通用数学/随机工具（避免各模块重复实现）
 */

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 帧率无关的指数平滑：t 为“每秒收敛强度” */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function randSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 按权重挑选：entries = [[value, weight], ...] */
export function weightedPick(entries) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries.length ? entries[entries.length - 1][0] : null;
}

/** 打乱数组（Fisher-Yates，原地） */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** 把角度归一化到 (-PI, PI] */
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

/** 角度差（最短路径） */
export function angleDelta(a, b) {
  return wrapAngle(b - a);
}

/** 向目标角度平滑插值（最大步进） */
export function approachAngle(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return wrapAngle(current + Math.sign(d) * maxStep);
}

/** 归一化向量，返回 [x, y, len] */
export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return [0, 0, 0];
  return [x / len, y / len, len];
}

/** 圆形范围随机点 */
export function randomPointInCircle(cx, cy, r) {
  const a = Math.random() * TAU;
  const rr = Math.sqrt(Math.random()) * r;
  return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
