# 交付说明

> 目标：把 `radio.qiaomu.ai` 的完整功能与界面复刻成 DeepSeek Harness 插件。
> 交付物：`@qiaomu/dsh-radio`（宿主侧 DSH 插件 + 独立播放器页面）。
> 本文只记录**可复核**的证据：命令、原始输出、截图路径、构建指纹。

---

## 1. 交付形态与一个必须说清的边界

插件是**宿主侧插件**：宿主半边用 `ctx.webServer` 注册自己的 HTTP 路由，
并在 `/qiaomu-radio/` 上提供**完整的独立播放器页面**。界面代码
（`src/client/**` + `styles/**`）与宿主服务（`src/host/**`）都在同一个包里，预览与
生产走同一份源码、同一个 `createRadioService`、同一个 HLS 代理。

**边界（不夸大）**：本包**没有**把六套皮肤做成 harness 页面里的 UI 插槽贡献（slot）。
界面是插件自己同源路由上的独立播放器页面；harness 页面本身不出现电台面板。原因不是省事，
而是现阶段不可行：

1. harness 的 web 服务**不发 CORS 头**，浏览器侧必须同源，而 `host.call` 的 Remote
   命名空间（`ctx.remote.<ns>`）需要官方 tsdown/Typert 代码生成，第三方包没有公开契约；
2. 因此界面走插件自己的同源路由：功能完整、可独立打开，并**在真实 harness 里验证通过**
   （见 §2.4）。

`lib/client.js`（2,457 B）**确实被真实 harness 加载并激活**：它按官方格式注册成
`window.__ModuleLoader__.load({id, factory})`，导出 cordis 的 `apply`/`inject`。
它保持极小且不依赖 `react-dom` 是**故意的**——理由见 §2.4 的两条实测踩坑记录。

---

## 2. 验收命令与真实输出

### 2.1 `npm run check`（typecheck + test + build）

```
$ npm run typecheck     # tsc --noEmit            → 0 错误
$ npm run test          # vitest run
  ✓ tests/core.recommendation.test.ts (16 tests)
  ✓ tests/host.catalog.test.ts (21 tests)
  ✓ tests/host.proxy.test.ts (12 tests)
  ✓ tests/dsh.routes.test.ts (12 tests)
  ✓ tests/dsh.plugin.test.ts (9 tests)
  ✓ tests/build.client-bundle.test.ts (4 tests)
  ✓ tests/ui.skins.test.ts (20 tests)
  ✓ tests/ui.navigation.test.ts (5 tests)
  Test Files  10 passed (10)
  Tests       106 passed (106)
$ npm run build         # node scripts/build.mjs
  built release artifacts into lib/
```

宿主测试**零网络访问**：全部注入假 `fetch` 与假 `now()`；`tests/dsh.plugin.test.ts`
另有一条断言，确保 `apply()` 激活期间**不发起任何 fetch**。
`tests/ui.*` 用 happy-dom + 假 host，`fetch` 被 stub 成 reject（`// @vitest-environment happy-dom`
逐文件声明，因为 `vitest.config.ts` 的 `environmentMatchGlobs` 在 vitest 4.1.11 下对这两个文件不生效）。

UI 两个测试文件覆盖：六皮肤契约 DOM（`radio-stage`/`theme-picker`/`skin-<t>`/`skin-body`/
`skin-faceplate`/`skin-screen[data-page]`/`skin-controls`/`skin-dock`）、无障碍（交互元素必须有
可访问名、图标 `aria-hidden` + `stroke=currentColor`、无 emoji、`lang` 属六语言之一）、
窄容器走 `.skin-flat-screen`、样式契约（无 `!important`、选择器必须含 `.radio-root`、
**样式表里不许内联 WebGL 渲染器**、CSS 3D 回退必须留全、存在 `reduced-motion` 块），以及 `menu → channels → stations → now`
全链路与键盘 roving（ArrowDown/ArrowUp/Enter/Escape）。

### 2.2 产物清单

```
lib/index.js              40.1 KB   宿主半边（ESM, Node 20+）
lib/client.js              2.4 KB   harness 客户端半边：__ModuleLoader__ 注册信封
                                    + apply/inject（无 react-dom，见 §2.5）
lib/player/app.js        921.7 KB   播放器页面脚本（React + three.js 已内联）
lib/player/styles.css     69.4 KB   styles/*.css 顺序拼接
lib/player/hls.js        345.0 KB   懒加载的 hls.js
lib/player/models/qiaomu-fantasy-radio-hyper3d-v2.glb   2,680.6 KB   魔兽世界款的 GLB
                                    （sha256 bd88187c…31da6，与参考**同一个文件**）
lib/player/images/warcraft-loading-rune.png                59.8 KB   该款的加载符文
lib/types/**                        宿主半边类型声明
```

`npm pack --dry-run` → **32 个文件**，无源码、无测试、无 `preview-dist` 混入。

`lib/client.js` 里 `THREE`/`three` 出现 **0 次**（实测 `grep -c`）——three.js 只进宿主提供的播放器页，
**不进 harness 客户端半边**，客户端捆绑包"只能依赖 React"的约束没有被破坏。

### 2.3 真实安装 + 真实启动（不是"应该能跑"）

