/**
 * tools/portfolio-play-check.mjs — 验证详情页试玩 iframe 加载的是游戏本体而非作品集
 * 前置：python -m http.server 8100（根目录）+ Chrome CDP 9223
 */
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const PAGE_URL = 'http://127.0.0.1:8100/portfolio-site/work/doomsday-awakening.html';

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
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result ? res.result.value : undefined;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: PAGE_URL });
await wait(1200);

const dataSrc = await evaluate("document.getElementById('gameFrame').getAttribute('data-src')");
console.log('data-src:', dataSrc);

// 关键：先滚动到试玩区，让 lazy iframe 进入视口
await evaluate("document.getElementById('playCover').scrollIntoView({ block: 'center' })");
await wait(600);
await evaluate("document.getElementById('playCover').click()");
await wait(3500);

const inner = await evaluate(`(() => {
  const f = document.getElementById('gameFrame');
  let d;
  try { d = f.contentDocument; } catch (e) { return { err: String(e) }; }
  return {
    src: f.getAttribute('src'),
    url: d && d.URL,
    title: d && d.title,
    hasCanvas: !!(d && d.getElementById('game-canvas')),
    hasMenu: !!(d && d.getElementById('menu')),
    hasGame: !!(d && d.defaultView && d.defaultView.__game),
    bodyLen: d && d.body ? d.body.innerHTML.length : 0
  };
})()`);
console.log('iframe 内容:', JSON.stringify(inner, null, 2));

const ok = inner && inner.hasCanvas && inner.hasMenu && inner.hasGame &&
  !String(inner.title).includes('张欣');
console.log(ok ? '\nRESULT: PASS — 试玩 iframe 加载游戏本体' : '\nRESULT: FAIL — 试玩加载异常');
process.exit(ok ? 0 : 1);
