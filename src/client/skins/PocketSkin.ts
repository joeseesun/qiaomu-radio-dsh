/**
 * `pocket` — the iPod: monochrome screen, engraved shell and a real click wheel
 * with MENU, previous/next, play-pause and a centre select button.
 */

import type { ReactNode } from "react";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "../icons";
import { isListPage } from "../pages/types";
import { h } from "../ui";
import { renderDock, renderScreen, useScreen } from "./shared";
import type { SkinProps } from "./types";

export function PocketSkin(props: SkinProps): ReactNode {
  const controller = props.controller;
  const runtime = useScreen(controller);
  const listPage = isListPage(controller.page);
  const step = (direction: number) => {
    if (listPage) controller.moveSelection(direction);
    else if (direction > 0) controller.next();
    else controller.previous();
  };

  return h(
    "section",
    {
      className: "skin-pocket skin-body radio-device device-pocket",
      "aria-label": "iPod",
    },
    h("div", { className: "device-engraving" }, "iPod"),
    h(
      "div",
      { className: "skin-faceplate" },
      renderScreen(controller, runtime, { wheel: true }),
      h(
        "div",
        {
          className: "skin-controls ipod-wheel",
          onWheel: (event: { deltaY: number; preventDefault?: () => void; stopPropagation?: () => void }) => {
            event.stopPropagation?.();
            runtime.onWheel(event);
          },
          onKeyDown: (event: { key: string; preventDefault?: () => void }) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault?.();
              step(1);
              return;
            }
            if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault?.();
              step(-1);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault?.();
              controller.back();
            }
          },
        },
        h(
          "button",
          {
            type: "button",
            className: "wheel-menu",
            "aria-label": controller.t("page.menu"),
            onClick: () => controller.back(),
          },
          "MENU",
        ),
        h(
          "button",
          {
            type: "button",
            className: "wheel-left",
            "aria-label": controller.t("action.previous"),
            onClick: () => step(-1),
          },
          SkipBackIcon({ size: 22 }),
        ),
        h(
          "button",
          {
            type: "button",
            className: "wheel-right",
            "aria-label": controller.t("action.next"),
            onClick: () => step(1),
          },
          SkipForwardIcon({ size: 22 }),
        ),
        h(
          "button",
          {
            type: "button",
            className: "wheel-bottom",
            "aria-label": controller.isPlaying ? controller.t("action.pause") : controller.t("action.play"),
            onClick: () => controller.toggle(),
          },
          controller.isPlaying ? PauseIcon({ size: 17 }) : PlayIcon({ size: 17 }),
        ),
        h("button", {
          type: "button",
          className: "wheel-center",
          "aria-label": listPage
            ? controller.t("action.select")
            : controller.isPlaying
              ? controller.t("action.pause")
              : controller.t("action.play"),
          onClick: () => controller.activateSelection(),
        }),
      ),
    ),
    h("div", { className: "device-signature", "aria-hidden": "true" }, "THE WORLD IS ON AIR"),
    renderDock(controller),
  );
}