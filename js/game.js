/**
 * game.js — 游戏总装配与状态机
 *
 * 状态：menu / story / playing / upgrade / paused / victory / defeat
 * 只有 playing 状态才会推进游戏逻辑；story / upgrade / paused / 结算都会冻结世界，
 * 从而满足“暂停后不再射击、升级时游戏暂停、结束后不再产生子弹和丧尸”。
 */

import { WORLD, LIMITS, DEVICE, RENDER, LOOT } from './config.js';
import { MAP } from './data/mapData.js';
import { STORY, DEFEAT_LINES } from './data/story.js';

import { Camera } from './core/Camera.js';
import { InputManager } from './core/InputManager.js';
import { GameLoop } from './core/GameLoop.js';

import { Player } from './entities/Player.js';
import { Loot, rollDrops } from './entities/Loot.js';

import { CombatSystem } from './systems/CombatSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';
import { LevelSystem } from './systems/LevelSystem.js';
import { SkillSystem } from './systems/SkillSystem.js';
import { ParticleSystem } from './systems/ParticleSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';

import { Renderer } from './render/Renderer.js';

import { HUD } from './ui/HUD.js';
import { Menu } from './ui/Menu.js';
import { Dialog } from './ui/Dialog.js';
import { UpgradePanel } from './ui/UpgradePanel.js';
import { PausePanel } from './ui/PausePanel.js';
import { ResultPanel } from './ui/ResultPanel.js';
import { TouchControls } from './ui/TouchControls.js';

import { clamp, dist, wrapAngle, pick } from './core/MathUtils.js';

export class Game {
  constructor(canvas, assets, save) {
    this.canvas = canvas;
    this.assets = assets;
    this.save = save;
    this.device = DEVICE;
    this.map = MAP;
    this.world = WORLD;
    // 子弹只被“高墙/车体/木箱”阻挡；货架、收银台、路障、垃圾堆属于低矮掩体，可以越过射击
    this.bulletBlockers = MAP.obstacles.filter((o) => !o.low);

    this.state = 'menu';
    this.elapsed = 0;
    this.kills = 0;
    this.zombies = [];
    this.loot = [];
    this.nearestLoot = null;

    this.pendingStory = null;
    this.pendingVictory = false;
    this.deathQueued = false;
    this.upgradeQueued = false;
    this.finished = false;
    this.rotateDismissed = false;

    // --- 核心系统 ---
    this.camera = new Camera();
    this.audio = new AudioSystem();
    this.audio.setVolume(save.settings.volume);
    this.audio.setMuted(save.settings.muted);

    this.particles = new ParticleSystem(this);
    this.combat = new CombatSystem(this);
    this.skills = new SkillSystem(this);
    this.level = new LevelSystem(this);
    this.spawner = new SpawnSystem(this);
    this.player = new Player(this);

    // --- 渲染与输入 ---
    this.renderer = new Renderer(canvas, this, assets);
    this.input = new InputManager(canvas);
    this.input.attach(DEVICE.touch);

    // --- UI ---
    this.hud = new HUD(this);
    this.menu = new Menu(this);
    this.dialog = new Dialog(this);
    this.upgradePanel = new UpgradePanel(this);
    this.pausePanel = new PausePanel(this);
    this.resultPanel = new ResultPanel(this);
    this.touch = new TouchControls(this);

    this.loop = new GameLoop((dt) => this.update(dt), () => this.render());
    this._bindWindowEvents();
    this.resize();

    this.hud.hide();
    this.touch.hide();
    this.input.setEnabled(false);
  }

  // =========================================================
  // 生命周期
  // =========================================================
  start() {
    this.loop.start();
  }

