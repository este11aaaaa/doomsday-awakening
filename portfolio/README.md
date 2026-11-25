# 接进作品集网站 · 操作说明

> **已上线（2026-11-25 发布，已验证）**
> 试玩页：https://doomsday-awakening-69778.app.workbuddy.host/portfolio/embed.html
> 游戏本体：https://doomsday-awakening-69778.app.workbuddy.host/index.html
> 线上自检：真实浏览器加载成功，22 个资源全部命中，0 JS 异常。

这个目录只放「给作品集用的东西」，游戏本体仍然在上一层：

```
doomsday-awakening/           ← 游戏（要整体部署）
├── index.html
├── js/ css/ assets/
└── portfolio/                ← 本目录：嵌入页 + 文案 + 片段
    ├── embed.html            独立试玩页（带海报、全屏、重开）
    ├── snippet.html          最小 iframe 片段（复制粘贴用）
    ├── case-study.md         项目介绍 / 技术说明 / 英文简介
    └── README.md             本文件
```

---

## 三种接入方式（选一种）

### A. 内嵌 iframe（推荐）

1. 把 **整个 `doomsday-awakening` 目录**部署到静态托管（Vercel / Netlify / GitHub Pages / 自己的服务器都行）。
2. 在你的作品集页面里放 `snippet.html` 的内容，把 `src` 改成线上地址：

```html
<iframe src="https://你的域名/doomsday-awakening/index.html" ...>
```

3. 容器必须是 `aspect-ratio: 16/9`（或固定高度），**不要给 iframe 设 `height:100%` 而父级没高度**，否则会塌成 0。

> 想要"封面 → 点击开始"的效果，直接链到 `https://你的域名/doomsday-awakening/portfolio/embed.html`（自带海报、播放按钮、全屏、重开）。

### B. 只放一个"试玩"链接

作品集卡片用 `docs/screenshot-01-menu.png` 当封面，链接指向线上 `index.html`（或 `embed.html`）。
最简单，手机上体验也最好（可以正常横屏）。

### C. 截图 + 说明，不放可玩版

用 `case-study.md` 的文案 + `docs/` 里的截图。适合担心性能或加载体积的场景。

---

## 部署注意

| 事项 | 说明 |
| --- | --- |
| 必须走 HTTP | ES Modules 不能 `file://` 直开，本地预览用 `python -m http.server 8000` |
| MIME 类型 | 托管平台默认会给 `.js` 正确的 `text/javascript`；自己搭 Nginx 记得配 |
| 路径 | 全部是相对路径，整个目录搬到任何子路径都能跑（如 `/work/doomsday/`） |
| 体积 | 运行时 3 MB（`art-source/` 里 23 MB 原始 AI 图**不用上传**） |
| 移动端 | 竖屏进入会提示旋转；嵌入页给了「新窗口」按钮 |
| 音频 | 首次点击后才初始化 Web Audio（浏览器的自动播放策略），这是刻意设计 |
| 存档 | LocalStorage 只存音量与最佳战绩；在跨域 iframe 里被拦截也不会报错（已 try/catch） |

---

## 上传清单（只传这些）

```
index.html
js/  css/  assets/  docs/            ← docs 里是截图，作品集要用
portfolio/embed.html
portfolio/snippet.html
（不要传：art-source/、tools/、node_modules 之类）
```

> `docs/` 既是文档也是截图库。如果不想公开测试日志，可以只传 `docs/*.png`。

---

## 上线后的自检（30 秒）

- [ ] 打开线上 `index.html`，主菜单背景图正常（不是纯黑）
- [ ] 点「开始游戏」→ 剧情 → 能移动能开枪
- [ ] 按 `ESC` 能暂停，再按能继续
- [ ] F12 Console 里 **0 个红色报错、0 个 404**
- [ ] 手机打开 → 提示横屏 → 横屏后左右摇杆都能用
- [ ] 嵌入页 `portfolio/embed.html` → 点播放 → iframe 里能正常游玩（键盘焦点已进入 iframe）

---

## 常见问题

**Q：iframe 里键盘没反应？**
A：iframe 需要先获得焦点。`embed.html` 已经在点击后调用 `iframe.focus()`；自己写的话，在 iframe 上监听一次 `click` 再 focus 即可。

**Q：嵌入后画面糊？**
A：Canvas 按 `devicePixelRatio` 渲染，正常不会糊。若父容器做了 `transform: scale()` 会二次缩放，改用宽高变化代替。

**Q：能和作品集共用字体/主题色吗？**
A：游戏是独立视觉（末世暗色 + 荧光绿），建议不要套用站点主题，保持"作品本身"的完整性。嵌入页的边框和按钮已经做了中性处理。
