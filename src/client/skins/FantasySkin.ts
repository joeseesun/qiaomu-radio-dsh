/**
 * `fantasy` — 魔兽世界 3D。真 three.js 场景（`three/fantasyScene.ts`），
 * 加载参考实现自己的 GLB 模型。
 *
 * 为什么之前是 CSS 3D：本轮之前按"用 CSS 3D 近似 3D"的约定实现，用户看到成品后
 * 指出与参考站差距明显。参考的 `theme === "fantasy"` 实际渲染的是
 * `RamsRadio.tsx` + `qiaomu-fantasy-radio-hyper3d-v2.glb`（真 3D 模型），
 * 所以这里改为同一路线。CSS 版本保留为 WebGL 不可用时的回退（`FantasyFallback.ts`），
 * 参考实现自身也有一条 three.js 失败兜底。
 *
 * 模块表约束在这里不适用：本文件只进宿主提供的播放器页（`lib/player/app.js`），
 * 不进 harness 客户端半边（`lib/client.js` 不引用任何皮肤），所以 three.js 可以正常打包。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FANTASY_MODEL_URL, FANTASY_RUNE_URL } from "../../core/modelAssets";
import { h } from "../ui";
import { FantasyFallback } from "./FantasyFallback";
import { renderScreen, renderTransport, useScreen } from "./shared";
import { mountFantasyScene, type FantasyLines, type FantasySceneHandle } from "./three/fantasyScene";
import type { FantasyAction } from "./three/fantasySurface";
import type { SkinProps } from "./types";

/** WebGL 可用性探测：happy-dom 与无 GPU 的 headless 会走回退路径。 */
function hasWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function FantasySkin(props: SkinProps): ReactNode {
  const controller = props.controller;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FantasySceneHandle | null>(null);
  const [supported] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const runtime = useScreen(controller);

  // 场景只挂载一次，但回调与文案必须是最新的：用可变 ref 而不是闭包快照，
  // 因为引擎在挂载时捕获 options 对象。
  const live = useRef({ controller, reducedMotion: props.reducedMotion });
  live.current = { controller, reducedMotion: props.reducedMotion };

  const labels = useRef<Record<FantasyAction, string>>({
    screen: "",
    power: "",
    previous: "",
    next: "",
    favorite: "",
    volume: "",
  }).current;
  labels.screen = controller.t("action.menu");
  labels.power = controller.isPlaying ? controller.t("action.pause") : controller.t("action.play");
  labels.previous = controller.t("action.previous");
  labels.next = controller.t("action.next");
  labels.favorite = controller.liked ? controller.t("action.unlike") : controller.t("action.like");
  labels.volume = controller.t("action.volume");

  const lines = useMemo<FantasyLines>(() => {
    const current = controller.current;
    const track = controller.track;
    const eyebrow =
      [current?.country, current?.tags[0]].filter(Boolean).join(" · ") || controller.t("status.live");
    const title = track?.title || current?.name || "Qiaomu Radio";
    const artist = track?.artist || current?.tags.slice(0, 3).join(" · ") || "";
    const status = `${controller.isPlaying ? controller.t("status.live") : controller.t("status.paused")} · ${
      controller.t("action.volume")
    } ${Math.round(controller.volume * 100)}%`;
    return [eyebrow, title, artist, status];
  }, [
    controller.current,
    controller.track,
    controller.isPlaying,
    controller.volume,
    controller.locale,
    controller.t,
  ]);

  useEffect(() => {
    if (!supported) return;
    const element = host.current;
    if (!element) return;
    const handle = mountFantasyScene(element, {
      modelUrl: FANTASY_MODEL_URL,
      labels,
      actions: {
        onToggle: () => live.current.controller.toggle(),
        onPrevious: () => live.current.controller.previous(),
        onNext: () => live.current.controller.next(),
        onLike: () => live.current.controller.like(),
        onVolume: (value) => live.current.controller.setVolume(value),
        onScreenMenu: () => setPanel((open) => !open),
      },
      announce: setAnnouncement,
      prefersReducedMotion: () => live.current.reducedMotion,
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
    scene.current?.setLines(lines);
  }, [lines, ready]);

  useEffect(() => {
    scene.current?.setVisual({
      playing: controller.isPlaying,
      liked: controller.liked,
      muted: controller.muted,
      volume: controller.volume,
    });
  }, [ready, controller.isPlaying, controller.liked, controller.muted, controller.volume]);

  // 机内屏幕回到"正在播放"页时收起面板（与参考实现一致）。
  useEffect(() => {
    if (controller.page === "now") setPanel(false);
  }, [controller.page]);

  if (!supported || failed) return h(FantasyFallback, props);

  return h(
    "section",
    {
      className: "skin-fantasy-3d fantasy-experience radio-device device-fantasy",
      "data-fantasy-3d": "1",
      "aria-label": controller.t("theme.fantasy"),
    },
    h("div", { className: "fantasy-view", ref: host, "data-fantasy-view": "1" }),
    !ready
      ? h(
          "div",
          { className: "fantasy-loading", role: "status", "data-fantasy-loading": "1" },
          h("img", { src: FANTASY_RUNE_URL, alt: "", "data-fantasy-rune": "1" }),
          h("span", null, controller.t("status.connecting")),
        )
      : null,
    panel
      ? h(
          "div",
          { className: "fantasy-panel", "data-fantasy-panel": "1" },
          h(
            "button",
            {
              type: "button",
              className: "fantasy-panel-close",
              "aria-label": controller.t("action.back"),
              onClick: () => setPanel(false),
            },
            controller.t("action.back"),
          ),
          renderScreen(controller, runtime),
          renderTransport(controller),
        )
      : null,
    h("span", { className: "native-sr", role: "status" }, announcement),
  );
}