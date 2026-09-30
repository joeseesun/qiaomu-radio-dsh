# 乔木电台 DSH 插件 · 视觉验收报告

> 验收人：`radio-visual`（视觉验收）｜方法：真实 Chrome 截图 + CDP 量化测量 + 逐像素与线上参考对照 + 读图代理逐屏判读
> 本报告只写**可复核的观测**：每条都有截图路径、坐标/尺寸/颜色实测值与复现命令。判读不了、验证不了的，在 §9 如实列出。
> **第 2 版（01:35 复核后）**：P0-1 等级按 lead 口径改记 P1；P0-2 / P1-1 / P1-2 / P1-3 经第二轮实测确认为**已修复**。

---

## 0. 快照与可比性声明（先读这一节，否则会误改）

本轮跨了三份构建，结论必须绑定快照：

| 代号 | 是什么 | 指纹 / 时间 | 证据来源 |
|---|---|---|---|
| **A. 生产构建** | 老板最早给的 18 张截图对应的构建，也是 `127.0.0.1:4190/qiaomu-radio/` 曾服务的内容 | `lib/client.js` sha256 `56cc461f8d8792…`，00:53:23 | ~~`docs/shots/*.png`（18 张）~~ **该目录现为空、原始图已丢失** → 同代证据见 §9 的 `../../qiaomu-radio-baselines/shots-A-era-*`（相对 `docs/`）；另有 4190 的 DOM 实测 |
| **B1. 中间态** | 我第一轮测量的工作树 | `preview-dist/styles.css` sha256 `c4d96c1f68deea…`，01:09:06 | `127.0.0.1:4182` |
| **B2. 当前树（复核基准）** | 含 lead 的外壳修复 + radio-ui 的皮肤修复 | `src/dsh/page.ts` 01:22:05、`styles/30-skins.css` 01:24:43 | `127.0.0.1:4183`、`/tmp/shots-B/*.png`（我重出的 18 张） |
| **C. 线上参考** | `https://radio.qiaomu.ai/` | 01:29 抓取（1280x860）、01:03 抓取（1440x1000） | `/tmp/ref3/R2-*.png`、`/tmp/ref2/R-*.png` |

两条方法学结论（都做过对照，不是推断）：

1. **`?theme=` 生效**。我用 `--screenshot` 批量截图时曾出现六张图字节完全相同（未复现）；改用 CDP 复核：`?theme=pocket → data-theme=pocket`、`?theme=console → data-theme=console`，且 `--screenshot` 复测两张图字节不同（75434 vs 360749）。本报告主题结论一律基于 CDP。
2. **线上参考的 fantasy/rams 必须用软件 WebGL 才能出图**。默认 `--disable-gpu` 下参考页空白；加 `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` 后 6/6 正常（1280x860 下唯一色数 285~116250）。

### 0.1 第二轮复核（01:31~01:35，B2 基准）

用 **lead 提供的 `tools/capture-skins.mjs`**（CDP：`Emulation.setEmulatedMedia` + `setDeviceMetricsOverride` + 真实点击换肤）在 `http://127.0.0.1:4183/` 重出 **18 张**：18/18 皮肤正确、**18/18 `overflow=false`**。

> **写盘位置说明**：该脚本第 11 行固定写 `docs/shots/`，会覆盖旧 18 张，而我的写权限只到 `docs/VISUAL-REVIEW.md` 与 `/tmp`，所以我把脚本**拷到 `/tmp/capture-skins-B.mjs`、只把 `outDir` 改成 `/tmp/shots-B`**（另把 `ws` 导入改为绝对路径以便在 `/tmp` 运行），其余逻辑一字未改。旧图当时留在 `docs/shots/` 以做前后对照；**该目录现为空、原始 A 基准图已丢失**（按 lead「仓库不含图」口径，见 §9），同代证据在仓库外 `../../qiaomu-radio-baselines/shots-A-era-*`（相对 `docs/`；我已抽样比对 sha 与 `/tmp/shots`、`/tmp/shots2` 一致，路径口径与只读约束见 §9）。

**修复前后对照（全部为实测值）**

| 项目 | 修复前（A / B1） | 复核值（B2，01:31） |
|---|---|---|
| 深色外观下 `.radio-root` 文字色 | `rgb(255,255,255)`（白字压米色，10 处 <3:1，最低 **1.09:1**） | `rgb(63,66,57)`；页内对比度审计 **`badCount=0`**（editorial/rams/deck） |
| 页面外圈颜色 | A：`#ffffff` 纯白（100%）；B1：底部留 `#d9d8cf` | **100% 主题色**：editorial `(238,234,226)`、deck `(35,38,48)`、rams `(227,226,216)` |
| `body` margin / 多余滚动 | `8px` / `scrollHeight = clientHeight + 16` | `0px` / `1000 / 1000` |
| `.radio-root` min-height @1000px 视口 | `880px`（`min(100svh,880px)`） | **`1000px`**（`styles/30-skins.css:1222` 已改为 `100svh`） |
| 设备中心 vs 视口中心 | y=459 vs 500（高 41px） | **y=500 vs 500（0px）** |
| rams 立体部件 | `.rams-shell 308x0`、3D transform 元素 **0** 个 | shell `984x510`、speaker `557x480`、grille `517x446`、cone `323x317`、knob `208x195`、**t3d=24** |
| fantasy 立体部件 | `.fantasy-shell 308x0`、t3d=0 | shell `1027x514`、glow `1007x594`、**t3d=17** |
| `.skin-dock` | 6 皮肤全部显示（第二套原生控件条） | deck/editorial/pocket/console `display:none`(`0x0`)；rams/fantasy `520x56` 且 `accent-color` 为主题色 |
| 皮肤背景色 vs 参考 | — | **6/6 逐像素相同**：`(227,226,216)` `(22,20,23)` `(238,234,226)` `(232,232,227)` `(35,38,48)` `(55,59,62)` |

**能力限制（必须说明）**：本轮读图模型**持续不可用**——`kimi-coding/k3` 连续 **4 轮**失败（1 / 3 / 6 / 2 个 agent 全部失败，最后一次 01:38，按 lead 指示停止重试），因此**第二轮"像不像参考"的主观判读没有完成**。上表全部是 DOM 几何 + 像素统计 + 参考像素对照的客观量，可自行复核；并排图已生成待判读：
`/tmp/pair-{rams,fantasy,editorial,pocket,deck,console}.png`（左 = 复刻 1280x860，右 = 参考 1280x860）。

**时间线提醒（避免混淆）**：`/tmp/shots-B` 拍于 **01:25**、`shots-C` 于 **01:47~01:48**，都早于 `preview-dist/` 的 **01:51:00** 重建，因此**都不含 meta pin**。`shots-D` 拍于 01:51 构建（含 meta pin）。**最新请用 `/tmp/shots-E`（02:15 构建，含 P2-4 console 修复）**——`shots-D` 只在 **console** 上过期（其余皮肤 D/E 差异 ≤0.93%）。

**发布产物 = 预览产物（已核验，结论可互推）**：`lib/player/styles.css` 与 `preview-dist/styles.css` **整文件逐字节相同**（63,370 B，sha `a53650ed2049a727`，`cmp` 无差异）。因此 §7/§3 里"在 `preview-dist`/4182/4183 上的浏览器实测"**等价于对最终 release 产物 CSS 的实测**，无需为"对发布产物负责"重测；两者哪天不等，就是构建出了问题。

### 0.2 真实 GUI（DSH harness 上的插件页）复核 —— 本轮新增的验证面（我此前完全没覆盖）

- **为什么必须补**：lead 本轮把挂载点从 `/plugins/@qiaomu/dsh-radio` 改为 **`/qiaomu-radio`**、去掉前缀注册的尾斜杠，并把 `lib/client.js` 改成 harness 的经典脚本信封（`window.__ModuleLoader__.load({id, factory})`，不再依赖 `react-dom`）——**改前该插件在真实 GUI 里 entry 激活失败**。而我此前所有截图都来自 `preview-dist`（独立预览服务），**真实 GUI 这一面从未被验证**。AGENTS.md 也要求改动要在真机看过才算完成，故补测。
- **方法与边界（可复现）**：复用 lead 已开的调试实例 **Chrome 9226**（`--user-data-dir=/tmp/cdp-gui-profile`，指向已登录的 harness 实例 `127.0.0.1:4199/qiaomu-radio/?token=…`）。脚本 `/tmp/gui-shots.mjs` 从已有标签页读取 URL（**token 不打印、不落盘**），**自建临时标签页采集、采完即关闭**，不触碰任何既有标签页；18 张存 `/tmp/gui/`。
- **`19387`（用户本机 GUI）我无法验证**：未认证请求 `/` → **401**、`/qiaomu-radio` → 404，我没有会话凭据。**这只说明该面在我的权限外，不作为"路由不存在"的缺陷依据**（lead 的实例 4199 上同一路径工作正常）。

| 项 | 实测 |
|---|---|
| 挂载 | `.radio-root.listening-room.room-<skin>`、`#radio-root` 1 个子元素、`body.radio-page`、标题「乔木电台 · 此刻，听点什么」 |
| 皮肤切换 | **6/6 正确**（editorial / rams / pocket / deck / console / fantasy），`data-page=now` |
| 横向溢出 | **18/18 `overflow=false`**（1280x860 与 420x900） |
| 几何 | 与 `preview-dist` 在**同一浏览器实例内逐值相同**：editorial `370x300@(455,251)`、rams `308x92@(792,172)`、pocket `350x288@(465,130)`、deck `428x286@(426,341)`、console `728x350@(276,283)`、fantasy `332x111@(469,313)` |
| 控制台 | **0 error / 0 exception**（两次干净复跑，`Runtime.exceptionThrown` + `Log.entryAdded` + console 全收） |

**像素对照（同一 Chrome 9226 内，GUI vs preview，各 18 张）**：**light/dark 11/18 ≤1%**（多数 ≤0.5%，最大 `editorial-light` 1.04%），且差异**集中在屏内动态内容区**（editorial-light bbox `(910,529)-(1648,1230)`、console-light `(604,300)-(1948,776)`）→ 与"布局相同、只有动态内容/时刻不同"一致。**narrow 那 1.24%~6.51% 的差异已查明（我先前写的"未复核"作废）—— 不是 GUI/preview 的保真差异，而是 `.radio-notice` 的竞争态。** radio-ui 先给出相关性证据，我补做了**因果实验**（抓取客户端真实收到的 catalog 响应体 72,123 B，再用**同一响应体 + 一个 `warning` 字段**重放）：

