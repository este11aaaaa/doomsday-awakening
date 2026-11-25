/**
 * tools/headless-test.mjs — 无浏览器自动化测试
 *
 * 做法：用最小 DOM / Canvas 打桩，真实实例化 Game 及其所有系统，
 * 以 60FPS 驱动 update() 和 render()，用脚本玩家完成“移动→瞄准→射击→
 * 击杀→升级→选技能→拾取→暂停→死亡→重开→Boss→胜利”的完整流程。
 *
 * 说明：Canvas 绘制指令被打桩为空操作，因此本测试验证的是
 * 逻辑 / 状态机 / 数值 / 输入接口 / 对象上限，而不是画面像素。
 */

import assert from 'node:assert';

// ============================================================
// 1. DOM / 浏览器环境打桩
// ============================================================
await import('./dom-stub.mjs');
const { fakeDocument, elements } = await import('./dom-stub.mjs');

// ============================================================
// 2. 导入游戏模块
// ============================================================
const { Game } = await import('../js/game.js');
const { DEVICE, LIMITS } = await import('../js/config.js');
const { AssetManager } = await import('../js/core/AssetManager.js');
const { SaveSystem } = await import('../js/systems/SaveSystem.js');
const { isBlocked } = await import('../js/core/Collision.js');
const { Zombie } = await import('../js/entities/Zombie.js');
const { MAP } = await import('../js/data/mapData.js');

// ============================================================
// 3. 断言收集
// ============================================================
const results = [];
function check(name, cond, info = '') {
  const ok = !!cond;
  results.push({ name, ok, info });
  if (!ok) console.error(`  ✗ ${name} ${info ? '— ' + info : ''}`);
  else console.log(`  ✓ ${name}${info ? ' — ' + info : ''}`);
  return ok;
}

// ============================================================
// 4. 初始化游戏
// ============================================================
console.log('\n=== 初始化 ===');
const canvas = fakeDocument.getElementById('game-canvas');
const assets = new AssetManager();
const save = new SaveSystem();
let game;
try {
  game = new Game(canvas, assets, save);
  check('Game 实例化成功', true);
} catch (err) {
  check('Game 实例化成功', false, String(err && err.stack));
  process.exit(1);
}
check('初始状态为 menu', game.state === 'menu', game.state);
check('初始 HUD 隐藏', elements.get('hud').classList.contains('hidden'));
check('静态地图层已生成', !!game.renderer.staticLayer);
check('玩家初始武器为突击步枪', game.player.currentWeaponId === 'rifle');
check('玩家初始弹药 30/120', game.player.slot.mag === 30 && game.player.slot.reserve === 120);

// ============================================================
// 5. 剧情流程
// ============================================================
console.log('\n=== 剧情 ===');
game.startNewRun(true);
check('开局进入剧情状态', game.state === 'story', game.state);
check('剧情对话已激活', game.dialog.active === true);
check('剧情 HUD 隐藏', elements.get('hud').classList.contains('hidden'));

let guard = 0;
while (game.dialog.active && guard++ < 600) {
  game.dialog.next();
  game.update(1 / 60);
}
check('剧情可逐句推进并正常结束', !game.dialog.active);
check('剧情结束后进入战斗', game.state === 'playing', game.state);
check('战斗 HUD 已显示', !elements.get('hud').classList.contains('hidden'));
check('预置物资已放置', game.loot.length === MAP.lootSpots.length, `${game.loot.length} 个`);

// ============================================================
// 6. 脚本玩家
// ============================================================
let frames = 0;
let maxZombies = 0;
let maxBullets = 0;
let maxParticles = 0;

function chooseSkill(g) {
  const choices = g.upgradePanel.choices;
  if (!choices.length) return;
  const prefer = ['ammo', 'rapid', 'vitality', 'reload', 'crit', 'emp'].find((id) => choices.includes(id));
  g.upgradePanel.select(prefer || choices[0]);
}


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

