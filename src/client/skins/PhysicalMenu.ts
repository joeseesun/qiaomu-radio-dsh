import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { h } from "../ui";
import type { RadioController } from "../useRadio";
import { renderScreen, useScreen } from "./shared";

/** React stays in charge of navigation; the scene only positions this DOM node. */
export function PhysicalMenu({ controller, target }: { controller: RadioController; target: HTMLElement }): ReactNode {
  const runtime = useScreen(controller);
  useEffect(() => { const screen = runtime.screenRef.current; if (screen) { screen.tabIndex = -1; screen.focus({ preventScroll: true }); } }, [target]);
  useEffect(() => {
    const content = target.querySelector<HTMLElement>(".screen-content");
    if (content) content.scrollTop = 0;
    if (controller.page === "search") target.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [controller.page, target]);
  const close = () => controller.openPage("now");
  return createPortal(h("div", {
    className: "physical-menu",
    onKeyDownCapture: (event: { key: string; preventDefault(): void; stopPropagation(): void }) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    },
  }, renderScreen(controller, {
    ...runtime,
    onKeyDown: event => {
      if ((event.target as HTMLElement).closest("button,input,textarea") && ["Enter", " "].includes(event.key)) return;
      runtime.onKeyDown(event);
    },
  }, { volume: false, trackActions: false }), h("button", {
    type: "button", className: "physical-menu-close", "aria-label": controller.t("support.close"),
    title: controller.t("support.close"), onClick: close,
  }, h("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true },
    h("path", { d: "m6 6 12 12M18 6 6 18" })))), target);
}
