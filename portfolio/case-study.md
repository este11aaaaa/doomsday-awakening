# 作品集文案 · 末日重启：觉醒者

> 直接可用的项目介绍 / 技术说明文案。按你网站的版式取用，不用照搬结构。

---

## 一句话

**一款用原生 JavaScript 与 Canvas 2D 从零实现的末世丧尸射击 Demo：完整的三阶段尸潮 + Boss 战流程，键鼠与手机双摇杆双端可玩，0 依赖、0 外部美术素材。**

---

## 项目卡片

| 项目 | 内容 |
| --- | --- |
| 名称 | 末日重启：觉醒者 / Doomsday Awakening |
| 类型 | HTML5 俯视角射击 · 轻度 RPG 成长 |
| 角色 | 独立开发（玩法、程序、数值、剧情、美术管线） |
| 技术 | 原生 ES Modules + Canvas 2D + Web Audio + LocalStorage |
| 规模 | 38 个源码文件 / 约 8.2k 行 / 34 个 JS 模块 |
| 平台 | PC 浏览器（Chrome / Edge）、手机与平板浏览器（横屏） |

---

## 背景与目标

想验证一件事：**不引入任何引擎和素材，只用浏览器原生能力，能做出多完整的一款游戏？**

约束是自己定的：不用 Phaser / PixiJS，不买美术素材，不接后端。
结果是必须在系统层面自己解决输入、渲染、碰撞、寻路、对象生命周期、双端适配——这恰好是作品集里最能说明工程能力的地方。

---

## 我做了什么

**1. 从状态机出发的架构**
`menu / story / playing / upgrade / paused / victory / defeat` 七个状态，只有 `playing` 推进世界逻辑。
这一条设计直接消掉了「暂停时还在刷怪」「结算后还能开枪」「升级面板背后丧尸继续走」这类常见 bug。

**2. 双端统一的输入层**
PC 键鼠与手机双虚拟摇杆最终都归一为 `移动向量 / 瞄准角度 / 是否射击 / 一次性动作队列`。
摇杆用 Pointer Events + `pointerId` 隔离，左手移动不会因为右手松开而中断。

**3. 敌人 AI 与地图的妥协设计**
俯视角射击不需要 A*：射线试探绕行 + 1.1 秒卡住检测 + **跨建筑时先走门口路点**，让丧尸能自己从街道拐进超市，而不是贴着墙抖。

**4. 一套可复用出图 / 接图流程**
`import-sprite`（白底抠图 / 透明底直通 / 锚点裁切 / 旋转 / 去雾）→ `rotate-check`（0/90/180/270 体检）→ `make-tileable`（四向镜像做无缝纹理）→ `IMAGE_MANIFEST` 登记即生效，无图自动回退程序化绘制。

---

## 技术亮点

- **静态地图层**：2400×1800 的整张地图只在开局绘制一次到离屏 Canvas，每帧只 blit 可视区域。
- **对象池**：子弹 / 粒子 / 伤害数字 / 毒池全部池化，硬上限（子弹 220、粒子 420、伤害数字 32），超出覆盖最旧对象，杜绝内存增长。
- **扫掠碰撞**：子弹按帧间线段做 Liang-Barsky 检测，1560 单位/秒也不会穿墙穿怪。
- **移动端适配**：Canvas 按 DPR 放大、`visualViewport` 处理地址栏收缩、safe-area、横竖屏切换、切后台自动暂停。
- **程序化音效**：20+ 种音效由 Web Audio 实时合成（噪声 + 振荡器包络），0 音频文件、可静音、不触发自动播放拦截。
- **无缝纹理的取巧**：AI 生成的地砖纹理用四向镜像强制无缝，再用 52% 暗色叠层压回末世色调。

---

## 可量化结果

| 指标 | 数值 |
| --- | --- |
| 语法检查 | 35 个文件全通过 |
| 逻辑回归（DOM 打桩跑 3240 帧） | 94 / 94 断言 |
| 真实浏览器端到端（键鼠 + 触摸） | 34 / 34 断言，0 JS 异常、0 资源 404 |
| 多分辨率布局（1920/1366/844/852/932/768） | 58 / 58 断言 |
| 运行时性能 | 60 FPS；峰值 12 只丧尸 / 5 颗子弹 / 69 个粒子（均远低于上限） |
| 包体积 | 运行时资源 3 MB（原始 AI 图另存，不进运行时） |

> 全部测试脚本在 `tools/` 下可复跑，日志在 `docs/test-logs/`。这一条在作品集里比"我做了个游戏"有说服力得多。

---

## 媒体清单（可直接放进 case study）

| 文件 | 建议用法 |
| --- | --- |
| `docs/screenshot-01-menu.png` | 封面图（主菜单 + 废墟插画） |
| `docs/screenshot-03-combat.png` | 玩法主图（HUD、物资、货架、丧尸） |
| `docs/screenshot-04-upgrade.png` | 成长系统（技能三选一） |
| `docs/screenshot-06-boss.png` | Boss 战（预警圈 + Boss 血条） |
| `docs/screenshot-08-victory.png` | 结算（数据面板） |
| `docs/screenshot-10-mobile-combat.png` | 移动端双摇杆（证明双端适配） |
| `docs/embed-preview.png` | 嵌入页截图 |

---

## 复盘（写"如果重做"比写"我完成了"更可信）

1. **AI 出图有明确的盲区**：角色、图标、纹理很稳；货架 / 墙体这类「俯视下就是长方形」的物件，模型三次都给了正面视角。最终改成程序化精修（伪高度 + 金属框 + 价签），比硬凑 AI 图更协调。
2. **手感调参占了一半时间**：丧尸 65 移速 vs 玩家 220，几乎不可能正面打死玩家，只有被围堵时才会掉血——这个"安全但会被围"的平衡是反复跑脚本模拟调出来的。
3. **Boss 太容易风筝**：完美走位可以 0 承伤击杀，下一版需要加封路 / 召唤 / 二阶段形态。

---

## English blurb（英文版简介，可直接用）

> **Doomsday Awakening** — a top-down zombie shooter built from scratch with vanilla JavaScript and Canvas 2D: no engine, no third-party assets, no backend.
>
> It ships a complete loop — three escalating waves, a level-up system with six stat-changing skills, loot, and a boss fight with telegraphed attacks — playable with WASD + mouse on desktop and dual virtual joysticks on mobile.
>
> Engineering highlights: a single-pass offscreen map layer, pooled bullets/particles with hard caps, swept-collision hit detection, a unified input layer that normalises keyboard and multi-touch, and a fully procedural audio engine. Verified with 186 automated assertions across logic, end-to-end browser, and responsive-layout suites.
