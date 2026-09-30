# 桌面版显示恢复（2026-09-30）

根因：桌面 profile 已通过 link 依赖安装 @qiaomu/dsh-radio，但
`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 缺少该包。
因此宿主和客户端均未激活，侧栏无电台入口，播放器路由返回 404。

修复：备份该 profile 的 package.json 后，将 @qiaomu/dsh-radio 加入 bundles，
重新构建现有源码并重启 DeepSeek Harness。没有修改播放器 UI 或用户数据。

验证：
- `npm run check` 成功：typecheck、10 个测试文件 / 106 项测试、release build 全通过。
- 实际桌面界面 `dsh-app://app/` 出现「乔木电台」侧栏按钮。
- 点击后 iframe `dsh-app://app/qiaomu-radio/` 加载成功，Braun 3D 播放器可见。
- 此次验证显示恢复；没有将其等同于音频播放或六皮肤全状态回归完成。

安装排查要同时检查 dependency 链接与 dsh.profile.bundles；只有 dependency 不会激活插件。
