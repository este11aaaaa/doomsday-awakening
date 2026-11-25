/**
 * core/GameLoop.js — requestAnimationFrame 主循环
 * 职责：稳定 deltaTime、限制单帧最大步长（切后台回来不会瞬移）、FPS 统计。
 */

export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.rafId = 0;
    this.lastTime = 0;
    this.dt = 0;
    this.maxDelta = 0.05;   // 最长 50ms，防止掉帧时穿墙
    this.fps = 60;
    this._accTime = 0;
    this._accFrames = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  _tick(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._tick);

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > this.maxDelta) dt = this.maxDelta;
    this.dt = dt;

    // FPS 统计（每 0.5s 更新一次，避免每帧计算）
    this._accTime += dt;
    this._accFrames++;
    if (this._accTime >= 0.5) {
      this.fps = Math.round(this._accFrames / this._accTime);
      this._accTime = 0;
      this._accFrames = 0;
    }

    this.update(dt);
    this.render(dt);
  }
}