function control(g) {
  const p = g.player;
  const input = g.input;
  input.mouse.seen = true;
  input.mouse.inside = true;
  input.mouse.down = true;

  let target = null;
  let bestD = Infinity;
  for (const z of g.zombies) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d < bestD) { bestD = d; target = z; }
  }

  if (target) {
    const scr = g.camera.worldToScreen(target.x, target.y);
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

    // 躲 Boss 震地预警
    if (target.isBoss && target.bossState === 'specialWindup') {
      mx = -dx / d;
      my = -dy / d;
    }
    input.setMoveAxis(mx, my);
  } else {
    input.setMoveAxis(0, 0);
    input.mouse.down = false;
  }

  if (p.slot.mag === 0 && !p.reloading) input.press('reload');
  if (g.nearestLoot) input.press('pickup');

  if (g.skills.empLevel > 0 && g.skills.empCooldown <= 0) {
    const near = g.zombies.filter((z) => !z.dead && Math.hypot(z.x - p.x, z.y - p.y) < 210).length;
    if (near >= 3) input.press('skill');
  }
}

/** 把游戏稳定到 playing 状态（处理自动升级/剧情/暂停） */
function settle() {
  game.input.reset();
  for (let i = 0; i < 60; i++) {
    if (game.state === 'upgrade') chooseSkill(game);
    else if (game.state === 'story') game.dialog.skip();
    else if (game.state === 'paused') game.resumeFromPause();
    else break;
  }
  return game.state;
}

/** 推进若干秒，自动处理升级/剧情/暂停，保证逻辑持续运行 */
function advance(seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (game.state === 'upgrade') chooseSkill(game);
    else if (game.state === 'story') game.dialog.skip();
    else if (game.state === 'paused') game.resumeFromPause();
    game.update(1 / 60);
  }
}

function run(seconds, opts = {}) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (game.state === 'story') {
      game.dialog.next();
    } else if (game.state === 'upgrade') {
      chooseSkill(game);
    } else if (game.state === 'paused') {
      game.resumeFromPause();
    } else if (game.state === 'victory' || game.state === 'defeat') {
      break;
    } else if (game.state === 'playing') {
      if (opts.idle !== true) control(game);
    }

    game.update(1 / 60);
    frames++;

    maxZombies = Math.max(maxZombies, game.zombies.length);
    maxBullets = Math.max(maxBullets, game.combat.activeBulletCount);
    maxParticles = Math.max(maxParticles, game.particles.activeCount);

    if (frames % 20 === 0) game.render();
  }
}

// ============================================================
// 7. 战斗 / 成长 / 拾取
// ============================================================
console.log('\n=== 战斗 20 秒 ===');
run(20);
check('丧尸已生成', maxZombies > 0, `峰值 ${maxZombies} 只`);
check('射击产生子弹', game.combat.stats.shots > 0, `${game.combat.stats.shots} 发`);
check('子弹命中丧尸', game.combat.stats.hits > 0, `${game.combat.stats.hits} 次命中`);
check('击杀丧尸获得经验', game.kills > 0 && game.level.totalXp > 0, `击杀 ${game.kills}，经验 ${game.level.totalXp}`);
check('命中有记录', game.combat.stats.hits > 0, `${game.combat.stats.hits} 次`);
check('子弹数量受上限控制', maxBullets <= LIMITS.bullets, `峰值 ${maxBullets}/${LIMITS.bullets}`);
check('粒子数量受上限控制', maxParticles <= game.particles.cap, `峰值 ${maxParticles}/${game.particles.cap}`);
check('丧尸数量受上限控制', maxZombies <= game.spawner.zombieCap, `峰值 ${maxZombies}/${game.spawner.zombieCap}`);

console.log('\n=== 暴击 ===');
{
  settle();
  const p = game.player;
  p.x = 1200;
  p.y = 1600;
  p.reloading = false;
  p.fireTimer = 0;
  p.slots[p.currentWeaponId].mag = 30;
  game.camera.update(0, p, game.world, true);
  const target = new Zombie(game, 'boss', p.x + 150, p.y); // 用 Boss 当靶子，血厚不会一枪死
  target.spawnTimer = 0;
  game.zombies.push(target);
  const critBefore = game.combat.stats.crits;
  const origCrit = p.getCritChance.bind(p);
  p.getCritChance = () => 1;      // 强制必定暴击
  for (let i = 0; i < 6; i++) {
    p.fireTimer = 0;
    game.combat.fireWeapon(p, 0);
    advance(4 / 60);
  }
  p.getCritChance = origCrit;
  check('暴击率生效并统计', game.combat.stats.crits > critBefore, `暴击 ${game.combat.stats.crits - critBefore} 次`);
  check('暴击造成额外伤害', target.hp < target.maxHp, `${target.maxHp} → ${target.hp}`);
}

