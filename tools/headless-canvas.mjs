/**
 * tools/headless-canvas.mjs — 自带浏览器的 Canvas 计算环境
 *
 * 为什么需要：图像处理（抠图/缩放/旋转预览）依赖真实 Canvas，
 * 而 Node 没有内置 Canvas。这里直接拉起一个临时 headless Chrome，
 * 用完即杀，不依赖任何常驻会话，也不会因为外部中断而失效。
 *
 * 用法：
 *   const { evaluate, close } = await connectCanvas();
 *   const png = await evaluate(`...return canvas.toDataURL()`);
 *   await close();
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

function findBrowser() {
  for (const p of CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('没找到 Chrome/Edge，可通过 CHROME_PATH 环境变量指定路径');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 连接（必要时启动）一个 canvas 计算用浏览器。
 * @param {number} [port] 指定端口则复用已有会话
 */
export async function connectCanvas(port) {
  let proc = null;
  let debugPort = port || Number(process.env.CDP_PORT || 0);

  if (!debugPort) {
    debugPort = 9400 + Math.floor(Math.random() * 300);
    const browser = findBrowser();
    const userDir = join(tmpdir(), `daw-canvas-${debugPort}`);
    proc = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDir}`,
      '--window-size=1200,800',
      'about:blank'
    ], { stdio: 'ignore' });

    // 等待调试端口就绪
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        if (res.ok) { ready = true; break; }
      } catch (err) { /* 还没起来 */ }
      await sleep(150);
    }
    if (!ready) {
      try { proc.kill(); } catch (err) { /* ignore */ }
      throw new Error('浏览器启动超时');
    }
  }

  const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用页面');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket 连接失败'));
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  const send = (method, params = {}, timeout = 30000) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) { pending.delete(mid); reject(new Error('超时: ' + method)); }
    }, timeout);
  });

  await send('Runtime.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    }
    return r.result ? r.result.value : undefined;
  };

  const close = async () => {
    try { ws.close(); } catch (err) { /* ignore */ }
    if (proc) {
      try { proc.kill(); } catch (err) { /* ignore */ }
    }
  };

  return { send, evaluate, close, port: debugPort, platform };
}

/** 统一的 main 包装：自动关闭浏览器 */
export async function withCanvas(fn) {
  const ctx = await connectCanvas();
  try {
    return await fn(ctx);
  } finally {
    await ctx.close();
  }
}