| 观察项 | 实测 |
|---|---|
| 干净侧 vs 注入侧 | 干净 32 帧**无** notice；注入侧 notice 出现后**自动消失** |
| notice 生命期（更正 + 精确复测） | 代码常量 **`NOTICE_MS = 3_200`**（`src/client/useRadio.ts:44`），唯一定时器在 `:670-674`，依赖是 `[notice]` → **每次文案变化都清旧定时器、重新计时 3.2s**。我 100ms 轮询实测：**单发换肤 notice = 3.20s ±0.1s**（`/tmp/notice-life.mjs` B 组，文案「已切换到「极简」…」单一种类）；注入 warning 那组读到 2.90s 是**起测偏晚**（轮询开始时它已在屏上）→ 我先前记的「≈2.75s」同属这个偏差，**作废**；§5.1 ② 记的「≥5s」也已更正为"重试链文案替换导致重新计时"，不是同一条存活更久 |
| notice 几何 | `396x38.6@(12,692)`、`class=radio-notice`、`role=status`（warning，不是 error 的 `has-error`） |
| 是否位移布局 | **否**：两侧 `.skin-body y=58`、`.skin-screen bottom=382` 完全相同 |
| 像素影响 | **5.44%**（420x900@2）＝ notice 带内 **4.30%** + 带外 **1.14%**（带外为 notice 阴影边缘 + 顶部主题钮的加载动画相位，行 1478-1498 各 452px） |

**来源链**：`src/host/catalog.ts:39` 的 `WARNING_CATALOG_DOWN`（上游目录偶发失败 → 宿主回退中国公开电台并返回 `warning`）→ `src/client/useRadio.ts:404` `if (result.warning) setNotice(result.warning)` → `src/client/RadioApp.ts:58` 渲染 `.radio-notice`。客户端另有一条自己的兜底文案（`src/client/transport.ts:61`，请求层直接失败时使用）。

**出图归一化规则（后续所有人适用，两条并用）**：①**截图那一刻必须把 `notice` 布尔值写进 `report.json`**（否则非零差异无法逐张定责）；②截图前断言 `!document.querySelector('.radio-notice')`，且**距最后一次交互 ≥3.5s**（> `NOTICE_MS` 3.2s）；若处于播放重试链，改为**轮询到连续 2 帧 absent** 再截。原因见上：notice 只有 3.2s 窗口、但**文案替换会重新计时**，所以"等它不在"仍可能擦肩而过，只有标志位能事后判定。（这条与 §5.1 ② 的"切皮肤触发 notice"是同一套规则的两个触发源：上游目录失败 / 点击主题选择器，共用同一个 3.2s 定时器，不必分别处理。）

**未复现的一条告警（记录在案，不作为结论）**：首轮采集出现过 1 条 `403 (Forbidden)`（`log.error`，未带 URL）；随后用 `Network.enable` + `Log.enable` 对 GUI 与 preview 各复跑 2~3 次，**均为 0 条**。未能复现、未取到 URL → **不写成问题**。

### 0.3 出图环境污染：`.radio-notice` 两个变体，以及"我的截图确实被污染"（本轮最后查清，影响一切像素对比的解读）

**变体一（`status`）**：`setNotice`（换肤 / `WARNING_CATALOG_DOWN` / 重试文案 / 偏好反馈共用），`role=status`，**3,200 ms 自动消失**——常量 `src/client/useRadio.ts:44` `NOTICE_MS = 3_200`，定时器在 `:670-674`，依赖 `[notice]`（文案被替换会**重启**计时）。我 100 ms 轮询实测单发换肤 notice **3.20s ±0.1s**，与常量吻合。

**变体二（`alert`）**：`setError`（`src/client/useRadio.ts:361`，文案「风格已经切换。浏览器需要你再点一次播放才能发声。」），`role=alert`、class 含 `has-error`，**没有任何定时器**——只能靠用户动作清除。触发条件：**出图 Chrome 未带 `--autoplay-policy=no-user-gesture-required`** 时，换肤尝试自动播放被拦。我在一个无该 flag 的干净 Chrome 上实测：`t=2 / 6 / 12 / 20 s` 该 alert **始终在**；用真实鼠标事件点它自己的「重试」按钮后 `+1s` 变成 `role=status` 的 info notice、`+3s` 消失（3.2 s 定时器）。

**我的 `/tmp/shots-B/C/D/E` 全部含变体二**（出图 Chrome 未带该 flag，且脚本每次换肤都会点选择器）。决定性证据（`editorial-light`，notice 带图像坐标 `(630,1570)-(1930,1690)`）：

| 图 | vs「含 alert」对照 | vs「移除 alert」对照 |
|---|---|---|
| 我的 `/tmp/shots-E/editorial-light.png` | **0.00%（max 0）** | 81.41% |
| `tools/capture-skins.mjs` 出图（`/tmp/shots-F`，alert 已 hidden） | 81.41% | **0.00%** |

**影响范围（重要，别误读前面的数字）**
- 我最初那次「`shots-E` vs `/tmp/gui` 差异 3.68%~33.83%」中，**约 2.9% 的地板就是这条 alert**（`640x50 / 1280x860` = 2.9%），其余才是 WebGL / 抗锯齿 / 动画相位差异。
- **不受影响**的对比：`shots-D` vs `shots-E`（两侧同状态）、`/tmp/gui` vs `/tmp/gui-preview`（两侧都跑在带 flag 的 9226）——这些结论仍然有效。
- **不受影响**的结论：18/18 `overflow=false`、挂载/换肤/几何/0 error。
- `docs/shots/` 现为**空目录**：按 lead 定的「**仓库不含图**」口径（`docs/DELIVERY.md` §3），仓库内不再保留截图基准（**清空动作的归属无法确认，本文不点名**）。原始 A 基准已丢失、不可再生；同代证据在**仓库外**只读目录 `../../qiaomu-radio-baselines/shots-A-era-{0052,0102}/`（相对本文件所在 `docs/`；绝对路径 `<workspace>/qiaomu-radio-baselines/`；校验与只读约束见 §9）。A 的结论保留在本文 §7（已标注历史）。

**出图归一化规则（三条，最终版）**：①截图那一刻记录 **`notice` 与 `noticeError` 两个布尔值**（写进 manifest）；②`status` 变体：截图前轮询到**连续 2 帧** absent（换肤/重试会重启计时）；③`alert` 变体：**不要等**——让 Chrome 带 `--autoplay-policy=no-user-gesture-required` 从源头避免，或截图前把该节点 `visibility:hidden` / `remove()`。
**触发源 × 变体是 2×2，不是一一对应**：上游目录失败 → 可能出 `status`（warning）；换肤点击 → 正常出 `status`，自动播放被拦时出 `alert`。

---

## 1. 结论摘要

| 编号 | 等级 | 皮肤 / 视口 | 一句话 | 状态 |
|---|---|---|---|---|
| P1-4 | —（已定性） | 全部 / 系统深色外观 | **有意不跟随系统深浅色**：外壳已 pin `color-scheme: light`，Chrome 不再涂黑画布、不再把初始文字色设白 | **已收口（设计决定，非缺陷）** |
| ~~P1-6~~ | 已撤回 | pocket / 所有视口 | 我引用的"参考自绘 slider"来自**未部署的本地 checkout**；线上 CSS（sha `0cfc3276…`）实测参考只用 `accent-color` + pocket `height:22px`，复刻已一致 | **撤回（误报，见 §5.1）** |
| P1-5 | P1 | rams、fantasy / 1280x860 | 立体层次是否达标；**只能定性，无法在 headless 里与参考 3D 对齐** | **未能复核** |
| P0-1 | P1（原记 P0） | editorial、rams、pocket / 系统深色外观 | 白字压米色，最低 1.09:1 不可读 | **已修复（复核通过）** |
| P0-2 | P0（对 A 构建） | rams、fantasy / 桌面视口 | 3D 立体部件高度塌陷为 0 | **已修复（复核通过）** |
| P1-1 | P1 | 全部 6 皮肤 / 所有视口 | 8px 纯白边框 + 底部纯白横带 + 16px 多余滚动 | **已修复（复核通过）** |
| P1-2 | P1 | 全部 6 皮肤 / 高视口 | `min(100svh,880px)` 使内容整体偏高 | **已修复（复核通过）** |
| P1-3 | P1 | 全部 6 皮肤 / 所有视口 | `.skin-dock` 重复控件条并遮挡内容 | **已修复（复核通过）** |
| ~~P2-4~~ | 已修复 | console / 1440x1000 | 播放列表曾 **360px vs 参考 350px**（根因：两角色合并使参考里空转的 `height:360px` 生效） | **已修复并复核（§3 P2-4）** |
| **P2-8** | 文档口径 | rams、fantasy / <720px | 窄屏平屏属**有意偏离**（参考窄屏仅 `118x33`，基本不可用） | 已定：不改代码，只写进交付说明 |
| ~~P2-1、P2-5、P2-6、P2-7前半~~ | 假阳性 | 见 §5.6~5.9 | 主题钮/表格半行/窄屏屏内滚动/tab 未选中态 —— **参考本就如此** | 已撤回，勿改 |
| ~~P2-2、P2-3~~ | 假阳性 | 见 §5.1②③ | 3D 度量伪影 / 截图器 notice | 已撤回，勿改 |
| P2-7后半 | 已修复 | 见 §3 P2-7b | notice 描边改为 `--radio-danger` 混色，6 皮肤各自成立 | 复核通过 |
| **真实 GUI（harness 插件页）** | **通过（结构面）** | 6 皮肤 x light/dark/narrow / 1280x860、420x900 | 挂载正常、皮肤切换 6/6、无溢出、几何与 preview 逐值相同、**0 error** | 见 §0.2；light/dark 像素 ≤1.04%；**narrow 差异已查明为 `.radio-notice` 竞争态（因果验证，非保真差异）** |

**最像 / 最差（针对 A 构建的 18 张截图）**：最像 `editorial-light`、`console-light`（设备盒与参考差 ≤2px）；最差 `rams-light`、`fantasy-light`（立体主体高度为 0，画面 90.9% / 74.9% 空白）。
**B2 基准下的排序**：主观排序**未能复核**；客观结构量见 §7。

---

## 2. 仍存在的问题（仅 P1-5）

> P1-4 已收口为「有意设计」，移到 §3 末尾；P1-6 已撤回（误报），见 §5.1。

### P1-5 rams / fantasy 立体层次 —— 未能复核

- **能对齐的只到"3D 视口/容器尺寸"这一层**（DOM 直量，1280x860；参考用 `--use-angle=swiftshader --enable-unsafe-swiftshader` 可拿到真 3D，见 §5.1）：

  | 皮肤 | 复刻 | 参考（webgl=true，真 3D） | 判读 |
  |---|---|---|---|
  | fantasy | `.skin-fantasy` / `.fantasy-scene` `1040x655` / `1040x579` | `<canvas> 1100x653`，roomH=860（不滚动） | 宽 −5%、高 +0.3% → **尺寸基本一致** |
  | rams | `.skin-body` `980x640`（机身容器） | `<canvas> 1240x670`（全幅画布，机身画在其中） | **口径不同，不可比** |