```bash
# 装进一个干净的临时工程
$ node <harness>/runtime/dependencies/pnpm/bin/pnpm.mjs add /绝对路径/qiaomu-radio-dsh
+ @qiaomu/dsh-radio 0.1.0

$ node -e "import('@qiaomu/dsh-radio').then(m => console.log(m.name, m.inject, typeof m.apply))"
@qiaomu/dsh-radio [ 'webServer' ] function      # 入口、注入声明、apply 都正确
```

`tools/serve-built.mjs` 用**生产产物**（`lib/index.js`）在一个最小 web 载体上真实启动：

```
$ node tools/serve-built.mjs 4190
[qiaomu-radio] player served at http://127.0.0.1:4190/qiaomu-radio/
@qiaomu/dsh-radio serving the built plugin at http://127.0.0.1:4190/qiaomu-radio/

302  /qiaomu-radio                      # 裸前缀跳转
200  /qiaomu-radio/           1062 B    # 播放器页面
200  /qiaomu-radio/app.js    226616 B
200  /qiaomu-radio/styles.css 32017 B
200  /qiaomu-radio/hls.js    353241 B
200  /qiaomu-radio/api/radio/catalog?mood=focus&source=china-curated  2473 B
```

### 2.4 真实电台链路（Radio Browser 实时数据 + HLS 全链路）

目录：真实拉取成功（`Classic Vinyl HD`，320 kbps，30 万投票）；中国精选 7 家：

```
央广中国之声 / 央广经济之声 / 北京音乐广播 FM97.4 / 北京交通广播 FM103.9 …
```

HLS 播放链路（生产产物 + 真实 Chrome 网络面板）：

```
200 api/radio/catalog
200 api/radio/resolve-play
200 .../hls.js                              ← 动态注入的运行时
200 .../stream/...rthk.../master.m3u8       ← 主播放列表
200 .../stream/...rthk.../index_64_a.m3u8   ← 变体播放列表（URI 已重写回代理前缀）
200 .../stream/...rthk.../index_64_a...ts   ← 媒体分片
```

分片代理另验：`Range: bytes=0-2047` → `206`、`content-type: video/mp2t`、2 KB，
TS 同步字节 `0x47` 正确。**China 电台的 CNR HLS 也验证通过**（央广中国之声 `index.m3u8` + 分片）。

`tools/cdp-nav-probe.mjs` 的完整步进（最终构建、清空 localStorage 后从零走）：
```
initial        page=now
after-menu     page=menu      行=[乔木电台|正在播放|频道|地区电台|电台列表|搜索电台|喜欢的电台|最近收听|语言]
after-channels page=channels 行=[频道|全球精选|松一口气|安静做事|爵士时刻|古典留白|需要能量|去远方|中国电台]
after-china    page=stations 行=[电台列表|央广中国之声 01 · 中国 · HLS|央广经济之声 02 …|香港电台第三台 07 …]
点“央广中国之声” page=now state=loading→error(自动播放被拦)  hls=function
               hlsSrc=…/hls.js   屏显=“正在播放 中国 HLS 央广中国之声 …”
network        200 hls.js / 200 stream/...zgzs/index.m3u8 / 200 stream/...zgzs/16066927.ts
```

**踩过并修掉的根因（值得记档）**：hls.js 最初用 `await import(url)` 加载，但
`hls.light.min.js` 是 UMD/IIFE，动态 `import()` 不报错也拿不到构造函数，于是**静默放弃 HLS**。
现改为注入 `<script>` 标签后回读 `globalThis.Hls`。另有一条同类根因由 `radio-ui` 定位：
Chrome 对 `canPlayType("application/vnd.apple.mpegurl")` 返回 `"maybe"`，原先"非空即原生支持"
导致永不加载 hls.js，现只有 `"probably"`（Safari）才算原生。

MP3 直连：`resolve-play` 返回 `{kind:"media", url:"https://icecast.walmradio.com:8443/classic"}`，
不经代理（`<audio>` 直放无需同源）。

### 2.5 在真实 DSH Web GUI 里验证（本轮新增）

为满足"在 DSH Web GUI 中真实验证"，起了一个**独立的 harness 实例**（不动你的 desktop profile）：

```bash
# 隔离的 harness 环境（官方 CLI，装在 /tmp，不碰你的 profile）
mkdir -p /tmp/dsh-verify && cd /tmp/dsh-verify
node ~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs \
  add @deepseek-ai/dsh@0.2.0-rc.2 --ignore-scripts
export DSH_HOME=/tmp/dsh-home                       # 独立 profile 根
node node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --from-default-profile web --dump-config
cd /tmp/dsh-home/profiles/web && <pnpm> add <workspace>/qiaomu-radio-dsh
# 用 profile 本地的 bundle 把插件挂进 web bundle（见 §5，官方方式）
node /tmp/dsh-verify/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --port 4199 --no-open
# → dsh web: http://127.0.0.1:4199/?token=…
```

**实测结果（全部来自这个真实 harness 进程，不是 preview 服务器）**

