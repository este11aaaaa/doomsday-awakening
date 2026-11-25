/**
 * tools/browser-test.mjs — 真实浏览器端到端测试（Chrome DevTools Protocol）
 *
 * 前置条件：
 *   1. 在项目根目录启动静态服务器：python -m http.server 8000
 *   2. 启动 headless Chrome：chrome --headless=new --remote-debugging-port=9222
 *
 * 覆盖内容：
 *   - 页面加载无 JS 异常 / 无 404 资源
 *   - 主菜单 → 剧情 → 战斗（真实鼠标键盘事件）
 *   - 击杀 / 升级面板 / 技能选择 / 暂停恢复
 *   - 桌面 1440×900 与手机 844×390 两套视口截图
 *   - 手机双摇杆真实触摸（Input.dispatchTouchEvent）驱动移动与射击
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:8000/index.html';
const OUT = new URL('../docs/e2e/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`);
}

// ---------------- CDP 客户端 ----------------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        for (const fn of this.listeners) fn(msg);
      }
    };
  }

  send(method, params = {}, timeout = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, timeout);
    });
  }

  on(fn) { this.listeners.push(fn); }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (res.exceptionDetails) {
      throw new Error('eval error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result ? res.result.value : undefined;
  }

  async screenshot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const p = join(OUT, name);
    writeFileSync(p, Buffer.from(data, 'base64'));
    return p;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return new CDP(ws);
}

// ---------------- 键盘 / 鼠标 / 触摸 ----------------
const KEY_MAP = {
  KeyW: { key: 'w', code: 'KeyW', vk: 87 },
  KeyA: { key: 'a', code: 'KeyA', vk: 65 },
  KeyS: { key: 's', code: 'KeyS', vk: 83 },
  KeyD: { key: 'd', code: 'KeyD', vk: 68 },
  KeyR: { key: 'r', code: 'KeyR', vk: 82 },
  KeyE: { key: 'e', code: 'KeyE', vk: 69 },
  KeyQ: { key: 'q', code: 'KeyQ', vk: 81 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Space: { key: ' ', code: 'Space', vk: 32 }
};

async function key(cdp, code, type = 'keyDown') {
  const k = KEY_MAP[code];
  await cdp.send('Input.dispatchKeyEvent', {
    type,
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk
  });
}

async function mouse(cdp, type, x, y, button = 'none') {
  await cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button,
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mousePressed' ? 1 : 0
  });
}

async function touch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 }))
  });
}

// ============================================================
// 主流程
// ============================================================
const cdp = await connect();
const consoleErrors = [];
const failedRequests = [];

cdp.on((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push('log: ' + msg.params.entry.text);
  }
  if (msg.method === 'Network.loadingFailed') {
    failedRequests.push(msg.params.errorText);
  }
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    failedRequests.push(`${msg.params.response.status} ${msg.params.response.url}`);
  }
});

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Network.enable');

// ---------- 桌面视口 ----------
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
});

console.log('\n=== 页面加载 ===');
await cdp.send('Page.navigate', { url: GAME_URL });
await wait(1800);

const booted = await cdp.evaluate('!!window.__game');
check('页面加载并实例化游戏', booted === true);
check('无 JS 异常', consoleErrors.length === 0, consoleErrors.join(' | '));
check('无资源加载失败', failedRequests.length === 0, failedRequests.join(' | '));

const menuVisible = await cdp.evaluate("!document.getElementById('menu').classList.contains('hidden')");
check('主菜单显示', menuVisible === true);
const menuShot = await cdp.screenshot('e2e-01-menu.png');
console.log('   截图：' + menuShot);

// ---------- 开始游戏（真实点击） ----------
console.log('\n=== 剧情 → 战斗 ===');
await cdp.evaluate("document.getElementById('btn-start').click()");
await wait(600);
let state = await cdp.evaluate('window.__game.state');
check('点击开始进入剧情', state === 'story', state);
await cdp.screenshot('e2e-02-story.png');

// 空格推进剧情（真实键盘）
for (let i = 0; i < 4; i++) {
  await key(cdp, 'Space', 'keyDown');
  await key(cdp, 'Space', 'keyUp');
  await wait(160);
}
const dialogActive = await cdp.evaluate('window.__game.dialog.active');
check('空格可推进剧情对话', dialogActive === true);
await cdp.evaluate("document.getElementById('dialog-skip').click()");
await wait(500);
state = await cdp.evaluate('window.__game.state');
check('跳过剧情后进入战斗', state === 'playing', state);

// ---------- 真实键鼠操作 ----------
console.log('\n=== 键鼠战斗 ===');
await cdp.evaluate('window.__game.zombies.length = 0');

// 鼠标移动到画面右侧并按住射击
await mouse(cdp, 'mouseMoved', 900, 450);
await mouse(cdp, 'mousePressed', 900, 450, 'left');
// 按住 D 键向右移动
await key(cdp, 'KeyD', 'keyDown');
await wait(1400);
const moved = await cdp.evaluate('({x: window.__game.player.x, y: window.__game.player.y, shots: window.__game.combat.stats.shots, angle: window.__game.player.aimAngle})');
check('鼠标左键持续射击产生子弹', moved.shots > 0, `${moved.shots} 发`);
check('玩家可以移动（WASD 生效）', Math.abs(moved.x - 1180) > 5 || Math.abs(moved.y - 1068) > 5, `(${moved.x.toFixed(0)},${moved.y.toFixed(0)})`);
await cdp.screenshot('e2e-03-combat.png');
await key(cdp, 'KeyD', 'keyUp');
await mouse(cdp, 'mouseReleased', 900, 450, 'left');

// R 换弹
await cdp.evaluate('window.__game.player.slot.mag = 2');
await key(cdp, 'KeyR', 'keyDown');
await key(cdp, 'KeyR', 'keyUp');
await wait(220);
const reloading = await cdp.evaluate('window.__game.player.reloading');
check('R 键触发换弹', reloading === true);

// ---------- 击杀 / 升级面板 ----------
console.log('\n=== 升级面板 ===');
await cdp.evaluate('window.__game.level.addXp(300)');
await wait(400);
state = await cdp.evaluate('window.__game.state');
check('升级时游戏暂停并弹出面板', state === 'upgrade', state);
const cardCount = await cdp.evaluate("document.querySelectorAll('.skill-card').length");
check('升级面板显示 3 张技能卡', cardCount === 3, String(cardCount));
await cdp.screenshot('e2e-04-upgrade.png');
for (let i = 0; i < 10; i++) {
  const st = await cdp.evaluate('window.__game.state');
  if (st !== 'upgrade') break;
  await cdp.evaluate("document.querySelector('.skill-card').click()");
  await wait(220);
}
state = await cdp.evaluate('window.__game.state');
check('逐级选择技能后恢复游戏', state === 'playing', state);

// ---------- 暂停 / 恢复 ----------
console.log('\n=== 暂停 ===');
await key(cdp, 'Escape', 'keyDown');
await key(cdp, 'Escape', 'keyUp');
await wait(300);
state = await cdp.evaluate('window.__game.state');
check('ESC 暂停游戏', state === 'paused', state);
await cdp.screenshot('e2e-05-pause.png');
const pausedElapsed = await cdp.evaluate('window.__game.elapsed');
await wait(500);
const stillElapsed = await cdp.evaluate('window.__game.elapsed');
check('暂停期间游戏时间冻结', pausedElapsed === stillElapsed);
await cdp.evaluate("document.getElementById('btn-resume').click()");
await wait(250);
state = await cdp.evaluate('window.__game.state');
check('继续游戏按钮可用', state === 'playing', state);

// ---------- 结算界面 ----------
console.log('\n=== 结算 ===');
await cdp.evaluate(`(() => {
  const g = window.__game;
  g.player.invuln = 0;
  g.player.hp = 1;
  g.player.takeDamage(50, g);
  return true;
})()`);
await wait(500);
state = await cdp.evaluate('window.__game.state');
check('玩家死亡进入失败结算', state === 'defeat', state);
const resultVisible = await cdp.evaluate("!document.getElementById('result').classList.contains('hidden')");
check('失败结算界面显示', resultVisible === true);
await cdp.screenshot('e2e-06-defeat.png');
await cdp.evaluate("document.getElementById('btn-again').click()");
await wait(400);
state = await cdp.evaluate('window.__game.state');
check('再战一次可重新开始', state === 'playing', state);

// ---------- 手机视口 ----------
console.log('\n=== 手机视口 844×390 ===');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
  screenWidth: 844, screenHeight: 390
});
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.send('Page.reload');
await wait(1800);

const touchMode = await cdp.evaluate('window.__game.device.touch');
check('手机视口识别为触屏模式', touchMode === true);
const canvasSize = await cdp.evaluate(`(() => {
  const c = document.getElementById('game-canvas');
  return { w: c.width, h: c.height, cssW: c.style.width, cssH: c.style.height, dpr: window.devicePixelRatio };
})()`);
check('Canvas 按 DPR 放大（2x）', canvasSize.w === 1688 && canvasSize.h === 780, JSON.stringify(canvasSize));
await cdp.screenshot('e2e-07-mobile-menu.png');

await cdp.evaluate("document.getElementById('btn-start').click()");
await wait(500);
await cdp.evaluate("document.getElementById('dialog-skip').click()");
await wait(600);
const touchVisible = await cdp.evaluate("!document.getElementById('touch-controls').classList.contains('hidden')");
check('手机端显示双摇杆操作层', touchVisible === true);
check('手机端 HUD 显示', await cdp.evaluate("!document.getElementById('hud').classList.contains('hidden')") === true);

// 左摇杆：真实触摸拖动
const left = await cdp.evaluate(`(() => {
  const r = document.getElementById('stick-move').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
const right = await cdp.evaluate(`(() => {
  const r = document.getElementById('stick-aim').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

await touch(cdp, 'touchStart', [{ x: left.x, y: left.y, id: 1 }]);
await touch(cdp, 'touchMove', [{ x: left.x + 46, y: left.y, id: 1 }, { x: right.x, y: right.y, id: 2 }]);
await touch(cdp, 'touchStart', [{ x: left.x + 46, y: left.y, id: 1 }, { x: right.x, y: right.y, id: 2 }]);
await touch(cdp, 'touchMove', [
  { x: left.x + 46, y: left.y, id: 1 },
  { x: right.x, y: right.y - 46, id: 2 }
]);
await wait(900);
const touchState = await cdp.evaluate(`({
  moveX: window.__game.input.touchMove.x,
  aiming: window.__game.input.touchAim.active,
  firing: window.__game.input.isFiring(),
  playerX: window.__game.player.x
})`);
check('左摇杆驱动移动', Math.abs(touchState.moveX) > 0.3, `moveX=${touchState.moveX.toFixed(2)}`);
check('右摇杆驱动瞄准射击', touchState.aiming === true && touchState.firing === true);
await cdp.screenshot('e2e-08-mobile-combat.png');

// 松开一根手指，另一根保持
await touch(cdp, 'touchEnd', [{ x: left.x + 46, y: left.y, id: 1 }]);
await wait(250);
const afterLift = await cdp.evaluate(`({
  moveX: window.__game.input.touchMove.x,
  aiming: window.__game.input.touchAim.active
})`);
check('松开左摇杆后移动归零', afterLift.moveX === 0);
check('松开左摇杆不影响右摇杆', afterLift.aiming === true);
await touch(cdp, 'touchEnd', []);
await wait(200);

// 手机端按钮
const btnReload = await cdp.evaluate(`(() => {
  const r = document.getElementById('btn-reload').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
await cdp.evaluate('window.__game.player.slot.mag = 1');
await touch(cdp, 'touchStart', [{ x: btnReload.x, y: btnReload.y, id: 7 }]);
await touch(cdp, 'touchEnd', []);
await wait(250);
check('手机端换弹按钮可用', await cdp.evaluate('window.__game.player.reloading') === true);

// ---------- 最终检查 ----------
console.log('\n=== 运行时健康检查 ===');
const health = await cdp.evaluate(`(() => {
  const g = window.__game;
  return {
    state: g.state,
    zombies: g.zombies.length,
    particles: g.particles.activeCount,
    capParticles: g.particles.cap,
    bullets: g.combat.activeBulletCount,
    capBullets: g.combat.bullets.length,
    hasClientError: !!document.getElementById('boot-error').textContent,
    storage: !!localStorage.getItem('doomsday-awakening.save.v1')
  };
})()`);
check('无启动错误面板', health.hasClientError === false);
check('粒子数量未超上限', health.particles <= health.capParticles, `${health.particles}/${health.capParticles}`);
check('子弹数量未超上限', health.bullets <= health.capBullets, `${health.bullets}/${health.capBullets}`);
check('存档已写入 LocalStorage', health.storage === true);
check('全流程无 JS 异常', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('全流程无资源 404', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n浏览器测试：${results.length} 项，通过 ${passed}，失败 ${failed}`);
if (failed) {
  for (const r of results) if (!r.ok) console.log(` - ${r.name} ${r.info}`);
  process.exit(1);
}
console.log('浏览器端到端测试全部通过 ✅');
process.exit(0);
