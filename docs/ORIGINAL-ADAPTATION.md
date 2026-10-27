# 原版适配记录

候选 0.2.0 对照 Qiaomu Radio 1.2.4，源提交 `450a6692c0dd3498a2ae7cfa6b579bb461fe60a6`。本分支基于 DSH 公开 0.1.1，并保留原工作区已有的四皮肤调整；没有修改原工作区或恢复明确移除的 editorial/console。包名保持 `@qiaomu/dsh-radio`，仓库为 `qiaomu-radio-dsh`。

## 原样复用

- Home provider、协议类型、十语言翻译、更新说明组件和翻译：`src/original/`；仅改 Host 类型和 import 边界。
- 分类目录数据，以及原版 RadioView 的 `renderBrowse`/`filterLabel` 两个方法；适配文件中的原方法片段逐字一致。
- 原更新说明 CSS 和分类面板 CSS；外层作用域隔离，Host 补容器与现有播放器调色板变量。
- 四皮肤、布局、屏内导航和模型沿用既有播放器；没有另画播放器。

`vendor/qiaomu-radio/source.json` 记录文件与片段哈希、上游位置和显式修改。`tests/original.source.test.ts` 逆向恢复 import/type 后校验。原 GPL 与协议 MIT 声明保留；Lucide 图标许可随包附带。

## Host 接线

| 原能力 | Harness 适配 |
| --- | --- |
| Home 继续听与当前播放 | 原 provider 接可选 qiaomuHome 服务；状态/动作经同源、精确 source 的 frame 消息传递 |
| 跨面板继续播放 | 一个延迟创建的 iframe 属于插件激活生命周期；面板卸载只隐藏，插件停用才销毁 |
| 打开、播放/暂停、更新内容命令 | 接 Harness shortcuts；Home 可单独停用 |
| 音量、频道、主题、收藏、历史 | 原有存储键保留；音量/频道增加独立偏好键；异常旧数据先原文备份，备份失败不覆盖 |
| 推荐与分类目录 | 推荐频道进入现有排序/播放；原版分类面板传 tag/country/language，缓存按组合隔离；筛选失败不返回无关备用电台 |
| 更新说明 | 原离线组件、版本去重、自动提示开关和独立 metadata；损坏 metadata 不覆盖 |
| 十语言/auto | 复用原版翻译，auto 保持系统跟随，阿拉伯语 RTL；DSH 独有未译词回退英语 |

## 验证与剩余工作

2026-10-28：`npm run check` 通过 128 项测试、类型检查、生产构建与必需包资产检查。证据为 Node/Happy DOM、注入媒体和网络 fixture。覆盖原源码/CSS、实际组件目录操作、原更新提示、语言恢复、异常数据保留、Home 状态、frame detach/reattach、目录失败与缓存隔离，以及旧播放/路由/四皮肤套件。补充回归验证：重开时首次目录请求使用已恢复的频道，不再错误使用皮肤默认频道；初次加载仍不自动播放。

尚未执行候选版本的 Harness 实际安装、界面或真实播放验收。浏览器由用户使用，不操作浏览器或重启任何日用/QA Harness。需验证四皮肤的深浅色和窄容器、原分类面板位置、iframe 与 Harness 弹层层级、切到 Home 后真实音频不中断、快捷命令、Home 停用、重启后的数据恢复。

仍须核对 Obsidian data.json 的显式导入、原列表内即时筛选与默认频道设置的语义差异；本轮不声称全部迁移已完成。独立网页的存储按浏览器 origin 隔离，不等同于 Obsidian Vault 或任意 Harness profile 共享数据。
