# 0.1.1 分发验收

- 源码基线：a1f6c5a（main），不覆盖日用工作区中尚未合并的皮肤/主题钮改动。
- npm run check：13 文件、113 测试通过，类型检查与生产构建成功。
- npm pack：prepack 构建并逐项验证 exports、bundle patch、播放器、HLS 与 GLB；修正 host 类型路径，移除不存在的 client 类型声明。
- DSH CLI 0.2.0-rc.2：独立 DSH_HOME 从 web 模板创建 radio-qa profile，安装 tgz 成功；真实安装为 profile 下独立文件，未链接开发仓库；dump-config 中有 qiaomu-radio。
- 启动实际 DSH Web 4193：页面与 CSS 返回 200；浏览器显示博朗播放器，菜单打开、方向键焦点切换正确。未验证其他操作系统与完整音频长时间播放。
- Topics 已写入并回读：dsh-plugin / deepseek-harness / radio / music。
- 市场：投稿文件与 screenshots.json 已备妥，未提交。Awesome 仓库年龄门槛到 2026-10-01 22:05:45（北京时间）才满足。
- npm 尚未发布，正式渠道为 GitHub Release tgz；不把 metadata 准备等同 npm 发布。
