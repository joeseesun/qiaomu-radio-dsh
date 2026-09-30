/**
 * Theme picker (`.theme-picker`), rendered inside `.radio-root` above the stage.
 *
 * Mirrors the reference menu: a round palette trigger, a `role="menu"` popover of
 * `menuitemradio` rows, Escape to dismiss, and an "asleep" state that fades the
 * control away until the next pointer or key interaction.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { MessageKey } from "../core/i18n";
import { RADIO_THEMES } from "../core/themes";
import { CheckIcon, PaletteIcon } from "./icons";
import { cx, h } from "./ui";
import type { RadioController } from "./useRadio";

export function ThemePicker(props: { controller: RadioController }): ReactNode {
  const controller = props.controller;
  const [open, setOpen] = useState(false);
  const [awake, setAwake] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setAwake(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAwake(false), 4_000);
    };
    document.addEventListener("pointerdown", wake);
    document.addEventListener("keydown", wake);
    wake();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("pointerdown", wake);
      document.removeEventListener("keydown", wake);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    rootRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return h(
    "div",
    {
      className: cx("theme-picker", open || awake ? "is-awake" : "is-asleep"),
      ref: rootRef,
      onKeyDown,
    },
    h(
      "button",
      {
        type: "button",
        className: "theme-trigger",
        ref: triggerRef,
        "aria-label": controller.t("theme.switch"),
        "aria-haspopup": "menu",
        "aria-expanded": open ? "true" : "false",
        onClick: () => setOpen(!open),
      },
      PaletteIcon({ size: 20, strokeWidth: 1.5 }),
    ),
    open
      ? h(
          "div",
          { className: "theme-popover", role: "menu", "aria-label": controller.t("theme.menu") },
          RADIO_THEMES.map((theme) =>
            h(
              "button",
              {
                key: theme.id,
                type: "button",
                role: "menuitemradio",
                "aria-checked": controller.themeId === theme.id ? "true" : "false",
                onClick: () => {
                  controller.chooseTheme(theme.id);
                  setOpen(false);
                  triggerRef.current?.focus();
                },
              },
              h("span", { className: `theme-dot dot-${theme.id}` }),
              h("span", null, controller.t(`theme.${theme.id}` as MessageKey)),
              controller.themeId === theme.id ? CheckIcon({ size: 15 }) : null,
            ),
          ),
        )
      : null,
  );
}