/**
 * tools/boss-probe.mjs — Boss 战可玩性探针（输出击杀耗时与承受伤害）
 */
await import('./dom-stub.mjs');
const { fakeDocument } = await import('./dom-stub.mjs');
const { Game } = await import('../js/game.js');
const { AssetManager } = await import('../js/core/AssetManager.js');
const { SaveSystem } = await import('../js/systems/SaveSystem.js');

const game = new Game(fakeDocument.getElementById('game-canvas'), new AssetManager(), new SaveSystem());
game.startNewRun(false);
game.zombies.length = 0;

const p = game.player;
p.x = 2100;
p.y = 900;
p.maxHp = 220;
p.hp = 220;

game.spawner.phase = 'boss';
game.spawner.spawnBoss();
const boss = game.spawner.boss;
boss.x = 2100;
boss.y = 560;
boss.spawnTimer = 0.2;
boss.bossState = 'chase';

const input = game.input;
input.mouse.seen = true;
input.mouse.inside = true;
input.mouse.down = true;

let t = 0;
const startHp = p.hp;
let maxBossDps = 0;
let lastBossHp = boss.hp;
let lastSample = 0;

for (let i = 0; i < 60 * 60; i++) {
  if (game.state === 'story') { game.dialog.skip(); continue; }
  if (game.state === 'upgrade') { game.upgradePanel.select(game.upgradePanel.choices[0]); continue; }
  if (game.state !== 'playing') break;

  const dx = boss.x - p.x;
  const dy = boss.y - p.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const scr = game.camera.worldToScreen(boss.x, boss.y);
  input.mouse.x = scr.x;
  input.mouse.y = scr.y;

  // 保持在 300 左右，并躲开震地
  let mx = 0;
  let my = 0;
  if (boss.bossState === 'specialWindup') {
    mx = -dx / d;
    my = -dy / d;
  } else if (d < 260) {
    mx = -dx / d;
    my = -dy / d;
  } else if (d > 420) {
    mx = dx / d;
    my = dy / d;
  } else {
    mx = -dy / d;
    my = dx / d;
  }
  input.setMoveAxis(mx, my);
  if (p.slot.mag === 0 && !p.reloading) input.press('reload');

  game.update(1 / 60);
  t += 1 / 60;

  if (boss.dead) break;

  if (t - lastSample >= 3) {
    const dps = (lastBossHp - boss.hp) / (t - lastSample);
    maxBossDps = Math.max(maxBossDps, dps);
    console.log(
      `t=${t.toFixed(0)}s BossHP=${boss.hp.toFixed(0)} (${Math.round(boss.hp / boss.maxHp * 100)}%)` +
      ` 玩家HP=${p.hp.toFixed(0)}/${p.maxHp} 状态=${boss.bossState} 距离=${d.toFixed(0)}` +
      ` 输出=${dps.toFixed(0)}/s 弹药=${p.slot.mag}/${p.slot.reserve} 装填=${p.reloading}`
    );
    lastBossHp = boss.hp;
    lastSample = t;
  }
}

console.log('\n结果：', {
  bossDead: boss.dead,
  time: t.toFixed(1) + 's',
  playerHp: Math.round(p.hp),
  damageTaken: Math.round(startHp - p.hp),
  state: game.state,
  kills: game.kills
});
