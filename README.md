# 乔木电台 · DSH 插件

把 [乔木电台](https://radio.qiaomu.ai/) 的五种播放器环境搬进 DeepSeek Harness：发现并收听全球直播电台，
让音乐陪着你工作与阅读。

**中文** | [English](#english) | [参考实现](../qiaomu-radio) · [在线电台](https://radio.qiaomu.ai/)

## 这是什么

一个 DSH 宿主侧插件。宿主半边用 `ctx.webServer` 注册自己的路由，并在这些路由上提供一个完整的
独立播放器页面；页面里是同一套 React 界面与同一份电台目录服务，所以「预览里看到的」和
「装进 harness 后打开的」是同一个东西。

| 能力 | 你得到什么 |
| --- | --- |
| 五种播放器环境 | 魔兽世界 3D、博朗 · 3D、iPod、Winamp、foobar2000 |
| 全球电台目录 | Radio Browser 真实直播台；目录不可用时使用内置备用台单 |
| 场景频道 | 松一口气 / 安静做事 / 爵士时刻 / 古典留白 / 需要能量 / 去远方 |
| 本机口味记忆 | 喜欢、跳过、收听历史、电台可靠性，只存在本机 |
| 播放控制 | 播放、暂停、上一台、下一台、音量、失败自动切换下一台 |
| 六种界面语言 | 简体中文、English、Español、Français、Deutsch、日本語 |

## 目录

```text
src/core/       纯逻辑：类型、主题、推荐、播放策略、手势数学    （可单测，无框架）
src/host/       宿主服务：电台目录、播放地址、now playing、流代理、口味存储
src/client/     浏览器界面：状态容器、播放引擎、五种皮肤、十二个屏幕页面
src/dsh/        DSH 接线：路由注册、页面渲染、Cordis 插件入口
preview/        开发预览：与宿主同一套服务的本地服务器
styles/         播放器样式
```

## 使用

### 在 App 里打开

装进 profile 并重启 harness 后，**左侧边栏会出现「乔木电台」入口**，点开即在主面板里使用
播放器（面板内嵌宿主提供的播放器页，与 `/qiaomu-radio/` 是同一份产物，只有一套 UI）。
也可以直接访问：

```
http://127.0.0.1:<harness 端口>/qiaomu-radio/
```

### 开发预览（推荐先看这个）

```bash
npm install
npm run preview        # http://127.0.0.1:4180/
```

预览服务器用真实的宿主服务（Radio Browser 目录、播放地址解析、HLS 代理）驱动同一套界面。

### 装进 harness

```bash
npm run build
```

产物：

```text
lib/index.js            宿主半边（ESM，Node 20+）
lib/client.js           浏览器半边（预留给 dsh.client 接线）
lib/player/app.js       播放器页面脚本
lib/player/styles.css   播放器样式
lib/player/hls.js       懒加载的 hls.js 运行时
```

把本包安装进 profile 并在 `cordis.patch.yml` 里挂载：

```yaml
- name: "@qiaomu/dsh-radio"
  config:
    catalogTtlMs: 900000
```

安装命令（profile 目录内）：

```bash
node <harness>/runtime/pnpm/bin/pnpm.mjs add /绝对路径/qiaomu-radio-dsh
```

装好后打开 `http://127.0.0.1:<web 端口>/qiaomu-radio/` 即得到播放器页面（harness 开了
浏览器信任校验，需带上 `dsh web` 打印的 `?token=…`）。挂载点在 `/qiaomu-radio` 而**不是**
`/plugins/...`，因为 harness 的客户端 Bundle 路由持有整段 `/plugins` 前缀，会把别的载体遮蔽——
这两点都有测试锁死，实测过程见 [交付说明](docs/DELIVERY.md) §2.5。

## 隐私与网络

- 不需要账号，无客户端遥测，不上传工作区文件。
- 目录请求发往 Radio Browser 的公共镜像；播放时直接连接所选电台的直播地址（HLS 经本插件
  同源代理，用于重写播放列表）。
- 喜欢、跳过、音量与收听历史保存在浏览器本地存储，以及插件的口味存储席位。

## 开发者工具

`tools/` 下都是只读探针（CDP 驱动真实 Chrome，不改产品代码）：

| 工具 | 用途 |
| --- | --- |
| `serve-built.mjs` | 用 `lib/index.js` 在一个最小 web 载体上起**生产产物**，默认 `http://127.0.0.1:4190/qiaomu-radio/` |
| `capture-skins.mjs` | 出图：6 皮肤 × {浅色, 深色, 窄容器}，写入 `docs/shots-final/`（`OUT_DIR` 可改） |
| `cdp-nav-probe.mjs` | 从零走完 `menu → channels → stations → now` 并打印网络序列 |
| `cdp-theme-url.mjs` | 逐个校验 `?theme=` 六个皮肤深链 |
| `cdp-contrast.mjs` | 浅/深外观下的前景色、对比度、页面外壳度量 |
| `cdp-geometry.mjs` / `cdp-shell.mjs` | 每种皮肤的盒模型与 3D 变换计数 |
| `cdp-dark-shot.mjs` | 深色外观截图，供像素审计 |

## 从源码构建

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run preview
```

## 与参考实现的关系

界面、主题、推荐公式与目录策略移植自 [qiaomu-radio](../qiaomu-radio)（GPL-3.0-or-later）。
参考实现里两款**实体 3D 皮肤**（`fantasy` 魔兽世界 / `rams` 博朗）已改成**真 three.js**：
场景参数与几何逐值移植（`src/client/skins/three/`），观感差异经同条件像素差分收敛到中位数 0.0
（差异只剩我们自己的机内屏幕文案）。原先的 CSS 3D 版本保留为 **WebGL 不可用时的回退**。
另外三款（`deck` / `pocket` / `console`）本来就是 CSS/DOM，不涉及 3D。
three.js 只进宿主提供的播放器页（`lib/player/app.js`），**不进 harness 客户端半边**
（`lib/client.js` 仍只依赖模块表里的 React），所以不违反客户端捆绑包只能依赖 React 的约束。
Obsidian 专有 API（Notice、Modal、setIcon、requestUrl）全部替换为浏览器原生实现。

## 交付文档

- [安装与接线](docs/INSTALL.md)：构建、装进 profile、挂载配置、路由清单、卸载。
- [交付说明](docs/DELIVERY.md)：验收命令与真实输出、产物清单、已知未验证项、与参考的差异清单。
- [界面契约](docs/CONTRACTS.md)：模块边界与界面契约（团队协作用）。
- [视觉验收报告](docs/VISUAL-REVIEW.md)：P0/P1/P2 分级、实测值、改法与反证。

## 许可

[GNU GPL v3 或更高版本](LICENSE)。闭源集成与白标分发见
[商业许可说明](../qiaomu-radio/COMMERCIAL-LICENSE.md)。

- 主页：[qiaomu.ai](https://qiaomu.ai/)
- X：[@vista8](https://x.com/vista8)

## GitHub 开发流程

仓库使用功能分支和 Pull Request 管理改动，合并前运行 `npm run check`。
GitHub Actions 自动执行类型检查、测试和构建。依赖、生成产物和本机配置不入库。
克隆后先运行 `npm ci && npm run build`，再按[安装说明](docs/INSTALL.md)接入 Harness；
必须同时配置 profile 依赖和 `dsh.profile.bundles`。

## English

Qiaomu Radio brings five radio player environments to DeepSeek Harness, with global
live stations, mood channels, playback controls, and locally stored preferences.

Requires Node.js 22+ and npm for development, and DeepSeek Harness for integration.
Run `npm ci`, `npm run check`, then `npm run preview` for a standalone preview.
Build before linking the package into your Harness profile. Add `@qiaomu/dsh-radio`
to both profile dependencies and `dsh.profile.bundles`, then restart Harness.
See [installation details](docs/INSTALL.md).

The desktop sidebar and Braun 3D player rendering were verified on September 30,
2026. Audio playback was not retested during that display repair. Station availability
depends on upstream services. This repository is open source. An npm package has not been published. Code is licensed under GPL-3.0-or-later (see LICENSE).