- **"fantasy 偏大 66.72% vs 46.5%"这条作废**：那个"内容占比"是"与首行底色不同的像素比例"，对 3D 场景不成立——参考的 3D 场景大部分是深色背景（`rgb(18,19,23)` 附近），会被算成"非内容"；而复刻的 CSS 3D 带大面积亮光晕，会被算成"内容"。**该指标不能比较 3D 剪影，据此缩小会放大偏差**（radio-ui 反证 + 我复核后撤回，见 §5.1）。
- **宽视口下有一处"设计路线"的正面印证**：参考 rams 在 three.js 正常时，交互屏是**投影进 3D 机身内**的（`.native-glass 278x78@(762,234)`，canvas `1240x671@(20,101)`），而不是另放一块平屏；复刻在宽视口也把屏放进机身（`.skin-body` 子树内），**路线一致**。窄视口的差异见 §4 P2-8。
- **结论**：**尺寸层面没有任何需要缩放的依据**（fantasy 几乎一致；rams 两边口径不同）。**"像不像 / 立体感够不够"仍未复核**，素材 `/tmp/pair-rams.png`、`/tmp/pair-fantasy.png`。

### P1-5 补测（lead，本轮）：差距**显著**，此前"未能复核"不能再当"大概率没事"

- **触发**：用户看真实 App 后直接问"魔兽世界等风格为啥没迁移过来"——说明他对成品的第一反应是"没有这一款"，
  而不是"这一款做得不够像"。这是比任何像素指标都更硬的产品信号。
- **事实核对（先排除"真没迁移"）**：在**用户正在运行的实例**（`http://127.0.0.1:19387/qiaomu-radio/`）实测枚举
  主题选择器 → `魔兽世界 3D / 博朗 · 3D / 极简 / iPod / Winamp / foobar2000`，六款齐；点选「魔兽世界 3D」后
  `data-theme="fantasy"`、`.skin-fantasy.skin-body` `1040x655`，子节点 `fantasy-scene` + `skin-dock` 正常渲染。
  **所以问题不是"缺失"，是"观感不像"。**
- **差距的根因（读参考源码得到，非推测）**：

  | | 参考实现（**注意下表两行的文件名与主题是反的**，见下） | 本插件（改造前） |
  |---|---|---|
  | fantasy（魔兽世界） | `PlayerSkin.tsx` 里 `theme === "fantasy"` 渲染 `RamsRadio.tsx`：**`GLTFLoader` 加载 2744956 B 的 `qiaomu-fantasy-radio-hyper3d-v2.glb`** + `RoomEnvironment` PMREM 环境 + 落地平面 + `OrbitControls` + `CSS3DRenderer` 把真 HTML 屏幕投影进 3D 空间 | 纯 CSS/DOM：**0 canvas、0 img、18 个内联 SVG** |
  | rams（博朗） | `theme === "rams"` 渲染 `NativeRadio.tsx`：**three.js 程序化建模**（`src/radioModel.ts` 现场建整台机身，**无外部模型文件**）+ `VSMShadowMap` 阴影 + 拆解视图 | 纯 CSS/DOM |

  > **上一版这张表两行写反了**，原因就是参考的命名陷阱：它按"给谁用"而不是"长什么样"命名，
  > `RamsRadio.tsx` 是魔兽世界款、`NativeRadio.tsx` 才是博朗款。第一轮核对时按文件名推断，
  > 于是把"GLB 在 rams 侧"写进了文档，并据此在 `ramsScene.ts` 里**错用了另一款主题的场景参数**
  > （见 §3 的 P1-5 收口）。结论：**读参考实现时不要相信文件名，只认 `PlayerSkin.tsx` 的分派。**

- **首次取得"像不像"的判读**（此前读图模型连续 4 轮失败）：把本插件 fantasy 截图与参考自带的
  `docs/assets/qiaomu-radio-fantasy-v4-screen-model-ready.png` 交给**能读图的模型**判定，结论：
  > 参考是可辨认的**奇幻实体物件**（木箱机身、皮革提手、兽角、蓝水晶、黄铜铆钉、红/蓝发光喇叭、带雕花黄铜边框的屏幕、落地阴影）；
  > 本插件是**一张扁平暗色卡片 + 两个渐变圆片 + 一排圆形按钮**，没有物体感。"差距非常大，几乎不构成同一个东西。"
- **因此更正 P1-5 的口径**：不再写"未能复核"。正确表述是
  **"已复核：CSS 3D 版与参考 three.js 渲染的观感差距显著"**——这是路线选择的结果（当初约定用 CSS 3D 近似 3D），
  不是实现缺陷，但**不能当作"和参考一致"交付**。用户已确认改造为真 three.js（两款都做）。
- **撤回一条方法论结论**：§5.1 里"必须先拿到 `webgl=true` 的真 3D 参考图才能判读像不像"**只适用于像素度量**；
  主观观感用参考自带的成品截图 + 能读图的模型即可判定，不必等 SwiftShader 对照。
- **涉及文件**：`styles/30-skins.css`（rams/fantasy 段）、`src/client/skins/RamsSkin.ts`、`src/client/skins/FantasySkin.ts`（已被 three.js 实现取代）

### P1-5 收口（lead，本轮）：两款都改成**真 three.js**，并做到逐像素复核通过

用户决定"两款都做成真 three.js"后执行。**这一节取代上面「差距显著」的结论**——差距已消除，证据是像素级的。

- **做法**：不移植参考的 React 组件，而是把场景**逐值移植**成无框架引擎
  （`three/fantasyScene.ts` 由 `RamsRadio.tsx` 移植、`three/ramsScene.ts` 由 `NativeRadio.tsx` 移植），
  React 侧只留薄包装（`FantasySkin.ts` / `RamsSkin.ts`），原 CSS 3D 版本降级为 WebGL 不可用时的回退
  （`FantasyFallback.ts` / `RamsFallback.ts`，对应参考自己的 `failed` 分支）。几何/材质模块
  （`radioGeometry.ts` / `radioModel.ts` / `pressFeedback.ts` / `fantasySurface.ts`）与参考**字节一致**
  （`diff <(tail -n +5 our) ref` 为空，几何数值哈希 `3052406537` 相同）。

- **同条件像素差分**（同一 headless Chrome、同一 SwiftShader、同一 1360x900 视口；把两边画布按各自
  `getBoundingClientRect()` 裁到同尺寸后逐像素比）：

  | 皮肤 | 画布 | 平均差 | 中位数 | >40 的像素 | 独立颜色数（我们 / 参考） |
  |---|---|---|---|---|---|
  | fantasy | 1100x684 / 1100x684 | **0.50** / 255 | **0.0** | **0.33%** | 122725 / 123123 |
  | rams | 1280x702 / 1280x702 | **0.38** / 255 | **0.0** | **0.21%** | — |

  差异**全部落在我们自己的机内屏幕文案区域**（内容是我们播放器的状态，不是参考的菜单文案）；
  机身轮廓、打孔网、旋钮、底脚、阴影、背景全为零差异。读图模型复判：
  > "三条此前指出的差异（构图偏小、阴影过硬过深、屏幕小字糊）均已修复，A 与 B 是同一台机器、同一机位，
  > 除屏幕文案内容外无可见差异。" "**A 已经把参考实现的 fantasy 皮肤成功还原过来了**"。

- **过程中查出并修掉的两个真 bug（都是本轮引入的，靠客观对照发现）**：
  1. **博朗错用了魔兽世界的场景参数**。第一次移植时把 `homeDistance`/阴影类型/地面/灯光整套照抄了 fantasy：
     参考 rams 是 `max(2.72, 1.05/(tan16°·aspect))` + `VSMShadowMap` + `200x200` 地面 + `(0xffffff,0x858678)` 半球光，
     而我写成了 `max(4.1, 1.63/…)` + `PCFShadowMap` + `30x30` + `(0xe2eaff,0x30221b)`。
     表现就是机身只有参考的 56% 大。定位手段：把 CSS3D 投影屏幕的**页面像素宽度**换算成相机距离
     （世界宽 0.551）→ 我们 170px/距离 3.97，参考 291px/距离 2.32。修后为 **291px/2.321，与参考逐位相同**。
  2. **挂载时把机位推到了拆解视角**。包装层的 `useEffect` 在挂载时会以 `exploded=false` 调一次
     `scene.explode(false)`，而引擎里 `explode()` 无条件改机位 → 初始画面变成宽视角（同样表现为"机身偏小"）。
     修法：目标状态未变化时不动机位（参考也只在用户点「拆解」时才调）。判别实验：往画布派发 `Home`
     后投影立刻变成 291px，证明相机数学正确、问题只在初始取景。
  - 另有参考自身的一处隐患被我们踩到并修掉：点中机内屏幕时 `pressMotion["screen"]` 为 `undefined`，
    `pulsePressMotion` 读 `.depth` 抛 `TypeError`（参考因 HTML 屏幕盖住指针而未暴露）。现已显式判空。

- **诚实的剩余差异**：机内屏幕显示的是**我们播放器的状态**（电台/曲目/音量/ON AIR），
  参考那套 11 页机内菜单**有意不移植**（我们已有自己的导航与屏幕组件，重复实现两套菜单没有意义）。
  博朗的调台旋钮走控制器的 `next()/previous()`，而不是参考的直接遍历 `p.stations`——
  因为本仓库约定皮肤的一切动作都经控制器（`docs/CONTRACTS.md` §4）。

- **验证面**：两款 × {浅色, 深色, 窄容器 430x900, 无 WebGL}，8 个组合全部走对路径、0 异常、0 横向溢出；
  无 WebGL 时回退渲染出完整机身（读图模型确认"不是空白/半截，是合理的 2D 降级"）。
  **另外要如实记一条**：浅色与深色两个截图 **md5 完全相同**（同一份文件哈希）——
  这不是仿真失效（`matchMedia('(prefers-color-scheme: dark)')` 实测会 true），
  而是本仓库**有意固定** `color-scheme: light`（`styles/10-base.css`），且房间底色按主题而非按系统深浅，
  所以这两款 3D 皮肤**与系统配色无关**；面板取色仍走 `.radio-root` 的 token。

---

## 3. 已修复（复核通过，附证据）

### P0-1（原记 P0，按 lead 口径记 P1）深色外观下浅色皮肤文字不可读