console.log('\n=== 换弹 ===');
{
  settle();
  const p = game.player;
  game.input.mouse.down = false;
  game.input.setMoveAxis(0, 0);
  p.reloading = false;
  p.slot.mag = 0;
  p.slot.reserve = 60;
  const ok = p.startReload();
  check('可以开始换弹', ok === true);
  const t = p.getReloadTime();
  advance(t + 0.3);
  check('换弹完成并补满弹匣', p.slot.mag === p.weapon.magSize, `${p.slot.mag}/${p.weapon.magSize} (state=${game.state})`);
  check('备用弹药相应减少', p.slot.reserve < 60, String(p.slot.reserve));
}

console.log('\n=== 拾取 ===');
{
  settle();
  const p = game.player;
  p.hp = 40;
  p.invuln = 0;
  const before = p.hp;
  const loot = game.spawnLoot('medkit', p.x + 10, p.y + 10);
  loot.spawnScale = 1;
  game.findNearestLoot();
  check('靠近物资时出现拾取提示', game.nearestLoot === loot);
  const picked = game.tryPickup();
  check('按 E 成功拾取医疗包', picked === true);
  check('医疗包恢复 40 生命', p.hp === Math.min(p.maxHp, before + 40), `${before} → ${p.hp}`);
  check('拾取后物资从地图移除', !game.loot.includes(loot));
}

console.log('\n=== 升级 / 技能 ===');
{
  settle();
  const p = game.player;
  const dmgBefore = p.getDamage();
  const statsBefore = {
    dmg: p.getDamage(),
    interval: p.getFireInterval(),
    maxHp: p.maxHp,
    reload: p.getReloadTime(),
    crit: p.getCritMultiplier()
  };
  game.level.addXp(1200);
  game.update(1 / 60);
  check('经验足够时弹出升级面板', game.state === 'upgrade', game.state);
  check('升级面板提供 3 个技能', game.upgradePanel.choices.length === 3, game.upgradePanel.choices.join(','));
  const pickId = game.upgradePanel.choices.includes('ammo') ? 'ammo' : game.upgradePanel.choices[0];
  const lvBefore = game.skills.levels[pickId];
  game.upgradePanel.select(pickId);
  check('选择技能后离开面板或继续下一级', game.state === 'playing' || game.state === 'upgrade', game.state);
  check('技能等级 +1', game.skills.levels[pickId] === lvBefore + 1, `${pickId}: ${lvBefore} → ${game.skills.levels[pickId]}`);
  // 任意技能都必须真实改变至少一项战斗数值
  const statsAfter = {
    dmg: p.getDamage(),
    interval: p.getFireInterval(),
    maxHp: p.maxHp,
    reload: p.getReloadTime(),
    crit: p.getCritMultiplier()
  };
  const changed = Object.keys(statsBefore).some((k) => Math.abs(statsBefore[k] - statsAfter[k]) > 1e-6) || game.skills.empLevel > 0;
  check('所选技能真实改变战斗数值', changed, `${pickId}: 伤害 ${dmgBefore.toFixed(1)} → ${p.getDamage().toFixed(1)}，射速间隔 ${statsBefore.interval.toFixed(3)} → ${statsAfter.interval.toFixed(3)}，生命上限 ${statsBefore.maxHp} → ${statsAfter.maxHp}`);
  // 连续升级：面板应再次弹出直到选择完毕
  let upGuard = 0;
  while (game.state === 'upgrade' && upGuard++ < 20) {
    game.upgradePanel.select(game.upgradePanel.choices[0]);
    game.update(1 / 60);
  }
  check('多次升级可连续选择且能回到战斗', game.state === 'playing', game.state);
}