```
GET  /qiaomu-radio/                                  200  2186 B   播放器页面
GET  /qiaomu-radio/app.js                            200  227718 B 客户端 Bundle
GET  /qiaomu-radio/styles.css                        200  62888 B
GET  /qiaomu-radio/hls.js                            200  353241 B
GET  /qiaomu-radio/api/radio/catalog?mood=jazz…      200  73736 B  实时电台数据
POST /qiaomu-radio/api/radio/resolve-play            200  122 B    HLS → 同源代理地址
GET  /qiaomu-radio/nope.js                           404  27 B     正常 404
```

浏览器侧（CDP 驱动真实 Chrome，`tools/cdp-nav-probe.mjs`）：`menu → channels(不自动开播)
→ stations → 点"央广中国之声"`，最终 `page=now`、`state=playing`，
网络序列 `200 hls.js → 200 …/stream/…zgzs/index.m3u8 → 200 …/stream/…/16067066.ts`。

**harness 页面本身**（`http://127.0.0.1:4199/?token=…`）：`__DSH_BOOT__` 里含
`{"id":"@qiaomu/dsh-radio", …}`，harness 通过
`/plugins/??…,@qiaomu/dsh-radio/client.js,…&rev=…` 把它发到浏览器，
**控制台 0 error / 0 exception**（`tools/cdp-gui-probe.mjs`）。

**踩到并修掉的四个真实平台行为（前两条是静默 404，后两条被 harness 报成 "1 entry did not activate"）**

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 播放器页面 200，但 `app.js` / `styles.css` / `api/*` 全部 404（SPA 兜底的空 404） | harness 的 webServer 把整段 `/plugins` 前缀判给 `dsh-client-modules`（它自己的 Bundle 路由，未命中就 404），任何挂在其下的载体**除精确页面路由外都被遮蔽** | 挂载点改到 `/qiaomu-radio`（`MOUNT_PATH`），并加测试锁死"不得落在 `/plugins` 下" |
| `…/app.js` 仍 404，但 `…//app.js` 反而 200 | harness 的路由匹配是 `pathname.startsWith(\`${prefix}/\`)`，前缀自带斜杠就只剩 `/qiaomu-radio//…` 能命中 | 前缀注册不带尾斜杠，并加"前缀路由对真实子路径可达"的回归测试（镜像 harness 的匹配语义） |
| 客户端 Bundle 被拒：`Cannot use import statement outside a module` | harness 把 `./client` 当**经典脚本**执行，它自己会调 `window.__ModuleLoader__.load({id, factory})` | `lib/client.js` 改成懒 CJS 注册信封（`scripts/client-bundle.mjs`，esbuild IIFE + 外层 `load()`），并加测试锁死格式 |
| 客户端 Bundle 被拒：`Dynamic require of "<spec>" is not supported` | **信封签名错了**：harness 调 `factory(require)`，`require` 是**参数**；发成 esbuild `iife` 时 esbuild 去找**全局** `require`，于是**任何** import 都失败——报错里的 spec 名是假线索 | `scripts/client-bundle.mjs` 改用 esbuild `cjs` + `factory: (require) => { … return module.exports; }`（与 `dsh-plugin-qiaomu-rss` 成品一致） |

### 2.5.1 真实安装进 `desktop` profile（本轮执行）

按官方 bundle 模式安装（本包现在**自带** `cordis.patch.yml` + `dsh.bundle.patch`，与
`dsh-plugin-qiaomu-rss` / `dsh-qiaomu-home` 一致，用户不必再造本地 bundle 包）：

```bash
cd ~/.dsh/profiles/desktop
node "<harness>/Contents/Resources/runtime/pnpm/bin/pnpm.mjs" add \
  link:<workspace>/qiaomu-radio-dsh
# 再把 "@qiaomu/dsh-radio" 列进 package.json 的 dsh.profile.bundles
```

**校验方式（不改动你正在运行的实例）**：`desktop` 被 harness 标记为
"managed exclusively by the Electron application"，独立 CLI 拒绝加载；因此在
`/tmp/dsh-install-check` 复制一份 profile（改名绕开该限制、把相对 symlink 改为绝对）后用
**同版本** CLI 校验（`runtime/primary-runtime/runtime.json` → `desktopVersion 0.2.0-rc.2`，
与所用 CLI/`node 24.21.0`/`pnpm 11.7.0` 一致）：

```
$ dsh --profile radiotest --dump-config   # exit=0，无 stderr
# == @qiaomu/dsh-radio
- id: qiaomu-radio
  name: '@qiaomu/dsh-radio'
```

**端到端**（同一份配置起在 4198）：

```
200   2,186 B  /qiaomu-radio/
200 227,718 B  /qiaomu-radio/app.js
200  63,370 B  /qiaomu-radio/styles.css
200 353,241 B  /qiaomu-radio/hls.js
200  73,198 B  /qiaomu-radio/api/radio/catalog?mood=jazz&source=radio-browser
harness 页面：radioEntry=true、客户端 Bundle 已送达、0 error / 0 exception
```

改动前的 profile 配置已备份到 `~/.dsh/profiles/desktop/.backup-qiaomu-radio-<时间>/`。

### 2.5.2 GUI 内入口（侧边栏 → 面板）与一个真实构建缺陷

