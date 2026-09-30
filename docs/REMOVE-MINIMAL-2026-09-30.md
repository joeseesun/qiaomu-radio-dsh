# 移除 Minimal（极简）

- 删除主题目录、类型与渲染注册表中的 editorial，并移除 EditorialSkin 实现。
- 历史 editorial 设置、初始化参数及 URL 迁移为 rams；设置在加载后保存。
- README 与包说明更新为五款皮肤；历史交付记录保留当时的六款基线。

验证：`npm run check` 通过（12 个测试文件、111 项测试，含迁移保存回归）。`npm run preview` 中旧 `?theme=editorial` 链接显示博朗；打开菜单仅有魔兽、博朗、iPod、Winamp、foobar2000。五款皮肤在浅色、深色 1440×900 与窄屏 640×900 共15个组合已实际截图检查。
