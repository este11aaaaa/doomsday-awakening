/**
 * ui/TouchControls.js — 手机双虚拟摇杆 + 触屏按钮
 *
 * 关键实现：
 *  - 使用 Pointer Events + pointerId 区分手指：左摇杆和右摇杆各自记录 pointerId，
 *    互不干扰（一根手指松开不会重置另一根）。
 *  - 摇杆基座固定，摇杆头限制在有效半径内，松开自动回零。
 *  - 所有触控元素 pointerdown 时阻止默认行为，避免页面滚动/双击缩放。
 */

const $ = (id) => document.getElementById(id);

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.root = $('touch-controls');
    this.enabled = false;
    this.sticks = {};
    this.btnSkill = $('btn-skill');
    this.btnPickup = $('btn-pickup');

    this._initStick('move', $('stick-move'), $('stick-move-knob'));
    this._initStick('aim', $('stick-aim'), $('stick-aim-knob'));
    this._initButtons();
  }

  _initStick(kind, zone, knob) {
    if (!zone || !knob) return;
    const state = {
      kind, zone, knob,
      pointerId: null,
      cx: 0, cy: 0,
      max: 52,
      x: 0, y: 0
    };

    const setKnob = (dx, dy) => {
      if (knob.style) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const apply = (clientX, clientY) => {
      let dx = clientX - state.cx;
      let dy = clientY - state.cy;
      const len = Math.hypot(dx, dy);
      const max = state.max;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      setKnob(dx, dy);

      let nx = dx / max;
      let ny = dy / max;
      const mag = Math.hypot(nx, ny);
      if (mag < 0.001) {
        nx = 0;
        ny = 0;
      }
      state.x = nx;
      state.y = ny;

      const input = this.game.input;
      if (kind === 'move') {
        input.setMoveAxis(nx, ny);
      } else if (mag < 0.22) {
        // 瞄准摇杆死区，避免轻微抖动导致乱射
        input.setAimAxis(0, 0);
      } else {
        input.setAimAxis(nx / mag, ny / mag);
      }
    };

    const reset = () => {
      state.pointerId = null;
      state.x = 0;
      state.y = 0;
      setKnob(0, 0);
      const input = this.game.input;
      if (kind === 'move') input.setMoveAxis(0, 0);
      else input.setAimAxis(0, 0);
    };

    zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (state.pointerId !== null) return; // 该摇杆已被占用
      e.preventDefault();
      state.pointerId = e.pointerId;
      const rect = zone.getBoundingClientRect ? zone.getBoundingClientRect() : { left: 0, top: 0, width: 152, height: 152 };
      state.cx = rect.left + rect.width / 2;
      state.cy = rect.top + rect.height / 2;
      state.max = Math.max(38, rect.width * 0.37);
      if (zone.setPointerCapture) {
        try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      apply(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== state.pointerId) return;
      e.preventDefault();
      apply(e.clientX, e.clientY);
    });

    const endHandler = (e) => {
      if (state.pointerId !== e.pointerId) return;
      reset();
    };
    zone.addEventListener('pointerup', endHandler);
    zone.addEventListener('pointercancel', endHandler);
    zone.addEventListener('lostpointercapture', endHandler);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    this.sticks[kind] = state;
  }

  _initButtons() {
    const bind = (el, action) => {
      if (!el) return;
      const press = (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        this.game.audio.init();
        this.game.audio.play('click');
        this.game.input.press(action);
      };
      const release = () => el.classList.remove('pressed');
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    bind($('btn-reload'), 'reload');
    bind($('btn-pickup'), 'pickup');
    bind(this.btnSkill, 'skill');
    bind($('btn-switch'), 'switch');
  }

  show() {
    this.enabled = true;
    if (this.root) this.root.classList.remove('hidden');
    if (typeof document !== 'undefined') document.body.classList.add('touch-mode');
  }

  hide() {
    this.enabled = false;
    if (this.root) this.root.classList.add('hidden');
    if (typeof document !== 'undefined') document.body.classList.remove('touch-mode');
    // 清空摇杆状态
    for (const key of Object.keys(this.sticks)) {
      const s = this.sticks[key];
      s.pointerId = null;
      s.x = 0;
      s.y = 0;
      if (s.knob && s.knob.style) s.knob.style.transform = 'translate(0px, 0px)';
    }
    this.game.input.setMoveAxis(0, 0);
    this.game.input.setAimAxis(0, 0);
  }

  /** 根据游戏状态刷新按钮显示（技能冷却 / 拾取高亮） */
  update() {
    if (!this.enabled) return;
    const g = this.game;
    const sk = g.skills;

    if (this.btnSkill) {
      if (!sk || sk.empLevel <= 0) {
        this.btnSkill.classList.add('locked');
      } else {
        this.btnSkill.classList.remove('locked');
      }
    }
    if (this.btnPickup) {
      if (g.nearestLoot) this.btnPickup.classList.add('hint');
      else this.btnPickup.classList.remove('hint');
    }
  }
}
