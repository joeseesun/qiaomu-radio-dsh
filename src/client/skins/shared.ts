/**
 * The parts every skin shares: the screen frame, the navigation strip, the
 * transport, the generic dock and the two environment hooks.
 *
 * The screen markup intentionally matches the reference `.device-screen`
 * structure (`screen-title` / `screen-content` / `track-actions` /
 * `device-volume`) so one stylesheet can dress all six environments.
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  ChevronLeftIcon,
  HeartIcon,
  HistoryIcon,
  InfoIcon,
  ListMusicIcon,
  LoaderIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  SearchIcon,
  SkipBackIcon,
  SkipForwardIcon,
  ThumbsDownIcon,
  VolumeIcon,
} from "../icons";
import { renderPage, pageTitle } from "../pages";
import { isListPage, type RadioPage } from "../pages/types";
import { cx, h } from "../ui";
import type { RadioController } from "../useRadio";

/** True when the host container is narrower than the compact breakpoint. */
export function useCompact(container: HTMLElement | null, breakpoint = 720): boolean {
  const [compact, setCompact] = useState(() =>
    typeof container?.clientWidth === "number" && container.clientWidth > 0
      ? container.clientWidth < breakpoint
      : typeof window !== "undefined"
        ? window.innerWidth < breakpoint
        : false,
  );
  useEffect(() => {
    if (!container || typeof ResizeObserver === "undefined") {
      const onResize = () => setCompact(window.innerWidth < breakpoint);
      window.addEventListener("resize", onResize);
      onResize();
      return () => window.removeEventListener("resize", onResize);
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth;
      setCompact(width < breakpoint);
    });
    observer.observe(container);
    setCompact(container.clientWidth < breakpoint);
    return () => observer.disconnect();
  }, [breakpoint, container]);
  return compact;
}

/**
 * Fit a fixed design surface into a physical glass.
 *
 * The reference projected a 900x250 (Braun) / 780x268 (fantasy) CSS3D element
 * onto the screen opening, so its inner metrics are authored at that size. We
 * keep the same design size and publish `--screen-scale` = renderedWidth /
 * designWidth, which one `transform: scale()` consumes. Nothing else changes,
 * so the inside of the screen keeps the reference's px metrics verbatim.
 */
export function useDesignScale(ref: MutableRefObject<HTMLElement | null>, designWidth: number): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const apply = () => {
      const width = element.clientWidth || element.getBoundingClientRect().width;
      if (width > 0) element.style.setProperty("--screen-scale", (width / designWidth).toFixed(5));
    };
    apply();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", apply);
      return () => window.removeEventListener("resize", apply);
    }
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [designWidth, ref]);
}

/** `prefers-reduced-motion`, live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);
  return reduced;
}

export type ScreenRuntime = {
  screenRef: MutableRefObject<HTMLDivElement | null>;
  onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void;
  onWheel(event: { deltaY: number; preventDefault?: () => void }): void;
};

/** Selection scrolling and the arrow-key contract of the in-device screen. */
export function useScreen(controller: RadioController): ScreenRuntime {
  const screenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = screenRef.current?.querySelector('[data-selected="true"]');
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [controller.page, controller.selection]);

  return {
    screenRef,
    onKeyDown: (event) => {
      const target = event.target as unknown as { tagName?: string } | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key === "Escape") {
        event.preventDefault();
        controller.back();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        controller.moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        controller.moveSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        controller.activateSelection();
      }
    },
    onWheel: (event) => {
      const direction = Math.sign(event.deltaY);
      if (!direction) return;
      event.preventDefault?.();
      if (isListPage(controller.page)) controller.moveSelection(direction);
      else controller.setVolume(Math.max(0, Math.min(1, controller.volume - direction * 0.03)));
    },
  };
}

export function screenStatus(controller: RadioController): string {
  return controller.isLoading
    ? controller.t("status.connecting")
    : controller.isPlaying
      ? controller.t("status.live")
      : controller.t("status.paused");
}

