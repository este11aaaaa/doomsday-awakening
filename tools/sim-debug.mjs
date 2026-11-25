/**
 * tools/sim-debug.mjs — 平衡性/行为调试脚本（不属于游戏运行时代码）
 * 用法：node tools/sim-debug.mjs [秒数]
 */
await import('./dom-stub.mjs');
const { fakeDocument } = await import('./dom-stub.mjs');
const { Game } = await import('../js/game.js');
const { AssetManager } = await import('../js/core/AssetManager.js');
const { SaveSystem } = await import('../js/systems/SaveSystem.js');
const { MAP } = await import('../js/data/mapData.js');

const canvas = fakeDocument.getElementById('game-canvas');
const game = new Game(canvas, new AssetManager(), new SaveSystem());
game.startNewRun(false);

const b = MAP.building;
const inside = (z) => z.x > b.x && z.x < b.x + b.w && z.y > b.y && z.y < b.y + b.h;


const B = MAP.building;
const inBuilding = (x, y) => x > B.x && x < B.x + B.w && y > B.y && y < B.y + B.h;
/** 测试机器人：跨区时也走门口（与丧尸 AI 相同的规则） */
function navPoint(from, to) {
  if (inBuilding(from.x, from.y) !== inBuilding(to.x, to.y)) {
    let best = null;
    let bd = Infinity;
    for (const g of MAP.gates) {
      const d = (g.x - from.x) ** 2 + (g.y - from.y) ** 2;
      if (d < bd) { bd = d; best = g; }
    }
    return best || to;
  }
  return to;
}

function control() {
  const p = game.player;
  const input = game.input;
  input.mouse.seen = true;
  input.mouse.inside = true;
  input.mouse.down = true;

  let target = null;
  let bestD = Infinity;
  for (const z of game.zombies) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d < bestD) { bestD = d; target = z; }
  }
  // 血量低时优先去捡医疗包
  let medkit = null;
  if (p.hp < p.maxHp * 0.65) {
    let bd = 900;
    for (const l of game.loot) {
      if (l.type !== 'medkit' || l.picked) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d < bd) { bd = d; medkit = l; }
    }
  }
  if (medkit && (!target || bestD > 150)) {
    const nav = navPoint(p, medkit);
    const dx = nav.x - p.x, dy = nav.y - p.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    input.setMoveAxis(dx / d, dy / d);
    const scr = game.camera.worldToScreen(medkit.x, medkit.y);
    input.mouse.x = scr.x; input.mouse.y = scr.y;
    if (p.slot.mag === 0 && !p.reloading) input.press('reload');
    if (game.nearestLoot) input.press('pickup');
    return;
  }

  if (target) {
    const scr = game.camera.worldToScreen(target.x, target.y);
    input.mouse.x = scr.x;
    input.mouse.y = scr.y;
    const nav = navPoint(p, target);
    const dx = nav.x - p.x;
    const dy = nav.y - p.y;
    const d = Math.max(1, bestD);
    const keep = target.isBoss ? 300 : 240;
    let mx = 0;
    let my = 0;
    if (d < keep - 70) { mx = -dx / d; my = -dy / d; }
    else if (d > keep + 90) { mx = dx / d; my = dy / d; }
    else { mx = -dy / d; my = dx / d; }
    input.setMoveAxis(mx, my);
  } else {
    input.setMoveAxis(0, 0);
    input.mouse.down = false;
  }
  if (p.slot.mag === 0 && !p.reloading) input.press('reload');
  if (game.nearestLoot) input.press('pickup');
}

const seconds = Number(process.argv[2] || 40);
let t = 0;
for (let i = 0; i < seconds * 60; i++) {
  if (game.state === 'story') game.dialog.skip();
  else if (game.state === 'upgrade') game.upgradePanel.select(game.upgradePanel.choices[0]);
  else if (game.state === 'paused') game.resumeFromPause();
  else if (game.state === 'playing') control();
  else break;

  game.update(1 / 60);
  t += 1 / 60;

  if (i % 300 === 0) {
    const zs = game.zombies.filter((z) => !z.dead);
    const dists = zs.map((z) => Math.hypot(z.x - game.player.x, z.y - game.player.y));
    const avg = dists.length ? dists.reduce((a, c) => a + c, 0) / dists.length : 0;
    const stuck = zs.filter((z) => z.avoidTimer > 0).length;
    console.log(
      `t=${t.toFixed(0).padStart(3)}s 波次=${game.spawner.waveIndex + 1}${game.spawner.isBossPhase ? '(boss)' : ''}` +
      ` 丧尸=${zs.length} 馆内=${zs.filter(inside).length} 平均距离=${avg.toFixed(0)} 绕行中=${stuck}` +
      ` 击杀=${game.kills} 等级=${game.level.level} HP=${game.player.hp.toFixed(0)}/${game.player.maxHp}` +
      ` 命中率=${game.combat.stats.shots ? Math.round(game.combat.stats.hits / game.combat.stats.shots * 100) : 0}%` +
      ` 玩家=(${game.player.x.toFixed(0)},${game.player.y.toFixed(0)}) 状态=${game.state}`
    );
  }
}
console.log('\n最终：', {
  state: game.state,
  kills: game.kills,
  level: game.level.level,
  wave: game.spawner.waveIndex + 1,
  phase: game.spawner.phase,
  hp: Math.round(game.player.hp),
  shots: game.combat.stats.shots,
  hits: game.combat.stats.hits,
  accuracy: game.combat.stats.shots ? Math.round(game.combat.stats.hits / game.combat.stats.shots * 100) : 0,
  alive: game.zombies.length
});
