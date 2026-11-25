/**
 * tools/capture-shots.mjs — 生成文档截图（真实浏览器渲染）
 * 前置：静态服务器 8000 + headless Chrome 9222
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html';
const OUT = new URL('../docs/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, { resolve });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (res.exceptionDetails) console.error('eval error', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
  return res.result?.value;
};
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(res.data, 'base64'));
  console.log('  saved', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: GAME_URL });
// 等资源（贴图/立绘）加载完成再截，避免拍到程序化回退版本
for (let i = 0; i < 30; i++) {
  await wait(150);
  const ok = await evaluate("!!(window.__game && window.__game.assets.getImage('menu_bg') && window.__game.assets.getImage('player'))");
  if (ok) break;
}
await wait(300);

console.log('菜单');
await shot('screenshot-01-menu.png');

console.log('剧情');
await evaluate("document.getElementById('btn-start').click()");
await wait(1200);
await shot('screenshot-02-story.png');

console.log('战斗场景');
await evaluate("document.getElementById('dialog-skip').click()");
await wait(400);
// 布置一个战斗场景：玩家在超市中央通道，周围有丧尸、物资、弹道
await evaluate(`(() => {
  const g = window.__game;
  const { Zombie } = g.player.constructor === Object ? {} : {};
  g.zombies.length = 0;
  g.kills = 0;
  g.level.level = 3; g.level.xp = 60;
  g.player.x = 1180; g.player.y = 962;
  g.player.maxHp = 130; g.player.hp = 96;
  g.player.currentWeaponId = 'rifle';
  g.player.slots.rifle.mag = 21; g.player.slots.rifle.reserve = 88;
  g.skills.levels.ammo = 2; g.skills.levels.rapid = 1; g.skills.recompute();
  g.spawner.waveKills = 6;
  g.nearestLoot = null;
  g.loot.length = 0;
  g.spawnLoot('ammo', 1240, 960);
  g.spawnLoot('medkit', 1060, 1010);
  g.combat.reset();
  g.particles.clear();
  return true;
})()`);
await wait(200);

// 用真实输入制造战斗画面：向上方射击
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 300 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 300, button: 'left', buttons: 1, clickCount: 1 });
await wait(700);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 300, button: 'left', buttons: 0, clickCount: 1 });
await wait(120);
await shot('screenshot-03-combat.png');

console.log('升级面板');
await evaluate('window.__game.level.addXp(400)');
await wait(500);
await shot('screenshot-04-upgrade.png');
for (let i = 0; i < 8; i++) {
  const st = await evaluate('window.__game.state');
  if (st !== 'upgrade') break;
  await evaluate("document.querySelector('.skill-card').click()");
  await wait(200);
}

console.log('暂停');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await wait(350);
await shot('screenshot-05-pause.png');
await evaluate("document.getElementById('btn-resume').click()");
await wait(200);

console.log('Boss 战');
await evaluate(`(() => {
  const g = window.__game;
  g.player.x = 1180; g.player.y = 1150;
  g.player.hp = g.player.maxHp;
  g.spawner.phase = 'boss';
  g.spawner.waveIndex = 2;
  g.spawner.spawnBoss();
  const b = g.spawner.boss;
  b.x = 1180; b.y = 930; b.spawnTimer = 0.01; b.hp = 1200; b.bossState = 'chase';
  b.specialTimer = 1.1;
  g.zombies.length = 1;
  g.zombies[0] = b;
  return true;
})()`);
await wait(1500);
await shot('screenshot-06-boss.png');

console.log('失败结算');
await evaluate(`(() => {
  const g = window.__game;
  g.player.invuln = 0; g.player.hp = 1; g.player.takeDamage(60, g);
  return true;
})()`);
await wait(500);
await shot('screenshot-07-defeat.png');

console.log('胜利结算');
await evaluate(`(() => {
  const g = window.__game;
  g.startNewRun(false);
  g.kills = 47; g.level.level = 8; g.elapsed = 214; g.level.totalXp = 1860;
  g.combat.stats.shots = 320; g.combat.stats.hits = 214; g.combat.stats.crits = 42;
  g.finishRun(true);
  return true;
})()`);
await wait(500);
await shot('screenshot-08-victory.png');

console.log('手机端');
await send('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenWidth: 844, screenHeight: 390
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.reload');
await wait(1600);
await shot('screenshot-09-mobile-menu.png');

await evaluate("document.getElementById('btn-start').click()");
await wait(700);
await evaluate("document.getElementById('dialog-skip').click()");
await wait(500);
await evaluate(`(() => {
  const g = window.__game;
  g.player.x = 1180; g.player.y = 962;
  g.spawnLoot('ammo', 1230, 940);
  return true;
})()`);
// 触摸双摇杆：左手移动 + 右手瞄准射击
const rects = await evaluate(`(() => {
  const l = document.getElementById('stick-move').getBoundingClientRect();
  const r = document.getElementById('stick-aim').getBoundingClientRect();
  return { l: {x: l.left + l.width/2, y: l.top + l.height/2}, r: {x: r.left + r.width/2, y: r.top + r.height/2} };
})()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rects.l.x, y: rects.l.y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rects.l.x + 40, y: rects.l.y, id: 1, radiusX: 12, radiusY: 12, force: 1 }, { x: rects.r.x, y: rects.r.y, id: 2, radiusX: 12, radiusY: 12, force: 1 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rects.l.x + 44, y: rects.l.y - 10, id: 1, radiusX: 12, radiusY: 12, force: 1 }, { x: rects.r.x + 10, y: rects.r.y - 44, id: 2, radiusX: 12, radiusY: 12, force: 1 }] });
await wait(900);
await shot('screenshot-10-mobile-combat.png');
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

console.log('完成');
process.exit(0);