/** Previous / play-pause / next, as used by the flat skins. */
export function renderTransport(controller: RadioController): ReactNode {
  const busy = controller.isLoading;
  return h(
    "div",
    { className: "device-transport skin-controls" },
    h(
      "button",
      { type: "button", "aria-label": controller.t("action.previous"), onClick: () => controller.previous() },
      SkipBackIcon({ size: "1.5em" }),
    ),
    h(
      "button",
      {
        type: "button",
        className: "transport-play",
        "aria-label": controller.isPlaying ? controller.t("action.pause") : controller.t("action.play"),
        onClick: () => controller.toggle(),
      },
      busy
        ? LoaderIcon({ className: "spinner", size: "1.7em" })
        : controller.isPlaying
          ? PauseIcon({ size: "1.7em" })
          : PlayIcon({ size: "1.7em" }),
    ),
    h(
      "button",
      { type: "button", "aria-label": controller.t("action.next"), onClick: () => controller.next() },
      SkipForwardIcon({ size: "1.5em" }),
    ),
  );
}

/** The six page shortcuts shown above the screen. */
export function renderNavigation(controller: RadioController): ReactNode {
  const items: Array<{ id: RadioPage; label: string; icon: ReactNode }> = [
    { id: "now", label: controller.t("page.now"), icon: RadioIcon({ size: "1.25em" }) },
    { id: "channels", label: controller.t("page.channels"), icon: ListMusicIcon({ size: "1.25em" }) },
    { id: "search", label: controller.t("page.search"), icon: SearchIcon({ size: "1.25em" }) },
    { id: "favorites", label: controller.t("page.favorites"), icon: HeartIcon({ size: "1.25em" }) },
    { id: "history", label: controller.t("page.history"), icon: HistoryIcon({ size: "1.25em" }) },
    { id: "info", label: controller.t("page.info"), icon: InfoIcon({ size: "1.25em" }) },
  ];
  return h(
    "div",
    { className: "device-navigation", "aria-label": controller.t("page.menu") },
    items.map((item) =>
      h(
        "button",
        {
          key: item.id,
          type: "button",
          "aria-label": item.label,
          "aria-pressed": controller.page === item.id ? "true" : "false",
          onClick: () => controller.openPage(item.id),
        },
        item.icon,
      ),
    ),
  );
}

/** Like / dislike / list, shown under the now-playing body. */
export function renderTrackActions(controller: RadioController): ReactNode {
  const station = controller.current;
  return h(
    "div",
    { className: "track-actions" },
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.liked ? controller.t("action.unlike") : controller.t("action.like"),
        "aria-pressed": controller.liked ? "true" : "false",
        disabled: station ? undefined : true,
        onClick: () => controller.like(),
      },
      HeartIcon({ size: "1.25em", fill: controller.liked ? "currentColor" : "none" }),
      h("span", null, controller.t("action.like")),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.t("action.dislike"),
        disabled: station ? undefined : true,
        onClick: () => controller.dislike(),
      },
      ThumbsDownIcon({ size: "1.15em" }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.t("action.list"),
        onClick: () => controller.openPage("stations"),
      },
      ListMusicIcon({ size: "1.25em" }),
    ),
  );
}

/** Volume slider row inside the screen frame. */
export function renderVolumeRow(controller: RadioController): ReactNode {
  return h(
    "div",
    { className: "device-volume" },
    h(
      "button",
      {
        type: "button",
        className: "volume-mute",
        "aria-label": controller.t("action.volume"),
        "aria-pressed": controller.muted ? "true" : "false",
        onClick: () => controller.toggleMute(),
      },
      VolumeIcon({ size: "1.1em" }),
    ),
    h("input", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.01,
      value: controller.volume,
      "aria-label": controller.t("action.volume"),
      onChange: (event: { target: { value: string } }) =>
        controller.setVolume(Number(event.target.value)),
    }),
    h("span", null, `${Math.round(controller.volume * 100)}%`),
  );
}

