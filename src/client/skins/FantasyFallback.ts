/**
 * `fantasy` 的回退呈现 — WebGL 不可用时使用。
 *
 * 正常路径是 `src/client/skins/three/fantasyScene.ts` 的 three.js 场景（真 3D 模型）。
 * 这里保留原来的 CSS 3D 版本，因为参考实现自身也有一条 three.js 失败兜底
 * （`RamsRadio.tsx` 的 `failed && <div className="fantasy-glass fantasy-flat-screen">`），
 * 而且 happy-dom 测试环境没有 WebGL，需要一个可渲染的降级路径。
 *
 * Cast-metal shell, two speaker horns whose cones breathe with playback, and the
 * reference's five round controls (previous / power / next / favourite / volume)
 * at the reference's own normalised positions. Speaker travel and key depth come
 * from `fantasySpeakerMotion` and `radioPressFeedback` through the shared
 * `usePhysicalMotion` runtime; the volume ring uses `turnVolume`.
 */

import { useCallback, useRef, type ReactNode } from "react";
import { clockwiseArc, turnVolume, volumeAngle } from "../../core/radioGestures";
import { HeartIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, VolumeIcon } from "../icons";
import { cx, h } from "../ui";
import { renderDock, renderScreen, useDesignScale, useScreen } from "./shared";
import { usePhysicalMotion } from "./motion";
import type { SkinProps } from "./types";

type FantasyAction = "previous" | "power" | "next" | "favorite" | "volume";

type Gesture = {
  action: FantasyAction;
  lastAngle: number;
  moved: boolean;
  startX: number;
  startY: number;
  value: number;
};

type PointerEventLike = {
  currentTarget: unknown;
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

function angleAt(element: HTMLElement, clientX: number, clientY: number): number {
  const rect = element.getBoundingClientRect();
  return Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2));
}

