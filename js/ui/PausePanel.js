/**
 * ui/PausePanel.js — 暂停界面（继续 / 重新开始 / 返回主菜单）
 */

import { formatTime } from '../core/MathUtils.js';

const $ = (id) => document.getElementById(id);

export class PausePanel {
  constructor(game) {
    this.game = game;
    this.root = $('pause');
    this.statsEl = $('pause-stats');
    this._bound = false;
    this.bind();
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    const g = this.game;

    const resume = $('btn-resume');
    if (resume) resume.addEventListener('click', () => g.resumeFromPause());

    const restart = $('btn-restart');
    if (restart) restart.addEventListener('click', () => {
      g.hidePause();
      g.startNewRun(false);
    });

    const menu = $('btn-menu');
    if (menu) menu.addEventListener('click', () => {
      g.hidePause();
      g.backToMenu();
    });
  }

  show() {
    const g = this.game;
    if (this.statsEl) {
      this.statsEl.innerHTML = `
        击杀 ${g.kills} · 等级 ${g.level.level} · 存活 ${formatTime(g.elapsed)}<br>
        当前波次：${g.spawner.getHudInfo().tag} — ${g.spawner.getHudInfo().mission}
      `;
    }
    if (this.root) this.root.classList.remove('hidden');
  }

  hide() {
    if (this.root) this.root.classList.add('hidden');
  }
}