**背景**：插件第一版交付后用户在 App 里"没看到"。根因不是安装失败——`/qiaomu-radio/`
返回 200、页面渲染正常——而是**客户端半边当时是空实现**（`inject: []` + `apply(){}`），
harness 界面里没有任何入口，只有手敲 URL 才能到达。对使用者而言这与"没装"无法区分。

**现在**：客户端半边注册 `sidebar.panellist` 图标与 `main` 槽面板。面板用 iframe 内嵌
宿主提供的播放器页，于是面板里渲染的就是 `/qiaomu-radio/` 那一份产物——**只有一套 UI 要维护**。
（`react-dom/client` 其实在 harness 模块表里，重挂 `RadioApp` 技术上可行；这里选 iframe 是
产品取舍，不是平台限制。）

**顺带挖出一个真实缺陷**：harness 调 `factory(require)`，`require` 是**参数**；而
`scripts/client-bundle.mjs` 原先发的是 esbuild `iife`，esbuild 因此去找**全局** `require`，
于是**任何 import 都会失败**。旧版客户端半边不 import 任何东西，所以这个 bug 一直潜伏；
一旦引入 `react` 立刻暴露：

```
@qiaomu/dsh-radio: import failed: Dynamic require of "react" is not supported
```

修法与 `dsh-plugin-qiaomu-rss` 成品一致：`format: "cjs"` +
`factory: (require) => { var module = {exports:{}}; … return module.exports; }`。
`tests/build.client-bundle.test.ts` 新增断言锁死信封签名（`factory: (require) =>`、CJS 前言、
裸 `require("react")`），因为它只会在"客户端半边 import 了东西"时才发作，极易回归。

> **同时更正一处此前的误判**：本项目早期把 `Dynamic require of "react-dom/client" is not
> supported` 记成"harness 模块表里没有 `react-dom`"。实测模块表**包含** `react`、`react-dom`、
> `react-dom/client`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-slots`、
> `@deepseek-ai/cordis`；那条报错是 esbuild 影子变量在喊"根本没有 `require`"，报错里的 spec 名
> 是**假线索**。仓库内相关注释与本文档已全部更正。

**验证**（隔离实例 `4198`，用**与 desktop 完全相同**的 profile 配置；
`tools/cdp-sidebar-probe.mjs`，真机 Chrome）：

```
宽 1440x1000  ok=true  booted/noConsoleError/noException/sidebarEntry/
                      panelMounted/panelSized/playerRendered 全 true
              侧边栏按钮「乔木电台」252x36 → 面板 iframe 1160x1000
              → iframe 内 .radio-root 1160x1000，标题「乔木电台 · 此刻，听点什么」
窄  420x900   ok=true  同上全 true；iframe 364x900，播放器照常渲染
0 console error / 0 exception（宽窄两遍）
```

### 2.6 交互实测（CDP 驱动真实 Chrome）

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 六皮肤 `?theme=` 深链 | 6/6 正确 | `editorial→editorial … rams→rams`，根类名 `radio-root listening-room room-<theme>` |
| 屏内导航 | 通过 | `data-page`：`now → menu → channels`、`channels → search`、`→ favorites`、`→ history`、`→ info`、`→ stations` |
| 主题选择器 | 通过 | 点击 Winamp → `data-theme=deck`，notice「已切换到「Winamp」，正在寻找这个系列的电台。」 |
| 频道选台 | 通过 | 点「频道」→ 频道列表（`paused`，不自动开播）→ 点「爵士时刻」→ 电台列表 `stations` → 点一家 → `now` 开播 |
| 换皮肤保留当前页 | 通过 | 在 `menu` 页换 fantasy，`data-page` 仍为 `menu` |
| 横向溢出 | 0 处 | 18 张最终截图 `scrollWidth > clientWidth` 全部 false |
| 键盘焦点 | 通过（`radio-visual` 实测） | 20/20 次 Tab `:focus-visible` 可见描边，颜色随皮肤变化 |

### 2.7 深色外观下的画布与文字（曾被误判为 P0）

`<meta name="color-scheme">` 从 `"light dark"` 收口为 **`"light"`**，因为本插件是固定
配色的播放器皮肤、有意不跟随系统深浅色。收敛证据（生产产物 + `Emulation.setEmulatedMedia: dark`，
逐像素解码 PNG 的角像素）：

```
editorial   corner=#eeeae2   （参考主题色，非 #121212、非 #ffffff）
pocket      corner=#e8e8e3
rams        corner=#e3e2d8
fantasy     corner=#121317   （本主题本身就是深色）
deck        corner=#232630
console     corner=#373b3e
```

18 张最终截图角像素审计：**0 张**出现 `#121212` / `#ffffff` 画布泄露。
`.radio-root` computed `color` 在浅色与深色外观下都是 `rgb(63,70,58)`；
`body margin 0px`、`scrollHeight 600 = viewport 600`（无多余滚动，无白框）。

---

### 2.8 两款实体 3D 皮肤的同条件 A/B（本轮）

用户问"魔兽世界等风格为啥没迁移过来"后，把 `fantasy`（魔兽世界）与 `rams`（博朗）都改成**真 three.js**。

