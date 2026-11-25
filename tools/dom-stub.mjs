/**
 * tools/dom-stub.mjs — 测试用最小 DOM / Canvas 打桩
 * 仅在 Node 测试中使用，不会被打包进游戏。
 */

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
}

class FakeEl {
  constructor(id = '', tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.classList = new FakeClassList();
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
    this.parentNode = null;
    this.value = '';
    this.disabled = false;
    this.dataset = {};
    this._listeners = {};
    this._rect = { left: 0, top: 0, width: 152, height: 152 };
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this._listeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  setAttribute(k, v) { this[k] = v; }
  getAttribute(k) { return this[k]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  setPointerCapture() {}
  releasePointerCapture() {}
  closest() { return null; }
  focus() {}
  /** 测试用：派发已注册的事件处理器 */
  emit(type, ev = {}) {
    const arr = this._listeners[type] || [];
    const event = {
      preventDefault() {},
      stopPropagation() {},
      ...ev
    };
    for (const fn of arr) fn(event);
  }
}

function makeCtx() {
  const target = {
    canvas: { width: 1280, height: 720 },
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    measureText: () => ({ width: 12 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform() {},
    save() {},
    restore() {}
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string') {
        t[k] = () => {};
        return t[k];
      }
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

class FakeCanvas extends FakeEl {
  constructor(id = '', w = 1280, h = 720) {
    super(id, 'canvas');
    this.width = w;
    this.height = h;
    this._ctx = makeCtx();
  }
  getContext() { return this._ctx; }
}

const elements = new Map();
elements.set('game-canvas', new FakeCanvas('game-canvas'));

const fakeDocument = {
  hidden: false,
  body: new FakeEl('body', 'body'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeEl(id));
    return elements.get(id);
  },
  querySelector(sel) {
    const key = 'sel:' + sel;
    if (!elements.has(key)) elements.set(key, new FakeEl(sel));
    return elements.get(key);
  },
  querySelectorAll() { return []; },
  createElement(tag) {
    if (tag === 'canvas') return new FakeCanvas('', 64, 64);
    return new FakeEl('', tag);
  },
  addEventListener() {},
  removeEventListener() {}
};

globalThis.document = fakeDocument;
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  visualViewport: null,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {}
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) HeadlessTest', maxTouchPoints: 0, language: 'zh-CN' },
  configurable: true,
  writable: true
});

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};



export { FakeEl, FakeCanvas, fakeDocument, elements };
