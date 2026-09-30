# 安装与接线

本插件是**宿主侧插件**：宿主半边用 `ctx.webServer` 注册自己的路由，并在
`/qiaomu-radio/` 上提供一个完整的独立播放器页面。
浏览器半边（`lib/client.js`）会被 harness 加载并激活（实测 0 error），但它不注册 harness
页面内的 UI 插槽——六套皮肤在插件自己的同源页面上，原因与实测见
[DELIVERY.md §1/§2.5](DELIVERY.md)。

## 1. 构建

```bash
cd qiaomu-radio-dsh
npm install
npm run check            # typecheck + test + build，必须全绿
```

产物：

| 文件 | 用途 |
| --- | --- |
| `lib/index.js` | 宿主半边（ESM，Node 20+），唯一被 harness 加载的入口 |
| `lib/player/app.js` | 播放器页面脚本（React 已内联） |
| `lib/player/styles.css` | 播放器样式（`styles/*.css` 顺序拼接） |
| `lib/player/hls.js` | 懒加载的 hls.js 运行时 |
| `lib/client.js` | harness 客户端半边：`__ModuleLoader__` 注册信封 + `apply`/`inject`，注册侧边栏入口与面板（只依赖 `react`） |
| `lib/types/**` | 宿主半边的类型声明 |

## 2. 安装进 profile

harness 自带 pnpm，直接用绝对路径调用即可（`<harness>` 换成你的安装目录）：

```bash
cd ~/.dsh/profiles/<profile>
node "<harness>/runtime/dependencies/pnpm/bin/pnpm.mjs" add /绝对路径/qiaomu-radio-dsh
```

## 3. 挂载

**两步，不需要手写配置**。本包自带 `cordis.patch.yml` 并在 `package.json` 里声明了
`dsh.bundle.patch`（与 `dsh-plugin-qiaomu-rss`、`dsh-qiaomu-home` 同一官方模式），
所以只要把它列进 profile 的 bundle 列表，加载器就会自动插入这一行。

**① 加依赖**（profile 目录内，用 harness 自带的 pnpm）：

```bash
cd ~/.dsh/profiles/<profile>
node "<harness>/Contents/Resources/runtime/pnpm/bin/pnpm.mjs" add link:/绝对路径/qiaomu-radio-dsh
```

**② 列进 bundle 列表**，编辑 profile 的 `package.json`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@qiaomu/dsh-radio"
      ]
    }
  }
}
```

重启 harness 后生效。

> **为什么不能只靠 profile 的 `cordis.patch.yml`**：那一层只能**按 id 覆盖已有条目**
> （写新 id 会得到 `patch: entry "<id>" not found`），新增插件必须经过 bundle。
> 本包自带 patch 就是为了让用户不必自己造一个本地 bundle 包。

支持的配置项（可选，写在 profile 的 `cordis.patch.yml` 里按 id 覆盖）：

```yaml
- id: qiaomu-radio
  name: "@qiaomu/dsh-radio"
  config:
    catalogTtlMs: 900000
```

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `assetDir` | `lib/player` | 播放器静态资源目录，测试时可覆盖 |
| `catalogTtlMs` | 900000 | 电台目录缓存时长（15 分钟） |
| `streamUrlTtlMs` | 600000 | 单台播放地址缓存时长（10 分钟） |
| `mirrors` | de1/nl1/at1 | Radio Browser 镜像，可按顺序覆盖 |
| `userAgent` | `QiaomuRadio/0.1 …` | 请求 Radio Browser 时使用的 UA |
| `taste` | 内存实现 | 自定义口味存储（实现 `TasteStore`） |

**挂载点不要放在 `/plugins` 下**：harness 的 `dsh-client-modules` 持有整段 `/plugins` 前缀
（它自己的 Bundle 路由，未命中即 404），挂在那里的载体除了精确页面路由会被全部遮蔽。
本插件因此用 `/qiaomu-radio`（`src/host/proxy.ts` 的 `MOUNT_PATH`）。

**前缀注册不要带尾斜杠**：harness 的路由匹配是 `pathname.startsWith(prefix + "/")`，
前缀自带斜杠就只剩 `/qiaomu-radio//app.js` 能命中。代码里已有测试锁死这两点。

## 4. 打开播放器

重启 harness 后，宿主控制台会打印一行：

```
[qiaomu-radio] player served at http://127.0.0.1:<port>/qiaomu-radio/
```

在浏览器打开该地址即可。它是同源的（与 harness 同一个 web 端口），所以
目录请求、播放地址解析、HLS 代理都走同一来源，不受 CORS 限制。

`/qiaomu-radio`（不带斜杠）会 302 跳到带斜杠的地址。
harness 开了浏览器信任校验，直接贴 `http://127.0.0.1:<port>/qiaomu-radio/` 需要带上
`dsh web` 打印的那个 `?token=…`（或用同一浏览器已完成信任的会话）。

## 5. 路由清单

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/qiaomu-radio/` | 播放器页面 |
| GET | `/qiaomu-radio/<asset>` | `app.js`、`styles.css`、`hls.js` |
| GET | `/qiaomu-radio/stream/<urlencoded 上游地址>` | HLS 播放列表与分片代理，播放列表内的 URI 会被重写回同一前缀 |
| GET/POST | `/qiaomu-radio/api/radio/catalog` | 电台目录 |
| GET/POST | `/qiaomu-radio/api/radio/resolve-play` | 解析播放地址 |
| GET/POST | `/qiaomu-radio/api/radio/now-playing` | 正在播放曲目 |

API 既可 GET 查询串调用（`?mood=jazz&source=radio-browser`），也可 POST JSON
（`{"mood":"jazz","source":"radio-browser"}`）。

## 6. 不上 harness 时怎么看界面

```bash
npm run preview      # http://127.0.0.1:4180/
```

预览服务器跑的是**真实的宿主服务**（同一份 `createRadioService`、同一个 HLS 代理），
只是用一个最小 HTTP 载体代替 harness 的 web 服务，并把 `lib/player` 的静态资源
从源码直接打包。界面与装进 harness 后完全一致。

要看生产构建产物（而不是源码预览包）：

```bash
npm run build
node tools/serve-built.mjs 4190     # http://127.0.0.1:4190/qiaomu-radio/
```

## 7. 卸载

```bash
cd ~/.dsh/profiles/<profile>
node "<harness>/runtime/dependencies/pnpm/bin/pnpm.mjs" remove @qiaomu/dsh-radio
```

再从 `cordis.patch.yml` 里删掉那条挂载。