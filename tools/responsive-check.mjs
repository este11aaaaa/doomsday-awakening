/**
 * tools/responsive-check.mjs — 多分辨率布局检查
 * 覆盖：1920×1080 / 1366×768 / 844×390 / 852×393 / 932×430 / 768×1024
 * 检查：HUD 关键元素是否越界、是否互相遮挡、触屏层是否按设备显示、竖屏是否出现旋转提示
 */
const CDP_PORT = 9222;
const GAME_URL = 'http://127.0.0.1:8000/index.html';

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  return r.result?.value;
};

const CASES = [
  { name: '1920×1080 桌面', w: 1920, h: 1080, mobile: false },
  { name: '1366×768 桌面', w: 1366, h: 768, mobile: false },
  { name: '844×390 手机横屏', w: 844, h: 390, mobile: true },
  { name: '852×393 手机横屏', w: 852, h: 393, mobile: true },
  { name: '932×430 手机横屏', w: 932, h: 430, mobile: true },
  { name: '768×1024 平板竖屏', w: 768, h: 1024, mobile: true }
];

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`);
};

await send('Page.enable');
await send('Runtime.enable');

for (const c of CASES) {
  console.log(`\n=== ${c.name} ===`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: c.w, height: c.h, deviceScaleFactor: c.mobile ? 2 : 1, mobile: c.mobile,
    screenWidth: c.w, screenHeight: c.h
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: c.mobile, maxTouchPoints: c.mobile ? 5 : 0 });
  await send('Page.navigate', { url: GAME_URL });
  await wait(1300);

  // 进入战斗
  await evaluate("document.getElementById('btn-start').click()");
  await wait(350);
  await evaluate("document.getElementById('dialog-skip').click()");
  await wait(500);

  const info = await evaluate(`(() => {
    const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, hidden: el.classList.contains('hidden') }; };
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      canvas: (() => { const cv = document.getElementById('game-canvas'); return { w: cv.width, h: cv.height, cssW: cv.style.width, cssH: cv.style.height, dpr: window.devicePixelRatio }; })(),
      hud: r('hud'),
      hp: r('hud-hp-fill'),
      mission: r('hud-top') || null,
      weapon: r('hud-weapon-panel'),
      pause: r('hud-pause'),
      touch: r('touch-controls'),
      stickMove: r('stick-move'),
      stickAim: r('stick-aim'),
      btnSkill: r('btn-skill'),
      rotate: r('rotate-hint'),
      state: window.__game.state,
      touchMode: window.__game.device.touch,
      zoom: window.__game.camera.zoom
    };
  })()`);

  // canvas 尺寸与 DPR
  const expectW = c.w * (c.mobile ? 2 : 1);
  const expectH = c.h * (c.mobile ? 2 : 1);
  check('Canvas 像素尺寸与 DPR 匹配', Math.abs(info.canvas.w - expectW) <= 2 && Math.abs(info.canvas.h - expectH) <= 2,
    `${info.canvas.w}×${info.canvas.h} (期望 ${expectW}×${expectH})`);

  // 触屏层显示
  if (c.mobile) {
    check('移动端显示触屏操作层', info.touch && !info.touch.hidden);
    // 摇杆与按钮不重叠
    const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    check('双摇杆不重叠', !overlap(info.stickMove, info.stickAim));
    check('摇杆与技能按钮不重叠', !overlap(info.stickAim, info.btnSkill));
    // 摇杆在屏幕内
    check('摇杆位于屏幕内', info.stickMove.x >= 0 && info.stickMove.y >= 0 &&
      info.stickMove.x + info.stickMove.w <= info.vw + 1 && info.stickMove.y + info.stickMove.h <= info.vh + 1,
      `移动杆 ${Math.round(info.stickMove.x)},${Math.round(info.stickMove.y)} ${Math.round(info.stickMove.w)}×${Math.round(info.stickMove.h)}`);
    check('HUD 武器面板位于屏幕内', info.weapon.x + info.weapon.w <= info.vw + 1 && info.weapon.y >= 0,
      `${Math.round(info.weapon.x)},${Math.round(info.weapon.y)}`);
  } else {
    check('桌面端隐藏触屏操作层', info.touch && info.touch.hidden);
    check('桌面端显示武器面板', info.weapon && !info.weapon.hidden);
  }

  // 竖屏提示
  const portrait = c.h > c.w;
  if (portrait && c.mobile) {
    check('竖屏显示旋转提示', info.rotate && !info.rotate.hidden);
  } else if (c.mobile) {
    check('横屏不显示旋转提示', info.rotate && info.rotate.hidden);
  }

  // HUD 关键元素不越界
  const inView = (r) => r && r.x >= -1 && r.y >= -1 && r.x + r.w <= info.vw + 1 && r.y + r.h <= info.vh + 1;
  check('HUD 左上血条在屏幕内', inView(info.hp));
  check('暂停按钮在屏幕内', inView(info.pause));
  check('战斗状态正常', info.state === 'playing' || info.state === 'upgrade', info.state);

  // 任务条与武器面板不重叠（移动端上下分区，桌面端左右分区）
  const overlap2 = info.mission && info.weapon && info.mission.x < info.weapon.x + info.weapon.w &&
    info.weapon.x < info.mission.x + info.mission.w && info.mission.y < info.weapon.y + info.weapon.h &&
    info.weapon.y < info.mission.y + info.mission.h;
  check('任务条与武器面板不重叠', !overlap2);
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n布局检查：${results.length} 项，通过 ${passed}，失败 ${failed}`);
if (failed) {
  for (const r of results) if (!r.ok) console.log(` - ${r.name} ${r.info}`);
  process.exit(1);
}
console.log('多分辨率布局检查全部通过 ✅');
process.exit(0);