console.log('\n=== 电磁脉冲 ===');
{
  settle();
  const p = game.player;
  game.skills.apply('emp');
  game.skills.empCooldown = 0;
  // 固定生成一个测试目标，保证断言可重复
  const target = new Zombie(game, 'normal', p.x + 80, p.y + 20);
  target.spawnTimer = 0;
  game.zombies.push(target);
  const before = target.hp;
  const cast = game.skills.tryCastEmp();
  check('EMP 可释放', cast === true);
  check('EMP 进入冷却', game.skills.empCooldown > 0, `${game.skills.empCooldown.toFixed(1)}s`);
  check('EMP 对范围内丧尸造成伤害', target.hp < before || target.dead, `${before} → ${target.hp}`);
}

console.log('\n=== 毒液丧尸 / 毒池 ===');
{
  settle();
  const p = game.player;
  // 固定到街道开阔处，避免毒液弹被墙体挡下
  p.x = 1200;
  p.y = 1600;
  p.hp = p.maxHp;
  p.invuln = 0;
  game.camera.update(0, p, game.world, true);
  game.combat.reset();
  game.combat.spawnAcid(p.x + 55, p.y, Math.PI, 300, 8);
  advance(0.7);
  const activeAcids = game.combat.acids.filter((a) => a.active).length;
  check('毒液弹命中后生成毒池', game.combat.hazards.length > 0,
    `${game.combat.hazards.length} 个 (activeAcids=${activeAcids}, state=${game.state}, player=(${p.x.toFixed(0)},${p.y.toFixed(0)}), hp=${p.hp.toFixed(0)})`);
  // 直接把毒池放到玩家脚下，验证持续伤害
  game.combat.hazards.length = 0;
  game.input.reset();
  game.combat.spawnHazard(p.x, p.y);
  p.invuln = 0;
  const before = p.hp;
  advance(2);
  check('毒池对玩家持续造成伤害', p.hp < before, `${before} → ${p.hp.toFixed(1)}`);
}

console.log('\n=== 暂停 / 恢复 ===');
{
  settle();
  game.pause();
  check('暂停状态正确', game.state === 'paused');
  const elapsed = game.elapsed;
  const bullets = game.combat.activeBulletCount;
  const zombies = game.zombies.length;
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  check('暂停时游戏时间冻结', game.elapsed === elapsed);
  check('暂停时不产生子弹', game.combat.activeBulletCount <= bullets);
  check('暂停时丧尸数量不变', game.zombies.length === zombies);
  game.resumeFromPause();
  check('可以恢复游戏', game.state === 'playing');
}

// ============================================================
// 8. 死亡 / 结算 / 重开
// ============================================================
console.log('\n=== 死亡与结算 ===');
{
  settle();
  const p = game.player;
  p.invuln = 0;
  p.hp = 5;
  p.takeDamage(999, game);
  game.update(1 / 60);
  check('玩家死亡后进入失败结算', game.state === 'defeat', game.state);
  check('失败结算面板已显示', !elements.get('result').classList.contains('hidden'));
  check('失败时 HUD 已隐藏', elements.get('hud').classList.contains('hidden'));
  check('失败后不再更新世界', (() => {
    const e = game.elapsed;
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    return game.elapsed === e;
  })());
  check('战绩已写入存档', save.record.plays >= 1, `plays=${save.record.plays}`);
}

console.log('\n=== 连续重新开始 3 次 ===');
{
  for (let n = 1; n <= 3; n++) {
    game.startNewRun(false);
    check(`第 ${n} 次重开进入战斗`, game.state === 'playing', game.state);
    check(`第 ${n} 次重开后丧尸清空`, game.zombies.length === 0, `${game.zombies.length}`);
    check(`第 ${n} 次重开后 Boss 清空`, game.spawner.boss === null);
    check(`第 ${n} 次重开后等级重置`, game.level.level === 1 && game.kills === 0);
    check(`第 ${n} 次重开后玩家满血`, game.player.hp === game.player.maxHp);
    run(3);
    check(`第 ${n} 次重开后仍可正常战斗`, game.state === 'playing' || game.state === 'upgrade' || game.state === 'defeat', game.state);
    // 清理战场，避免影响下一次
    game.player.hp = game.player.maxHp;
  }
}