```bash
# 参考实现本机运行（只读，不改它）
cd ../qiaomu-radio && node server.mjs --dev            # → http://127.0.0.1:4173
# 我们的生产产物
node tools/serve-built.mjs 4190                        # → http://127.0.0.1:4190/qiaomu-radio/
# 同一个 headless Chrome 实例、同一 SwiftShader WebGL、同一 1360x900 视口，各出一张
node /tmp/probe-3d.mjs 9240 "http://127.0.0.1:4173/?theme=fantasy"    /tmp/ref-fantasy2.png fantasy
node /tmp/probe-3d.mjs 9240 "http://127.0.0.1:4190/qiaomu-radio/?theme=fantasy" /tmp/ours.png fantasy
```

观察结果（把两边画布按各自 `getBoundingClientRect()` 裁到同尺寸后逐像素比）：

| 皮肤 | 画布（我们 / 参考） | 平均差 | 中位数 | >40 像素占比 | 差异位置 |
| --- | --- | --- | --- | --- | --- |
| fantasy | 1100x684 / 1100x684 | **0.50**/255 | **0.0** | **0.33%** | 只在我们自己的屏幕文案 |
| rams | 1280x702 / 1280x702 | **0.38**/255 | **0.0** | **0.21%** | 同上 |

交互（真实 CDP 输入，非合成事件）：两款都能 **射线拾取到控件**（fantasy 命中 `(548,450)`）、
**点机内屏幕开机内面板**（`panel false → true`）、**`Space` 驱动控制器**（`paused → loading`）、
键盘方向键 / 滚轮 / `Home` 生效、**0 个异常、0 个资源 4xx**。

8 个组合矩阵（两款 × {浅, 深, 窄 430x900, 无 WebGL}）全部：路径正确（有 WebGL 走 3D、没有走回退）、
**0 横向溢出、0 异常**。窄容器实测画布 `406x460`（fantasy）/ `406x520`（rams），机器完整入画。
无 WebGL 时回退渲染出**完整机身**（读图模型判读："不是空白/半截，是与 3D 版观感一致的合理 2D 降级"）。

**两条要如实说明的点**：
1. 浅色与深色两张截图 **md5 完全相同**。这不是仿真没生效（`matchMedia('(prefers-color-scheme: dark)')`
   实测会在 true/false 间切换），而是本仓库**有意固定** `color-scheme: light`（`styles/10-base.css` 有说明），
   且房间底色按主题而定 → 这两款 3D 皮肤**与系统深浅配色无关**；面板取色仍走 `.radio-root` 的 token。
2. 逐字节移植的只是**几何/材质/相机/光照**；机内屏幕显示的是**我们播放器的状态**，
   参考那套 11 页机内菜单**有意不移植**（我们已有自己的导航与屏幕组件）。

## 3. 截图复现（仓库不含图）

> **基准图去向**：仓库内不再保留截图（`package.json` 的 `files` 只含
> `lib/**`、`dsh-plugin.json`、`README.md`、`docs/INSTALL.md`，图片本来也不进 npm 包）。
> 早期「A 期」那一代的同代截图（`L-/D-/N-` 命名、`rootBox x:8 y:8` 即**修复前**的 8px
> body margin 状态）已从易失的 `/tmp` 抢救到仓库外的持久位置：
> `../../qiaomu-radio-baselines/shots-A-era-0052/` 与 `shots-A-era-0102/`（从 `docs/` 出发；
> 绝对路径 `<workspace>/qiaomu-radio-baselines/`，各 21 张 PNG + `report.json`）。
> 原始 `{theme}-{scheme}.png` 命名的那一批已无法在任何位置找回；A 的对照结论保留在
> [VISUAL-REVIEW.md](VISUAL-REVIEW.md) §7（历史），需要时用 `tools/capture-skins.mjs` 重出。

### 3.0 出图必须归一化 `.radio-notice`（否则像素对比会误判）

`.radio-notice` 浮在机身上方，会污染整屏像素。它有**两个变体、两个状态源、生命期完全不同**：

| 变体 | 状态源 | `role` | 生命期 |
| --- | --- | --- | --- |
| `notice`（info/warning） | `setNotice` | `status` / `aria-live=polite` | **`NOTICE_MS = 3_200`**（`src/client/useRadio.ts:44`）自动消失 |
| `error` → `.radio-notice.has-error` | **`setError`** | `alert` / `aria-live=assertive` | **无任何定时器，只能由用户动作清除**（实测 ≥40s 仍在），并带一个「重试」按钮 |

渲染处：`src/client/RadioApp.ts:58-60`（`cx("radio-notice", controller.error && "has-error")` +
`role: controller.error ? "alert" : "status"`）。触发源与产品行为无关，共两个：**上游目录偶发失败**
（`src/host/catalog.ts:39` `WARNING_CATALOG_DOWN`）与**出图脚本自己的换肤点击**。

**这条不是理论风险，是已经发生过两次的误判根因**：早期"P2-3 背景光晕"与"真实 GUI 窄屏
1.24%~6.51% 像素差"都源于此。后者两位队友已用 1:1 实验证死：**notice 状态一致的配对逐像素
0.00%，不一致的配对恒定 ≈5%**，且 `.skin-body y=58` 两侧完全相同（**notice 不位移布局**）。