export function FantasyFallback(props: SkinProps): ReactNode {
  const controller = props.controller;
  const runtime = useScreen(controller);
  useDesignScale(runtime.screenRef, 780);
  const rootRef = useRef<HTMLElement | null>(null);

  const audibleRef = useRef(controller.isPlaying);
  audibleRef.current = controller.isPlaying;
  const volumeRef = useRef(controller.volume);
  volumeRef.current = controller.volume;

  const motion = usePhysicalMotion({
    rootRef,
    actions: ["previous", "power", "next", "favorite", "volume"],
    speakers: 2,
    reducedMotion: props.reducedMotion,
    audibleRef,
    volumeRef,
  });

  const gesture = useRef<Gesture | null>(null);

  const tap = useCallback(
    (action: FantasyAction) => {
      if (action === "previous") controller.previous();
      else if (action === "next") controller.next();
      else if (action === "power") controller.toggle();
      else if (action === "favorite") controller.like();
      else controller.toggleMute();
    },
    [controller],
  );

  const onDown = (action: FantasyAction) => (event: PointerEventLike) => {
    const element = event.currentTarget as HTMLElement;
    event.preventDefault?.();
    event.stopPropagation?.();
    element.setPointerCapture?.(event.pointerId);
    motion.hold(action, true);
    gesture.current = {
      action,
      lastAngle: angleAt(element, event.clientX, event.clientY),
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      value: controller.volume,
    };
  };

  const onMove = (action: FantasyAction) => (event: PointerEventLike) => {
    const active = gesture.current;
    if (!active || active.action !== action) return;
    const element = event.currentTarget as HTMLElement;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 4) {
      active.moved = true;
    }
    if (!active.moved) return;
    if (action !== "volume") return;
    event.preventDefault?.();
    const angle = angleAt(element, event.clientX, event.clientY);
    active.value = turnVolume(active.value, clockwiseArc(active.lastAngle, angle));
    active.lastAngle = angle;
    controller.setVolume(active.value);
  };

  const onUp = (action: FantasyAction) => (event: PointerEventLike) => {
    const active = gesture.current;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    motion.hold(action, false);
    motion.pulse(action);
    gesture.current = null;
    if (active && active.action === action && !active.moved) tap(action);
  };

  const onActivate = (action: FantasyAction) => (event: { detail: number }) => {
    if (event.detail === 0) {
      motion.pulse(action);
      tap(action);
    }
  };

  const roundButton = (
    action: FantasyAction,
    label: string,
    icon: ReactNode,
    pressed?: boolean,
  ) =>
    h(
      "button",
      {
        type: "button",
        className: `fantasy-knob fantasy-knob-${action}`,
        "aria-label": label,
        "aria-pressed": pressed === undefined ? undefined : pressed ? "true" : "false",
        onPointerDown: onDown(action),
        onPointerMove: onMove(action),
        onPointerUp: onUp(action),
        onPointerCancel: onUp(action),
        onClick: onActivate(action),
      },
      h("span", { className: "fantasy-knob-ring", "aria-hidden": "true" }),
      icon,
    );

  /**
   * Narrow containers get the flat screen below the console instead of the
   * glass; only the glass variant may carry the absolutely positioned class.
   */
  const screen = renderScreen(
    controller,
    runtime,
    props.compact
      ? { className: "fantasy-flat-screen", spectrum: false }
      : { className: "fantasy-glass", inner: "fantasy-glass-inner", spectrum: false },
  );

  return h(
    "section",
    {
      ref: rootRef,
      className: cx(
        "skin-fantasy",
        "skin-body",
        props.compact && "is-compact",
        controller.exploded && "is-exploded",
      ),
      "aria-label": controller.t("theme.fantasy"),
    },
    h(
      "div",
      { className: "fantasy-scene" },
      h(
        "div",
        { className: "skin-faceplate fantasy-faceplate" },
        h("div", { className: "fantasy-shell" }),
        h("div", { className: "fantasy-glow", "aria-hidden": "true" }),
        h(
          "div",
          { className: "fantasy-speaker fantasy-speaker-left", "aria-hidden": "true" },
          h("i", { className: "fantasy-cone" }),
          h("i", { className: "fantasy-cone fantasy-cone-inner" }),
        ),
        h(
          "div",
          { className: "fantasy-speaker fantasy-speaker-right", "aria-hidden": "true" },
          h("i", { className: "fantasy-cone" }),
          h("i", { className: "fantasy-cone fantasy-cone-inner" }),
        ),
        props.compact
          ? h(
              "div",
              { className: "fantasy-readout", "aria-hidden": "true" },
              h("span", null, controller.isPlaying ? controller.t("status.live") : controller.t("status.paused")),
              h("strong", null, controller.current?.name || controller.t("page.menu")),
            )
          : screen,
        h(
          "div",
          { className: "skin-controls fantasy-controls" },
          roundButton("previous", controller.t("action.previous"), SkipBackIcon({ size: 18 })),
          roundButton(
            "power",
            controller.isPlaying ? controller.t("action.pause") : controller.t("action.play"),
            controller.isPlaying ? PauseIcon({ size: 20 }) : PlayIcon({ size: 20 }),
          ),
          roundButton("next", controller.t("action.next"), SkipForwardIcon({ size: 18 })),
          roundButton("favorite", controller.liked ? controller.t("action.unlike") : controller.t("action.like"), HeartIcon({ size: 17, fill: controller.liked ? "currentColor" : "none" }), controller.liked),
          h(
            "button",
            {
              type: "button",
              className: "fantasy-knob fantasy-knob-volume",
              "aria-label": controller.t("action.volume"),
              style: { "--knob-rotation": `${volumeAngle(controller.volume)}rad` },
              onPointerDown: onDown("volume"),
              onPointerMove: onMove("volume"),
              onPointerUp: onUp("volume"),
              onPointerCancel: onUp("volume"),
              onClick: onActivate("volume"),
            },
            h("span", { className: "fantasy-knob-ring", "aria-hidden": "true" }),
            VolumeIcon({ size: 18 }),
          ),
        ),
      ),
    ),
    props.compact ? h("div", { className: "skin-flat-screen fantasy-flat" }, screen) : null,
    renderDock(controller),
  );
}