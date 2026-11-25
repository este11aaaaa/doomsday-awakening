/**
 * tools/probe.mjs — 定点探针：验证“瞄准 → 射击 → 命中 → 受伤”闭环
 */
await import('./dom-stub.mjs');
const { fakeDocument } = await import('./dom-stub.mjs');
const { Game } = await import('../js/game.js');
const { AssetManager } = await import('../js/core/AssetManager.js');
const { SaveSystem } = await import('../js/systems/SaveSystem.js');
const { Zombie } = await import('../js/entities/Zombie.js');
const { Bullet } = await import('../js/entities/Bullet.js');

const bs = { wall: 0, range: 0, hit: 0 };
const origUpdate = Bullet.prototype.update;
Bullet.prototype.update = function (dt, obs) {
  const wasActive = this.active;
  const alive = origUpdate.call(this, dt, obs);
  if (wasActive && !alive) {
    if (this.wallHit) bs.wall++;
    else bs.range++;
  }
  return alive;
};
const origTake = Zombie.prototype.takeDamage;
Zombie.prototype.takeDamage = function (...args) {
  bs.hit++;
  return origTake.apply(this, args);
};

const game = new Game(fakeDocument.getElementById('game-canvas'), new AssetManager(), new SaveSystem());
game.startNewRun(false);

const p = game.player;
// 移到建筑外开阔地（下方街道，周围无遮挡）
p.x = 1200;
p.y = 1600;
game.zombies.length = 0;
game.loot.length = 0;

const z = new Zombie(game, 'normal', 1400, 1600);
z.spawnTimer = 0;
z.x = 1400;
z.y = 1600;
game.zombies.push(z);

const input = game.input;
input.mouse.seen = true;
input.mouse.inside = true;
input.mouse.down = true;

let firstHp = z.hp;
let angleErrSum = 0;
let frameCount = 0;
for (let i = 0; i < 90; i++) {
  // 瞄准丧尸
  const scr = game.camera.worldToScreen(z.x, z.y);
  input.mouse.x = scr.x;
  input.mouse.y = scr.y;
  game.update(1 / 60);
  const trueAngle = Math.atan2(z.y - p.y, z.x - p.x);
  let err = p.aimAngle - trueAngle;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  angleErrSum += Math.abs(err);
  frameCount++;
}

console.log('瞄准平均误差(rad):', (angleErrSum / frameCount).toFixed(4));
console.log('子弹终止原因 wall/range/hit:', bs.wall, bs.range, bs.hit);
console.log('射击/命中:', game.combat.stats.shots, game.combat.stats.hits);
console.log('命中率:', Math.round(game.combat.stats.hits / Math.max(1, game.combat.stats.shots) * 100) + '%');
console.log('丧尸 HP:', firstHp, '→', z.hp, '死亡:', z.dead);
console.log('击杀计数:', game.kills, '经验:', game.level.totalXp);

// 近距离伤害测试（先停火并清空残留子弹，避免误杀测试目标）
input.mouse.down = false;
input.firing = false;
game.combat.reset();
game.zombies.length = 0;
const z2 = new Zombie(game, 'normal', p.x + 20, p.y);
z2.spawnTimer = 0;
game.zombies.push(z2);
const hp0 = p.hp;
for (let i = 0; i < 180; i++) game.update(1 / 60);
console.log('玩家 HP 受击:', hp0, '→', p.hp.toFixed(0), '丧尸距离:', Math.hypot(z2.x - p.x, z2.y - p.y).toFixed(0));
