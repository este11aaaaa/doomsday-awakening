/**
 * ui/ResultPanel.js — 胜利 / 失败结算
 */

import { formatTime } from '../core/MathUtils.js';

const $ = (id) => document.getElementById(id);

export class ResultPanel {
  constructor(game) {
    this.game = game;
    this.root = $('result');
    this.panel = document.querySelector('.panel-result');
    this.kicker = $('result-kicker');
    this.title = $('result-title');
    this.story = $('result-story');
    this.stats = $('result-stats');
    this._bound = false;
    this.bind();
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    const g = this.game;

    const again = $('btn-again');
    if (again) again.addEventListener('click', () => {
      this.hide();
      g.startNewRun(false);
    });

    const menu = $('btn-result-menu');
    if (menu) menu.addEventListener('click', () => {
      this.hide();
      g.backToMenu();
    });
  }

  /**
   * @param {object} data { win, kills, level, time, totalXp, story, accuracy, crits }
   */
  show(data) {
    if (this.panel) {
      if (data.win) this.panel.classList.remove('defeat');
      else this.panel.classList.add('defeat');
    }
    if (this.kicker) this.kicker.textContent = data.win ? 'CHAPTER 01 COMPLETE' : 'SURVIVOR LOST';
    if (this.title) this.title.textContent = data.win ? '第一章 · 超市突围 完成' : '生存失败';
    if (this.story) this.story.textContent = data.story || '';

    const stats = [
      { label: '击杀丧尸', value: String(data.kills), cls: 'green' },
      { label: data.win ? '通关时间' : '存活时间', value: formatTime(data.time), cls: '' },
      { label: '最终等级', value: `Lv.${data.level}`, cls: 'green' },
      { label: '获得经验', value: String(Math.round(data.totalXp)), cls: 'gold' },
      { label: '命中率', value: `${data.accuracy}%`, cls: '' },
      { label: '暴击次数', value: String(data.crits), cls: 'red' }
    ];

    if (this.stats) {
      this.stats.innerHTML = stats.map((s) => `
        <div class="result-stat"><span>${s.label}</span><b class="${s.cls}">${s.value}</b></div>
      `).join('');
    }

    if (this.root) this.root.classList.remove('hidden');
  }

  hide() {
    if (this.root) this.root.classList.add('hidden');
  }
}