**`tools/capture-skins.mjs` 现在的归一化规则**（三条并用）：

1. 截图前把**两个**布尔值记进 `capture-manifest.json`：`notice` 与 `noticeError`（`.has-error`），
   外加 `noticeHidden` 与文案。清单是持久的，控制台输出不是。
2. `status` 变体：轮询到**连续两帧** absent 再截——单帧会漏掉"一条刚消失、下一条替换上来"的
   间隙（文案替换会重启 3.2s 计时）。
3. `alert` 变体：**等不到消失**（无定时器），所以不再白等，改为**截图前隐藏**该元素并记录。

**出图 Chrome 必须带 `--autoplay-policy=no-user-gesture-required`**（或等价地先给一次用户手势），
否则换肤会稳定触发 `alert` 变体。实测对照（同一预览实例 4182）：

```
9226（带 flag）   18/18  notice=false
9227（不带 flag）  15/18  notice=true/alert  ← 5 个非 rams 主题 × 3 尺寸
```

被排除的 3 张正是 `rams`（默认主题，脚本不点主题选择器），与"alert 由换肤+播放被拦触发"完全吻合。

### 3.0.1 notice 不遮挡任何页面控件（已自动化）

`.radio-notice` 是 `.skin-body` 的**兄弟节点**，所以"按钮两两比对"式审计天然覆盖不到它——
这是一条真实存在过的验证缺口。结论（两变体 × 宽/窄）：

| 变体 | notice 盒（宽 / 窄） | 页面控件被遮挡 | 自身控件命中 |
| --- | --- | --- | --- |
| `status` | `640x39@(320,801)` / `396x39` | **0** | 0（无按钮） |
| `alert` | `640x50@(320,790)` / `396x50` | **0** | **1 = 自带的「重试」按钮** |

口径必须带这个限定：**除 notice 自带的「重试」按钮外，没有任何页面控件被遮挡**——不排除自身会
误读成"notice 遮住了一个按钮"。`status` 高 39 / `alert` 高 50，差 **11px 正是「重试」那一行**
（真实点击后可清除 `alert` → `loading` → `playing`，即它是条内可用的最上层控件）。

**方法坑**：朴素的矩形相交在 deck 宽视口会报 **2 个假阳性**（`424x30` 播放列表行，落在
`.playlist-scroll` `client 255 / scroll 1500` 里**已被裁掉**）——必须用 **clip-aware 可见性**
（沿祖先 `overflow != visible` 取交集）。且它**写不成 vitest 回归**（happy-dom 无布局引擎，
`getBoundingClientRect()` 恒 0），只能走浏览器。

**已自动化**：`tools/capture-skins.mjs` 每张图记录 `noticeObstructs`（页面控件）与
`noticeOwnControlHits`（自身控件）、`noticeControlsChecked`；独立探针
`tools/notice-obstruction-check.mjs` 做宽/窄两个视口的**阴性 + 阳性对照**（往 notice 内注入一个
真实可见控件，检查器必须报出来——否则"0 遮挡"与"检查器坏了"无法区分）。两个数字都对上：
出图 18 张 → **页面遮挡 0 / 自身命中 13**；探针两视口 `ok: true`，notice 盒与上面表格逐值相同。

> 注：探针必须**显式设视口**。harness 默认 headless 窗口是 ~756x469，notice 会落在**折线下方**
> （y=709），此时检查器正确地跳过它——在那里量"遮挡"没有意义。这是本项目第三次踩到
> "截图/量测环境没对齐导致假结论"。

**正面验收结果（顺带测到，属"已验证"）**：在**无用户手势 + 自动播放被拦**的真实环境下，
`error → 点「重试」→ loading → playing` 全过程通过，说明 notice 的重试按钮能以真实手势恢复播放；
同一次实验还**自然触发**了一次 `WARNING_CATALOG_DOWN`（未注入），与"上游目录偶发失败"一致。

### 3.1 报告里三条已被数据推翻的结论（按反证执行，不要按报告改）

| 报告条目 | 反证 | 结论 |
| --- | --- | --- |
| P1-6「pocket 音量条需自绘 slider，参考在 `styles.css:1119-1126`」 | 参考 `src/styles.css` 全文只有 **185 行**，`type=range\|slider\|appearance` 命中 **0**；线上 `index-C2QS_QBT.css`（29,537 B）同样 **0** 命中，只有 `.device-volume input{height:24px;accent-color:var(--ink)}` | **误报，保持 `accent-color`** |
| P2-1「fantasy 占位比参考大 66.72% vs 46.5%」 | 该视口下线上参考自身走了 three.js 失败回退分支（`NativeRadio.tsx:252`），实测 `.native-radio 1240x911`、页面 1031 需滚动；复刻是 `1040x655`、不滚动，**比参考窄 16%、矮约 28%** | 按报告再缩 20~30% 会**放大**偏差，**未采纳** |
| P0-1 的等级 | 机制真实（深色外观下 `.radio-root` 继承白色，实测 `rgb(255,255,255)`），但属"系统深色外观"路径 | 已修；等级按 P1 记，机制说明保留 |

## 3.2 页面外壳（Lead 侧）

