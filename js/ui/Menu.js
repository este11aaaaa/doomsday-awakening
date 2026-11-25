/**
 * ui/Menu.js — 主菜单 / 游戏介绍 / 操作说明 / 音量设置
 */

const $ = (id) => document.getElementById(id);

const INTRO_HTML = `
  <p><b>2035 年</b>，未知病毒摧毁了人类文明。城市成为丧尸的猎场，幸存者只能在废墟里争抢最后一点物资。</p>
  <p>你是 <b>林夜</b>，一个普通到不能再普通的幸存者。在一次废弃超市的搜刮行动中，队长 <b>陈锋</b> 为了独吞物资，关上了安全门——把你和整群丧尸关在了一起。</p>
  <p>就在你即将被撕碎的那一刻，视野里浮出一行荧光绿的字：</p>
  <p style="color:#6dfba4">【末日生存系统已激活】</p>
  <p>击杀丧尸 → 获得经验 → 升级进化 → 强化武器。用枪口把整座超市杀穿，然后去找陈锋算账。</p>
  <span class="sec-title">核心玩法</span>
  <ul>
    <li>三阶段尸潮：普通丧尸 → 疾跑丧尸 → 毒液丧尸，击杀目标依次为 10 / 15 / 20。</li>
    <li>每级随机三选一技能，射速 / 伤害 / 暴击 / 生命 / 换弹 / 电磁脉冲都会真实改变战斗数值。</li>
    <li>地图内可拾取弹药箱、医疗包、经验晶体与武器箱（手枪 / 步枪 / 霰弹枪）。</li>
    <li>最终迎战巨型变异体 Boss：注意它的震地预警圈与直线冲撞。</li>
  </ul>
  <span class="sec-title">美术与音效</span>
  <p>全部场景、角色、丧尸、武器、特效均为 Canvas 程序化绘制；音效由 Web Audio 实时合成，无外部素材依赖。</p>
`;

const CONTROLS_HTML = `
  <span class="sec-title">PC（键盘 + 鼠标）</span>
  <ul>
    <li><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> 移动（斜向已归一化）</li>
    <li><b>鼠标移动</b> 瞄准 · <b>按住左键</b> 连续射击</li>
    <li><span class="kbd">R</span> 换弹 · <span class="kbd">E</span> 拾取物资 · <span class="kbd">Q</span> 电磁脉冲</li>
    <li><span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> 切换手枪 / 步枪 / 霰弹枪</li>
    <li><span class="kbd">ESC</span> 暂停 · 升级时按 <span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> 选技能</li>
  </ul>
  <span class="sec-title">手机 / 平板（触屏）</span>
  <ul>
    <li><b>左摇杆</b> 移动 · <b>右摇杆</b> 瞄准并持续射击（拖动方向即射击方向）</li>
    <li>右下角按钮：<b>换弹</b> / <b>拾取</b> / <b>脉冲</b> / <b>武器</b></li>
    <li>右上角 <b>II</b> 暂停；横屏体验最佳，竖屏会提示旋转</li>
    <li>可以左手移动、右手射击，多指同时操作互不影响</li>
  </ul>
  <span class="sec-title">小提示</span>
  <ul>
    <li>霰弹枪近距离伤害极高，适合贴脸打 Boss；步枪适合清尸群。</li>
    <li>拾取物资前先看一眼备弹，弹药箱只补充当前武器的备弹。</li>
    <li>Boss 抬起双臂时要立刻跑出红圈。</li>
  </ul>
`;

export class Menu {
  constructor(game) {
    this.game = game;
    this.root = $('menu');
    this.info = $('menu-info');
    this.infoTitle = $('menu-info-title');
    this.infoBody = $('menu-info-body');
    this.recordEl = $('menu-record');
    this.volumeEl = $('menu-volume');
    this.muteEl = $('menu-mute');
    this._bound = false;
    this.bind();
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    const g = this.game;

    const start = $('btn-start');
    if (start) {
      start.addEventListener('click', () => {
        g.audio.init();
        g.audio.play('click');
        this.hide();
        g.startNewRun();
      });
    }

    const intro = $('btn-intro');
    if (intro) {
      intro.addEventListener('click', () => {
        g.audio.init();
        g.audio.play('click');
        this.openInfo('游戏介绍', INTRO_HTML);
      });
    }

    const controls = $('btn-controls');
    if (controls) {
      controls.addEventListener('click', () => {
        g.audio.init();
        g.audio.play('click');
        this.openInfo('操作说明', CONTROLS_HTML);
      });
    }

    const close = $('btn-info-close');
    if (close) {
      close.addEventListener('click', () => {
        if (this.info) this.info.classList.add('hidden');
        g.audio.play('click');
      });
    }

    if (this.volumeEl) {
      this.volumeEl.addEventListener('input', () => {
        const v = Number(this.volumeEl.value) / 100;
        g.audio.init();
        g.audio.setVolume(v);
        g.save.setVolume(v);
        if (v > 0 && g.save.settings.muted) this.toggleMute(false);
      });
    }

    if (this.muteEl) {
      this.muteEl.addEventListener('click', () => {
        g.audio.init();
        this.toggleMute(!g.audio.muted);
      });
    }
  }

  toggleMute(muted) {
    const g = this.game;
    g.audio.setMuted(muted);
    g.save.setMuted(muted);
    if (this.muteEl) this.muteEl.textContent = `静音：${muted ? '开' : '关'}`;
  }

  openInfo(title, html) {
    if (!this.info) return;
    if (this.infoTitle) this.infoTitle.textContent = title;
    if (this.infoBody) this.infoBody.innerHTML = html;
    this.info.classList.remove('hidden');
  }

  /** 用 AI 生成的主菜单插画替换纯 CSS 背景 */
  applyBackground() {
    const img = this.game.assets.getImage('menu_bg');
    if (!img || !this.root) return;
    const sky = this.root.querySelector('.menu-sky');
    if (sky && sky.style) {
      sky.style.backgroundImage =
        'linear-gradient(180deg, rgba(6,10,8,.55) 0%, rgba(6,10,8,.72) 55%, rgba(6,10,8,.9) 100%),' +
        `url(${img.src})`;
      sky.style.backgroundSize = 'cover';
      sky.style.backgroundPosition = 'center 42%';
    }
    this.root.classList.add('has-photo');
  }

  show() {
    if (this.root) this.root.classList.remove('hidden');
    if (this.info) this.info.classList.add('hidden');
    this.refreshRecord();
  }

  hide() {
    if (this.root) this.root.classList.add('hidden');
    if (this.info) this.info.classList.add('hidden');
  }

  refreshRecord() {
    const g = this.game;
    const s = g.save.settings;
    if (this.volumeEl) this.volumeEl.value = String(Math.round(s.volume * 100));
    if (this.muteEl) this.muteEl.textContent = `静音：${s.muted ? '开' : '关'}`;
    const r = g.save.record;
    if (this.recordEl) {
      this.recordEl.textContent = r.plays > 0
        ? `最高击杀 ${r.bestKills} · 最高等级 ${r.bestLevel} · 通关 ${r.wins} 次`
        : '最高记录：暂无';
    }
  }
}
