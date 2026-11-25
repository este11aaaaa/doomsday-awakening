/**
 * core/InputManager.js — 统一输入接口（PC 键鼠 + 手机触屏）
 *
 * 设计要点：
 * 1. 所有输入最终归一为：移动向量 / 瞄准角度 / 是否射击 / 一次性动作队列。
 * 2. 摇杆通过 setMoveAxis / setAimAxis 注入，使用 pointerId 由 TouchControls 管理，
 *    互不干扰（左摇杆松开不会停止右摇杆射击）。
 * 3. 事件只在 attach() 时绑定一次，detach() 时全部移除，避免重复绑定。
 */

import { TAU } from './MathUtils.js';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyE', 'KeyQ',
  'Space', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'Tab'
]);

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;          // 游戏中才消费按键
    this.keys = new Set();

    this.moveX = 0;
    this.moveY = 0;
    this.firing = false;
    this.lastAimAngle = 0;

    this.mouse = { x: 0, y: 0, down: false, inside: false, seen: false };
    this.touchMove = { x: 0, y: 0, active: false };
    this.touchAim = { x: 0, y: 0, active: false };

    this.actions = { reload: 0, pickup: 0, skill: 0, pause: 0, switch: 0, confirm: 0 };
    this.weaponSlotRequest = 0;
    this.isTouchMode = false;

    this._bound = {};
    this._attached = false;
  }

  attach(isTouchMode = false) {
    if (this._attached) return;
    this._attached = true;
    this.isTouchMode = isTouchMode;

    this._onKeyDown = (e) => {
      if (GAME_KEYS.has(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;

      switch (e.code) {
        case 'KeyR': this.actions.reload++; break;
        case 'KeyE': this.actions.pickup++; break;
        case 'KeyQ': this.actions.skill++; break;
        case 'Escape': this.actions.pause++; break;
        case 'Enter':
        case 'Space': this.actions.confirm++; break;
        case 'Digit1': this.weaponSlotRequest = 1; break;
        case 'Digit2': this.weaponSlotRequest = 2; break;
        case 'Digit3': this.weaponSlotRequest = 3; break;
        default: break;
      }
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this._onMouseMove = (e) => {
      const p = this._localPoint(e.clientX, e.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = true;
      this.mouse.seen = true;
    };

    this._onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.mouse.down = true;
      const p = this._localPoint(e.clientX, e.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = true;
      this.mouse.seen = true;
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.down = false;
    };

    this._onMouseLeave = () => {
      this.mouse.inside = false;
      this.mouse.down = false;
    };

    this._onBlur = () => this.reset();
    this._onContextMenu = (e) => {
      if (this.enabled) e.preventDefault();
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  detach() {
    if (!this._attached) return;
    this._attached = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  _localPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { left: 0, top: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.mouse.down = false;
      this.touchMove.x = 0;
      this.touchMove.y = 0;
      this.touchMove.active = false;
    }
  }

  /** 触屏摇杆注入（x/y 为 -1..1 的归一化向量） */
  setMoveAxis(x, y) {
    this.touchMove.x = x;
    this.touchMove.y = y;
    this.touchMove.active = x !== 0 || y !== 0;
  }

  setAimAxis(x, y) {
    this.touchAim.x = x;
    this.touchAim.y = y;
    this.touchAim.active = x !== 0 || y !== 0;
    if (this.touchAim.active) {
      this.lastAimAngle = Math.atan2(y, x);
      this.firing = true;
    } else if (!this.mouse.down) {
      this.firing = false;
    }
  }

  setTouchFiring(v) {
    this.firing = v;
  }

  /** UI 按钮触发一次性动作 */
  press(action) {
    if (this.actions[action] === undefined) return;
    this.actions[action]++;
  }

  consume(action) {
    if (!this.actions[action]) return false;
    this.actions[action] = 0;
    return true;
  }

  consumeWeaponSlot() {
    const s = this.weaponSlotRequest;
    this.weaponSlotRequest = 0;
    return s;
  }

  /** 当前移动向量（键盘优先，其次摇杆），始终归一化 */
  getMoveVector() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;

    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      this.moveX = x / len;
      this.moveY = y / len;
      return { x: this.moveX, y: this.moveY, active: true };
    }

    const tx = this.touchMove.x;
    const ty = this.touchMove.y;
    const tl = Math.hypot(tx, ty);
    if (tl > 0.001) {
      this.moveX = tx / tl;
      this.moveY = ty / tl;
      return { x: this.moveX, y: this.moveY, active: true };
    }

    this.moveX = 0;
    this.moveY = 0;
    return { x: 0, y: 0, active: false };
  }

  isFiring() {
    return this.mouse.down || this.firing || this.touchAim.active;
  }

  /**
   * 计算当前瞄准角度。
   * 触屏：右摇杆方向优先；键鼠：鼠标世界坐标方向。
   * 返回 { angle, fromTouch, worldX, worldY }
   */
  getAim(playerX, playerY, camera) {
    // 触屏摇杆
    if (this.touchAim.active) {
      const a = Math.atan2(this.touchAim.y, this.touchAim.x);
      this.lastAimAngle = a;
      return {
        angle: a,
        fromTouch: true,
        worldX: playerX + Math.cos(a) * 240,
        worldY: playerY + Math.sin(a) * 240
      };
    }

    // 鼠标（未使用过鼠标时保持上一次方向）
    if (this.mouse.seen && this.mouse.inside && !this.isTouchMode) {
      const w = camera.screenToWorld(this.mouse.x, this.mouse.y);
      const dx = w.x - playerX;
      const dy = w.y - playerY;
      if (dx * dx + dy * dy > 4) {
        const a = Math.atan2(dy, dx);
        this.lastAimAngle = a;
        return { angle: a, fromTouch: false, worldX: w.x, worldY: w.y };
      }
    }

    const a = this.lastAimAngle || 0;
    return {
      angle: a,
      fromTouch: this.touchAim.active,
      worldX: playerX + Math.cos(a) * 240,
      worldY: playerY + Math.sin(a) * 240
    };
  }

  /** 清空所有瞬时状态（死亡 / 暂停 / 重开时调用） */
  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.mouse.inside = false;
    this.firing = false;
    this.touchMove.x = 0;
    this.touchMove.y = 0;
    this.touchMove.active = false;
    this.touchAim.x = 0;
    this.touchAim.y = 0;
    this.touchAim.active = false;
    this.actions.reload = 0;
    this.actions.pickup = 0;
    this.actions.skill = 0;
    this.actions.pause = 0;
    this.actions.switch = 0;
    this.actions.confirm = 0;
    this.weaponSlotRequest = 0;
  }

  /** 归一化角度工具（供外部使用） */
  static norm(a) {
    while (a > Math.PI) a -= TAU;
    while (a <= -Math.PI) a += TAU;
    return a;
  }
}
