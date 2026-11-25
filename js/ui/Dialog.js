/**
 * ui/Dialog.js — 剧情对话（逐字显示 / 点击继续 / 跳过 / 键盘确认）
 * 任何情况下都提供「跳过剧情」按钮，不会出现无法关闭的弹窗。
 */

const $ = (id) => document.getElementById(id);

const SPEAKER_CLASS = {
  hero: '',
  enemy: 'enemy',
  sys: 'sys',
  narr: 'narr',
  radio: 'sys'
};

export class Dialog {
  constructor(game) {
    this.game = game;
    this.root = $('dialog');
    this.speakerEl = $('dialog-speaker');
    this.textEl = $('dialog-text');
    this.skipBtn = $('dialog-skip');

    this.lines = [];
    this.index = 0;
    this.charIndex = 0;
    this.typing = false;
    this.active = false;
    this.onComplete = null;
    this.cps = 46; // 每秒字数

    this._bind();
  }

  _bind() {
    if (this.root) {
      this.root.addEventListener('click', () => this.next());
    }
    if (this.skipBtn) {
      this.skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.skip();
      });
    }
  }

  play(lines, onComplete) {
    this.lines = Array.isArray(lines) ? lines : [];
    this.index = 0;
    this.charIndex = 0;
    this.typing = false;
    this.active = true;
    this.onComplete = onComplete || null;
    if (this.root) this.root.classList.remove('hidden');
    this._renderLine();
  }

  _renderLine() {
    const line = this.lines[this.index];
    if (!line) {
      this.finish();
      return;
    }
    if (this.speakerEl) {
      this.speakerEl.textContent = line.who || '旁白';
      this.speakerEl.className = 'dialog-speaker ' + (SPEAKER_CLASS[line.type] || '');
    }
    if (this.textEl) {
      this.textEl.textContent = '';
      this.textEl.className = 'dialog-text' + (line.type === 'sys' ? ' sys-line' : '');
    }
    this.charIndex = 0;
    this.typing = true;
  }

  /** 点击/空格：正在打字则立即显示完整句子，否则下一句 */
  next() {
    if (!this.active) return;
    const line = this.lines[this.index];
    if (!line) {
      this.finish();
      return;
    }
    if (this.typing) {
      this.charIndex = line.text.length;
      this.typing = false;
      this._paint();
      return;
    }
    this.index += 1;
    if (this.index >= this.lines.length) {
      this.finish();
      return;
    }
    this._renderLine();
  }

  skip() {
    if (!this.active) return;
    this.active = false;
    if (this.root) this.root.classList.add('hidden');
    const cb = this.onComplete;
    this.onComplete = null;
    this.lines = [];
    if (cb) cb();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    if (this.root) this.root.classList.add('hidden');
    const cb = this.onComplete;
    this.onComplete = null;
    if (cb) cb();
  }

  hide() {
    this.active = false;
    if (this.root) this.root.classList.add('hidden');
    this.onComplete = null;
  }

  update(dt) {
    if (!this.active || !this.typing) return;
    const line = this.lines[this.index];
    if (!line) return;
    this.charIndex += this.cps * dt;
    if (this.charIndex >= line.text.length) {
      this.charIndex = line.text.length;
      this.typing = false;
    }
    this._paint();
  }

  _paint() {
    const line = this.lines[this.index];
    if (!line || !this.textEl) return;
    const shown = line.text.slice(0, Math.floor(this.charIndex));
    this.textEl.textContent = shown;
    if (!this.typing) {
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      this.textEl.appendChild(cursor);
    }
  }
}