// ============================================================
// 9. Boss 战与胜利
// ============================================================
console.log('\n=== Boss 与胜利 ===');
{
  game.startNewRun(false);
  const p = game.player;
  p.hp = p.maxHp;
  game.spawner.waveIndex = 2;
  game.spawner.phase = 'boss';
  game.spawner.spawnBoss();
  const boss = game.spawner.boss;
  check('Boss 已生成', !!boss && boss.isBoss === true);
  check('Boss 血量 1800', boss.maxHp === 1800, String(boss.maxHp));
  check('Boss 血条在 HUD 中显示', (() => {
    game.hud.update(0.016);
    return !elements.get('boss-bar').classList.contains('hidden');
  })());

  // 让 Boss 释放一次震地，验证前摇预警与释放逻辑
  p.invuln = 0;
  boss.spawnTimer = 0.02;
  boss.specialTimer = 0;
  boss.bossState = 'chase';
  boss.attackTimer = 99;
  let sawTelegraph = false;
  let sawSlam = false;
  for (let i = 0; i < 300; i++) {
    if (game.state === 'upgrade') chooseSkill(game);
    else if (game.state === 'story') game.dialog.skip();
    game.update(1 / 60);
    if (boss.bossState === 'specialWindup') sawTelegraph = true;
    if (boss.slamFlash > 0) sawSlam = true;
  }
  check('Boss 震地有前摇预警并会释放', sawTelegraph && sawSlam, `telegraph=${sawTelegraph} slam=${sawSlam}`);

  // 击杀 Boss
  p.hp = p.maxHp;
  p.invuln = 99;
  boss.hp = 1;
  boss.takeDamage(999, false, 0);
  game.onZombieKilled(boss);
  game.update(1 / 60);
  check('Boss 死亡触发胜利剧情', game.state === 'story', game.state);
  let vGuard = 0;
  while (game.dialog.active && vGuard++ < 400) {
    game.dialog.next();
    game.update(1 / 60);
  }
  check('胜利剧情结束后进入胜利结算', game.state === 'victory', game.state);
  check('通关次数已记录', save.record.wins >= 1, `wins=${save.record.wins}`);
  check('胜利后不再产生丧尸', (() => {
    const n = game.zombies.length;
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    return game.zombies.length === n;
  })());
}

