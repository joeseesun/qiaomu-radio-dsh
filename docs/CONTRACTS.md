# 接口与 DOM 契约（冻结版 · v1）

本文件是队友之间唯一的对接依据。**任何一方要改这里，先改本文件再改代码。**

## 1. 目录与写入范围

```
src/core/        纯逻辑，无框架、无 DOM、无 Node API       ← Lead（已冻结，勿改）
src/host/        宿主服务：目录、播放地址、now playing、代理、口味存储
src/client/      浏览器端：状态、播放引擎、六种皮肤、页面
src/dsh/         DSH 适配：host 入口、client 入口、桥接
preview/         独立预览服务器与入口页
scripts/         构建脚本
styles/          CSS
tests/           vitest
```

| 归属 | 可写文件 |
| --- | --- |
| radio-host (T1) | `src/host/**`（`taste.ts` 除外，已由 Lead 写好）、`tests/host.*.test.ts`、`tests/core.*.test.ts` |
| radio-ui (T2) | `src/client/**`（`api.ts`、`transport.ts` 除外）、`styles/**`、`tests/ui.*.test.ts` |
| Lead | `src/core/**`、`src/client/api.ts`、`src/client/transport.ts`、`src/host/taste.ts`、`src/host/contract.ts`、`src/dsh/**`、`preview/**`、`scripts/**`、`package.json`、`docs/**` |

**禁止**跨范围写入。T1 需要 UI 契约变化 → 发消息给 Lead。

## 2. 唯一 JSX 出口

整个仓库只有 `src/client/ui.ts` 使用 JSX：

```ts
// src/client/ui.ts
import { createElement } from "react";
import type { ReactNode } from "react";

/** 唯一 JSX 出口：JSX 在这里编译成 createElement，其余全部 .ts 文件直接调 h()。 */
export function h(type: unknown, props?: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode;
```

所有 `.ts` 文件里写 DOM 一律 `h("section", { className: "radio-root" }, ...)`。
`h` 必须：过滤 `null`/`undefined`/`false` 子节点、把 `key` 原样透传、支持 `children` prop。

## 3. 客户端 API（`src/client/api.ts`，已冻结）

UI 只依赖 `RadioHost`，绝不 import DSH 或 Node：

```ts
type RadioHost = {
  api: RadioApi;                               // 唯一数据/播放入口
  storage: RadioStorage;                       // 口味与皮肤的本机持久化
  baseUrl: string;                             // 本插件宿主路由的前缀
  assetUrl?(relativePath: string): string | null; // 同源资源（hls.js 就靠它）
  now?: () => number;                          // 注入时钟，测试用
};
```

- 关卡页（插件自己路由提供的独立播放器）：`createRadioApi({ kind: "http", baseUrl })`，
  对应 `GET/POST {baseUrl}/api/radio/catalog|resolve-play|now-playing`。
- DSH 动态浏览器半边（`fetch` 被沙箱隐藏）：`createRadioApi({ kind: "rpc", call })`，
  其中 `call` 就是注入的 `host.call(method, args)`，方法名 `radio/catalog`、`radio/resolvePlay`、`radio/nowPlaying`。
- 预览环境：同一个 http 适配器，`baseUrl` 为 `""`，见 `preview/server.mjs`。
- **UI 不要自己 `fetch`**，也不要依赖 `window.fetch`、`setTimeout` 之外的浏览器全局；
  HLS 运行时用 `host.assetUrl?.("hls.js")` 取地址后动态 `import()`。

### 状态容器（T2 实现，Lead 依赖以下签名）

```ts
// src/client/useRadio.ts
export type RadioController = {
  // 状态
  themeId: ThemeId; theme: RadioTheme; mood: MoodId; source: StationSource;
  stations: Station[]; queue: Station[]; current: Station | null;
  isPlaying: boolean; isLoading: boolean; error: string; notice: string;
  volume: number; liked: boolean; profile: TasteProfile; locale: Locale;
  // 动作（全部同步签名，返回 void；内部自行处理异步）
  toggle(): void; next(): void; previous(): void; play(station: Station): void;
  like(): void; dislike(): void; chooseMood(mood: MoodId): void;
  chooseTheme(themeId: ThemeId): void; chooseSource(source: StationSource): void;
  chooseRegion(code: string | null): void; search(query: string): void;
  setVolume(value: number): void; retry(): void; close(): void;
};
export function useRadio(options: RadioMountOptions): RadioController;
```

`useRadio` 负责：目录请求与竞态取消、播放/失败切换（最多 5 次）、失败后记录 reliability、
15s 超时恢复、媒体键、键盘（Space 播放/暂停、N 下一台）、音量落到 `<audio>`、
localStorage 存取 `profile` 与 `themeId`、播放成功写 history。