export type ScreenOptions = {
  /** Show the volume row inside the screen (physical skins use their knob). */
  volume?: boolean;
  /** Show the like / dislike / list row on the now screen. */
  trackActions?: boolean;
  /** Winamp-style equaliser bars. */
  spectrum?: boolean;
  className?: string;
  /** Scroll the screen with the wheel (iPod click wheel). */
  wheel?: boolean;
  /**
   * Wrap the whole screen in an extra `.screen-inner` element. The two CSS-3D
   * skins use this to render a fixed 900x250 / 780x268 design surface that one
   * `transform: scale()` fits into the physical glass, mirroring the reference
   * CSS3DRenderer projection.
   */
  inner?: string;
};

/** The `.skin-screen` frame shared by all six skins. */
export function renderScreen(
  controller: RadioController,
  runtime: ScreenRuntime,
  options: ScreenOptions = {},
): ReactNode {
  const status = screenStatus(controller);
  const title = pageTitle(controller.page, controller.t);
  const label =
    controller.page === "now" ? controller.t("action.menu") : controller.t("action.back");
  const parts: ReactNode[] = [
    h(
      "div",
      { className: "screen-title" },
      h(
        "button",
        { type: "button", "aria-label": label, onClick: () => controller.back() },
        controller.page === "now" ? null : ChevronLeftIcon({ size: "1.05em" }),
        h("span", null, title),
        controller.page === "now" ? ChevronLeftIcon({ size: "1.05em", className: "screen-enter" }) : null,
      ),
      h(
        "span",
        { className: "screen-status", "aria-label": status },
        controller.isLoading
          ? LoaderIcon({ className: "spinner", size: "1em" })
          : controller.isPlaying
            ? PlayIcon({ size: "0.95em" })
            : PauseIcon({ size: "0.95em" }),
      ),
    ),
    h("div", { className: "screen-content" }, renderPage(controller, { spectrum: options.spectrum })),
    options.trackActions === false ? null : controller.page === "now" ? renderTrackActions(controller) : null,
    options.volume === false ? null : renderVolumeRow(controller),
  ];
  return h(
    "div",
    {
      className: cx("skin-screen", "device-screen", options.className),
      "data-page": controller.page,
      ref: runtime.screenRef,
      onKeyDown: runtime.onKeyDown,
      onWheel: options.wheel ? runtime.onWheel : undefined,
    },
    options.inner
      ? h("div", { className: cx("screen-inner", options.inner) }, ...parts)
      : parts,
  );
}

/**
 * The generic bar outside the device. The four flat skins already carry a full
 * transport inside their body, so CSS hides the dock for them; the two
 * physical skins rely on it as the accessible companion to their knobs.
 */
export function renderDock(controller: RadioController): ReactNode {
  const station = controller.current;
  return h(
    "div",
    { className: "skin-dock", "aria-label": controller.t("page.menu") },
    h(
      "button",
      { type: "button", "aria-label": controller.t("action.previous"), onClick: () => controller.previous() },
      SkipBackIcon({ size: 16 }),
    ),
    h(
      "button",
      {
        type: "button",
        className: "dock-play",
        "aria-label": controller.isPlaying ? controller.t("action.pause") : controller.t("action.play"),
        onClick: () => controller.toggle(),
      },
      controller.isLoading
        ? LoaderIcon({ className: "spinner", size: 18 })
        : controller.isPlaying
          ? PauseIcon({ size: 18 })
          : PlayIcon({ size: 18 }),
    ),
    h(
      "button",
      { type: "button", "aria-label": controller.t("action.next"), onClick: () => controller.next() },
      SkipForwardIcon({ size: 16 }),
    ),
    h(
      "label",
      { className: "dock-volume" },
      VolumeIcon({ size: 14 }),
      h("input", {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: controller.volume,
        "aria-label": controller.t("action.volume"),
        onChange: (event: { target: { value: string } }) =>
          controller.setVolume(Number(event.target.value)),
      }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.liked ? controller.t("action.unlike") : controller.t("action.like"),
        "aria-pressed": controller.liked ? "true" : "false",
        disabled: station ? undefined : true,
        onClick: () => controller.like(),
      },
      HeartIcon({ size: 16, fill: controller.liked ? "currentColor" : "none" }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.t("action.dislike"),
        disabled: station ? undefined : true,
        onClick: () => controller.dislike(),
      },
      ThumbsDownIcon({ size: 15 }),
    ),
  );
}