- **等级口径**：任务定义中"文字不可读"属 P0；lead 复核后要求记为 **P1**（需系统真处于深色外观才触发）。按要求记 P1，同时保留分歧记录：触发条件是 **macOS / Chrome 的默认深色外观**，不是边缘配置，所以我上一轮按 P0 记录。
- **关于那 18 张 `*-dark.png` 的拍摄路径，我做了决定性复验，结论与 lead 的说明不同**（这点值得记下来，因为它决定像素证据是否成立）：
  - `tools/capture-skins.mjs:19,35` 用的是 `Emulation.setEmulatedMedia { prefers-color-scheme: dark }`，**不是** `--force-dark-mode`；全仓库 `grep -rn "force-dark"` → **0 处**。
  - 我在**旧外壳构建**（4190，不含 lead 的外壳修复）上用同一方法复验，得到与那 18 张 `*-dark.png` **完全一致**的指纹：
    ```
    4190 + setEmulatedMedia(dark)： 外圈=(18,18,18)#121212   .radio-root color=rgb(255,255,255)  应用底色=(247,245,238) 不变
    4190 + setEmulatedMedia(light)：外圈=(255,255,255)#ffffff .radio-root color=rgb(0,0,0)      应用底色=(247,245,238) 不变
    ```
  - 判别依据：`--force-dark-mode` 这类后处理会**连应用自己的浅色背景一起压暗**；而那 18 张图里 editorial 的 `#eeeae2`、pocket 的 `#e8e8e7` 与 light 图**逐像素相同**（最高频色完全一致、差异仅 2.7~3.9% 集中在文字笔画）。所以它们是**真实深色外观**下拍的，我的像素证据成立。
  - 真正的触发机制不是 force-dark，而是 `<meta name="color-scheme" content="light dark">`（改前在 `src/dsh/page.ts:61`，现已 pin 为 `content="light"`，见 `:77`）：它告诉 Chrome 页面支持深色方案，Chrome 于是在深色外观下把画布涂 `#121212`、把初始文字色设为白色；`.radio-root` 未设 `color`，于是白字继承下来压在米色背景上。
- **修复前证据**：DOM `color = rgb(255,255,255)`，页内审计 10 处 <3:1（含 `H1「此刻，听点什么」`、`now-tags「按播放，遇见下一段声音。」`、`signal-state「已暂停」`、`now-country「WORLD RADIO」`），最低 **1.09:1**；像素侧设备区"近白像素" 0.04%→**1.69%**、"近黑" 1.42%→0.45%（editorial），rams 同 0.00%→1.28%。
- **复核值（B2，深色外观）**：`color = rgb(63,66,57)`，**`badCount = 0`**；像素侧同一设备区近白 light `0.03%` / dark `0.03%`、近黑 `0.82%` / `0.75%` → 文字颜色不再翻转。deck/console 自身 `color-scheme: dark` 仍生效（deck 深色外观 `color = rgb(216,221,231)`）。
- **修复方式**：`body.radio-page { color:#2b2f28; color-scheme: light }`（`src/dsh/page.ts`，01:22:05）。
- **建议**：**已收口**——meta 已 pin 为 `content="light"`（`src/dsh/page.ts:77` + `tests/dsh.routes.test.ts:276-278` 锁定），详见 §3 P1-4。

### P0-2 rams / fantasy 立体部件高度为 0（仅 A 构建）

- **A 构建证据**（4190，1440x1000，`data-compact="false"`）：`.rams-shell 308x0`、`.rams-speaker 308x0`、`.rams-grille 0x0`、`.rams-cone 0x0`、`.rams-knob 16x6`、`.rams-readout ABSENT`、`canvas 0`、**带 CSS transform 的元素 0 个**；fantasy 同样 `308x0 / 0x0 / 308x0`。设备整体只有 `308x236`（rams）/ `308x311`（fantasy），而参考内容占画面 46.1% / 39.5%。读图代理也在 `rams-light`、`rams-dark`、`fantasy-*` 一致报告"看不到机身"。
- **B2 复核值**：rams `.rams-shell 984x510`、`.rams-speaker 557x480`、`.rams-grille 517x446`、`.rams-cone 323x317`、`.rams-knob 208x195`，**t3d=24**；fantasy `.fantasy-shell 1027x514`、`.fantasy-glow 1007x594`，**t3d=17**。横向对比：1280x860 下 rams 内容占比 **59.55% vs 参考 61.08%**。
- **结论**：已修复。剩余是 P1-5 的层次/尺寸问题。

### P1-1 8px 纯白边框 + 底部纯白横带 + 16px 多余滚动

- **A 构建证据**：外圈 8 CSS px 的 top/left/right **100% 为 `#ffffff`**（6 皮肤全部如此），而参考同一圈 **0.0% 纯白**（100% 主题色）；`body` computed `margin: 8px`、`body`/`html` 背景 `rgba(0,0,0,0)`；`scrollHeight = clientHeight + 16`（1016/1000、876/860、916/900）。
- **B1 中间态**：白框消失但底部留 `#d9d8cf` 残留带（`(720,890)`/`(720,995)` 采样）。
- **B2 复核值**：`body margin = 0px`；`scrollHeight / clientHeight = 1000 / 1000`；外圈 **100% 主题色**（editorial `(238,234,226)` 100%、deck `(35,38,48)` 100%、rams `(227,226,216)`+`(228,227,217)`）；1280x860 与 1440x1000 两种视口上下左右四点采样全部为主题色。
- **修复方式**：`html,body.radio-page{margin:0;padding:0;min-height:100%}` + `body.radio-page{background:var(--radio-bg,#d9d8cf)}`（`src/dsh/page.ts`，与 `preview/server.mjs` 共用 `renderPlayerPage()`）。

### P1-2 `min(100svh,880px)` 使内容整体偏高

- **B1 证据**：1440x1000 下 `.radio-root` 只有 `880px` 高，设备中心 y=459 而视口中心 500（**高 41px**）；参考 editorial 顶部 y=218 而当时复刻是 171（差 47px）。
- **B2 复核值**：`styles/30-skins.css:1222` 已改为 `min-height: 100svh`（文件 01:24:43）；1440x1000 下 `.radio-root = 1440x1000@(0,0)`、`min-height=1000px`、**设备中心 y=500 = 视口中心**、`doc 1000/1000`。4 个皮肤（editorial/deck/console/rams）逐一实测一致。
- **说明**：lead 的外壳规则 `body.radio-page #radio-root{min-height:100svh}` 命中的是页面外壳 `<div id="radio-root" class="radio-page-root">`（`src/dsh/page.ts:69`），不是 App 的 `.radio-root`；真正起效的是 radio-ui 改掉的 `styles/30-skins.css:1222`。

### P1-3 `.skin-dock` 在每个皮肤都渲染第二套控件条

- **A 构建证据**：6 皮肤全部出现"上一曲/播放/下一曲/喇叭/滑杆/心/踩"的原生控件条，且遮挡内容（deck 列表第 09 行被截断、console 状态栏下多一条、pocket 机身底部多一条、editorial 卡片底部多一条、fantasy 两排控件堆叠、rams 出现亮蓝色原生滑杆）；其中一条滑杆 `accent-color: auto`（未上色）。
- **B2 复核值**：`styles/30-skins.css:116-118` 的 `.radio-root .skin-dock{display:none}` 生效——deck/editorial/pocket/console 实测 `display:none`、盒 `0x0`；rams/fantasy 实测 `520x56` 可见且 `accent-color` 为主题色（rams `rgb(169,83,31)`）。与 `src/client/skins/shared.ts:374-377` 的注释（已有控件的皮肤用 CSS 隐藏 dock）一致。
- **结论**：已修复，属预期设计。

### P1-4 深色主题 —— 收口为「有意不跟随系统深浅色」

- **结论（lead 已拍板并执行）**：本插件是固定配色的播放器皮肤，**有意**不跟随系统深浅色，**不是缺陷**。因此 `src/dsh/page.ts` 的 `<meta name="color-scheme">` 从 `"light dark"` 改为 **`"light"`**（改前在 `:61`，改后在 `:77`），并在 `tests/dsh.routes.test.ts:276-278` 加了断言锁定（含 `not.toContain("color-scheme: dark")`，已跑绿）。
- **这条 pin 解决什么**：`content="light dark"` 会让 Chrome 在深色外观下把页面画布涂成 `#121212`、并把初始文字色设为白色（这正是 P0-1 的触发机制）。pin 成 `light` 后，画布与初始文字色都不会再被系统深浅色影响，外壳即便被替换也不会复发。
- **修复前证据（保留）**：A/B1 的 light 与 dark 截图主体配色逐像素相同（差异仅 2.7%~3.9% 抗锯齿），`styles/` 与 `src/` 下 `prefers-color-scheme` **0 处**。
- **若将来真要深色主题**：为 6 组 token（`styles/10-base.css:33-94`）各补一份 `@media (prefers-color-scheme: dark)` 覆盖，并同时恢复 `content="light dark"`。
- **涉及文件**：`src/dsh/page.ts:57,77`、`tests/dsh.routes.test.ts:276-278`、`styles/10-base.css:33-94`
- **验证状态（已复核，01:55）**：`preview-dist/` 已于 **01:51:00** 重建；`curl http://127.0.0.1:4183/` 实测发出 **`<meta name="color-scheme" content="light" />`** ✓。深色外观下实测：`body` / `.radio-root` 的 computed `color-scheme` 均为 `light`（deck 皮肤自身仍为 `dark`，符合其设计），`.radio-root` 文字色 `rgb(63,66,57)`（deck `rgb(216,221,231)`），页内对比度审计 `badCount=0`。由于 `.radio-root` 现在 100% 覆盖视口，原先那条 `#121212` 画布已不可见，且 meta 不再声明支持深色方案 → **该触发路径从根上关闭**。终稿截图见 `/tmp/shots-D`（18/18）。

### P2-7b notice 配色 —— 已修复（复核通过）

- **原问题**：`.radio-notice.has-error` 用固定红描边，与深色皮肤（deck/console/fantasy）不搭，旧读图也最早暴露它。
- **修复（radio-ui 已落地）**：`styles/10-base.css` 新增 `--radio-danger`（6 皮肤各一份），`10-base.css:164` 改为 `border-color: color-mix(in srgb, var(--radio-danger, #b53a38) 55%, var(--radio-line))`；`styles/30-skins.css:1081` 为 DSH 深色祖先补 `--radio-danger: #e2865e`。
- **我的复核值（4183，终稿构建）**：6 皮肤 computed `--radio-danger` 依次 `#b53a38`（editorial）/ `#a8452f`（pocket）/ `#e2865e`（deck）/ `#e0836a`（console）/ `#b34a2e`（rams）/ `#e0a05a`（fantasy），与 radio-ui 给的清单**逐个相同**。触发 notice 后 `class="radio-notice has-error"`，`border-top-color` 是**随皮肤变化的混色值**：editorial `srgb(0.7557,0.4886,0.4667)` = `color-mix(#b53a38 55%, #cfcec4)` 的精确结果，deck `srgb(0.6375,0.4584,0.4075)` = `color-mix(#e2865e 55%, #556074)` 的精确结果 → **不再是固定红**。
- **涉及文件**：`styles/10-base.css:33,55,66,78,90,101,113,164`、`styles/30-skins.css:1081`

