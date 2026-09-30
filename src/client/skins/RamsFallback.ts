/**
 * `rams` 的回退呈现 — WebGL 不可用时使用。
 *
 * 正常路径是 `src/client/skins/three/ramsScene.ts` 的 three.js 程序化机身。
 * 这里保留原来的 CSS 3D 版本：参考实现自身也有 three.js 失败兜底
 * （`NativeRadio.tsx` 的 `failed && <div className="native-glass native-flat-screen">`），
 * 且 happy-dom 测试环境没有 WebGL，需要一个可渲染的降级路径。
 *
 * The faceplate is a `preserve-3d` stack: shell, drilled speaker grille with two
 * moving cones, inset glass screen, and three machined knobs. The knob maths is
 * the reference maths — `clockwiseArc` + `turnVolume` for the volume arc,
 * `detents` + `TUNING_DETENT` for the tuning dial — and the key travel comes
 * from `stepPressMotion`, written to CSS variables by `usePhysicalMotion`.
 *
 * Geometry is taken from the reference parametric model, expressed as
 * percentages of the 1.9 x 1.0 faceplate.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { clockwiseArc, detents, TUNING_DETENT, turnVolume, volumeAngle } from "../../core/radioGestures";
import { isListPage } from "../pages/types";
import { h, cx } from "../ui";
import { renderDock, renderScreen, useDesignScale, useScreen } from "./shared";
import { usePhysicalMotion } from "./motion";
import type { SkinProps } from "./types";

type KnobAction = "tune" | "volume" | "power";

type Gesture = {
  id: number;
  action: KnobAction;
  lastAngle: number;
  arc: number;
  steps: number;
  moved: boolean;
  startX: number;
  startY: number;
  value: number;
};

const HOME_VIEW = { x: -13, y: -6 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wheelCentre(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function angleAt(element: HTMLElement, clientX: number, clientY: number): number {
  const centre = wheelCentre(element);
  return Math.atan2(clientY - centre.y, clientX - centre.x);
}

export function RamsFallback(props: SkinProps): ReactNode {
  const controller = props.controller;
  const runtime = useScreen(controller);
  useDesignScale(runtime.screenRef, 900);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const tuneRef = useRef<HTMLButtonElement | null>(null);

  const audibleRef = useRef(controller.isPlaying);
  audibleRef.current = controller.isPlaying;
  const volumeRef = useRef(controller.volume);
  volumeRef.current = controller.volume;

  const motion = usePhysicalMotion({
    rootRef,
    actions: ["tune", "volume", "power"],
    speakers: 2,
    reducedMotion: props.reducedMotion,
    audibleRef,
    volumeRef,
  });

  const gesture = useRef<Gesture | null>(null);
  const orbit = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);
  const view = useRef({ ...HOME_VIEW });

  const applyView = useCallback((x: number, y: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--view-x", `${x}deg`);
    stage.style.setProperty("--view-y", `${y}deg`);
  }, []);

  useEffect(() => {
    view.current = { ...HOME_VIEW };
    applyView(HOME_VIEW.x, HOME_VIEW.y);
  }, [applyView, controller.viewEpoch]);

  const tuneBy = useCallback(
    (delta: number) => {
      if (isListPage(controller.page)) {
        controller.moveSelection(delta);
        return;
      }
      if (delta > 0) controller.next();
      else controller.previous();
    },
    [controller],
  );

  const tap = useCallback(
    (action: KnobAction) => {
      if (action === "power") controller.toggle();
      else if (action === "tune") controller.activateSelection();
      else controller.toggleMute();
    },
    [controller],
  );

  const onKnobDown = (action: KnobAction) => (event: PointerEventLike) => {
    const element = event.currentTarget as HTMLElement;
    event.preventDefault?.();
    event.stopPropagation?.();
    element.setPointerCapture?.(event.pointerId);
    motion.hold(action, true);
    gesture.current = {
      id: event.pointerId,
      action,
      lastAngle: angleAt(element, event.clientX, event.clientY),
      arc: 0,
      steps: 0,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      value: controller.volume,
    };
  };

  const onKnobMove = (action: KnobAction) => (event: PointerEventLike) => {
    const active = gesture.current;
    if (!active || active.action !== action) return;
    const element = event.currentTarget as HTMLElement;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 4) {
      active.moved = true;
    }
    if (!active.moved) return;
    event.preventDefault?.();
    const angle = angleAt(element, event.clientX, event.clientY);
    const arc = clockwiseArc(active.lastAngle, angle);
    active.lastAngle = angle;
    if (action === "volume") {
      active.value = turnVolume(active.value, arc);
      controller.setVolume(active.value);
      return;
    }
    if (action !== "tune") return;
    active.arc += arc;
    const steps = detents(active.arc);
    const delta = steps - active.steps;
    if (!delta) return;
    active.steps = steps;
    tuneRef.current?.style.setProperty("--knob-rotation", `${active.arc}rad`);
    tuneBy(delta);
  };

  const onKnobUp = (action: KnobAction) => (event: PointerEventLike) => {
    const active = gesture.current;
    const element = event.currentTarget as HTMLElement;
    element.releasePointerCapture?.(event.pointerId);
    motion.hold(action, false);
    motion.pulse(action);
    gesture.current = null;
    if (active && !active.moved) tap(action);
  };

  /** Keyboard-activated clicks report `detail === 0`; pointer taps are handled above. */
  const onKnobClick = (action: KnobAction) => (event: MouseEventLike) => {
    if (event.detail === 0) {
      motion.pulse(action);
      tap(action);
    }
  };

  const onStageDown = (event: PointerEventLike) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) return;
    stageRef.current?.setPointerCapture?.(event.pointerId);
    orbit.current = { x: event.clientX, y: event.clientY, baseX: view.current.x, baseY: view.current.y };
  };

  const onStageMove = (event: PointerEventLike) => {
    const active = orbit.current;
    if (!active) return;
    event.preventDefault?.();
    view.current = {
      x: clamp(active.baseX - (event.clientY - active.y) * 0.3, -34, 8),
      y: clamp(active.baseY + (event.clientX - active.x) * 0.3, -42, 42),
    };
    applyView(view.current.x, view.current.y);
  };

  const onStageUp = () => {
    orbit.current = null;
  };

  const knob = (
    action: KnobAction,
    label: string,
    extra: Record<string, unknown>,
    ref?: typeof tuneRef,
  ) =>
    h(
      "button",
      {
        type: "button",
        ref,
        "aria-label": label,
        "data-knob": action,
        ...extra,
        onPointerDown: onKnobDown(action),
        onPointerMove: onKnobMove(action),
        onPointerUp: onKnobUp(action),
        onPointerCancel: onKnobUp(action),
        onClick: onKnobClick(action),
      },
    );

  /**
   * Narrow containers would shrink the in-glass screen below legibility, so the
   * interactive screen moves below the device (the reference's flat fallback)
   * and the glass shows a passive hardware readout instead. The two variants
   * carry different classes because only the glass one is absolutely placed
   * inside the faceplate; exactly one of them is ever mounted.
   */
  const screenOptions = { volume: false, trackActions: false, wheel: true } as const;
  const glassScreen = renderScreen(controller, runtime, {
    ...screenOptions,
    className: "rams-glass",
    inner: "rams-glass-inner",
  });
  const screen = props.compact
    ? renderScreen(controller, runtime, { ...screenOptions, className: "rams-flat-screen" })
    : glassScreen;

  return h(
    "section",
    {
      ref: rootRef,
      className: cx(
        "skin-rams",
        "skin-body",
        props.compact && "is-compact",
        controller.exploded && "is-exploded",
      ),
      "aria-label": controller.t("theme.rams"),
    },
    h(
      "div",
      {
        ref: stageRef,
        className: "rams-scene",
        onPointerDown: onStageDown,
        onPointerMove: onStageMove,
        onPointerUp: onStageUp,
        onPointerCancel: onStageUp,
        onPointerLeave: onStageUp,
      },
      h(
        "div",
        { className: "skin-faceplate rams-faceplate" },
        h("div", { className: "rams-shell" }),
        h(
          "div",
          { className: "rams-speaker" },
          h("span", { className: "rams-grille", "aria-hidden": "true" }),
          h("i", { className: "rams-cone", "data-speaker": "0", "aria-hidden": "true" }),
          h("i", { className: "rams-cone", "data-speaker": "1", "aria-hidden": "true" }),
        ),
        props.compact
          ? h(
              "div",
              { className: "rams-readout", "aria-hidden": "true" },
              h("span", null, controller.isPlaying ? controller.t("status.live") : controller.t("status.paused")),
              h("strong", null, controller.current?.name || controller.t("page.menu")),
            )
          : glassScreen,
        h(
          "div",
          { className: "skin-controls rams-controls" },
          knob(
            "tune",
            controller.t("action.select"),
            {
              className: "rams-knob rams-knob-tune",
              style: { "--knob-rotation": "0rad" },
            },
            tuneRef,
          ),
          h("span", { className: "rams-label rams-label-tune", "aria-hidden": "true" }, "TUNING"),
          h(
            "div",
            { className: "rams-scale", "aria-hidden": "true" },
            Array.from({ length: 13 }, (_, index) =>
              h("i", {
                key: index,
                style: { "--angle": `${-135 + index * 22.5}deg` },
              }),
            ),
          ),
          knob("volume", controller.t("action.volume"), {
            className: "rams-knob rams-knob-volume",
            style: { "--knob-rotation": `${volumeAngle(controller.volume)}rad` },
          }),
          h("span", { className: "rams-label rams-label-volume", "aria-hidden": "true" }, "VOLUME"),
          knob("power", controller.isPlaying ? controller.t("action.pause") : controller.t("action.play"), {
            className: "rams-knob rams-knob-power",
          }),
        ),
      ),
    ),
    props.compact ? h("div", { className: "skin-flat-screen rams-flat" }, screen) : null,
    renderDock(controller),
  );
}

type PointerEventLike = {
  currentTarget: unknown;
  target?: unknown;
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

type MouseEventLike = { detail: number };

export { TUNING_DETENT };