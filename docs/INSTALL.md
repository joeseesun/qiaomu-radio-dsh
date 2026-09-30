# 安装乔木电台

## 正式安装包

从 https://github.com/joeseesun/qiaomu-radio-dsh/releases 下载 `qiaomu-dsh-radio-0.1.1.tgz`。在终端中进入下载目录，选择已有的 Web/Desktop profile（下面使用 web）：

```sh
dsh plugin --profile web add ./qiaomu-dsh-radio-0.1.1.tgz
```

使用桌面 App 的 CLI 时，可先在 App 中安装命令行入口；也可使用对应版本随包提供的 dsh。profile 名称必须对应实际运行的实例，不要把 web 包装成所有桌面安装都通用的 profile 名。

重启对应 Harness，侧栏点「乔木电台」。bundle 自带 cordis.patch.yml，CLI 维护组合顺序，不需要再手动重复添加同一个插件行。

当前未发布 npm 包。直接从 GitHub 获取的源码不含 lib，也没有安装期 prepare；请使用 Release tgz，或按下文开发安装流程构建。

## 已验证兼容范围

macOS Apple Silicon、官方 Desktop 随包 DSH CLI 0.2.0-rc.2；隔离 DSH_HOME 内从 web 模板创建 profile，安装 tgz 后启动真实 DSH Web，验证页面、脚本、CSS、模型与屏内导航。其他平台与版本尚未验证。此版本 API 仍在变化。

## 开发安装

```sh
npm ci
npm run check
npm pack
# 将实际生成的 tgz 安装进独立测试 profile
```

开发预览 `npm run preview` 使用 4180 端口。发布前必须验证 tgz，而不是只验证本地目录链接。

## 页面与网络

页面在同一宿主的 `/qiaomu-radio/`，不在 `/plugins`。独立浏览器访问宿主受保护页面时，按目标 DSH 版本的信任流程操作；不在截图、文档或 issue 中公开 token。

直播需要网络：Radio Browser 目录镜像、选中电台流与 SomaFM 曲目元数据。喜欢、音量和收听历史保存在本机浏览器存储；3D 模型与 HLS 运行时随包提供，不需要第三方 CDN。换 profile/浏览器可能使用不同的本地存储。

## 更新与卸载

下载新版本 tgz，用相同 add 命令更新，重启对应实例。更新前保留自己的 profile 配置；发生问题可重新安装旧版本 tgz。

```sh
dsh plugin --profile web remove @qiaomu/dsh-radio
```

不要为了卸载插件删除整个 profile。浏览器本地收藏数据与软件包卸载是不同操作。