### P2-4 console 播放列表 360px → 350px —— 已修复（复核通过）

- **原问题（我诊断）**：console 播放列表比参考高 10px。参考（1440x1000）：`div.classic-playlist 728x350@(356,388)`、`overflow: visible`，且 **DOM 里根本没有 `.device-screen` 元素**；复刻是**同一元素**带 `skin-screen device-screen classic-playlist` → `728x360@(356,377)`、`overflow:hidden`，滚动区 `331/1440`（参考 `321/1440`）。
- **根因**：`styles/20-reference.css:220` 的 `.classic-foobar .classic-playlist{height:350px}`（3 类特异性）被**同文件**的 `.classic-foobar .device-screen{height:360px}`（同特异性、源码位置在后）覆盖。参考把两个角色放在**不同元素**上，所以它那条 360px 规则**匹配不到任何元素（空转）**；插件合并两角色后这条空转规则被激活，还顺带带进 `overflow:hidden`。
- **修复（**不是我所改**——我的写范围只有 `docs/VISUAL-REVIEW.md` 与 `/tmp`；`styles/20-reference.css` 由队友在 **02:15:26** 落地）**：采用我建议的改法 ②，`:232` 变为 `.radio-root .classic-foobar .device-screen:not(.classic-playlist) { height: 360px; … }`，并在 `:226-231` 写了注释说明这条"空转规则被合并激活"的来龙去脉。
- **我的复核值（4183，修复后构建）**：console `.classic-playlist 728x350@(356,382)`、computed `350px`、滚动区 **`321/1440`** → 与参考**高度和滚动区精确一致**（y 382 vs 388 差 6px 是两侧 stage 偏移，非元素几何）；deck 仍 `428x286@(506,440)`、`255/1500`（未受影响，本来就一致）。
- **回归证据**：修复前后重出图逐像素比对（`/tmp/shots-D` 修前 vs `/tmp/shots-E` 修后）：**console-light 差异 5.21%、console-dark 5.02%**，而 deck-light 仅 0.11%、editorial-light 0.93%（editorial 的 0.93% 是渲染噪声——editorial 完全不走 `.classic-*` 规则）→ **只有 console 几何变了**。`npm run check` 由 radio-ui 复跑：EXIT=0 / 7 files / **93 tests**；18 变体审计 `VARIANT ISSUES: none`。
- **涉及文件**：`styles/20-reference.css:220,226-232`
- **非 now 页的 `.classic-panel` 已复核（两种方法 + 两个实例）**：`now` 页上该选择器本来就是 ABSENT，所以我改用"点「喜欢的电台」进 `favorites` 页再量"。radio-ui 的脚本（`/tmp/p24-qmr.mjs`，4182 / Chrome 9222）与**我自己的驱动**（4183 / Chrome 9230）结果**完全一致**：console 进 `favorites` 页后元素变为 `skin-screen device-screen classic-panel`、computed **`360px`**（`738x360@(351,377)`）→ 证明 `:not(.classic-playlist)` **只收窄了播放列表，没有误伤非 now 页的屏**；deck 的同类面板是 **`154.094px`**（内容驱动，没有 360 规则），与 radio-ui 报的 154 一致。

---

## 4. P2（细节偏差：**修复后只剩 P2-8 这条文档口径**）

| 编号 | 皮肤 / 视口 | 现象 | 证据 | 建议 |
|---|---|---|---|---|
| **P2-8** | rams、fantasy / **<720px（compact）** | **窄屏把交互屏移到机身下方的平屏 → 属"有意偏离"（口径已与 radio-ui 对齐）**：复刻 compact = "3D 场景区 + 独立 `396x240` 平屏 + 场景内只留被动 readout"（`.rams-readout 119x36@(270,98)` / `.fantasy-readout 125x42@(146,149)`，交互屏 `.skin-screen …-flat-screen 384x228`）。**参考在宽、窄都保持 3D**：420x900 rams `canvas 420x576@(0,184)` + 投影屏 `.native-glass 118x33@(267,382)`；fantasy `canvas 420x684@(0,130)` 且**连 `.native-glass` 都没有**（屏在 canvas 内） | 参考：`/tmp/nr/report.json`（webgl=true）；复刻内层结构：`/tmp/ni/report.json`（`compact=true`）。参考的 `.native-flat-screen` **只在 three.js `failed` 时出现**（`src/NativeRadio.tsx:252`、`src/RamsRadio.tsx:228`），不是窄屏策略。**交叉验证**：radio-ui 在 4182、我在 4183 独立复测**同一构建**（即时 `styles.css` sha 均 `631a003fbb02b62d`），`flat 396x240` / `scene 396x248·241` / `body 396x578·571` 完全一致 | **代码不动，只改文档口径**（已与 radio-ui 一致）：参考窄屏投影屏只有 118x33（等效字号约 4.5px）基本不可用，复刻平屏可用性更好 → 在交付说明里写成**有意的可用性取舍**；"玻璃内 readout"在参考中没有对应物，也记为**有意补充** |
| ~~P2-4~~ | — | — | ~~console 列表 360 vs 350~~ → **已修复并复核**，见 §3 P2-4（改法 ② 已落地，只影响 console） | 修复 |
| ~~P2-1~~ | — | — | ~~主题钮"参考无此元素"~~ → **假阳性撤回**：参考同样有且位置逐像素相同，见 §5.6 | 撤回 |
| ~~P2-2~~ | — | — | ~~fantasy 占位偏大~~ → **已撤回**，指标不适用于 3D，见 §5.1 ③ | 撤回 |
| ~~P2-3~~ | — | — | ~~底部中央亮晕~~ → **已撤回**，那是截图器触发的 notice，见 §5.1 ② | 撤回 |
| ~~P2-5~~ | — | — | ~~deck 列表末行截断~~ → **假阳性撤回**，与参考逐项相同，见 §5.7 | 撤回 |
| ~~P2-6~~ | — | — | ~~pocket 窄屏 LCD 裁切~~ → **假阳性撤回**，是参考同款滚动区，见 §5.8 | 撤回 |
| ~~P2-7 前半~~ | — | — | ~~未选中 tab 融进底栏~~ → **假阳性撤回**，参考就是 `#323232`，见 §5.9；**后半 notice 配色已修复**，见 §3 P2-7b | 撤回 / 已修复 |

---

## 5. 已排除的假阳性（**请勿据此改动**）

1. **"light 截图却是深色页" / "dark 截图却是浅色页"**：deck/console/fantasy 的参考本身就是深色皮肤。6/6 皮肤背景色与参考**逐像素相同**（`(227,226,216)` / `(22,20,23)` / `(238,234,226)` / `(232,232,227)` / `(35,38,48)` / `(55,59,62)`）。**调色板是对的。**
2. **"空白太大 / 设备太小"**：参考本身就是居中的小窗口。A 构建逐项对照（1440x1000，CSS px）：

   | 皮肤 | 复刻设备盒 | 参考内容框 | Δx | Δy | Δ宽 | Δ高 |
   |---|---|---|---|---|---|---|
   | editorial | 420x604 @(510,217) | 421x591 @(509,218) | −1 | −1 | −1 | +13 |
   | console | 740x555 @(350,242) | 739x546 @(350,243) | 0 | −1 | +1 | +9 |
   | deck | 440x542 @(500,248) | 439x515 @(500,250) | 0 | −2 | +1 | +27 |
   | pocket | 420x687 @(510,176) | 顶边 y=176 | 0 | 0 | — | — |

   **不要为了"填满"去放大设备。**
3. **pocket 的 3 处小字对比度 2.28~2.55:1**（`iPod` 2.28、`MENU` 2.41、`THE WORLD IS ON AI…` 2.55，灰绿 `#959d8c` 压 iPod 白机身）：**参考本身就是这样**——同色像素占比 **复刻 0.877% vs 参考 0.934%**。不作为复刻缺陷（若团队要过 WCAG AA，需连同参考一起改）。
4. **`data-state=error` / "已暂停"**：headless 无用户手势、自动播放被拦，属预期噪声（6 皮肤同状态，无差别）。
5. **横向溢出**：**18/18 `overflow=false`**（B2 的 18 张截图，含 420x900 窄屏）。B1 曾观察到 fantasy 在 420x900 下 `scrollWidth 424 / clientWidth 420`，逐元素扫描未定位到越界元素，B2 未复现，不再作为结论。

**以下 6~9 是第二轮（radio-ui 逐条实测 + 我独立复核）新排除的四条**，同样**请勿据此改动代码**。

6. **P2-1「右上角悬浮主题钮，参考无此元素」→ 假阳性：参考也有，位置逐像素相同。** 实测 `.theme-trigger`：参考 1440x1000 `44x44@(1372,22)`、1280x860 `44x44@(1212,22)`、420x900 `44x44@(362,14)`；复刻三个视口**完全一致**。线上 CSS 同样有 `.theme-trigger{width:44px;height:44px;…border-radius:50%}` 及 `.room-deck/.room-console/.room-fantasy .theme-trigger` 变体。唯一差别是 `.theme-picker` 的 `position: fixed → absolute`（复刻**故意**改的，防止逃出 `.radio-root`），其 `top/right` 仍是参考值 `22px/24px`（窄屏 `14px/14px`）。**不要为了"贴到内容容器"再挪位置**；自动比对时仍应排除它，但那是**两边对称的**离群点。
7. **P2-5「deck 列表末行被截断」→ 假阳性：与参考逐项相同。** 参考 deck `.classic-playlist 428x286@(506,446)`、复刻 `286px`（一致）；滚动区参考 `255/1500`、复刻 `255/1500`（**完全相同**）。"半行可见"来自参考自身的 `.classic-playlist{height:286px}`（=9.53 行），末行可滚达。
8. **P2-6「pocket 窄屏 LCD 内一行被裁」→ 假阳性：屏内列表本来就是滚动区，规则与参考逐字相同。** 线上 CSS 与复刻同为 `.screen-content{…flex:1;min-height:0;overflow-y:auto}`（复刻另带 `scrollbar-width:thin;scrollbar-color:#849172 transparent`）。复刻实测 `?theme=pocket` 420x900：`.skin-screen 264/264 overflow:hidden`（自身不溢出）、`.screen-content` 为 `auto` 滚动区、末行 bottom=293 而容器 bottom=294（**已完整可见**）。**不要加 line-height、不要改 overflow。**
9. **P2-7 前半「console 未选中 tab 融进底栏」→ 假阳性：参考本就是 `#323232`。** 线上 CSS 与复刻逐字相同：`.foobar-tabs button{background:#323232;border:1px solid #494949;border-bottom:0;padding:5px 12px;font-size:11px}`、`.foobar-tabs button[aria-pressed=true]{background:#555}`。复刻 computed：选中 `rgb(85,85,85)`、未选中 `rgb(50,50,50)`。**提高未选中对比度就是偏离参考。**