  _bindWindowEvents() {
    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        this.resize();
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
      else this.showResumeHint();
    });
    window.addEventListener('blur', () => this.autoPause());

    // 触屏反馈：第一次触摸尝试恢复音频上下文
    window.addEventListener('pointerdown', () => this.audio.init(), { passive: true });
  }

  resize() {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxDpr);
    const portrait = h > w;

    this.camera.resize(w, h, dpr, this.device.touch, portrait);
    this.renderer.resize(w, h, dpr);
    this.camera.update(0, this.player, this.world, true);
    this._updateRotateHint(portrait);
  }

  _updateRotateHint(portrait) {
    const el = document.getElementById('rotate-hint');
    if (!el) return;
    const need = this.device.touch && portrait && !this.rotateDismissed;
    if (need) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  // =========================================================
  // 开局 / 重开
  // =========================================================
  resetRun() {
    this.elapsed = 0;
    this.kills = 0;
    this.zombies.length = 0;
    this.loot.length = 0;
    this.nearestLoot = null;
    this.pendingStory = null;
    this.pendingVictory = false;
    this.deathQueued = false;
    this.upgradeQueued = false;
    this.finished = false;

    this.combat.reset();
    this.particles.clear();
    this.skills.reset();
    this.level.reset();
    this.spawner.reset();
    this.player.reset();
    this.player.refreshStats();

    // 预置物资
    for (const spot of MAP.lootSpots) {
      this.spawnLoot(spot.type, spot.x, spot.y);
    }

    this.camera.update(0, this.player, this.world, true);
    this.hud.resetCache();
    this.input.reset();
  }

  /**
   * @param {boolean} withStory 是否播放开场剧情（重开时跳过）
   */
  startNewRun(withStory = true) {
    this.hideAllPanels();
    this.resetRun();
    this.input.setEnabled(true);
    this.state = 'story';
    this.hud.hide();
    this.touch.hide();
    this.dialog.hide();

    if (withStory) {
      this.dialog.play(STORY.opening, () => {
        this.dialog.hide();
        this.beginCombat();
      });
    } else {
      this.beginCombat();
      this.hud.toast('第一章重新开始', '#6dfba4');
    }
  }

  beginCombat() {
    this.state = 'playing';
    this.input.setEnabled(true);
    this.input.reset();
    this.hud.show();
    this.hud.resetCache();
    if (this.device.touch) this.touch.show();
    else this.touch.hide();
    this.camera.update(0, this.player, this.world, true);
    this.hud.banner('第一阶段 · 尸潮初现', '#6dfba4');
    this.audio.init();
  }

  backToMenu() {
    this.state = 'menu';
    this.finished = false;
    this.resetRun();
    this.hideAllPanels();
    this.hud.hide();
    this.touch.hide();
    this.input.setEnabled(false);
    this.input.reset();
    this.menu.show();
  }

  hideAllPanels() {
    this.dialog.hide();
    this.upgradePanel.hide();
    this.pausePanel.hide();
    this.resultPanel.hide();
  }

  // =========================================================
  // 主循环
  // =========================================================
  update(dt) {
    switch (this.state) {
      case 'playing':
        this.updatePlaying(dt);
        break;

      case 'story':
        this.dialog.update(dt);
        if (this.input.consume('confirm')) this.dialog.next();
        if (this.input.consume('pause')) this.dialog.skip();
        break;

      case 'upgrade':
        // 面板自行监听键盘，这里只需要保持画面冻结
        break;

      case 'paused':
        if (this.input.consume('pause')) this.resumeFromPause();
        break;

      default:
        // menu / victory / defeat：不推进世界
        break;
    }
  }

  updatePlaying(dt) {
    const input = this.input;
    this.elapsed += dt;

    // ---- 一次性动作 ----
    if (input.consume('pause')) {
      this.pause();
      return;
    }
    if (input.consume('reload')) this.player.startReload();
    if (input.consume('pickup')) this.tryPickup();
    if (input.consume('skill')) this.skills.tryCastEmp();
    if (input.consume('switch')) this.player.cycleWeapon();
    const slot = input.consumeWeaponSlot();
    if (slot) this.player.switchBySlot(slot);

    // ---- 玩家 ----
    this.player.update(dt, input, this.camera);
    this.applyAimAssist(dt);

    // ---- 射击 ----
    if (input.isFiring()) this.combat.fireWeapon(this.player, this.player.aimAngle);

    // ---- 系统 ----
    this.skills.update(dt);
    this.spawner.update(dt);
    this.combat.update(dt);
    this.updateZombies(dt);
    this.updateLoot(dt);
    this.particles.update(dt);

    // ---- 摄像机 ----
    this.camera.update(dt, this.player, this.world);

    // ---- 清理 ----
    this.cleanup();

    // ---- 拾取提示 ----
    this.findNearestLoot();

    // ---- UI ----
    this.hud.update(dt);
    this.touch.update();

    // ---- 队列（升级 / 剧情 / 死亡 / 胜利）----
    this.processQueues();
  }

  render() {
    this.renderer.render();
  }

  // =========================================================
  // 战斗辅助
  // =========================================================
  updateZombies(dt) {
    const list = this.zombies;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dead) continue;
      z.update(dt);
      z.x = clamp(z.x, z.radius, this.world.width - z.radius);
      z.y = clamp(z.y, z.radius, this.world.height - z.radius);
    }

    // 简单分离，避免丧尸完全重叠成一个点
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawnTimer > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawnTimer > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = Math.min((rr - d) * 0.3, 2.4);
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  /** 触屏辅助瞄准：在很小的角度范围内吸附最近目标，提升手感 */
  applyAimAssist(dt) {
    if (!this.device.touch) return;
    if (!this.input.touchAim.active) return;
    const p = this.player;
    let best = null;
    let bestScore = Infinity;
    const list = this.zombies;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dead || z.spawnTimer > 0) continue;
      const d = dist(p.x, p.y, z.x, z.y);
      if (d > 640) continue;
      const ang = Math.atan2(z.y - p.y, z.x - p.x);
      const diff = Math.abs(wrapAngle(ang - p.aimAngle));
      if (diff > 0.2) continue;
      const score = diff + d / 6000;
      if (score < bestScore) {
        bestScore = score;
        best = z;
      }
    }
    if (best) {
      const target = Math.atan2(best.y - p.y, best.x - p.x);
      p.aimAngle += wrapAngle(target - p.aimAngle) * Math.min(1, dt * 14);
    }
  }

  updateLoot(dt) {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.update(dt);
      if (l.picked) this.loot.splice(i, 1);
    }
    if (this.loot.length > LIMITS.loot) this.loot.splice(0, this.loot.length - LIMITS.loot);
  }

  spawnLoot(type, x, y) {
    const l = new Loot(this, type, clamp(x, 30, this.world.width - 30), clamp(y, 30, this.world.height - 30));
    this.loot.push(l);
    return l;
  }

  findNearestLoot() {
    const p = this.player;
    let best = null;
    let bestD = LOOT.pickupRadius + p.radius;
    for (let i = 0; i < this.loot.length; i++) {
      const l = this.loot[i];
      if (!l.canPickup) continue;
      const d = dist(p.x, p.y, l.x, l.y);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    this.nearestLoot = best;
  }

  tryPickup() {
    const l = this.nearestLoot;
    if (!l) {
      this.hud.toast('附近没有可拾取的物资', '#8fa294');
      return false;
    }
    l.apply(this);
    const idx = this.loot.indexOf(l);
    if (idx >= 0) this.loot.splice(idx, 1);
    this.nearestLoot = null;
    return true;
  }

  cleanup() {
    const list = this.zombies;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].dead) list.splice(i, 1);
    }
  }

  // =========================================================
  // 事件回调（由实体/系统调用）
  // =========================================================
  onZombieKilled(z) {
    this.kills += 1;
    this.combat.stats.kills += 1;
    this.spawner.onZombieKilled(z);
    this.level.addXp(z.data.xp);

    if (z.isBoss) {
      this.particles.explosion(z.x, z.y, 160);
      this.particles.ring(z.x, z.y, 240, '#ffb454', 0.8);
      this.camera.shake(22, 0.8);
      this.audio.play('zombieDie');
      this.spawner.phase = 'done';
      this.pendingVictory = true;
      return;
    }

    this.particles.blood(z.x, z.y, 10, Math.random() * Math.PI * 2);
    this.particles.debris(z.x, z.y, 4);
    this.audio.play('zombieDie');
    this.camera.shake(2.2, 0.12);
    rollDrops(this, z.typeId, z.x, z.y);
  }

  onPlayerHurt(amount) {
    this.hud.flashDamage();
    this.camera.shake(9, 0.24);
    this.audio.play('hurt');
    this.particles.blood(this.player.x, this.player.y, 6, Math.random() * Math.PI * 2);
  }

  onPlayerDeath() {
    this.deathQueued = true;
    this.particles.blood(this.player.x, this.player.y, 26, Math.random() * Math.PI * 2);
    this.camera.shake(18, 0.6);
    this.audio.play('defeat');
  }

  onWaveChanged(wave) {
    this.hud.banner(`${wave.tag} · ${wave.mission}`, '#6dfba4');
  }

  onBossPhaseStart() {
    this.hud.banner('警告：检测到高危变异生命体', '#ff5a45');
    this.queueStory('boss');
  }

  onBossSpawned(boss) {
    this.hud.banner('巨型变异体 已出现', '#ff5a45');
    this.audio.play('bossRoar');
    this.camera.shake(14, 0.7);
    this.particles.ring(boss.x, boss.y, 200, '#ff5a45', 0.6);
  }

  queueStory(kind) {
    this.pendingStory = kind;
  }

  requestUpgrade() {
    this.upgradeQueued = true;
  }

  // =========================================================
  // 队列处理：升级 / 剧情 / 死亡 / 胜利
  // =========================================================
  processQueues() {
    if (this.finished) return;

    if (this.pendingVictory) {
      this.pendingVictory = false;
      this.playVictoryStory();
      return;
    }

    if (this.deathQueued) {
      this.deathQueued = false;
      this.finishRun(false);
      return;
    }

    if (this.upgradeQueued && this.level.hasPending) {
      this.showUpgrade();
      return;
    }

    if (this.pendingStory) {
      const kind = this.pendingStory;
      this.pendingStory = null;
      this.startStory(kind);
    }
  }

  showUpgrade() {
    this.upgradeQueued = false;
    const choices = this.skills.rollChoices(3);
    if (!choices.length) {
      this.level.consumeLevelUp();
      return;
    }
    this.state = 'upgrade';
    this.input.reset();
    this.input.setEnabled(true);
    this.upgradePanel.show(choices, this.level.level, (id) => this.onSkillChosen(id));
  }

  onSkillChosen(id) {
    this.skills.apply(id);
    this.level.consumeLevelUp();
    this.upgradePanel.hide();
    this.player.refreshStats();
    this.hud.resetCache();

    if (this.level.hasPending) {
      this.showUpgrade();
      return;
    }
    this.state = 'playing';
    this.input.reset();
    this.input.setEnabled(true);
  }

  startStory(kind) {
    const lines = STORY[kind];
    if (!lines || !lines.length) return;
    this.state = 'story';
    this.input.reset();
    this.hud.hide();
    this.touch.hide();
    this.dialog.play(lines, () => {
      this.dialog.hide();
      this.hud.show();
      if (this.device.touch) this.touch.show();
      this.state = 'playing';
      this.input.setEnabled(true);
      this.input.reset();
      if (kind === 'boss') {
        this.hud.banner('最终阶段 · 巨型变异体', '#ff5a45');
      }
    });
  }

  playVictoryStory() {
    this.state = 'story';
    this.input.reset();
    this.hud.hide();
    this.touch.hide();
    this.dialog.play(STORY.victory, () => {
      this.dialog.hide();
      this.finishRun(true);
    });
  }

  finishRun(win) {
    if (this.finished) return;
    this.finished = true;
    this.state = win ? 'victory' : 'defeat';
    this.input.setEnabled(false);
    this.input.reset();
    this.hud.hide();
    this.touch.hide();
    this.upgradeQueued = false;
    this.pendingStory = null;

    const s = this.combat.stats;
    const accuracy = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;

    this.save.recordRun({
      kills: this.kills,
      level: this.level.level,
      time: this.elapsed,
      win
    });

    this.audio.play(win ? 'victory' : 'defeat');

    this.resultPanel.show({
      win,
      kills: this.kills,
      level: this.level.level,
      time: this.elapsed,
      totalXp: this.level.totalXp,
      accuracy: clamp(accuracy, 0, 100),
      crits: s.crits,
      story: win
        ? '无线电里传来陈锋的声音，他还在。\n「陈锋，游戏才刚刚开始。」\n\n第二章：复仇的开始 · 即将解锁'
        : pick(DEFEAT_LINES)
    });
  }

  // =========================================================
  // 暂停
  // =========================================================
  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resumeFromPause();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.input.setEnabled(true);
    this.pausePanel.show();
  }

  hidePause() {
    this.pausePanel.hide();
  }

  resumeFromPause() {
    if (this.state !== 'paused') return;
    this.pausePanel.hide();
    this.state = 'playing';
    this.input.reset();
    this.input.setEnabled(true);
  }

  autoPause() {
    if (this.state === 'playing') this.pause();
  }

  showResumeHint() {
    if (this.state === 'paused') {
      this.hud.toast('已暂停 · 点击继续游戏恢复', '#ffb454');
    }
  }

  dismissRotateHint() {
    this.rotateDismissed = true;
    this._updateRotateHint(this.camera.portrait);
  }
}
