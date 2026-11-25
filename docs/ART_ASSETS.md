# 美术资产清单 · Doomsday Awakening

> 当前版本所有美术都是 **Canvas 程序化绘制**（`js/render/Renderer.js`），没有任何外部图片。
> 这份清单告诉你：**想把手绘美术接进来，需要自己产出哪些图、多大尺寸、什么格式、放哪里、改哪段代码。**

---

> 已经确定用 **豆包 / 即梦** 出图？直接看 **[ART_PROMPTS.md](ART_PROMPTS.md)**（每张图的可复制提示词、反向词、抠图与缩放流程）。

## 0. 先明确三件事（决定工作量）

**① 朝向：只画「朝右」一版。**
游戏是俯视角 + 360° 自由瞄准，渲染时统一 `translate(角色坐标) → rotate(aimAngle)`。
所以角色只需要一张**朝右（+X 方向）**的图，靠旋转复用。若要做 8 方向，工作量 ×8，收益有限。

**② 锚点：图片中心 = 角色碰撞中心。**
代码里 `ctx.drawImage(sprite, -w/2, -h/2, w, h)`，所以图必须**居中、四周留透明边**（建议留 8%~12%），否则会看起来"贴地"或"飘"。

**③ 不要烘焙阴影。**
影子、地面光晕、受击白闪、血雾都由代码绘制。图里画死阴影会和动态光照打架。

其他统一规范：

| 规范 | 要求 |
| --- | --- |
| 格式 | PNG-32（带 Alpha），或 WebP（体积更小，Chrome/Safari 均支持） |
| 分辨率 | 世界单位 ×2 导出（`@2x`），代码里按世界尺寸缩小绘制，保证高清屏清晰 |
| 光源 | 统一左上打光（与地图墙面高光一致） |
| 描边 | 统一 2px 深色描边（#0a0f0c，60% 不透明），解决暗背景辨识度 |
| 色板 | 跟随 `js/config.js` 的 `COLORS`：荧光绿 #6dfba4 / 暗红 #e54034 / 橙黄 #ffb454 / 青 #4fd6c8 |
| 文件命名 | 全小写下划线：`zombie_runner.png`、`wall_h.png`，不要中文名、不要空格 |

---

## 1. P0 · 最小可玩美术包（约 18 个文件，做完画面立刻"像成品"）

只做这一档，观感提升就有 80%。

### 1.1 角色（5 张）

| 文件 | 世界尺寸 | 导出尺寸 | 说明 |
| --- | --- | --- | --- |
| `player.png` ✅**已接入** | 64×64 | 384×384（现用） | 林夜：深绿战术夹克、护目镜、右手持枪、背包。枪口朝右。**当前世界尺寸 64 单位**（`Renderer.PLAYER_SPRITE_SIZE`），换图后需要重新抠锚点 |
| `zombie_normal.png` ✅**已接入** | 60×60 | 384×384（现用 62 单位） | 普通丧尸：灰绿皮肤、破烂衣服、**空手**双臂前伸（不要画枪） |
| `zombie_runner.png` ✅**已接入** | 52×52 | 384×384（现用 58 单位） | 疾跑丧尸：更瘦、前倾、褐色皮肤 |
| `zombie_spitter.png` ✅**已接入** | 64×64 | 384×384（现用 68 单位） | 毒液丧尸：鼓胀的绿色毒囊、短臂 |
| `boss.png` ✅**已接入** | 200×200 | 512×512（现用 150 单位） | 巨型变异体：红色躯干、骨刺、单只发光核心眼。**注意四周留白**，它碰撞半径 46 |

> 可选增强：给每个角色额外做 2 张 `_attack.png`（前摇姿态）和 1 张 `_dead.png`（尸体贴花），但不是必需——现有代码用"抬起手臂 + 白闪 + 血雾"表现攻击。

### 1.2 场景地砖与墙体（4 张）

| 文件 | 世界尺寸 | 导出尺寸 | 说明 |
| --- | --- | --- | --- |
| `floor_tile.png` ✅**已接入** | 62×62 | 512×512 | 超市地砖。AI 出图后用 `make-tileable` 四向镜像强制无缝 |
| `asphalt_tile.png` ✅**已接入** | 128×128 | 512×512 | 街道沥青，同上四向镜像 |
| `wall_h.png` | 128×34 | **256×68** | 横向墙体，**左右可平铺**（9-slice 的中间段），顶部高光 + 底部阴影 |
| `wall_v.png` | 34×128 | **68×256** | 纵向墙体，上下可平铺 |

