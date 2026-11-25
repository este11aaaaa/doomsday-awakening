/**
 * tools/shot.mjs — 截图小工具（可复用当前浏览器会话）
 * 用法：
 *   node tools/shot.mjs out.png                # 全屏截图
 *   node tools/shot.mjs out.png 0 0 500 120    # 裁剪截图（CSS 像素）
 */
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const [out = 'docs/shot.png', cx, cy, cw, ch] = process.argv.slice(2);

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

const params = { format: 'png' };
if (cx !== undefined) {
  params.clip = { x: Number(cx), y: Number(cy), width: Number(cw), height: Number(ch), scale: 1 };
}
const res = await send('Page.captureScreenshot', params);
const { writeFileSync } = await import('node:fs');
writeFileSync(out, Buffer.from(res.data, 'base64'));
console.log('saved', out);
process.exit(0);
