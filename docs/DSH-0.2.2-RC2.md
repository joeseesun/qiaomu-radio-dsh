# DeepSeek Harness 0.2.2-rc.2 verification

Verified 2026-11-12 (America/Los_Angeles). Product 0.1.5, baseline v0.1.4 / `c1be1b079dda042c58124dbf610cb673d050e42a`.

The old public tgz is rejected by the unmodified official rc.2 installer in an empty profile. This release explicitly adds only `0.2.2-rc.2` to the existing engines/DSH peers; untested future rc.3 remains rejected. Lock root metadata and bundled product identity are synchronized; the locked dependency graph is unchanged.

Upstream: [official rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2). The official compatibility evaluator still gives engines.dsh precedence. Reviewed the actual sidebar slot, layout, Typert remote/gateway and tool contracts. The sidebar.panellist registration remains supported; these products do not wrap the changed session append API or depend on the old host overlay positioning API. RSS defines tools through defineTool and does not inspect obsolete error categories. No exemption is used.

## Verified

- Clean `npm ci`, existing `npm run check`, build and package audit pass.
- Official signed macOS arm64 rc.2 Desktop bundled CLI; signature and exact version rechecked. A separate DSH_HOME/workspace and web profile are used, with no daily-host changes.
- Candidate plugin install, composed configuration, host startup and every packaged installed file compared by size/SHA-256.
- 真实 Harness 打开 3D 电台与目录，播放 Classic Vinyl HD 公共流，原生 audio 时间从 37.43 秒推进至 71.27 秒，readyState=4、无媒体错误；空格暂停后 paused=true。键盘打开主题菜单切换 iPod，保留电台及暂停状态，并标记喜欢。

## Limits and recovery

只实测一个公开 MP3 流及博朗/iPod 两款皮肤；其余电台、HLS 与全部皮肤未穷举。主题按钮指针点击曾被覆盖层阻挡，键盘入口正常，未把该观察归因 rc.2。 Windows/Linux and older host versions were not rerun; retained older declarations are not new runtime evidence. No production publishing or paid model calls. Existing migration branches and primary-workspace edits are preserved.

Previous version remains available at [the prior release](https://github.com/joeseesun/qiaomu-radio-dsh/releases/tag/v0.1.4). Roll back by installing that tgz with the matching prior host; no data-format migration is introduced. Release assets and the independently downloaded public package are checked separately after merge.
