/**
 * Top-level entry: `mountRadio` / `unmountRadio`.
 *
 * This is the only module that imports `react-dom`; everything below it works
 * with `h()` plus the injected `RadioHost`. The rendered tree starts at
 * `.radio-root` (docs/CONTRACTS.md §5).
 */

import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { I18nProvider } from "../core/i18n";
import type { RadioMountOptions } from "./api";
import { SKINS } from "./skins";
import { useCompact, useReducedMotion } from "./skins/shared";
import { ThemePicker } from "./ThemePicker";
import { cx, h } from "./ui";
import { useRadio } from "./useRadio";

export type RadioMountHandle = {
  /** The element the React tree was mounted into. */
  root: HTMLElement;
  /** Tear this instance down (idempotent). */
  unmount(): void;
};

/** The React surface. Kept separate so the mount entry stays effect-free. */
export function RadioApp(props: {
  options: RadioMountOptions;
  container: HTMLElement | null;
}): ReactNode {
  const controller = useRadio(props.options);
  const compact = useCompact(props.container);
  const reducedMotion = useReducedMotion();
  const Skin = SKINS[controller.themeId];
  const message = controller.error || controller.notice;

  return h(
    "main",
    {
      className: cx("radio-root", "listening-room", `room-${controller.themeId}`),
      "data-theme": controller.themeId,
      "data-state": controller.state,
      "data-compact": compact ? "true" : "false",
      "data-motion": reducedMotion ? "off" : "on",
      "data-presentation": props.options.presentation ?? "page",
      lang: controller.locale,
    },
    h(ThemePicker, { controller }),
    h(
      "div",
      { className: "radio-stage" },
      h(Skin, { controller, compact, reducedMotion }),
    ),
    message
      ? h(
          "div",
          {
            className: cx("radio-notice", controller.error && "has-error"),
            role: controller.error ? "alert" : "status",
            "aria-live": controller.error ? "assertive" : "polite",
          },
          h("span", null, message),
          controller.error
            ? h(
                "button",
                { type: "button", onClick: () => controller.retry() },
                controller.t("action.retry"),
              )
            : null,
        )
      : null,
  );
}

type MountState = { reactRoot: Root; container: HTMLElement; owned: boolean };

let activeMount: MountState | null = null;

/**
 * Render the radio into `container` (or into a fresh `.radio-mount` appended to
 * `document.body` when no container is given).
 */
export function mountRadio(
  options: RadioMountOptions,
  container: HTMLElement | null = null,
): RadioMountHandle {
  const target = container ?? options.container ?? document.createElement("div");
  const owned = !container && !options.container;
  if (owned) {
    target.className = "radio-mount";
    document.body.appendChild(target);
  }

  const reactRoot = createRoot(target);
  const state: MountState = { reactRoot, container: target, owned };
  activeMount = state;
  reactRoot.render(h(I18nProvider, null, h(RadioApp, { options, container: target })));

  let unmounted = false;
  return {
    root: target,
    unmount() {
      if (unmounted) return;
      unmounted = true;
      if (activeMount === state) activeMount = null;
      reactRoot.unmount();
      if (state.owned) target.remove();
    },
  };
}

/** Tear down the most recently mounted surface, if any. */
export function unmountRadio(): void {
  const state = activeMount;
  if (!state) return;
  activeMount = null;
  state.reactRoot.unmount();
  if (state.owned) state.container.remove();
}