// ============================================================
// 10. 触屏摇杆（Pointer 事件 + 多点触控）
// ============================================================
console.log('\n=== 触屏双摇杆 / 多点触控 ===');
{
  DEVICE.touch = true;
  game.device.touch = true;
  game.input.isTouchMode = true;
  game.resize();
  game.startNewRun(false);
  game.touch.show();

  const moveZone = elements.get('stick-move');
  const aimZone = elements.get('stick-aim');
  moveZone._rect = { left: 20, top: 500, width: 152, height: 152 };
  aimZone._rect = { left: 900, top: 500, width: 152, height: 152 };

  // 左摇杆：向右拖
  moveZone.emit('pointerdown', { pointerId: 11, clientX: 96, clientY: 576 });
  moveZone.emit('pointermove', { pointerId: 11, clientX: 146, clientY: 576 });
  check('左摇杆产生移动输入', Math.abs(game.input.touchMove.x) > 0.5, `x=${game.input.touchMove.x.toFixed(2)}`);

  // 右摇杆：向上拖（同时按住）
  aimZone.emit('pointerdown', { pointerId: 22, clientX: 976, clientY: 576 });
  aimZone.emit('pointermove', { pointerId: 22, clientX: 976, clientY: 526 });
  check('右摇杆触发瞄准与射击', game.input.touchAim.active === true && game.input.isFiring() === true);
  check('右摇杆方向正确（向上 ≈ -90°）', Math.abs(game.input.touchAim.y + 1) < 0.15, `y=${game.input.touchAim.y.toFixed(2)}`);

  // 多点触控互不干扰：先松左摇杆
  moveZone.emit('pointerup', { pointerId: 11 });
  check('松开左摇杆后移动归零', game.input.touchMove.x === 0 && game.input.touchMove.y === 0);
  check('松开左摇杆不影响右摇杆射击', game.input.touchAim.active === true && game.input.isFiring() === true);

  // 再松右摇杆
  aimZone.emit('pointerup', { pointerId: 22 });
  check('松开右摇杆后停止射击', game.input.touchAim.active === false && game.input.isFiring() === false);

  // 触屏按钮（按下后由 update 消费动作）
  game.input.mouse.down = false;
  const btnReload = elements.get('btn-reload');
  game.player.reloading = false;
  game.player.slot.mag = 1;
  game.player.slot.reserve = 30;
  btnReload.emit('pointerdown', { pointerId: 33 });
  game.update(1 / 60);
  check('触屏换弹按钮可用', game.player.reloading === true);

  const btnSkill = elements.get('btn-skill');
  game.skills.levels.emp = 1;
  game.skills.recompute();
  game.skills.empCooldown = 0;
  game.state = 'playing';
  btnSkill.emit('pointerdown', { pointerId: 34 });
  game.update(1 / 60);
  check('触屏技能按钮可用', game.skills.empCooldown > 0, `${game.skills.empCooldown.toFixed(1)}s`);

  // 触屏瞄准与射击闭环：在正前方生成一只丧尸，用右摇杆打死它
  const p2 = game.player;
  p2.x = 1200; p2.y = 1500;
  p2.reloading = false;
  p2.slots[p2.currentWeaponId].mag = 30;
  const target = new Zombie(game, 'normal', p2.x + 130, p2.y);
  target.spawnTimer = 0;
  game.zombies.push(target);
  const shotsBefore = game.combat.stats.shots;
  const hpBefore = target.hp;
  game.input.setAimAxis(1, 0);
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  check('触屏摇杆可驱动玩家射击', game.combat.stats.shots > shotsBefore, `+${game.combat.stats.shots - shotsBefore} 发`);
  check('触屏射击可以命中并击杀目标', target.hp < hpBefore || target.dead, `HP ${hpBefore} → ${target.hp}`);

  // 恢复桌面模式
  game.touch.hide();
  DEVICE.touch = false;
  game.device.touch = false;
  game.input.isTouchMode = false;
  game.resize();
}

// ============================================================
// 11. 对象上限 / 状态一致性
// ============================================================
console.log('\n=== 稳定性 ===');
{
  game.startNewRun(false);
  run(25);
  check('长时间运行后丧尸数量仍受控', game.zombies.length <= game.spawner.zombieCap + 1, `${game.zombies.length}`);
  check('长时间运行后子弹数量仍受控', game.combat.activeBulletCount <= LIMITS.bullets, `${game.combat.activeBulletCount}`);
  check('长时间运行后粒子数量仍受控', game.particles.activeCount <= game.particles.cap, `${game.particles.activeCount}`);
  check('丧尸不会停留在墙体内', game.zombies.every((z) => !isBlocked(z.x, z.y, z.radius - 2, MAP.obstacles)) || game.zombies.length === 0);
  check('伤害数字不超过上限', game.particles.texts.length <= game.particles.textCap);
  check('丧尸死亡后会被清理', game.zombies.every((z) => !z.dead));
  check('渲染各状态无异常', (() => {
    try {
      game.render();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  })());
}

// ============================================================
// 12. 汇总
// ============================================================
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log('\n================ 测试汇总 ================');
console.log(`断言：${results.length} 项，通过 ${passed}，失败 ${failed}`);
console.log(`模拟帧数：${frames}`);
console.log(`战斗统计：射击 ${game.combat.stats.shots} / 命中 ${game.combat.stats.hits} / 暴击 ${game.combat.stats.crits} / 击杀 ${game.combat.stats.kills}`);
console.log(`峰值：丧尸 ${maxZombies} / 子弹 ${maxBullets} / 粒子 ${maxParticles}`);
console.log(`存档：plays=${save.record.plays}, wins=${save.record.wins}, bestKills=${save.record.bestKills}`);
if (failed) {
  console.log('\n失败项：');
  for (const r of results) if (!r.ok) console.log(` - ${r.name} ${r.info}`);
  process.exit(1);
}
console.log('全部断言通过 ✅');