### 5.1 已撤回的结论（radio-ui 反证 + 我的复核）

记录我上一版报错、现已撤回的三条，避免后人照错结论改代码。

**① P1-6「pocket 音量条未按参考自定义」——撤回：我引用了未部署的产物。**
- 我引用的是 `qiaomu-radio/styles.css:1119-1126`（`.qiaomu-radio__ipod-volume…appearance:none; height:40px` + 自绘 track/thumb 6x14）。该文件**确实存在**（仓库根 `styles.css`，1161 行，sha `68bea2e6…`，Sep 21 20:00），但**不是线上部署的那份**：线上 `assets/index-C2QS_QBT.css`（29,537 B，sha `0cfc3276…`）里 `appearance|type=range|slider` **命中 0 次**，只有 `.device-volume input{…height:24px;accent-color:var(--ink)}` 和一条 pocket 覆盖 `{height:22px}`。仓库里另有 `src/styles.css`（185 行，sha `918ae9ca…`），radio-ui 引的是这份。
- **复刻实测（4183）已与线上逐条对得上**：`.device-volume` 走 `accent-color`（editorial `rgb(69,72,63)`、deck/console `rgb(142,168,120)`、pocket `rgb(71,84,62)`、fantasy `rgb(212,174,103)`），pocket 的 `.device-volume` 盒高 **22px**（editorial 24 / deck·console `classic-volume` 16 / fantasy 13）。**不需要改，尤其不要加 `appearance:none`。**

**② P2-3「底部中央多一层背景亮晕」——撤回：那是截图器自己触发的 notice，不是背景外泄。**
- 根背景 DOM 实测（4183，1280x860）：editorial `rgb(238,234,226)`/`bgi none`、deck `rgb(35,38,48)`/`none`、console `rgb(55,59,62)`/`none`；只有 rams/fantasy/pocket 是 `radial-gradient`，且与线上逐字相同（如 fantasy `radial-gradient(at 28% 35%, rgba(84,40,23,.333)…)`）。采样点上的 `.radio-stage` 是 `bg transparent / bgi none / shadow none`。
- 我采样的 `(640,800)` 实际落在 **`.radio-notice`** 上：截图器每换一次皮肤都要点主题选择器，触发「风格已经切换。浏览器需要你再点一次播放才能发声。［重试］」。实测该 notice 盒 **`640x50@(320,790)`**。（**生命期更正（第二次，最终版）**：这个「≥5s 不消失」的观察**不是** `status` 变体，而是出图 Chrome **未带 `--autoplay-policy=no-user-gesture-required`** 时换肤产生的 **`alert` 变体**（`setError`，`src/client/useRadio.ts:361`，`role=alert`，**无定时器**，只能靠用户动作清除）——我在无 flag 的干净 Chrome 上实测它在 `t=20s` 仍在。`status` 变体才受 `NOTICE_MS = 3_200` 管（实测 3.20s±0.1s，文案替换会重启计时）。完整证据见 **§0.3**。）参考图没有它（参考不需要换肤）。
- **该 artifact 影响的范围（已按 §0.3 更正）**：底部中央 y≈790..840 有一条 notice。**我的 `/tmp/shots-B~E` 全部含（§0.3）**，逐像素比对时必须先排除该区域（这也解释了旧读图里反复出现的"底部红色描边 toast"）。**A 期的 `docs/shots/*` 实测不含**：我用同一带域检测器扫 `shots-A-era-0052/L-editorial.png` 与 `D-editorial.png` 底部 95 行 → **0 命中**（检测器已用"确定含 alert 的图"做阳性对照：命中 `x∈[640,1919]`；"移除 alert"图 0 命中），即 A 期那一代**没有这个污染**，A 的对照不受影响。
- 当前树重出图（`/tmp/shots-C`）实测 deck `(640,800)=(35,38,48)`、editorial `(640,800)=(238,234,226)`，**与根背景完全一致，无外泄**。

**③ P2-2「fantasy 占比 66.72% vs 46.5% → 缩小 20%~30%」——撤回：指标不适用于 3D，且对照口径混合。**
- 见 §2 P1-5 的更正表：参考 fantasy 真 3D 下是 `<canvas> 1100x653`、roomH=860，复刻 `.skin-fantasy 1040x655` → **尺寸基本一致**；"内容占比"是深色 3D 背景 vs 本地亮光晕造成的度量伪影。
- **另纠正一处对照错位**：radio-ui 给的"参考 fantasy"数字（`.native-radio 1240x911@(20,66)`、`.native-stage 1240x671@(20,66)`、`.native-glass.native-flat-screen 460x240@(410,737)`、roomH 1031）经我复现，与 **`?theme=rams` 在 WebGL 失败回退分支**下的实测**逐项相同**；fantasy 皮肤在这些选择器上**全为 ABSENT**。所以那组数字是**参考的 rams（回退态）**，不是 fantasy。用它与本地 fantasy 比出的"窄 16%、矮 28%"是混合口径。

**顺带两条方法学结论（正面价值，后续判读者必读）——**
- **参考的 3D 在 headless 里通常拿不到**：默认 `--disable-gpu` 下 fantasy 无 canvas、rams 落进 `failed` 回退分支（`src/NativeRadio.tsx:252` 的 `{failed ? <div className="native-glass native-flat-screen">{screenUI}</div> : …}`，数值在 `src/styles.css:24`：`width:min(100%,460px);height:240px`），且**参考自己会滚动**（rams 回退态 roomH=1031 > 860 视口）。
- **要拿参考真 3D 必须加软件 WebGL**：`--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader` → `webgl=true`，fantasy `<canvas> 1100x653`、rams `<canvas> 1240x670`，roomH 都回到 860。**比对 3D 皮肤前必须确认两边 `webgl=true`，否则就是"回退态 vs 3D"的错位比较。**

---

## 6. 交互与可访问性实测

方法：CDP `Input.dispatchKeyEvent` 发真实 Tab/Enter，`Input.dispatchMouseEvent` 发真实按下/抬起；每步后读 `document.activeElement` 的计算样式与 `.skin-screen[data-page]`。

### 6.1 键盘焦点：**通过**

连续 20 次 Tab（`?theme=console`，1440x1000），每一步 `:focus-visible === true`（20/20），computed `outline: solid 2px`、`outline-offset: 3px`，描边色随皮肤变化（rams `#6d7c5c`、editorial `#3d6355`、pocket `#4a5a3c`、deck `#c8ef55`、console `#a8cfdf`、fantasy `#f0c170`）。焦点顺序：主题钮 → 标题栏 `···` → `File/Edit/View/Playback/Library/Help` → 工具栏 → 搜索 `INPUT` → 标签页 → 列表行；无焦点陷阱、无跳空。规则出处 `styles/20-reference.css:7-9`。

### 6.2 `data-page` 切换：**通过**

`data-page` 挂在 `.skin-screen`（`src/client/skins/shared.ts:362`，classic 皮肤 `src/client/skins/classic.ts:134`）。每次都先用 `elementFromPoint` 确认命中的就是目标按钮（`hitTestIsSelf: true`，无遮挡）：

| 皮肤 | 点击 | before → after | 屏幕内容 |
|---|---|---|---|
| console | 最近收听 | now → **history** | "最近收听 开始收听后，电台会留在这里。" |
| console | 喜欢的电台 | history → **favorites** | "喜欢的电台 按下爱心…" |
| console | Default Playlist | favorites → **now** | 电台表格 |
| deck | 频道 | now → **channels** | "频道 全球精选 20 电台直播…" |
| deck | 搜索电台 | channels → **now** | 播放列表 |
| deck | 最近收听 | now → **history** | "最近收听…" |
| editorial | 频道 | now → **channels** | "频道 全球精选 20…" |
| editorial | 搜索电台 | channels → **search** | "搜索电台 电台名称…" |
| editorial | 喜欢的电台 | search → **favorites** | "喜欢的电台…" |
| editorial | 最近收听 | favorites → **history** | "最近收听…" |
| editorial | 关于电台 | history → **info** | "关于电台 Qiaomu Radio…" |

### 6.3 `alert` 变体上的「重试」按钮：**通过**（真实输入事件实测）

在**无 `--autoplay-policy=no-user-gesture-required`** 的干净 Chrome（自动播放会被拦）里：换肤后出现 `.radio-notice.has-error`（`role=alert`，文案「风格已经切换。浏览器需要你再点一次播放才能发声。重试」），我用 `Input.dispatchMouseEvent` 发**真实按下/抬起**点它自己的「重试」按钮（按钮中心 `(920,815)`）。逐帧读数（`data-state` 取自 `.radio-root`，`src/client/RadioApp.ts:42`）：

| 时刻 | notice | role | `data-state` |
|---|---|---|---|
| 换肤后 | `640x50@(320,790)`，含 1 个「重试」按钮（`btnH=30`） | alert | `error` |
| 点击后 +0.5s / +1s | `640x39@(320,801)`，**按钮消失**（变回 status 变体） | status | `loading` |
| 点击后 +3s / +6s / +9s | 无（3.2s 定时器到点） | — | **`playing`** |

**结论：这条 alert 不是装饰**——真实手势点它后 `error → loading → playing`，且 notice 自己从 50px 缩回 39px（因为按钮只存在于 alert 变体）。
**仍未验证**：是否**真的从扬声器出声**。状态机能到 `playing`，且 `src/client/player.ts:260` 的 `playing` 事件来自 `<audio>` 元素，但 headless 没有音频设备，我**不能断言"人耳能听到"**；能断言的只是"错误态被清除、状态机走到 playing"。

### 6.4 notice 条是否遮挡可见交互控件：**不遮挡**（clip-aware 审计；方法本身有坑）

**口径**：只统计真正可见的可交互元素（`button` / `[role=button]` / `a[href]` / `input` / `select` / `textarea` / `[tabindex≠-1]`），沿祖先中 `overflow !== visible` 的容器逐级取**可见矩形交集**（clip-aware），再与 `.radio-notice` 求交，最后用 `elementFromPoint` 复核是否真的被吃；**并显式排除 notice 自身的控件**（`n.contains(el)`）。