## 4. 皮肤契约（T2）

```ts
// src/client/skins/types.ts
export type SkinProps = {
  controller: RadioController;
  /** 窄容器（右侧栏 / 浮动层）：宽度 < 720px */
  compact: boolean;
  /** 用户偏好减少动效 */
  reducedMotion: boolean;
};
export function EditorialSkin(props: SkinProps): ReactNode;
export function PocketSkin(props: SkinProps): ReactNode;
export function DeckSkin(props: SkinProps): ReactNode;
export function ConsoleSkin(props: SkinProps): ReactNode;
export function RamsSkin(props: SkinProps): ReactNode;
export function FantasySkin(props: SkinProps): ReactNode;
```

`src/client/skins/index.ts` 导出 `SKINS: Record<ThemeId, (props: SkinProps) => ReactNode>`。

顶层入口（`src/client/RadioApp.ts`）：

```ts
export function mountRadio(options: RadioMountOptions & { container?: HTMLElement }): void;
export function unmountRadio(): void;
```

### 屏幕内页面（T2）

六种皮肤的「屏幕」共用同一套页面集（参考 `plugin-src/radio-view.ts` 的 iPod 导航）：

| page | 内容 |
| --- | --- |
| `now` | 正在播放：电台名、国家/格式、now-playing 曲目、进度氛围 |
| `menu` | 菜单：正在播放 / 频道 / 地区 / 电台列表 / 搜索 / 喜欢 / 最近 / 语言 / 支持 |
| `channels` | 六个心境频道，含 note 与 accent |
| `regions` | `RADIO_REGIONS` + 「自动判断地区」 |
| `stations` | 当前队列列表，行=序号/名称/地区/编码 |
| `favorites` | `profile.likedStationIds` |
| `history` | `profile.history` |
| `search` | 输入电台名 + 提交搜索 / 中国电台 / 全球精选 20 |
| `info` | 数据来源与隐私说明 + 电台官网 |
| `support` | 打赏/关注/源码/乔木推荐 |
| `language` | 六种界面语言 |

## 5. 虚拟 DOM 契约（T2 + CSS）

```
.radio-root[data-theme="editorial|pocket|deck|console|rams|fantasy"]
  [data-state="playing|loading|paused|error"] [data-compact="true|false"]
  └ .radio-stage
     └ .skin-<theme>            ← 皮肤根（CSS 3D 与 3D 画布都挂在这里）
        ├ .skin-body / .skin-faceplate
        ├ .skin-screen[data-page]  ← 屏幕内页面
        ├ .skin-controls           ← 实体控件区
        └ .skin-dock               ← 皮肤外的通用控制条（音量/喜欢/上一台/下一台）
  .theme-picker                    ← 六主题切换（渲染在 .radio-root 内、.radio-stage 之上）
  .radio-notice[role="status"|"alert"]
```

- 所有交互元素必须是 `<button>` 或带 `role` + 键盘处理；`:focus-visible` 必须有可见描边。
- `data-motion="off"` 时禁用 CSS 过渡与动画（`prefers-reduced-motion: reduce` 同时生效）。
- 样式只作用于 `.radio-root` 子树，禁止全局选择器与 `!important` 堆叠。
- 颜色令牌必须同时定义在 `[data-theme]` 下与其 `.dsw-dark` / `.dark` 祖先下（DSH 深色主题），
  正文对比度 ≥ 4.5:1。
- 图标：**内联 SVG**（`stroke="currentColor"`、`width/height=1em`），不使用 emoji。
  常用图标集中放 `src/client/icons.ts`（T2 自建）。

### 5.1 两款实体皮肤的分层（`fantasy` / `rams`）

这两款走真 three.js（用户决定）。**分层不许越界**：

```
src/client/skins/<Theme>Skin.ts        薄包装：只做 React 生命周期 + 把控制器状态喂给引擎
  └ src/client/skins/three/<theme>Scene.ts   无框架引擎：three.js 场景 + 指针/键盘手势，零 React
     └ src/client/skins/three/*.ts           几何/材质/按键反馈（与参考实现字节一致，勿改数值）
  └ src/client/skins/<Theme>Fallback.ts  WebGL 不可用时的 CSS 3D 回退（参考的 `failed` 分支）
```

- 引擎**不 import React、不做 i18n、不读控制器**：文案与动作都由包装层经 `options` 注入
  （`labels` / `actions` / `announce` / `prefersReducedMotion` / `onReady` / `onFail`），
  回调要用 ref 转发，保证引擎拿到的是最新闭包。
- 包装层只准通过 `controller` 触发播放状态变化（`next()` / `previous()` / `toggle()` / `setVolume()` / `toggleMute()`），
  **皮肤不得自己遍历电台列表**。
