/**
 * tools/portfolio-embed-check.mjs
 * 验证作品集详情页「点击封面才加载试玩 iframe」的懒加载交互。
 * 前置：python -m http.server 8100（根目录）+ Chrome CDP 9223
 */
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const PAGE_URL = process.env.PAGE_URL || 'http://127.0.0.1:8100/portfolio-site/work/doomsday-awakening.html';

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
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
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result ? res.result.value : undefined;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: PAGE_URL });
await wait(1500);

const before = await evaluate(`(() => {
  const f = document.getElementById('gameFrame');
  const c = document.getElementById('playCover');
  return {
    title: document.title,
    frameSrc: f ? (f.getAttribute('src') || '') : null,
    dataSrc: f ? (f.getAttribute('data-src') || '') : null,
    coverVisible: c ? !c.classList.contains('hidden') : null
  };
})()`);
console.log('BEFORE CLICK:', JSON.stringify(before, null, 2));

await evaluate(`document.getElementById('playCover').click()`);
await wait(1200);

const after = await evaluate(`(() => {
  const f = document.getElementById('gameFrame');
  const c = document.getElementById('playCover');
  return {
    frameSrc: f ? (f.getAttribute('src') || '') : null,
    coverHidden: c ? c.classList.contains('hidden') : null
  };
})()`);
console.log('AFTER CLICK:', JSON.stringify(after, null, 2));

const ok = before.frameSrc === '' && before.coverVisible === true &&
  after.frameSrc === before.dataSrc && after.coverHidden === true;
console.log(ok ? '\nRESULT: PASS — 试玩懒加载交互正常' : '\nRESULT: FAIL — 懒加载行为异常');
process.exit(ok ? 0 : 1);