`src/dsh/page.ts` 的 `renderPlayerPage()` 是源码预览与生产路由**唯一**的 HTML 来源，
其中 `PAGE_SHELL_CSS` 负责三层事：

1. `html,body.radio-page{margin:0;padding:0}` —— 消掉 UA 默认 8px 外边距造成的白框与多余滚动；
2. `body.radio-page{background:#d9d8cf;color:#2b2f28;color-scheme:light}` + `<meta name="color-scheme" content="light">`
   —— 固定配色皮肤**有意不跟随系统深浅色**，防止 Chrome 把画布涂成 `#121212` 并把初始文字色设白；
3. `body.radio-page:has(main.radio-root[data-theme=<t>]){background:…}` 六条 —— 让 body 背后那层颜色
   跟随主题（token `--radio-bg` 声明在 `.radio-root` 上，body 读不到，所以这里按主题写死并靠
   `main` 上的 `data-theme` 联动）。实测六皮肤 `bodyBg` 与 `.radio-root` 背景一致。

测试锁点：`tests/dsh.routes.test.ts` 断言 `content="light"`、`body.radio-page{margin:0`、
六条 `:has(...)` 规则齐全，且**不出现** `color-scheme: dark`。

---

## 3.3 与参考实现的已知差异（诚实清单，来自 radio-ui 与 Lead 的核对）

| # | 差异 | 性质 |
| --- | --- | --- |
| 1 | rams / fantasy 已改成**真 three.js**（与参考同路线）。原先的 CSS 3D 版本保留为 WebGL 不可用时的回退 | **本轮按用户决定收口**。像素差分中位数 0.0，差异只剩我们自己的屏幕文案（见 §2.8）；客户端半边仍不含 three.js |
| 2 | `.classic-title` 用内联 SVG 字形，参考用 `ϟ`/`◈`；播放列表当前行用 SVG `PlayIcon`，参考用 `▶` | 按 AGENTS.md「图标一律内联 SVG，不用 emoji」执行 |
| 3 | `support` 二维码绝对定位在 `.skin-screen` 上，未用 `createPortal(document.body)` | `react-dom` 只允许出现在 `RadioApp.ts` |
| 4 | `explore`（拆解展示/恢复视角）是复刻新增的第十二页 | 参考 iPod 导航只有 11 页 |
| 5 | deck / console 的 `now` 页把播放列表本身当作 `.skin-screen`（**一个元素同时担 `.device-screen` 与 `.classic-playlist` 两个角色**，参考是分开的两个元素） | 布局与参考一致；但合并元素会让参考里"空转"的 `.classic-foobar .device-screen{height:360px}` 被激活，把 console 播放列表从 350px 顶成 360px 并带进 `overflow:hidden`。**已修**：该规则收窄为 `:not(.classic-playlist)`；实测 console 恢复 `728x350` / 滚动区 `321`，与参考精确一致，`.classic-panel` 的 360px 未受影响（deck 本来 286/255，无回归） |
| 6 | 若干交互目标 < 24px（Winamp 标题栏 32x17、dock、窄屏 rams/fantasy 旋钮） | 与参考一致；物理皮肤另有 `.skin-dock` 作为无障碍替代 |
| 7 | console / deck 播放列表末行是半行 | 参考几何本身如此（`.classic-playlist{height:286px}` + 30px 行 = 9.53 行），是滚动提示，**有意保留** |
> 署名：第 5 条的**定位与根因**来自 `radio-visual` 的视觉审计（她发现参考 DOM 里
> `.classic-foobar .device-screen{height:360px}` 是一条"空转"规则），**代码改动由 Lead 落盘**
> （`styles/20-reference.css`，02:15）。`radio-ui` 独立复测确认，他原打算的改法一致但被文件版本
> 守卫正确拦下，没有重复应用。

| 8 | **已随本轮改造解决**：rams / fantasy 在宽、窄视口**都走 3D**（实测窄容器 `430x900` 下画布 `406x460` / `406x520`，完整入画），平屏只在 three.js 不可用时出现——与参考的 `.native-flat-screen` 兜底语义一致。其余四款仍是 CSS/DOM 皮肤，窄容器按原设计走 `.skin-flat-screen` | 本轮收口。上一版这条记录的"窄屏把交互屏移到平屏"只对改造前的 CSS 3D 皮肤成立 |

## 4. 已知未验证与未能验证

**未能验证（如实列出，不写成"已确认"）**：

1. **音频是否真的出声**：headless 无音频输出设备，且浏览器自动播放策略拦截；只能验证到
   "点击后状态机与网络请求正确"。人在场时"需再点一次播放"即可出声。
