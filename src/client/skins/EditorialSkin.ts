/**
 * `editorial` — the reference 乔木原版 environment: generous whitespace, a
 * serif headline and a single accent-filled play button.
 */

import type { ReactNode } from "react";
import { renderDock, renderNavigation, renderScreen, renderTransport, useScreen } from "./shared";
import type { SkinProps } from "./types";
import { h } from "../ui";

export function EditorialSkin(props: SkinProps): ReactNode {
  const controller = props.controller;
  const runtime = useScreen(controller);
  return h(
    "section",
    {
      className: "skin-editorial skin-body radio-device device-editorial",
      "aria-label": controller.t("theme.editorial"),
    },
    h(
      "div",
      { className: "window-title" },
      h("span", null, "Qiaomu Radio"),
      h("span", null, "LIVE RADIO"),
    ),
    h(
      "div",
      { className: "skin-faceplate" },
      renderNavigation(controller),
      renderScreen(controller, runtime),
      renderTransport(controller),
    ),
    h("div", { className: "device-signature", "aria-hidden": "true" }, "QIAOMU RADIO"),
    renderDock(controller),
  );
}