/**
 * ui/HUD.js — 游戏内 HUD（DOM 层，保证文字清晰 + 响应式布局）
 * 只负责显示，不参与任何游戏逻辑；数值来自 game.player / game.spawner / game.level。
 */

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('hud'),
      level: $('hud-level'),
      hpFill: $('hud-hp-fill'),
      hpText: $('hud-hp-text'),
      xpFill: $('hud-xp-fill'),
      xpText: $('hud-xp-text'),
      wave: $('hud-wave'),
      mission: $('hud-mission'),
      kills: $('hud-kills'),
      killsTarget: $('hud-kills-target'),
      weaponName: $('hud-weapon'),
      mag: $('hud-mag'),
      reserve: $('hud-reserve'),
      reload: $('hud-reload'),
      ammo: document.querySelector('.weapon-ammo'),
      weaponPanel: $('hud-weapon-panel'),
      slots: $('hud-slots'),
      bossBar: $('boss-bar'),
      bossFill: $('boss-fill'),
      bossName: $('boss-name'),
      pickup: $('pickup-hint'),
      pickupText: $('pickup-text'),
      pause: $('hud-pause'),
      portrait: document.querySelector('.hud-portrait'),
      damage: $('fx-damage')
    };

    this._cache = {};
    this._toastEl = null;
    this._toastTimer = 0;
    this._bannerEl = null;
    this._bannerTimer = 0;
    this._damageTimer = 0;
    this._slotEls = {};
    this._slotsReady = false;

    if (this.el.pause) {
      this.el.pause.addEventListener('click', (e) => {
        e.stopPropagation();
        game.togglePause();
      });
    }
  }

  /** 头像图片晚于 HUD 初始化加载时调用 */
  applyPortrait() {
    const img = this.game.assets.getImage('portrait_linye');
    const box = this.el.portrait;
    if (!img || !box) return;
    if (box.style) {
      box.style.backgroundImage = `url(${img.src})`;
      box.style.backgroundSize = 'cover';
      box.style.backgroundPosition = 'center 28%';
    }
    const mark = box.querySelector ? box.querySelector('.portrait-mark') : null;
    if (mark && mark.style) mark.style.display = 'none';
  }

  show() {
    if (this.el.root) this.el.root.classList.remove('hidden');
  }

  hide() {
    if (this.el.root) this.el.root.classList.add('hidden');
    this._hidePickup();
  }

  // ---------------- 顶部提示 ----------------
  toast(text, color = '#6dfba4') {
    if (!this.el.root || typeof document === 'undefined') return;
    if (this._toastEl && this._toastEl.parentNode) this._toastEl.parentNode.removeChild(this._toastEl);
    const div = document.createElement('div');
    div.className = 'hud-toast';
    div.textContent = text;
    div.style.color = color;
    div.style.borderColor = color;
    this.el.root.appendChild(div);
    this._toastEl = div;
    this._toastTimer = 1.8;
  }

  banner(text, color = '#6dfba4') {
    if (!this.el.root || typeof document === 'undefined') return;
    if (this._bannerEl && this._bannerEl.parentNode) this._bannerEl.parentNode.removeChild(this._bannerEl);
    const div = document.createElement('div');
    div.className = 'hud-banner';
    div.textContent = text;
    div.style.color = color;
    this.el.root.appendChild(div);
    this._bannerEl = div;
    this._bannerTimer = 2.4;
  }

  flashDamage() {
    if (this.el.damage) {
      this.el.damage.classList.add('on');
      this._damageTimer = 0.1;
    }
  }

  // ---------------- 每帧刷新 ----------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;

    // 血条 / 经验条
    this._setStyle(this.el.hpFill, 'width', `${Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1)}%`);
    this._setText(this.el.hpText, `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);
    this._setStyle(this.el.xpFill, 'width', `${(g.level.progress * 100).toFixed(1)}%`);
    this._setText(this.el.xpText, `${Math.floor(g.level.xp)} / ${g.level.xpToNext}`);
    this._setText(this.el.level, String(g.level.level));
    this._setText(this.el.kills, String(g.kills));

    // 任务信息
    const info = g.spawner.getHudInfo();
    this._setText(this.el.wave, info.tag);
    this._setText(this.el.mission, info.mission);
    this._setText(this.el.killsTarget, info.target > 0 ? String(info.target) : '—');

    // 武器 / 弹药
    const w = p.weapon;
    this._setText(this.el.weaponName, w.name);
    this._setText(this.el.mag, String(p.slot.mag));
    this._setText(this.el.reserve, String(p.slot.reserve));
    if (this.el.ammo) {
      const low = p.slot.mag <= Math.max(1, Math.floor(w.magSize * 0.25));
      if (low) this.el.ammo.classList.add('low');
      else this.el.ammo.classList.remove('low');
    }
    if (this.el.reload) {
      if (p.reloading) this.el.reload.classList.remove('hidden');
      else this.el.reload.classList.add('hidden');
    }
    this._updateSlots(p);

    // Boss 血条
    const boss = g.spawner.boss;
    if (boss && !boss.dead && g.spawner.phase === 'boss') {
      this.el.bossBar.classList.remove('hidden');
      this._setStyle(this.el.bossFill, 'width', `${Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1)}%`);
      this._setText(this.el.bossName, boss.phase2 ? '巨型变异体 · 狂暴' : '巨型变异体');
    } else {
      this.el.bossBar.classList.add('hidden');
    }

    // 拾取提示
    if (g.nearestLoot && g.state === 'playing') this._showPickup(g.nearestLoot);
    else this._hidePickup();

    // 定时器
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0 && this._toastEl) {
        if (this._toastEl.parentNode) this._toastEl.parentNode.removeChild(this._toastEl);
        this._toastEl = null;
      }
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0 && this._bannerEl) {
        if (this._bannerEl.parentNode) this._bannerEl.parentNode.removeChild(this._bannerEl);
        this._bannerEl = null;
      }
    }
    if (this._damageTimer > 0) {
      this._damageTimer -= dt;
      if (this._damageTimer <= 0 && this.el.damage) this.el.damage.classList.remove('on');
    }
  }

  _showPickup(loot) {
    if (!this.el.pickup) return;
    this.el.pickup.classList.remove('hidden');
    this._setText(this.el.pickupText, `${loot.meta.label} · ${loot.meta.hint}`);
  }

  _hidePickup() {
    if (this.el.pickup) this.el.pickup.classList.add('hidden');
  }

  _updateSlots(p) {
    if (!this.el.slots) return;
    if (!this._slotsReady) {
      this.el.slots.innerHTML = '';
      ['pistol', 'rifle', 'shotgun'].forEach((id, i) => {
        const span = document.createElement('span');
        span.className = 'weapon-slot';
        span.textContent = `${i + 1} ${id === 'pistol' ? '手枪' : id === 'rifle' ? '步枪' : '霰弹'}`;
        this.el.slots.appendChild(span);
        this._slotEls[id] = span;
      });
      this._slotsReady = true;
    }
    for (const id of Object.keys(this._slotEls)) {
      const span = this._slotEls[id];
      const owned = p.slots[id].owned;
      const active = p.currentWeaponId === id;
      span.className = 'weapon-slot' + (owned ? ' owned' : '') + (active ? ' active' : '');
    }
  }

  _setText(el, value) {
    if (!el) return;
    if (this._cache[el.id] === value) return;
    this._cache[el.id] = value;
    el.textContent = value;
  }

  _setStyle(el, prop, value) {
    if (!el) return;
    const key = el.id + ':' + prop;
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    if (el.style) el.style[prop] = value;
  }

  resetCache() {
    this._cache = {};
    this._slotsReady = false;
    this._hidePickup();
    if (this.el.bossBar) this.el.bossBar.classList.add('hidden');
  }
}
