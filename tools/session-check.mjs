/**
 * tools/session-check.mjs — 真实浏览器「跑一局」验证（1920×1080，40 秒自动战斗）
 * 目的：确认在真实渲染 + 真实输入下，丧尸会靠近、玩家能击杀、能自然升级、无运行时报错。
 */
const CDP_PORT = 9222;
const GAME_URL = 'http://127.0.0.1:8000/index.html';

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) errors.push(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: GAME_URL });
await wait(1500);
await evaluate("document.getElementById('btn-start').click()");
await wait(300);
await evaluate("document.getElementById('dialog-skip').click()");
await wait(400);

let held = false;
const samples = [];
for (let tick = 0; tick < 160; tick++) {
  const s = await evaluate(`(() => {
    const g = window.__game;
    if (!g) return { state: 'none' };
    const p = g.player;
    let best = null, bd = Infinity;
    for (const z of g.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < bd) { bd = d; best = z; }
    }
    let aim = null;
    if (best) {
      const s2 = g.camera.worldToScreen(best.x, best.y);
      aim = { x: Math.round(s2.x), y: Math.round(s2.y) };
    }
    return {
      state: g.state, kills: g.kills, level: g.level.level, hp: Math.round(p.hp),
      zombies: g.zombies.length, nearest: Number.isFinite(bd) ? Math.round(bd) : -1,
      aim, wave: g.spawner.waveIndex + 1,
      shots: g.combat.stats.shots, hits: g.combat.stats.hits,
      mouseDown: g.input.mouse.down,
      cards: document.querySelectorAll('.skill-card').length
    };
  })()`);

  if (s.state === 'upgrade') {
    await evaluate("document.querySelector('.skill-card')?.click()");
    await wait(220);
    continue;
  }
  if (s.state === 'story') {
    await evaluate("document.getElementById('dialog-skip').click()");
    await wait(200);
    continue;
  }
  if (s.state === 'defeat' || s.state === 'victory') {
    samples.push({ t: tick * 0.25, ...s });
    break;
  }
  if (s.state !== 'playing') { await wait(250); continue; }

  // 只对屏幕内、且进入射程的目标开火；目标离开则松开鼠标
  const inRange = s.aim && s.nearest >= 0 && s.nearest < 520;
  const inView = inRange && s.aim.x > 8 && s.aim.x < 1912 && s.aim.y > 8 && s.aim.y < 1072;
  if (inView) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.aim.x, y: s.aim.y });
    if (!s.mouseDown) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.aim.x, y: s.aim.y, button: 'left', buttons: 1, clickCount: 1 });
      held = true;
    }
  } else if (s.mouseDown) {
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'left', buttons: 0, clickCount: 1 });
    held = false;
  }
  if (tick % 8 === 0) samples.push({ t: +(tick * 0.25).toFixed(0), ...s });
  await wait(250);
}
if (held) {
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'left', buttons: 0, clickCount: 1 });
}

console.log('时间(s) | 状态 | 波次 | 击杀 | 等级 | HP | 存活丧尸 | 最近距离 | 射击/命中');
for (const s of samples) {
  console.log(`${String(s.t).padStart(6)} | ${s.state.padEnd(6)} | ${s.wave} | ${String(s.kills).padStart(3)} | ${s.level} | ${String(s.hp).padStart(3)} | ${String(s.zombies).padStart(4)} | ${String(s.nearest).padStart(5)} | ${s.shots}/${s.hits}`);
}

const last = samples[samples.length - 1] || {};
const passed = [];
const failed = [];
const ck = (name, ok, info = '') => { (ok ? passed : failed).push(name + (info ? ' — ' + info : '')); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`); };
console.log('\n=== 会话结论 ===');
ck('产生了有效击杀', (last.kills || 0) >= 5, `击杀 ${last.kills}`);
ck('玩家经验/等级提升', (last.level || 1) >= 2, `Lv.${last.level}`);
ck('丧尸确实靠近到交战距离', samples.some((s) => s.nearest >= 0 && s.nearest < 260), `最小最近距离 ${Math.min(...samples.filter(s => s.nearest >= 0).map(s => s.nearest))}`);
ck('射击命中率 > 15%', last.shots && last.hits / last.shots > 0.15, `${last.shots}/${last.hits} = ${last.shots ? Math.round(last.hits / last.shots * 100) : 0}%`);
ck('运行期间无 JS 异常', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(`\n通过 ${passed.length}，失败 ${failed.length}`);
if (failed.length) { failed.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('真实浏览器一局验证通过 ✅');
process.exit(0);