- 引擎必须能在 WebGL 不可用时返回 `null`/回调 `onFail`，由包装层切到回退组件；
  测试环境（happy-dom）没有 WebGL，所以回退路径是**必须**保持可渲染的。
- three.js **只允许出现在 `src/client/skins/three/**` 与宿主播放器页**；`src/client/index.ts`
  这一半（harness 客户端捆绑包）不得 import three.js，模块表里只有 React。
  由 `tests/build.client-bundle.test.ts` 与 `grep -c THREE lib/client.js → 0` 守住。
- 场景参数（相机/光照/阴影/地面）**每一款各有一套，不许互相抄**——两条皮肤抄错就会表现为
  "机身明显偏小/阴影过硬"，同条件像素差分能立刻看出来（见 `docs/VISUAL-REVIEW.md` 的 P1-5 收口）。

## 6. 宿主服务契约（T1）

```ts
// src/host/catalog.ts
export function createRadioService(options?: RadioServiceOptions): RadioService;
```

- `catalog(req)`：镜像轮询 `de1/nl1/at1.api.radio-browser.info`；
  - `radio-browser`：按心境 tag 搜索，`order=clickcount&reverse=true&hidebroken=true&limit=60`；
  - `regional`：`countrycode=<CC>`，无 CC 时回退 `global-curated`；
  - `china-curated`：`CHINA_STATIONS`；
  - `global-curated`：`GLOBAL_CURATED_STATIONS`，另可拉取 `order=clickcount` 的流行音乐台（`selectPopularMusic`）；
  - 任一镜像全部失败 → 返回精选台并把 `warning` 填成一句中文说明；
  - 结果去重（id + streamUrl）、仅 HTTPS、`countryCode` 转大写、按 `clickCount` 降序。
- `resolvePlay(station)`：
  - HLS（`.m3u8`）→ `{ kind: "hls", url: "/<proxyPrefix>/<encoded upstream>" }`；
  - 直接流 → `{ kind: "media", url: station.streamUrl }`；
  - 结果按 `streamUrlTtlMs` 缓存。
- `nowPlaying(station)`：仅对 SomaFM（`somafm.com`）抓 `https://somafm.com/songs/<channel>.json`，
  失败返回 `null`，绝不抛错。
- `proxy(request, response, upstream)`：转发任意上游字节流；重写 HLS 播放列表里的相对/绝对 URI
  为同一代理路径；透传 `content-type`、`icy-metaint`、Range；错误时回 502。
- `prefetch(stations)`：只查缓存，未命中的不阻塞。

## 7. 测试要求

- T1：`tests/host.catalog.test.ts`（镜像失败回退、去重、HTTPS 过滤、regional 回退）、
  `tests/host.proxy.test.ts`（m3u8 重写、Range 透传、上游 502）、
  `tests/core.recommendation.test.ts`（排序、反馈、reliability）。
- T2：`tests/ui.skins.test.ts`（六皮肤在 happy-dom 挂载无异常、关键 a11y 属性存在）、
  `tests/ui.navigation.test.ts`（屏幕内导航：menu→channels→stations→now）。
- 一律用注入的假 fetch 与假时钟；测试不得访问网络。

## 8. 视觉基准

参考实现就是基准，不需要另写规格文档：`<workspace>/qiaomu-radio/src/`
（`NativeRadio.tsx`、`RamsRadio.tsx`、`PlayerSkin.tsx`、`ClassicPlayer.tsx`、`ThemePicker.tsx`、
`SupportPanel.tsx`、`App.tsx`、`styles.css`）与 `plugin-src/radio-view.ts`（iPod 屏内导航）。
逐屏对齐时以这些文件里的实际数值为准，不要凭印象发挥。

## 9. 验收基线

1. `npm run typecheck` 通过。
2. `npm run test` 全绿。
3. `npm run build` 产出 `lib/index.js`、`lib/player/app.js`、`lib/player/styles.css`、`lib/player/hls.js`。
4. `npm run preview` 起本地服务（http://127.0.0.1:4180/），六种皮肤可切换、可搜索、
   可播放公开 MP3、可收藏；浅色/深色/窄容器（<720px）逐个看过。
5. 中文界面为默认；窄容器不出现横向滚动。

## 10. 交付形态（重要）

插件是**宿主侧插件**：宿主半边用 `ctx.webServer` 注册自己的 HTTP 路由，并在这些路由上
提供完整的独立播放器页面（`GET /qiaomu-radio/`）。

- 不需要 DSH 客户端打包链：`lib/client.js` 只是给未来 `dsh.client` 接线留的 ESM 产物，
  当前 `package.json` 的 `dsh.client` 是预留声明。