> 墙体是任意长度拼的（200~660 世界单位），所以必须做成可平铺的条带，不能是一整块。

### 1.3 关键道具（3 张）

| 文件 | 世界尺寸 | 导出尺寸 | 说明 |
| --- | --- | --- | --- |
| `shelf.png` 🟡**程序化替代** | 200×30 | — | 货架改为程序化精修：金属端柱 + 层板分隔 + 商品投影 + 前缘价签，比 AI 两版都更像货架 |
| `car_h.png` ✅**已接入** | 150×64 | 512×229 | 废弃轿车（横向）；纵向车在渲染时旋转 90° |
| `car_v.png` | 64×150 | **128×300** | 同一辆车的纵向版本（或直接旋转 car_h，但高光会转错，建议单画） |

### 1.4 物资图标（4 张，44×44 世界）

| 文件 | 导出尺寸 | 说明 |
| --- | --- | --- |
| `loot_ammo.png` ✅**已接入** | 128×128 | 绿色弹药箱（AI 生成，3/4 俯角） |
| `loot_medkit.png` ✅**已接入** | 128×128 | 白色医疗箱 + 红十字 |
| `loot_xp.png` ✅**已接入** | 128×128 | 青色发光晶体 |
| `loot_weapon.png` ✅**已接入** | 128×128 | 木质军械箱 + 步枪剪影 |

> 这 4 张是**目前唯一已经接好图片通道**的资产（`AssetManager.makeSprite` → `Renderer.sprites`），做好丢进去就能用。

### 1.5 品牌与 UI（4 项）

| 文件 | 尺寸 | 说明 |
| --- | --- | --- |
| `logo.png` | **1200×600** 透明底 | 主菜单标题「末日重启 / 觉醒者」。现在是 CSS 文字 + 辉光，换成手写标题字会立刻高级 |
| `skill_*.png` ✅**已接入** | 6 张 × 128×128 | 霓虹线稿图标（AI）；`--dehaze` 去掉白色雾边，58px 显示 |
| `portrait_linye.png` ✅**已接入** | 192×192 | HUD 左上角头像（AI 生成，护目镜/疤痕/冷绿侧光） |
| `menu_bg.jpg` ✅**已接入** | 1600×900 | 主菜单背景（AI 生成，超市废墟 + 破洞天光，中心留空） |

---

## 2. P1 · 场景丰富度与战斗表现（约 14 张）

| 文件 | 世界尺寸 | 导出 | 说明 |
| --- | --- | --- | --- |
| `counter.png` | 180×36 | 360×72 | 收银台 |
| `barrier.png` | 140×26 | 280×52 | 橙白条纹路障 |
| `crate.png` | 70×70 | 140×140 | 木箱（挡子弹） |
| `trash.png` | 90×80 | 180×160 | 垃圾堆 |
| `exit_zone.png` | 360×280 | 720×560 | 出口地面标识（绿色箭头 + 虚线框） |
| `decal_blood_1/2/3.png` | 96×96 | 192×192 | 血迹贴花，3 张随机铺地 |
| `decal_crack_1/2.png` | 128×128 | 256×256 | 地面裂缝 |
| `muzzle_1/2/3.png` | 64×64 | 128×128 | 枪口火焰 3 帧（现在是代码画的三角+光晕） |
| `bullet.png` | 32×8 | 64×16 | 曳光弹（现在是两点连线） |
| `acid_glob.png` | 32×32 | 64×64 | 毒液弹 |
| `hazard_pool.png` | 160×160 | 320×320 | 毒池地面（现在是径向渐变圆） |
| `crosshair.png` | 32×32 | 64×64 | 准星（现在是四条短线，矢量其实更好，可不做） |

---

## 3. P2 · 锦上添花（可选）

- `zombie_*_walk_*.png`：4~6 帧走路动画（8 方向的话工作量爆炸，建议只做"朝右 4 帧"）
- `boss_attack.png` / `boss_phase2.png`：Boss 前摇与狂暴形态
- `chapter_card.png`：章节标题卡（"第一章 超市突围"）
- `ui_frame.png`：HUD 面板边框（9-slice）
- `result_win.jpg` / `result_lose.jpg`：结算界面插画
- `vignette.png`、`fog.png`：氛围叠加层
- 天气/灰尘粒子贴图：`particle_dust.png`、`particle_ember.png`

---

## 4. 这些**不用**做（代码已处理，画了反而冲突）

