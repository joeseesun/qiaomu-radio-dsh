# DeepSeek Harness 0.2.2-rc.3 verification

Verified 2026-11-13 (America/Los_Angeles). Product 0.1.6, baseline v0.1.5 / `962bc15640b685dc692f7900af36599245809453`.

The old public tgz is rejected by the unmodified official rc.3 installer in an empty profile. This release explicitly adds only `0.2.2-rc.3` to the existing engines/DSH peers; untested future rc.4 remains rejected. Lock root metadata and bundled product identity are synchronized; the locked dependency graph is unchanged.

Upstream: [official rc.3 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3). The official compatibility evaluator still gives engines.dsh precedence. Reviewed the actual sidebar slot, layout, Typert remote/gateway and tool contracts. The new sidebar.session.action HOC and workspace.picker factory are additive; sidebar.panellist and the existing directory-flow slots remain. The eight products do not own those directory-flow slots or the session archive exporter. Compatibility evaluator, Typert protocol, tools, gateway, remote-access and layout entry match rc.2 byte for byte. RSS tool invocation and native companion are tested on the new host. No exemption is used.

## Verified

- Clean `npm ci`, existing `npm run check`, build and package audit pass.
- Official signed macOS arm64 rc.3 Desktop bundled CLI; signature and exact version rechecked. A separate DSH_HOME/workspace and web profile are used, with no daily-host changes.
- Candidate plugin install, composed configuration, host startup and every packaged installed file compared by size/SHA-256.
- 实际目录加载并选择 MANGORADIO；真实 MP3 直播 readyState=4、无媒体错误、currentTime 从 27.77 秒推进到 181.34 秒；Braun 3D 切换 iPod 后电台保留，收藏与暂停成功。

## Limits and recovery

只验证 macOS arm64 官方 rc.3 Web 宿主、Braun/iPod 和该 MP3 电台；未覆盖所有皮肤、HLS 或物理扬声器听感。 Windows/Linux and older host versions were not rerun; retained older declarations are not new runtime evidence. No production publishing or paid model calls. Existing migration branches and primary-workspace edits are preserved.

Previous version remains available at [the prior release](https://github.com/joeseesun/qiaomu-radio-dsh/releases/tag/v0.1.5). Roll back by installing that tgz with the matching prior host; no data-format migration is introduced. Release assets and the independently downloaded public package are checked separately after merge.
