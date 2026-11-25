/**
 * systems/SaveSystem.js — LocalStorage 存档（设置 + 最佳记录）
 * 隐私模式 / 禁用存储时静默降级，不影响游戏运行。
 */

const KEY = 'doomsday-awakening.save.v1';

const DEFAULTS = () => ({
  settings: { volume: 0.7, muted: false },
  record: { bestKills: 0, bestLevel: 1, bestTime: 0, wins: 0, plays: 0 },
  lastRun: null
});

function deepMerge(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = { ...base[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export class SaveSystem {
  constructor() {
    this.available = true;
    this.data = this.load();
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') throw new Error('no localStorage');
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS();
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULTS(), parsed);
    } catch (err) {
      this.available = false;
      return DEFAULTS();
    }
  }

  save() {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch (err) {
      this.available = false;
      return false;
    }
  }

  get settings() {
    return this.data.settings;
  }

  get record() {
    return this.data.record;
  }

  setVolume(v) {
    this.data.settings.volume = Math.max(0, Math.min(1, v));
    this.save();
  }

  setMuted(m) {
    this.data.settings.muted = !!m;
    this.save();
  }

  /** 记录一局结果，返回是否为新的最佳 */
  recordRun({ kills, level, time, win }) {
    const r = this.data.record;
    r.plays += 1;
    let isBest = false;
    if (kills > r.bestKills) { r.bestKills = kills; isBest = true; }
    if (level > r.bestLevel) r.bestLevel = level;
    if (time > r.bestTime) r.bestTime = time;
    if (win) r.wins += 1;
    this.data.lastRun = { kills, level, time, win, at: Date.now() };
    this.save();
    return isBest;
  }

  resetRecord() {
    this.data.record = DEFAULTS().record;
    this.save();
  }
}
