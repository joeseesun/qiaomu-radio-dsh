/**
 * `rams` — 博朗 3D。真 three.js 程序化机身（`three/ramsScene.ts`）。
 *
 * 参考实现里 `theme === "rams"` 渲染的是 `NativeRadio.tsx`，它用 `createRadioModel()`
 * 现场建出整台机身（无外部模型文件），所以这款不需要随包发 GLB——与 fantasy 正好相反。
 *
 * 与参考一致的两处标志性做法：屏幕是**真 HTML 经 CSS3DRenderer 投影进 3D 机身**，
 * 以及**拆解视图**（`parts` 沿各自的 offset 散开）。
 *
 * CSS 版本保留为 WebGL 不可用时的回退（`RamsFallback.ts`）。
 * 本文件只进宿主提供的播放器页，不进 harness 客户端半边，所以 three.js 可以正常打包。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { h } from "../ui";
import { RamsFallback } from "./RamsFallback";
import { renderScreen, renderTransport, useScreen } from "./shared";
import { mountRamsScene, type RamsSceneHandle, type RamsScreen } from "./three/ramsScene";
import type { SkinProps } from "./types";

function hasWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function RamsSkin(props: SkinProps): ReactNode {
  const controller = props.controller;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<RamsSceneHandle | null>(null);
  const [supported] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const runtime = useScreen(controller);

  const live = useRef({ controller, reducedMotion: props.reducedMotion });
  live.current = { controller, reducedMotion: props.reducedMotion };

  const labels = useRef({ screen: "", power: "", volume: "", canvas: "" }).current;
  labels.screen = controller.t("action.menu");
  labels.power = controller.isPlaying ? controller.t("action.pause") : controller.t("action.play");
  labels.volume = controller.t("action.volume");
  labels.canvas = `${controller.t("theme.rams")}：${controller.t("action.menu")}`;

  const screen = useMemo<RamsScreen>(() => {
    const current = controller.current;
    const track = controller.track;
    const status = controller.error
      ? controller.error
      : controller.notice || (controller.isLoading ? controller.t("status.connecting") : controller.isPlaying ? "● ON AIR" : "Ⅱ STANDBY");
    return {
      eyebrow: current?.country || controller.t("status.live"),
      title: track?.title || current?.name || "QIAOMU / RADIO",
      subtitle: track?.artist || current?.tags.slice(0, 3).join(" · ") || "",
      status: `${status}　${controller.liked ? "♥" : ""}`,
    };
  }, [
    controller.current,
    controller.track,
    controller.error,
    controller.notice,
    controller.isLoading,
    controller.isPlaying,
    controller.liked,
    controller.locale,
    controller.t,
  ]);

  useEffect(() => {
    if (!supported) return;
    const element = host.current;
    if (!element) return;
    const handle = mountRamsScene(element, {
      labels,
      actions: {
        onToggle: () => live.current.controller.toggle(),
        // 参考的调台旋钮走的是 `p.stations` 列表；这里走控制器的 next/previous，
        // 因为本仓库的契约要求皮肤的所有动作都经过控制器（docs/CONTRACTS.md §4），
        // 皮肤自己遍历列表会绕过控制器的队列/口味逻辑。
        onTune: (delta) => (delta > 0 ? live.current.controller.next() : live.current.controller.previous()),
        onVolume: (value) => live.current.controller.setVolume(value),
        onMuteToggle: () => live.current.controller.toggleMute(),
        onScreenMenu: () => setPanel((open) => !open),
      },
      announce: setAnnouncement,
      prefersReducedMotion: () => live.current.reducedMotion,
      onReset: () => setExploded(false),
      onReady: () => setReady(true),
      onFail: () => setFailed(true),
    });
    if (!handle) {
      setFailed(true);
      return;
    }
    scene.current = handle;
    return () => {
      handle.dispose();
      scene.current = null;
    };
  }, [supported, labels]);

  useEffect(() => {
    scene.current?.setScreen(screen);
  }, [screen, ready]);

  useEffect(() => {
    scene.current?.setVisual({
      playing: controller.isPlaying,
      muted: controller.muted,
      volume: controller.volume,
    });
  }, [ready, controller.isPlaying, controller.muted, controller.volume]);

  // 拆解视图是参考的独立动作（不是翻页触发的），所以用面板里的按钮驱动。
  useEffect(() => {
    scene.current?.explode(exploded);
  }, [exploded, ready]);

  useEffect(() => {
    if (controller.page === "now") setPanel(false);
  }, [controller.page]);

  if (!supported || failed) return h(RamsFallback, props);

  return h(
    "section",
    {
      className: "skin-rams-3d native-radio radio-device device-rams",
      "data-rams-3d": "1",
      "data-exploded": exploded ? "true" : "false",
      "aria-label": controller.t("theme.rams"),
    },
    h("div", { className: "native-stage", ref: host, "data-rams-stage": "1" }),
    !ready
      ? h("div", { className: "native-loading", role: "status", "data-rams-loading": "1" })
      : null,
    panel
      ? h(
          "div",
          { className: "native-panel", "data-rams-panel": "1" },
          h(
            "div",
            { className: "native-panel-head" },
            h(
              "button",
              {
                type: "button",
                className: "native-panel-action",
                "data-rams-explode": "1",
                "aria-pressed": exploded ? "true" : "false",
                onClick: () => setExploded((value) => !value),
              },
              exploded ? controller.t("action.collapse") : controller.t("action.explode"),
            ),
            h(
              "button",
              {
                type: "button",
                className: "native-panel-action",
                "aria-label": controller.t("action.back"),
                onClick: () => setPanel(false),
              },
              controller.t("action.back"),
            ),
          ),
          renderScreen(controller, runtime),
          renderTransport(controller),
        )
      : null,
    h("span", { className: "native-sr", role: "status" }, announcement),
  );
}