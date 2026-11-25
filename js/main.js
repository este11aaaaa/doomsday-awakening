/**
 * main.js — 入口：初始化资源、存档、游戏实例与全局浏览器事件
 */

import { AssetManager } from './core/AssetManager.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { Game } from './game.js';

function showBootError(err) {
  const el = document.getElementById('boot-error');
  const msg = err && err.stack ? err.stack : String(err);
  if (el) {
    el.textContent = '启动失败：\n' + msg + '\n\n请确认使用本地 HTTP 服务器打开（不要直接双击 index.html）。';
    el.classList.remove('hidden');
  }
  // eslint-disable-next-line no-console
  console.error('[Doomsday] boot error', err);
}

/** 用户主动开始游戏后，尝试请求横屏（失败不影响游戏） */
async function tryLockLandscape() {
  try {
    const so = typeof screen !== 'undefined' ? screen.orientation : null;
    if (so && typeof so.lock === 'function') {
      await so.lock('landscape');
    }
  } catch (err) {
    // 桌面浏览器 / iOS Safari 不支持，静默忽略
  }
}

function boot() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('#game-canvas not found');
  if (!canvas.getContext) throw new Error('Canvas 2D not supported');

  const assets = new AssetManager();
  const save = new SaveSystem();
  const game = new Game(canvas, assets, save);

  // 便于调试与自动化测试
  window.__game = game;

  // 外部资源（当前为空清单）：失败也不会阻塞游戏
  assets.preload().then(() => {
    // 贴图到达后重建静态地图层（否则首帧用的是程序化地面）
    if (game.renderer) game.renderer.refreshStaticLayer();
    if (game.hud) game.hud.applyPortrait();
    if (game.menu) game.menu.applyBackground();
    if (assets.failed.length) {
      // eslint-disable-next-line no-console
      console.info('[Doomsday] 部分资源加载失败，已回退到程序化绘制：', assets.failed);
    }
  });

  game.start();

  // 横屏提示“仍然继续”
  const rotateOk = document.getElementById('btn-rotate-ok');
  if (rotateOk) {
    rotateOk.addEventListener('click', () => game.dismissRotateHint());
  }

  // 用户点击开始后再尝试锁定横屏
  const startBtn = document.getElementById('btn-start');
  if (startBtn) {
    startBtn.addEventListener('click', () => { tryLockLandscape(); }, { once: true });
  }

  // 移动端：禁用双击缩放与手势缩放（不影响游戏外页面）
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => {
    if (e.target && e.target.closest && e.target.closest('#app')) e.preventDefault();
  });

  // iOS 进入后台
  window.addEventListener('pagehide', () => game.autoPause());

  // 未捕获异常只记录，不阻塞游戏
  window.addEventListener('error', (e) => {
    // eslint-disable-next-line no-console
    console.error('[Doomsday] runtime error', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    // eslint-disable-next-line no-console
    console.error('[Doomsday] unhandled rejection', e.reason);
  });
}

try {
  boot();
} catch (err) {
  showBootError(err);
}