2. **主观"像不像参考"的读图判读**：**P1-5 已收口，差距已消除**（此前记的"差距显著"针对的是改造前的 CSS 3D 版）。
   本轮两款都改成真 three.js 后，同条件像素差分中位数 **0.0**、>40 的像素只剩 **0.21%（rams）/ 0.33%（fantasy）**
   且全部落在我们自己的屏幕文案上；读图模型复判："三条差异均已修复，是同一台机器、同一机位，除屏幕文案外无可见差异"。
   完整证据见 §2.8 与 `docs/VISUAL-REVIEW.md` 的「P1-5 收口」。**下面这段是改造前的记录，保留作对照**：
   首次成功判读来自把本插件 fantasy 截图与参考自带的
   `qiaomu-radio/docs/assets/qiaomu-radio-fantasy-v4-screen-model-ready.png` 交给能读图的模型：
   参考是可辨认的**奇幻实体物件**（木箱、提手、兽角、水晶、铆钉、红/蓝发光喇叭、雕花屏幕、落地阴影），
   本插件是**扁平暗色卡片 + 渐变圆按钮**，"几乎不构成同一个东西"。
   **根因是路线而非缺陷**：参考里（注意**文件名与主题相反**，以 `PlayerSkin.tsx` 的分派为准）
   fantasy 走 `RamsRadio.tsx`：`GLTFLoader` 加载 2.74 MB 的 GLB；rams 走 `NativeRadio.tsx`：
   `src/radioModel.ts`（89 行图元）程序化建模 + VSM 阴影 + `CSS3DRenderer` 投影 HTML 屏幕。
   （上一版这两句写反了，正是参考命名陷阱导致的。）
   本插件两款都是纯 CSS/DOM（实测 0 canvas / 0 img / 18 SVG）。用户已确认改造为真 three.js（两款都做）。
   客观尺寸仍成立，可作对照：
   - editorial 设备盒 `420x604@(510,217)` vs 参考 `421x591@(509,218)`（差 ≤2px）；
   - fantasy 复刻 `.skin-fantasy 1040x655` vs 参考真 3D `<canvas> 1100x654`：**宽 −5.5%、高 +0.2%**
     （−5% 落在 canvas 透明留白内，**不缩放**）。此前"66.72% vs 46.5%、偏大"的结论已作废：
     那组数字是拿**参考 rams 在 WebGL 失败回退态**的下场量去比**本地 fantasy**，参照物错位；
   - rams 是"复刻机身容器 980x640"vs"参考全幅 canvas 1240x671"，口径不同，**不可比**。
3. **hover / tooltip 视觉、触屏手势**：**指针类交互本轮已实测**——两款 3D 皮肤的射线拾取、
   悬停游标（`native-canvas-action`）、点屏幕开机内面板、滚轮、键盘方向键/`Space`/`Home` 都在
   真实 Chrome 里用 CDP 输入驱动过。**仍未验证**：触屏多点手势（iPod 转盘拖动、手柄缩放）与 tooltip 视觉。
4. **用户自己的 `desktop` profile 里的加载**：**已执行并验证**（§2.5.1）。安装前备份在
   `~/.dsh/profiles/desktop/.backup-qiaomu-radio-<时间>/`；因 profile 用 `link:`，插件代码更新无需重装。
5. **harness 页面内的电台 UI 插槽**：**已做**（§2.5.2）。客户端半边注册 `sidebar.panellist`
   侧边栏入口与 `main` 槽面板，面板内嵌宿主提供的播放器页；真机验证见 §2.5.2 的 7 项检查。

**已知限制**：

- Radio Browser 公共镜像在离线或限流时自动回退内置台单，界面显示中文 `warning`，不报错。
- 上游非 2xx 的流统一按 `502` 处理（与参考实现 `!ok → throw → 502` 一致）。
- 单实例内存缓存两档 TTL：目录 15 分钟、播放地址 10 分钟；`clear()` 全清。

---

## 5. 复现全部验证的最短路径

```bash
npm install
npm run check                                        # typecheck + 97 tests + build

# A. 源码预览（真实宿主服务 + 源码 UI）
npm run preview                                      # http://127.0.0.1:4180/

# B. 生产产物（真实路由 + 生产 Bundle）
node tools/serve-built.mjs 4190                      # http://127.0.0.1:4190/qiaomu-radio/

# C. 留档：6 皮肤 × {浅,深,窄}
BASE=http://127.0.0.1:4190/qiaomu-radio/ CDP_PORT=9226 \
  OUT_DIR=docs/shots-final node tools/capture-skins.mjs

# D. 真实 harness 实例（§2.5 的完整步骤见该节），拿到 token 后：
TOKEN=…
node tools/cdp-nav-probe.mjs 9226 "http://127.0.0.1:4199/qiaomu-radio/?token=$TOKEN"
node tools/cdp-gui-probe.mjs 9226 "http://127.0.0.1:4199/?token=$TOKEN"   # 应为 0 error
```

`tools/` 下的探针都是只读的开发者工具（CDP 驱动、不写产品代码）：
`serve-built.mjs`（起生产产物）、`capture-skins.mjs`（出图）、
`cdp-nav-probe.mjs`（`menu → channels → stations → now` 全链路 + 网络序列）、
`cdp-gui-probe.mjs`（真实 harness 页面的 `__DSH_BOOT__` 与激活错误）、
`cdp-theme-url.mjs`（六皮肤深链）、`cdp-contrast.mjs`（深色外观对比度）、
`cdp-geometry.mjs` / `cdp-shell.mjs` / `cdp-console-geometry.mjs`（几何）、
`cdp-dark-shot.mjs`（深色外观截图，供像素审计）。

**注意**：`tools/cdp-*.mjs` 需要本地有 `ws`（`npm install --no-save ws@8`），且必须留在项目
目录内运行，否则 Node 解析不到该依赖。