- 因此界面验证走 `npm run preview`（同一份 UI 源码 + 同一个宿主服务），
  装进 harness 后打开插件的路由地址即可得到同一界面。
- 打包与部署由 Lead 负责，队友不要改 `scripts/**`。
## 11. 魔兽皮肤启动校准

启动时可为随包双面 GLB 建立临时空间索引以加速表面投射；必须保持原坐标、网格密度和交互区域，且用真实模型对照原射线结果。索引仅在静态校准阶段使用，不用于之后变形的模型。加载失败或超时须结束 loading 并释放场景。

## 12. 安静反馈与沉浸模式

- 切换皮肤只更新并保存 themeId，保留音频实例、电台、队列、频道、搜索与屏内页面；不发切换成功通知。
- 收藏/不喜欢通过按钮和电台变化反馈，不另发成功通知。连接状态留在设备屏内。
- 必要通知和错误使用不参与主体布局的底部区域；舞台始终预留底部空间。
- 沉浸布局指铺满插件内容区，保留 Harness 导航与窗口；不使用 Fullscreen API，不增加全屏按钮。
- page 展示在窄屏也至少铺满 iframe 高度；平面播放器扩展内容区，实体播放器保持比例，3D 场景使用可用空间。

## 13. 移除极简皮肤

此前支持五款皮肤：fantasy / rams / pocket / deck / console。Minimal（editorial）不再出现在主题菜单或渲染注册表；历史 editorial 设置与链接自动迁移为 rams，并保存迁移结果。此前六皮肤条目为历史基线；当前清单见第 16 节。

## 14. 实体屏内导航

博朗/魔兽点击屏幕后在原屏幕平面渲染共用 HTML 导航，移除外置大面板与重复播放控件。场景接受可选 menuElement，句柄提供 menu(boolean)；打开时平滑聚焦屏幕，关闭恢复先前视角，减少动效时直接到位。返回逐级导航，Escape/关闭返回收听；选择电台返回 now 自动关闭。屏幕导航不改音频生命周期。拆解入口独立于菜单。

## 15. 公开分发契约

正式分发包含构建后的 host/client/player/HLS/GLB 与声明文件。prepack 执行构建并验证所有 exports 和必需资产；安装无需构建脚本。GitHub Topics/市场收录与软件包发布分别验收。当前发布从 main 构建，不包含其他工作区未提交的皮肤变更。
## 16. 移除 Foobar2000 主题与缩小切换钮

当前主题清单为 fantasy / rams / pocket / deck。Foobar2000（console）不再出现在主题菜单和渲染注册表；历史 console 设置与 `?theme=console` 链接迁移为 rams，并保存迁移结果。主题切换钮保持键盘可达及原有点击区域，视觉圆钮与图标缩小；闲置时保持低对比可见，仍可直接点击。


## 17. 完整迁移审计（2026-10-28）

在独立 worktree 上合并公开 0.1.1 的分发元数据与原工作区既有的四皮肤改动，保留原工作区及未跟踪文件。以 Obsidian Radio 1.2.4 的源文件逐项核对功能；延续明确移除 editorial / console 的当前配置，不自行重设计其余皮肤。记录 source commit 与适配差异，Home 协议和升级提示接线需要保持现有播放/收藏/历史的独立生命周期。发布和安装仍须分别验收；浏览器由用户使用期间不执行界面自动化。

### 17.1 后台播放与 Home

插件激活范围拥有一个延迟创建的播放器 iframe；面板只作为定位锚点，不拥有音频或 iframe 的卸载权。切到 Home 后隐藏原 iframe，不移除或重新挂载；停用 Radio 才销毁它。Home provider 直接复用原版 home.ts 的数据与动作逻辑。跨 frame 只接受同 origin、精确 source 的协议消息；播放动作只携带已知电台 ID，不接受外部注入的流地址。原版 Open/Toggle 命令接入 Harness 快捷命令，Home 停用不影响 Radio。

### 17.2 原版目录、语言与持久化

本轮完整迁移扩展历史冻结接口：MoodId 加入 recommend；CatalogRequest.filter 接原版 tag/country/language；原版分类面板方法及 CSS 片段原样保留并校验。带筛选的请求失败或零结果不得填充无关备用台单。语言扩为原版十种加 auto，复用原翻译，DSH 特有文案缺译时回退英语。更新说明复用原组件与 CSS，离线读取独立 metadata。音量/频道持久化保留既有收藏与主题键；解析或结构异常的数据在规范化前备份原始字符串，备份失败则禁止覆盖。以上代码与包检查不替代四皮肤、窄屏、深浅色、真实播放及后台持续播放验收。