| 元素 | 现状 |
| --- | --- |
| 伤害数字 / 暴击数字 | Canvas 文字 + 描边，字体决定观感 |
| 血条 / 经验条 / Boss 血条 | DOM + CSS 渐变 |
| 玩家影子、丧尸影子、脚下光晕 | 代码椭圆 + 径向光晕 |
| 受击白闪、EMP 环、震地预警圈 | 代码绘制（会随参数变化） |
| 准星、瞄准虚线 | 代码矢量（跟随后坐力/触屏） |
| 所有 HUD / 菜单 / 升级卡片的框体 | CSS clip-path + 渐变 |
| 枪口光照、手电光锥 | 预渲染的径向渐变精灵 |

---

## 5. 目录与命名

```
assets/
├── images/
│   ├── characters/  player.png, zombie_normal.png, zombie_runner.png,
│   │                zombie_spitter.png, boss.png
│   ├── tiles/       floor_tile.png, asphalt_tile.png, wall_h.png, wall_v.png
│   ├── props/       shelf.png, car_h.png, car_v.png, counter.png,
│   │                barrier.png, crate.png, trash.png
│   ├── loot/        loot_ammo.png, loot_medkit.png, loot_xp.png, loot_weapon.png
│   ├── fx/          muzzle_1..3.png, bullet.png, acid_glob.png, hazard_pool.png,
│   │                decal_blood_1..3.png, decal_crack_1..2.png
│   └── ui/          logo.png, portrait_linye.png, skill_icons.png,
│                    menu_bg.jpg, exit_zone.png
└── audio/           （音效目前全部 Web Audio 合成，见 README）
```

图集约定（如果做 spritesheet）：**横向等分、每格正方形、无内边距**，帧序从左到右，例如
`zombie_normal_walk.png` = 6 格 × 120px = 720×120。

---

## 5.5 已经接入的角色（AI 生成）

| 文件 | 来源 | 处理参数 |
| --- | --- | --- |
| `player.png` | `art-source/player-source.png` | `--anchor=0.48,0.49 --bright=1.05` |
| `zombie_normal.png` | `art-source/Same_top_down_camera__framing__2026-11-25T14-56-27.png` | `--anchor=0.45,0.52 --bright=1.18` |
| `zombie_runner.png` | `art-source/zombie_runner-source.png` | `--rotate=-90 --anchor=0.5,0.5 --bright=1.18` |
| `zombie_spitter.png` | `art-source/zombie_spitter-source.png` | `--rotate=-90 --anchor=0.5,0.5 --bright=1.10` |
| `boss.png` | `art-source/boss-source.png` | `--rotate=-90 --anchor=0.5,0.5 --bright=1.12` |

> 渲染侧：`Renderer` 已支持「有图用图、无图回退矢量」，丧尸/Boss 的图片分支也已接好。
> 换图只需覆盖 `assets/images/characters/` 下的文件（或在 `IMAGE_MANIFEST` 改路径）。

### 道具与图标（已接入）

| 文件 | 来源 | 参数 |
| --- | --- | --- |
| `props/crate.png` | `art-source/Strict_top_down_view_of_a_wood_*.png` | `--size=160` |
| `props/trash.png` | `art-source/Strict_top_down_view_of_a_smal_*.png` | `--size=192` |
| `ui/skill_*.png` | `art-source/Game_skill_icon_glyph_*.png` | `--bbox --maxw=160 --dehaze` |

> 技能图标在 46px 会糊成色块，卡片里放大到 **58px** 并去掉外发光后才读得出来；若以后把卡片 UI 做大到 96px 会更清楚。

### UI 与物资（已接入）

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `loot/loot_*.png` | `art-source/Game_item_icon__*.png` | `--size=128 --anchor=0.5,0.5 --clearBR=0.80,0.90` |
| `ui/portrait_linye.png` | `art-source/Game_UI_portrait__square__head_*.png` | `--size=192 --crop=0.62 --anchor=0.55,0.5` |
| `ui/menu_bg.jpg` | `art-source/Dark_post_apocalyptic_game_mai_*.png` | 等比裁到 1600×900（去掉右下角水印），CSS 叠加渐变保证文字可读 |

### 场景贴图（已接入）

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `tiles/floor_tile.png` | `art-source/Seamless_tileable_texture__...15-02-44.png` | `make-tileable --crop=0.332`（正好 2×2 块地砖，网格对齐） |
| `tiles/asphalt_tile.png` | `art-source/Seamless_tileable_texture__...15-03-02.png` | `make-tileable --crop=0.72` |
| `props/car_h.png` | `art-source/Orthographic_top_down_view_of__...15-04-03.png` | `--bbox --maxw=512` |

