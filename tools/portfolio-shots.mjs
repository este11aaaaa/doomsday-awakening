/**
 * tools/portfolio-shots.mjs — 作品集最终版截图验证
 * 前置：python -m http.server 8100（根目录）+ Chrome CDP 9223
 */
import { writeFileSync } from 'node:fs';
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const BASE = 'http://127.0.0.1:8100/portfolio-site';
const OUT = 'C:/Users/13294/WorkBuddy/2026-11-25-21-07-20/portfolio-site/';

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
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.text);
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
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(OUT + name, Buffer.from(res.data, 'base64'));
  console.log('  saved', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

// 桌面首页
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/index.html' });
await wait(1600);
console.log('桌面首页');
await shot('docs-folio-home.png');
const heroText = await evaluate("document.querySelector('.hero h1')?.textContent + ' | ' + document.querySelector('.brand span:last-child')?.textContent");
console.log('  hero:', heroText);

// 滚动到作品区，确认删掉占位卡后的单卡布局
await evaluate("document.getElementById('work').scrollIntoView()");
await wait(600);
console.log('作品区（滚动后）');
await shot('docs-folio-work.png');

// 桌面详情页
await send('Page.navigate', { url: BASE + '/work/doomsday-awakening.html' });
await wait(1600);
console.log('详情页');
await shot('docs-folio-case.png');

// 移动端首页
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE + '/index.html' });
await wait(1600);
console.log('移动端首页');
await shot('docs-folio-mobile.png');

console.log('\nJS 异常 / 资源错误:', errors.length ? errors : '无');
process.exit(errors.length ? 1 : 0);
