/**
 * systems/AudioSystem.js — 程序化音效（Web Audio 合成，无需外部音频文件）
 *
 * 设计：
 *  - 惰性初始化：必须在用户第一次交互后调用 init()，避免浏览器自动播放策略拦截。
 *  - 所有音效由噪声 + 振荡器实时合成，体积为 0，且可统一控制音量/静音。
 *  - 同名音效做 30ms 节流，避免高射速武器把音频图打爆。
 */

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ready = false;
    this.volume = 0.7;
    this.muted = false;
    this._last = Object.create(null);
    this._throttle = 0.03;
  }

  init() {
    if (this.ready) {
      this.resume();
      return;
    }
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * 0.75;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this._createNoise();
      this.ready = true;
      this.resume();
    } catch (err) {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._applyGain();
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyGain();
  }

  _applyGain() {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume * 0.75;
    try {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    } catch (err) {
      this.master.gain.value = target;
    }
  }

  _createNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noise(dur, freq, q, gain, sweepTo = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.2, dur + 0.03);
  }

  _tone(f0, f1, dur, type = 'sine', gain = 0.2, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, f0), t);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  play(name) {
    if (!this.ready || this.muted) return;
    if (this.ctx.state === 'suspended') this.resume();

    const now = performance.now() / 1000;
    if (this._last[name] && now - this._last[name] < this._throttle) return;
    this._last[name] = now;

    try {
      this._playInner(name);
    } catch (err) {
      // 音效失败不能影响游戏
    }
  }

  _playInner(name) {
    switch (name) {
      // ---- 武器 ----
      case 'pistol':
        this._noise(0.09, 1500, 1.1, 0.22, 500);
        this._tone(190, 70, 0.08, 'square', 0.16);
        break;
      case 'rifle':
        this._noise(0.07, 1900, 1.3, 0.2, 700);
        this._tone(165, 60, 0.06, 'square', 0.12);
        break;
      case 'shotgun':
        this._noise(0.26, 780, 0.9, 0.3, 180);
        this._tone(100, 38, 0.22, 'sawtooth', 0.24);
        break;
      case 'reload':
        this._tone(880, 620, 0.05, 'square', 0.07);
        this._tone(540, 400, 0.06, 'square', 0.06, 0.13);
        this._noise(0.05, 2400, 2, 0.05, 0);
        break;
      case 'empty':
        this._tone(1300, 900, 0.03, 'square', 0.06);
        break;
      case 'switch':
        this._tone(700, 980, 0.04, 'triangle', 0.08);
        break;

      // ---- 命中 / 丧尸 ----
      case 'flesh':
        this._noise(0.06, 380, 0.8, 0.12, 160);
        break;
      case 'zombieHit':
        this._tone(210, 90, 0.22, 'sawtooth', 0.14);
        this._noise(0.14, 520, 0.7, 0.08, 200);
        break;
      case 'zombieDie':
        this._tone(240, 55, 0.38, 'sawtooth', 0.14);
        this._noise(0.3, 420, 0.6, 0.1, 140);
        break;
      case 'spit':
        this._noise(0.18, 900, 1.2, 0.14, 300);
        break;
      case 'acid':
        this._tone(300, 120, 0.24, 'sine', 0.08);
        this._noise(0.22, 700, 1.4, 0.06, 260);
        break;

      // ---- 玩家 ----
      case 'hurt':
        this._tone(150, 70, 0.3, 'sawtooth', 0.2);
        this._noise(0.2, 300, 0.6, 0.12, 120);
        break;
      case 'pickup':
        this._tone(660, 660, 0.07, 'triangle', 0.11);
        this._tone(990, 990, 0.09, 'triangle', 0.1, 0.06);
        break;
      case 'levelup':
        this._tone(523, 523, 0.1, 'triangle', 0.11);
        this._tone(659, 659, 0.1, 'triangle', 0.11, 0.09);
        this._tone(880, 880, 0.16, 'triangle', 0.12, 0.18);
        break;
      case 'emp':
        this._tone(1600, 90, 0.35, 'sawtooth', 0.16);
        this._noise(0.4, 1200, 0.5, 0.16, 120);
        break;

      // ---- Boss ----
      case 'bossRoar':
        this._tone(95, 42, 0.9, 'sawtooth', 0.22);
        this._noise(0.8, 260, 0.5, 0.16, 90);
        break;
      case 'bossCharge':
        this._tone(120, 420, 0.5, 'sawtooth', 0.12);
        break;
      case 'bossHit':
        this._noise(0.16, 240, 0.5, 0.2, 80);
        this._tone(90, 45, 0.2, 'square', 0.18);
        break;
      case 'bossSlam':
        this._noise(0.35, 180, 0.4, 0.26, 60);
        this._tone(70, 30, 0.4, 'sawtooth', 0.22);
        break;

      // ---- 流程 ----
      case 'victory':
        this._tone(523, 523, 0.14, 'triangle', 0.12);
        this._tone(659, 659, 0.14, 'triangle', 0.12, 0.14);
        this._tone(784, 784, 0.16, 'triangle', 0.12, 0.28);
        this._tone(1046, 1046, 0.32, 'triangle', 0.13, 0.44);
        break;
      case 'defeat':
        this._tone(330, 300, 0.24, 'sawtooth', 0.12);
        this._tone(220, 180, 0.34, 'sawtooth', 0.12, 0.24);
        this._tone(110, 60, 0.5, 'sine', 0.14, 0.5);
        break;
      case 'click':
        this._tone(900, 700, 0.04, 'square', 0.06);
        break;
      default:
        break;
    }
  }
}