> 渲染：地面贴图以 `createPattern` 铺满，再压一层 `rgba(16,22,19,0.52)` 保持末世暗调；
> 贴图晚于首帧加载时，`main.js` 会调用 `renderer.refreshStaticLayer()` 重建静态层。

## 5.55 程序化精修（不消耗出图预算）

AI 画不好的三类长条物件，改为程序化加强：

| 物件 | 精修内容 |
| --- | --- |
| 墙体 | 俯视伪高度：投影 → 7px 高度面 → 顶面渐变 → 顶边受光 → 浇筑分块缝 + 裂缝 + 掉角 |
| 货架 | 金属端柱、层板分隔线、每 64px 竖立柱、商品投影、前缘价签（随机米黄/青白） |
| 收银台 | 木纹台面渐变 + 前挡板 + 收银机（绿色屏幕）+ 塑料袋 |
| 路障 | 斜条纹（不再是竖条）+ 支脚 + 顶边高光 |

## 5.6 最初那版（豆包 3/4 视角，保留作对比）

`assets/images/characters/player.png` 是用豆包出图 + `tools/import-sprite.mjs` 转出来的：
白底抠图 → 清掉右下角水印 → 以躯干为锚点裁正方形 → 384×384。
渲染侧已实现「有图用图，无图用矢量」的双通道，把 `IMAGE_MANIFEST` 里那行删掉即可还原。

## 6. 接进游戏：三步

**第 1 步** 把文件放进 `assets/images/...`。

**第 2 步** 在 `js/core/AssetManager.js` 的 `IMAGE_MANIFEST` 里登记（键名 = 代码里用的 key）：

```js
const IMAGE_MANIFEST = {
  player: 'assets/images/characters/player.png',
  zombie_normal: 'assets/images/characters/zombie_normal.png',
  loot_ammo: 'assets/images/loot/loot_ammo.png',
  // ...
};
```
加载失败会自动回退到程序化绘制，不会白屏。

**第 3 步** 在 `js/render/Renderer.js` 里让对应绘制函数优先用图：

| 要替换的 | 改哪个函数 | 改法 |
| --- | --- | --- |
| 物资图标 | `_buildSprites()` | 已经走 `sprites['loot_*']`，登记 key 后**自动生效**，无需改代码 |
| 玩家 | `drawPlayer()` | 在函数开头加：`const img = assets.getSprite('player'); if (img) { translate/rotate; drawImage(img, -32,-32,64,64); 再画枪口火焰; return; }` |
| 丧尸 | `drawZombie()` | 同上，按 `z.typeId` 取 `zombie_normal / _runner / _spitter` |
| Boss | `drawBoss()` | 同上，`boss.png` 画 200×200 |
| 地砖/墙体/道具 | `buildStaticLayer()` / `_drawObstacle()` | 把 `ctx.fillRect` 换成 `ctx.drawImage` + `createPattern`（地砖用 pattern，墙体用 9-slice 拉伸） |

> 角色是**矢量绘制**的，换图必须动 `drawPlayer/drawZombie/drawBoss` 这三处（各 5~8 行）。
> 需要的话我可以直接把「图片优先 + 程序化兜底」的双通道写进渲染器，你只要丢图+登记即可。

---

## 7. 交付前自检（照着过一遍）

- [ ] 所有 PNG 都是**透明底**，没有白边/黑边（用深色背景预览一次）
- [ ] 角色**朝右**，且图片中心与角色碰撞中心重合（左右上下留白一致）
- [ ] 角色四周留 8%~12% 透明边，旋转时不会被裁切
- [ ] 地砖/沥青/wall_h/wall_v **无缝平铺**（复制 3×3 拼一下看接缝）
- [ ] 没有烘焙阴影、没有烘焙环境光（统一光向由代码加）
- [ ] 暗背景可读性：把图放在 #232b27 底色上，缩小到 50% 仍能看出轮廓
- [ ] @2x 导出，文件名与 `IMAGE_MANIFEST` 的 key 一致
- [ ] 单张图 < 500KB，整包 < 8MB（移动端流量）

---

## 8. 建议的制作顺序

1. **P0 角色 5 张** → 画面主体立刻成立（最优先，1~2 天）
2. **P0 地砖 + 墙体 4 张** → 场景不再"灰板"（半天）
3. **P0 货架 / 车 / 物资 7 张** → 场景信息量与可读性（1 天）
4. **P0 logo + 头像 + 技能图标** → 首次进入的观感（半天）
5. P1 按需补：先补 muzzle / hazard / decal（战斗表现），再补道具。
