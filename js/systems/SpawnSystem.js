/**
 * systems/SpawnSystem.js — 波次 / 尸潮生成 / Boss 出场
 * 三阶段推进（10 → 15 → 20 击杀），每阶段有独立的生成节奏与丧尸组合，
 * 全部完成后进入 Boss 阶段。不会无限刷怪：每波击杀目标达成即推进。
 */

import { WAVES, BOSS_PHASE, LIMITS, DEVICE } from '../config.js';
import { MAP } from '../data/mapData.js';
import { Zombie } from '../entities/Zombie.js';
import { Boss } from '../entities/Boss.js';
import { isBlocked } from '../core/Collision.js';
import { weightedPick, dist, rand } from '../core/MathUtils.js';

export class SpawnSystem {
  constructor(game) {
    this.game = game;
    this.zombieCap = DEVICE.lowEnd ? LIMITS.zombiesTouch : LIMITS.zombiesDesktop;
    this.reset();
  }

  reset() {
    this.phase = 'wave';        // wave | bossIntro | boss | done
    this.waveIndex = 0;
    this.waveKills = 0;
    this.spawnTimer = 0.5;
    this.bossSpawned = false;
    this.bossPending = 0;
    this.totalSpawned = 0;
    this.boss = null;
  }

  get wave() {
    return WAVES[this.waveIndex] || null;
  }

  get isBossPhase() {
    return this.phase === 'boss' || this.phase === 'bossIntro';
  }

  get target() {
    if (this.isBossPhase) return 0;
    return this.wave ? this.wave.target : 0;
  }

  get waveKillCount() {
    return this.waveKills;
  }

  get aliveCount() {
    let n = 0;
    const list = this.game.zombies;
    for (let i = 0; i < list.length; i++) {
      if (!list[i].dead && !list[i].isBoss) n++;
    }
    return n;
  }

  update(dt) {
    if (this.phase === 'done') return;

    if (this.phase === 'bossIntro') {
      this.bossPending -= dt;
      if (this.bossPending <= 0 && !this.bossSpawned) this.spawnBoss();
      return;
    }

    if (this.phase === 'boss') return;

    // ---- 阶段推进 ----
    if (this.waveKills >= this.target) {
      this.advanceWave();
      return;
    }

    // ---- 生成节奏 ----
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const wave = this.wave;
    if (!wave) return;
    if (this.aliveCount >= Math.min(wave.maxAlive, this.zombieCap)) return;
    if (this.totalSpawned >= this.target + 6) return; // 安全阀：不会无限刷

    const typeId = weightedPick(wave.types);
    const ok = this.spawnOne(typeId);
    this.spawnTimer = wave.interval * (ok ? rand(0.75, 1.2) : 0.5);
  }

  advanceWave() {
    const game = this.game;
    if (this.waveIndex < WAVES.length - 1) {
      this.waveIndex += 1;
      this.waveKills = 0;
      this.spawnTimer = 1.3;
      this.totalSpawned = 0;
      const w = this.wave;
      game.hud.banner(`${w.tag} · ${w.name}`, '#6dfba4');
      game.audio.play('levelup');
      game.onWaveChanged(w);
      if (this.waveIndex === 1) game.queueStory('mid');
      return;
    }

    // 三阶段完成 → Boss
    this.phase = 'bossIntro';
    this.bossPending = BOSS_PHASE.spawnDelay;
    game.onBossPhaseStart();
  }

  /** 击杀回调（由 Game 调用） */
  onZombieKilled(z) {
    if (this.phase === 'wave' && !z.isBoss) this.waveKills += 1;
  }

  spawnOne(typeId) {
    const pt = this.pickSpawnPoint();
    if (!pt) return false;
    const z = new Zombie(this.game, typeId, pt.x, pt.y);
    this.game.zombies.push(z);
    this.totalSpawned++;
    this.game.particles.ring(pt.x, pt.y, 38, 'rgba(190,70,55,0.85)', 0.45);
    this.game.particles.dust(pt.x, pt.y, 2);
    return true;
  }

  /**
   * 出生点：距离玩家 ≥440 且不在障碍物内；
   * 优先选择屏幕外点位（避免玩家眼前凭空刷怪），没有可用点时退化为屏幕内远处。
   */
  pickSpawnPoint() {
    const p = this.game.player;
    const cam = this.game.camera;
    const obstacles = MAP.obstacles;
    const pool = [];
    const offscreen = [];

    for (let i = 0; i < MAP.spawnPoints.length; i++) {
      const s = MAP.spawnPoints[i];
      if (dist(s.x, s.y, p.x, p.y) < 440) continue;
      if (isBlocked(s.x, s.y, 26, obstacles)) continue;
      pool.push(s);
      const dx = Math.abs(s.x - (cam.x + cam.viewW / 2));
      const dy = Math.abs(s.y - (cam.y + cam.viewH / 2));
      if (dx > cam.viewW / 2 + 30 || dy > cam.viewH / 2 + 30) offscreen.push(s);
    }

    const list = offscreen.length > 0 ? offscreen : pool;
    if (list.length > 0) {
      const s = list[Math.floor(Math.random() * list.length)];
      return { x: s.x + rand(-24, 24), y: s.y + rand(-24, 24) };
    }

    // 退化：随机远处空地
    for (let i = 0; i < 24; i++) {
      const x = rand(70, MAP.width - 70);
      const y = rand(70, MAP.height - 70);
      if (dist(x, y, p.x, p.y) < 400) continue;
      if (isBlocked(x, y, 26, obstacles)) continue;
      return { x, y };
    }
    return null;
  }

  spawnBoss() {
    this.bossSpawned = true;
    this.phase = 'boss';
    const candidates = [
      { x: 1200, y: 660 }, { x: 1200, y: 1150 }, { x: 1000, y: 800 }
    ];
    let pos = candidates[0];
    for (const c of candidates) {
      if (!isBlocked(c.x, c.y, 50, MAP.obstacles)) { pos = c; break; }
    }
    const boss = new Boss(this.game, pos.x, pos.y);
    this.boss = boss;
    this.game.zombies.push(boss);
    this.game.onBossSpawned(boss);
  }

  /** HUD 文案 */
  getHudInfo() {
    if (this.phase === 'done') {
      return { tag: '完成', mission: '章节完成', kills: this.waveKills, target: 0 };
    }
    if (this.isBossPhase) {
      return {
        tag: BOSS_PHASE.tag,
        mission: BOSS_PHASE.mission,
        kills: this.waveKills,
        target: 0
      };
    }
    const w = this.wave;
    return { tag: w.tag, mission: w.mission, kills: this.waveKills, target: w.target };
  }
}
