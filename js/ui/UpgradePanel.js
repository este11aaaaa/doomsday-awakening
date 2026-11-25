/**
 * ui/UpgradePanel.js — 升级三选一技能面板
 * 每次升级暂停游戏，抽 3 个技能；点击卡片或按 1/2/3 选择，选择后立即恢复游戏。
 */

import { SKILLS } from '../data/skills.js';

const $ = (id) => document.getElementById(id);

export class UpgradePanel {
  constructor(game) {
    this.game = game;
    this.root = $('upgrade');
    this.cardsEl = $('upgrade-cards');
    this.levelEl = $('upgrade-level');
    this.active = false;
    this.choices = [];
    this.onSelect = null;
    this._cards = [];

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (idx >= 0 && this.choices[idx]) {
        e.preventDefault();
        this.select(this.choices[idx]);
      }
    });
  }

  show(choices, level, onSelect) {
    this.choices = choices.slice();
    this.onSelect = onSelect;
    this.active = true;

    if (this.levelEl) this.levelEl.textContent = String(level);
    if (this.cardsEl) {
      this.cardsEl.innerHTML = '';
      this._cards = [];
      choices.forEach((id, i) => {
        const def = SKILLS[id];
        if (!def) return;
        const current = this.game.skills.levels[id] || 0;
        const next = current + 1;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `skill-card ${def.theme}` + (current === 0 ? ' new' : '');
        card.setAttribute('data-skill', id);
        // 有 AI 图标就用图，没有就回退到汉字
        const iconImg = this.game.assets.getImage('skill_' + id);
        const iconHtml = iconImg
          ? `<span class="skill-icon has-image"><img src="${iconImg.src}" alt="${def.name}" /></span>`
          : `<span class="skill-icon">${def.icon}</span>`;
        card.innerHTML = `
          <span class="skill-key">${i + 1}</span>
          ${current === 0 ? '<span class="skill-tag">NEW</span>' : ''}
          ${iconHtml}
          <span class="skill-name">${def.name}</span>
          <span class="skill-desc">${def.desc(next)}</span>
          <span class="skill-meta">
            <span>${current === 0 ? '解锁' : 'Lv.' + current + ' → ' + next}</span>
            <span class="skill-pips">
              ${Array.from({ length: def.maxLevel }, (_, k) => `<i class="pip${k < next ? ' on' : ''}"></i>`).join('')}
            </span>
          </span>
        `;
        card.addEventListener('click', () => this.select(id));
        this.cardsEl.appendChild(card);
        this._cards.push(card);
      });
    }

    if (this.root) this.root.classList.remove('hidden');
  }

  select(id) {
    if (!this.active) return;
    this.active = false;
    if (this.root) this.root.classList.add('hidden');
    const cb = this.onSelect;
    this.onSelect = null;
    if (cb) cb(id);
  }

  hide() {
    this.active = false;
    this.onSelect = null;
    if (this.root) this.root.classList.add('hidden');
  }
}