| 变体 | notice 盒（wide / narrow） | 有效组数 | 几何相交 | 真被吃（排除 notice 自身） |
|---|---|---|---|---|
| `status`（**lead 的** 9226，带 autoplay flag） | `640x39@(320,801)` / `396x39@(~12,655~692)` | 10 | 0 | **0** |
| `alert`（**我起的** 9231，无 flag，已清理） | `640x50@(320,790)` / `396x50@(~12,596~702)` | 10 | 1 = notice **自带的**「重试」按钮 | **0** |

→ **除 notice 自带的控件外，没有任何页面控件被 notice 吃掉**。`alert` 变体唯一"相交"的是它**自己的**「重试」按钮（在 notice 内部、可点，见 §6.3）；`elementFromPoint` 命中的也正是该 notice。宽度随视口 `640`（1280x860）/ `396`（420x900）；每变体每组 11~23 个可见控件。（首轮每组第 1 次点击未产生 notice → 记 `NO-NOTICE`，故 12 组里各 10 组有效，不是失败。）

**高度差 39 vs 50 的机制（verified）**：重试按钮**只存在于 `alert` 变体**。直接读数：`status` 换肤后 `notice.querySelectorAll('button').length = 0`、盒 `640x39@(320,801)`；`alert` 换肤后 = **1** 个（文案「重试」，`btnH=30`）、盒 `640x50@(320,790)` → **39 + 11 = 50**（按钮行）。点掉重试后 notice 变回 status、高度也回到 **39**（§6.3 表）。所以"是否排除 notice 自身控件"只影响 `alert` 变体的判定，`status` 下两种口径都是 0（radio-ui 独立复现：alert 下恰好 1 个、`overlap=30`；narrow deck 那次拿到的是 status 变体 → 0）。

**方法坑（radio-ui 指出、我已独立复现）**：**不能直接用几何相交判定遮挡**。deck 宽视口实测：naive 相交 **2** 个（列表行 `15Intense Radio`/`161LIVE德国MP3`，各 `424x30` @y784/814），但它们位于 `.playlist-scroll`（可见盒 `[428,364,424,255]`，`clientHeight 255 / scrollHeight 1500`）内、**已被滚出可视区裁掉** → clip-aware 后 **0**，`elementFromPoint` 也不会命中。所以"相交"必须先把祖先裁剪算进去。

**覆盖缺口（本案教训）**：早先那 18 个变体的审计只在 `.skin-body` **内部**控件之间两两比 overlap，而 `.radio-notice` 在 `.skin-body` **之外** → "notice 盖控件"从来不在覆盖范围内。**且无法写成 vitest 回归**：happy-dom 没有布局引擎（`getBoundingClientRect` 恒 0），只能靠浏览器驱动检查（radio-ui 确认，我同意）。

---

## 7. B2 基准的客观结构对照（1280x860，中心区 x=200..1100，排除右上角主题钮）

| 皮肤 | 复刻内容占比 | 参考内容占比 | 复刻内容框 | 参考内容框 | 备注 |
|---|---|---|---|---|---|
| rams | 59.55% | 61.08% | (200,128)-(1099,760) | (200,124)-(1099,701) | 上沿差 4px，下沿 +59px |
| fantasy | 66.72% | 46.5% | 触顶/触底 | (226,128)-(1099,654) | ~~偏大~~ **该指标不适用于 3D，结论已撤回**（§5.1 ③） |
| editorial | 3.89% | 2.65% | 受底部光晕影响 | (430,148)-(849,735) | DOM 设备盒与参考 ≤2px |
| pocket | 44.74% | 44.86% | — | — | 几乎一致 |
| deck | 36.67% | 32.3% | 受底部光晕影响 | (420,180)-(859,691) | DOM 设备盒与参考 ≤2px |
| console | 53.42% | 51.41% | (270,138)-(1009,829) | (270,173)-(1009,711) | 顶部高 35px（含标题栏差异） |

> **本表只作历史记录，不要据此下结论**：① 该指标对 3D 场景无效（深色 3D 背景被算成"非内容"，本地亮光晕被算成"内容"），fantasy 一行已因此撤回；② 我们的截图底部中央 y≈790..840 有截图器触发的 `.radio-notice`，会污染下沿读数；③ 右上角主题钮需排除，所以我把区域限制为 x=200..1100、y=80..830。皮肤的真实几何请以 §5 的 DOM 设备盒与 §2 P1-5 的 canvas 尺寸为准。

---

## 8. 建议的执行顺序（给 radio-ui / lead）

1. ~~P0-1~~、~~P0-2~~、~~P1-1~~、~~P1-2~~、~~P1-3~~ 均已修复并复核通过，**不要再改**。
2. ~~拍板 P1-4~~ **已收口并已复核**：深色主题**有意不做**；`src/dsh/page.ts:77` 的 meta 已 pin `content="light"`，`tests/dsh.routes.test.ts:276-278` 已加断言。`preview-dist/` 已于 **01:51:00** 重建，`curl 4183` 实测发出 `content="light"`，深色外观下 `.radio-root` 文字色 `rgb(63,66,57)`、`badCount=0`；终稿截图 `/tmp/shots-D`（18/18）。
3. ~~P1-6~~ **已撤回**：线上参考只用 `accent-color` + pocket `height:22px`，复刻已一致（§5.1 ①）。**不要**加 `appearance:none`。
4. **P1-5**：把 `/tmp/pair-rams.png`、`/tmp/pair-fantasy.png` 交给能读图的角色判读；**在没有"确认 `webgl=true` 的真 3D 参考图"之前，不要调 fantasy/rams 的缩放**（§5.1 ③）。
5. **P2**：~~P2-4~~ **已修复并复核**（`20-reference.css:232` 的 `:not(.classic-playlist)`，见 §3 P2-4）；P2-1 / P2-5 / P2-6 / P2-7前半 已判**假阳性**（§5.6~5.9，勿改），notice 配色已修复并复核（§3 P2-7b）；**P2-8 归入文档口径**（不改代码）。**代码侧已无待办。**
6. 出图请用 `BASE=http://127.0.0.1:4183/ CDP_PORT=<port> node tools/capture-skins.mjs`；注意点：（a）它会覆盖 `docs/shots/`；（b）**它换肤会触发 `.radio-notice`，且有两个变体**——`status`（3.2s 定时器）与 `alert`（`.has-error`，**无定时器**，出图 Chrome 未带 `--autoplay-policy=no-user-gesture-required` 时会一直挂着）。**必须按 §0.3 的三条规则归一化**（记录 `notice`/`noticeError` 标志、`status` 等连续 2 帧 absent、`alert` 不要等而是隐藏/移除或加 flag）。我已实测当前版本工具能正确处理（`/tmp/shots-F`：manifest 记 `notices: 15` 全部 alert 且 hidden，出图 notice 带零污染）。

---

## 9. 证据清单与未能验证

**截图**
- ~~A（老板提供，权威）：`docs/shots/{rams,fantasy,editorial,pocket,deck,console}-{light,dark,narrow}.png`~~ → **按 lead 定的「仓库不含图」口径（`docs/DELIVERY.md` §3），仓库内不再保留截图基准**；`docs/shots/` 现为空目录（mtime 02:18，**是谁清空的无法确认，本文不点名**）。**原始 A 基准图已丢失**：全盘搜不到 `{theme}-{scheme}.png` 那一代，A 期构建（`lib/client.js` sha `56cc461f…`）也已不可复现 → 这批图**不可再生**，A 的结论只保留在本文 §7（标注历史）。
  **同代证据（在仓库外，因此必须用"相对 `docs/`"或绝对路径引用，我独立复核过）**：`../../qiaomu-radio-baselines/shots-A-era-0052/`（21 PNG + `report.json` 19 条 + `run.log`）与 `../../qiaomu-radio-baselines/shots-A-era-0102/`（21 PNG + `report.json` 19 条）；绝对路径兜底 `<workspace>/qiaomu-radio-baselines/`。**相对写法以本文件所在目录（`docs/`）为基准**——从仓库根写相对路径是错的（这些目录在仓库外）。我已实地验证：`cd docs && ls ../../qiaomu-radio-baselines/shots-A-era-0052/` → 可列出 23 项。校验：①从 `/tmp/shots`(00:52) / `/tmp/shots2`(01:02) 各抽 3 张比对 sha **完全一致**（如 `L-rams.png` = `a0beb66a87528109…`）；②`report.json` 的 `rootBox = {x:8,y:8,w:1424}` = **修复前 UA 8px body margin**；③`L-editorial.png` 最外圈实测**纯白 `(255,255,255)`** = P1-1 修复前那条白边 → 确认是 A 期外观。**注意**：截图本来就不进 npm 包（`package.json` 的 `files` = `lib/index.js`/`lib/client.js`/`lib/player/**`/`lib/types/**/*.d.ts`/`dsh-plugin.json`/`README.md`/`docs/INSTALL.md`），"移出仓库"只影响工作树、**不影响交付物**。
  **⚠️ 这两个目录是只读基准**（原始 A 文件已丢失、不可再生，它们是唯一的同代实物证据）：**不要往里写任何东西**；后续出图请用 `tools/capture-skins.mjs` 并显式给 `OUT_DIR` 写到 `/tmp`。本人只做过读操作（sha / `ls` / PIL 读取，目录与文件 mtime 仍为搬运时间 03:10）。
