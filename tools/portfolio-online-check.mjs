/**
 * tools/portfolio-online-check.mjs — 在线版作品集端到端验证
 * 前置：Chrome CDP 9223（无需本地服务器）
 */
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const BASE = 'https://doomsday-awakening-69778.app.workbuddy.host';
const SHARE = BASE + '/?sharecode=K27MRGYITG';

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    errors.push(`HTTP ${msg.params.response.status} ${msg.params.response.url}`);
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

// 1) 先访问分享链接建立 cookie
await send('Page.navigate', { url: SHARE });
await wait(2500);
const home = await evaluate(`({ title: document.title, brand: document.querySelector('.brand span:last-child')?.textContent })`);
console.log('在线首页:', JSON.stringify(home));

// 2) 导航到详情页
await send('Page.navigate', { url: BASE + '/work/doomsday-awakening.html' });
await wait(2200);
const detail = await evaluate(`({ title: document.title, dataSrc: document.getElementById('gameFrame')?.getAttribute('data-src') })`);
console.log('在线详情页:', JSON.stringify(detail));

// 3) 滚动到试玩区并点击，验证游戏加载
await evaluate("document.getElementById('playCover').scrollIntoView({ block: 'center' })");
await wait(600);
await evaluate("document.getElementById('playCover').click()");
await wait(4500);
const game = await evaluate(`(() => {
  const f = document.getElementById('gameFrame');
  let d;
  try { d = f.contentDocument; } catch (e) { return { err: String(e) }; }
  return {
    url: d && d.URL,
    title: d && d.title,
    hasCanvas: !!(d && d.getElementById('game-canvas')),
    hasMenu: !!(d && d.getElementById('menu')),
    hasGame: !!(d && d.defaultView && d.defaultView.__game)
  };
})()`);
console.log('在线试玩 iframe:', JSON.stringify(game, null, 2));

console.log('资源错误:', errors.length ? errors.slice(0, 10) : '无');
const ok = home.brand === '张欣' && detail.title.includes('张欣') &&
  detail.dataSrc === '../game/index.html' && game.hasCanvas && game.hasMenu &&
  game.hasGame && !String(game.title).includes('张欣');
console.log(ok ? '\nRESULT: PASS — 在线作品集全部正常' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
