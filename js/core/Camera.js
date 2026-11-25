/**
 * core/Camera.js — 摄像机：跟随、边界限制、缩放、震屏、坐标转换
 * 关键点：世界坐标与屏幕坐标（CSS 像素）互相转换必须使用同一套变换参数，
 * 否则鼠标瞄准 / 触屏瞄准会在不同分辨率下偏移。
 */

import { RENDER } from '../config.js';
import { clamp, damp } from './MathUtils.js';

export class Camera {
  constructor() {
    this.x = 0;          // 视口左上角世界坐标
    this.y = 0;
    this.zoom = 1;
    this.viewW = 0;      // 视口宽（世界单位）
    this.viewH = 0;
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.touch = false;
    this.portrait = false;

    // 震屏
    this.shakeMag = 0;
    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this._t = 0;
  }

  /** 窗口/画布尺寸变化时调用 */
  resize(cssW, cssH, dpr, touch, portrait) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    this.touch = touch;
    this.portrait = portrait;

    // 目标可见高度：触屏看得更近（角色更大更好操作），桌面看得更远
    let viewH = touch ? RENDER.touchViewHeight : RENDER.desktopViewHeight;
    if (portrait) viewH = RENDER.portraitViewHeight;

    let zoom = this.cssH / viewH;
    zoom = clamp(zoom, RENDER.minZoom, RENDER.maxZoom);
    this.zoom = zoom;

    this.viewW = this.cssW / this.zoom;
    this.viewH = this.cssH / this.zoom;
  }

  /** 每帧跟随目标（带平滑） */
  update(dt, target, world, snap = false) {
    const viewW = this.viewW;
    const viewH = this.viewH;

    let tx = target.x - viewW / 2;
    let ty = target.y - viewH / 2;

    // 边界限制：世界比视口小时居中
    if (viewW >= world.width) tx = (world.width - viewW) / 2;
    else tx = clamp(tx, 0, world.width - viewW);

    if (viewH >= world.height) ty = (world.height - viewH) / 2;
    else ty = clamp(ty, 0, world.height - viewH);

    if (snap) {
      this.x = tx;
      this.y = ty;
    } else {
      this.x = damp(this.x, tx, RENDER.cameraLerp, dt);
      this.y = damp(this.y, ty, RENDER.cameraLerp, dt);
      // 平滑可能越过边界，二次夹紧
      this.x = viewW >= world.width ? (world.width - viewW) / 2 : clamp(this.x, 0, world.width - viewW);
      this.y = viewH >= world.height ? (world.height - viewH) / 2 : clamp(this.y, 0, world.height - viewH);
    }

    // 震屏衰减
    this._t += dt;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, this.shakeTime / this.shakeDuration);
      const m = this.shakeMag * k * k;
      this.shakeX = Math.sin(this._t * 68) * m;
      this.shakeY = Math.cos(this._t * 91) * m * 0.8;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  /** 触发震屏（叠加，有上限） */
  shake(mag, time = 0.22) {
    this.shakeMag = Math.min(26, this.shakeMag * 0.6 + mag);
    this.shakeTime = Math.max(this.shakeTime, time);
    this.shakeDuration = this.shakeTime;
  }

  /** 应用变换矩阵（dpr + zoom + 摄像机位置） */
  apply(ctx) {
    const s = this.zoom * this.dpr;
    ctx.setTransform(
      s, 0, 0, s,
      -(this.x + this.shakeX) * s,
      -(this.y + this.shakeY) * s
    );
  }

  /** 屏幕 CSS 坐标 → 游戏世界里对应点的“世界屏幕坐标”（用于鼠标瞄准，含缩放校正） */
  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x + this.shakeX,
      y: sy / this.zoom + this.y + this.shakeY
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x - this.shakeX) * this.zoom,
      y: (wy - this.y - this.shakeY) * this.zoom
    };
  }

  /** 判断世界矩形是否在视口内（渲染裁剪用） */
  isVisible(x, y, w = 0, h = 0, pad = 80) {
    return (
      x + w >= this.x - pad &&
      x <= this.x + this.viewW + pad &&
      y + h >= this.y - pad &&
      y <= this.y + this.viewH + pad
    );
  }
}