- B2（我重出，18 张，4183 的 01:25 构建）：`/tmp/shots-B/*.png`（用 lead 的脚本、仅改输出目录）
- B3（我重出，18 张，**01:47~01:48** 构建）：`/tmp/shots-C/*.png`
- **B4（18 张，4183 的 01:51 构建）**：`/tmp/shots-D/*.png` —— 实测该构建已发出 `<meta name="color-scheme" content="light" />`
- **B5（18 张，4183 的 02:15 构建 = 含 P2-4 修复）**：`/tmp/shots-E/*.png` —— 18/18 `overflow=false`；**注意：B2~B5 全部含 `alert` 变体 notice（§0.3）**，我的出图 Chrome 未带 autoplay flag。console 的 light/dark/narrow 以 B5 为准（D→E 同状态对比：console 5.21%/5.02%，deck 仅 0.11%）
- **B6（18 张，用当前版 `tools/capture-skins.mjs` 在我的无-flag Chrome 上实测，仅出到 `/tmp`）**：`/tmp/shots-F/*.png` + `capture-manifest.json`（18 条；`notice=true` 15 条**全部是 `alert`**、`noticeHidden=true`）——**出图 notice 带零污染**（见 §0.3 对照表）
- 参考 3D 状态对照：`/tmp/rs-default/`（`--disable-gpu`，webgl=false，rams 落回退态）、`/tmp/rs-swift/`（SwiftShader，webgl=true，真 3D canvas）、`/tmp/nr/`（参考在 420x900 的真 3D 状态）、`/tmp/ni/`（复刻 compact 内层结构：flat/scene/readout/screen，见 §4 P2-8）
- **窄屏交叉验证**：我（4183）与 radio-ui（4182）在**同一构建**上独立量得同一组数字（两侧 `styles.css` sha 均 `631a003fbb02b62d`；`flat 396x240`、`scene 396x248·241`、`body 396x578·571`、`compact=true`）——见 §4 P2-8
- 线上参考：`/tmp/ref3/R2-*.png`（1280x860，6 张）、`/tmp/ref2/R-*.png`（1440x1000，6 张）
- 并排待判读：`/tmp/pair-{rams,fantasy,editorial,pocket,deck,console}.png`（各 2566x860）
- 旧并排（A 基准）：`/tmp/cmp2-rams.png`、`/tmp/cmp2-fantasy.png`、`/tmp/cmp-pocket.png`、`/tmp/cmp-deck.png`、`/tmp/cmp-console.png`
- **真实 GUI（harness 插件页，§0.2）**：`/tmp/gui/gui-<skin>-<view>.png`（18 张，6 皮肤 x light/dark/narrow，经 Chrome 9226 → `127.0.0.1:4199/qiaomu-radio/`）；同一浏览器内的 preview 对照 `/tmp/gui-preview/gui-<skin>-<view>.png`（18 张，同流程、URL 换成 4183）
- **调试实例归属（清理前先看这条，`lsof`+`ps` 实测）**：**9222** = radio-ui（`/tmp/qmr-chrome3`，带 autoplay flag）；**9226** = **lead** 的 harness GUI 调试实例（`/tmp/cdp-gui-profile`，带 flag，**本文 §0.2/§6.3/§6.4 用的就是它**）；**9228** = `/tmp/cdp-9228`、**无 flag**、**归属未知（不是我的，我没碰过，建议先问再清）**；**我起的 9229（shots-E）与 9231（变体/遮挡实验）均已关闭并删除 profile**。**不要把 9226 当成我的清理掉**——它是 lead 的。

**量化报告（JSON）**：`/tmp/ng/report.json`（B2 六皮肤 DOM）、`/tmp/v/report.json`（深色外观对比度审计）、`/tmp/g/report.json`（1440x1000 复核）、`/tmp/fix/report.json`、`/tmp/clk2/report.json`（点击切换）、`/tmp/prod/report.json`、`/tmp/last/report.json`、`/tmp/lp/report.json`（根背景 / hit-test / range 控件，§5.1 ①②）、`/tmp/rs-default|rs-swift/report.json`（参考 3D vs 回退态，§5.1 ③）、`/tmp/toast/report.json`（`.radio-notice` 盒与存活时间）、`/tmp/nd/report.json`（终稿构建的窄屏 compact DOM + 深色外观 `color-scheme`）、`/tmp/nr/report.json`（参考 420x900 的真 3D 状态）、`/tmp/ni/report.json`（复刻 compact 内层结构，§4 P2-8）、`/tmp/mount/report.json`（4183 服务中断时的 `neterror` 排查）、`/tmp/rv/report.json`（主题钮三个视口 / pocket 滚动区 / 列表高度 / `--radio-danger` 六皮肤 / notice 混色）、`/tmp/cl/report.json`（console·deck 列表高度对照、窄屏 picker、deck notice 混色）、`/tmp/st/report.json`（console 结构对照：参考无 `.device-screen`）、`/tmp/fx/report.json`（**修复后** console `350px`/滚动区 `321/1440`、deck `286px`/`255/1500`）、`/tmp/pn/report.json`（**独立复核非 now 页面板**：console `favorites` 页 `.classic-panel` `360px`、deck `154.094px`）；另可用 radio-ui 的脚本 `/tmp/p24-qmr.mjs`（`QMR_PORT=<端口> node /tmp/p24-qmr.mjs "<URL>" CONSOLE`）复现同两组数
**脚本**：`/tmp/qmcdp.mjs`（CDP 驱动）+ `/tmp/spec-*.json`；`/tmp/capture-skins-B.mjs`（lead 脚本的 `/tmp` 副本，仅改 `outDir`）；`/tmp/gui-shots.mjs`（真实 GUI / 任意 URL 的 18 张采集 + 错误采集，`CDP_PORT=<port> [QM_URL=<url>] node /tmp/gui-shots.mjs <outDir>`，只读复用他人调试实例、自建临时标签页采完关闭）、`/tmp/preview-in-gui.mjs`（同一脚本的 `QM_URL` 变体，用于同浏览器对照）、`/tmp/gui-log.mjs`（`Log.entryAdded` 带 URL 的告警采集）、`/tmp/gui-403.mjs`（`Network.enable` 抓 4xx）；`/tmp/notice-exact.mjs`（**notice 因果实验**：先抓真实响应体再到 `Network.getResponseBody`，再"同体 + warning"重放）、`/tmp/notice-inject.mjs`、`/tmp/notice-urls.mjs`（列出实际请求路径，找出 `POST /api/radio/catalog`）、`/tmp/notice-check.mjs`（按 URL 模式拦截的初版，未命中，保留以说明试错）；`/tmp/notice-life.mjs`（100 ms 轮询测生命期）、`/tmp/variant-check.mjs`（**无-flag Chrome 上的 alert 变体与「重试」按钮实测**）、`/tmp/capture-skins-F.mjs`（当前版 `tools/capture-skins.mjs` 的 `/tmp` 副本，**仅把 `OUT_DIR` 解析改成绝对路径**，逻辑与归一化完全未动；因它是 ESM 且 `import { WebSocket } from "ws"`，我建了 `/tmp/node_modules` 软链到仓库 `node_modules` 才能从 `/tmp` 运行）

**notice 因果实验证据**：`/tmp/notice/real-body.json`（客户端真实响应体，72,123 B）、`/tmp/notice/exact-clean.png`（无 notice）、`/tmp/notice/exact-warn.png`（同体 + `warning`，含 notice）、`/tmp/notice/inject-{clean,warn}.png`（第一版实验）；生命期复测 `/tmp/notice-life.mjs`（A 注入 warning、B 点主题选择器换肤 → **B 实测 3.20s ±0.1s**，与常量 `NOTICE_MS = 3_200` 一致）

**alert 变体与出图污染证据（§0.3）**：`/tmp/variant/with-alert.png`（无-flag Chrome 换肤后，alert 在屏）、`/tmp/variant/no-alert.png`（同一会话手工移除 notice 后）；判定矩阵见 §0.3 的表；`/tmp/shots-F/`（**当前版工具出图，无污染**）与其 `capture-manifest.json`。另：仓库外 `<workspace>/radio-capture-noflag/` 有 8 张他人出图，其中 `editorial-light.png` 经同一带域比对确认**无 alert**（vs 移除-alert 0.00%），其余 5 张因皮肤底色不同无法用此方法判定。
**A 期是否含该污染（新查）**：同一检测逻辑（底部 95 行、|像素-同行中位数|>25、异常跨度 >200px）先做对照——`with-alert.png` **命中** `x∈[640,1919]`（阳性），`no-alert.png` **0 命中**（阴性）；再扫 `../../qiaomu-radio-baselines/shots-A-era-0052/{L,D}-editorial.png`（相对本文件所在 `docs/`；绝对路径 `<workspace>/qiaomu-radio-baselines/`）→ **0 命中**，即 **A 期那一代不含 notice 污染**（1440x1000 视口，检测器输出见 §5.1 ② 更正条）。

**§6.3/§6.4 变体读数证据**：`/tmp/variant-buttons.mjs`（同一脚本跑两个实例：`status` = **lead 的 9226**（带 flag）、`alert` = **我起的 9231**（无 flag，已清理）；每帧读 notice 盒 / `role` / `has-error` / `notice.querySelectorAll('button')` / 按钮高 / `.radio-root[data-state]`，并在 alert 上用真实 `Input.dispatchMouseEvent` 点「重试」后连读 5 帧）。
**§6.4 遮挡审计证据**：`/tmp/notice-obstruct.mjs`（两变体 × 6 皮肤 × wide/narrow 的 clip-aware 遮挡审计，输出每组的 notice 盒 / 可见控件数 / 几何相交数 / 真被吃数 + `elementFromPoint` 复核）、`/tmp/naive-vs-clip.mjs`（复现 naive 2 → clip-aware 0 的假阳性：`424x30` 列表行落在 `.playlist-scroll` `[428,364,424,255]`、`client 255 / scroll 1500` 之外）。**注意**：`alert` 变体的「几何相交=1」是 notice **自带的**「重试」按钮，非页面控件；不排除自身会得出"notice 遮挡了一个按钮"的错误结论。

**未能验证**
1. **第二轮"像不像参考"的主观判读**：读图模型连续 **4 轮**失败（1 / 3 / 6 / 2 个 agent，最后一次 01:38），按 lead 指示停止重试。所有"已修复"结论均基于客观量；**fidelity（尤其 P1-5 立体层次）仍未由人眼/读图确认——请勿写成"确认像"或"不像"**。
2. **音频是否真的出声**：headless 无音频设备 + 自动播放被拦 → 只验证到"点击后页面与状态切换正确"。`alert` 变体上点「重试」按钮后错误态被清除（§6.3），但页面**没有 `<audio>` 元素**（`audioPaused: null`），所以**不能断言"已出声"**。
3. **hover / tooltip / active 等指针态**：本轮只做 click 与键盘。
4. **触屏手势**：iPod Click Wheel 拖动、rams 旋钮拖动未验证。
5. `?theme=` 的早期字节相同异常未复现（见 §0 说明）。
6. `/tmp` 下的产物是临时文件，系统清理后会消失；如需长期留存请指定拷贝位置（我只被授权写 `docs/VISUAL-REVIEW.md`）。
7. ~~真实 GUI 的 narrow 视图差异~~ **已查明（不再是未复核项）**：`.radio-notice` 竞争态，因果实验见 §0.2。**残留说明**：我早先那 18 张 GUI/preview 截图**没有记录 `notice` 标志位**，所以那批窄屏差异的**逐张归属无法回溯**（机制已确定，个别张数未逐一定责）。
8. **用户本机 GUI（19387）**：未认证请求 `/` → 401、`/qiaomu-radio` → 404，我无会话凭据，**该面我无法验证**（不代表路由不存在；lead 的实例 4199 上正常）。
9. **首轮那条 `403 (Forbidden)`**：未取到 URL、后续 3 次复跑均 0 条 → 未复现，不作为结论。