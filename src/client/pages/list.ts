/**
 * Shared row list used by every list screen (menu / channels / regions /
 * stations / favorites / history / language / explore).
 *
 * The markup mirrors the reference `.screen-list`: real `<button>` rows, a
 * `data-selected` marker for the in-device highlight, and `aria-current` so a
 * screen reader announces the same selection the highlight shows.
 */

import type { ReactNode } from "react";
import { CheckIcon, ChevronRightIcon } from "../icons";
import { h } from "../ui";
import type { RadioController } from "../useRadio";
import { pageTitle } from "./titles";
import type { PageRow } from "./types";

/** Copy shown when a list screen has nothing to offer. */
export function emptyCopy(controller: RadioController): string {
  if (controller.isLoading) return controller.t("empty.loading");
  if (controller.page === "favorites") return controller.t("empty.favorites");
  if (controller.page === "history") return controller.t("empty.history");
  return controller.t("empty.stations");
}

/** One selectable row: index label, optional note/accent, trailing affordance. */
export function renderRow(
  controller: RadioController,
  row: PageRow,
  index: number,
): ReactNode {
  const selected = controller.selection === index;
  const leading: ReactNode[] = [];
  if (row.accent) {
    leading.push(h("i", { key: "accent", className: "row-accent", style: { background: row.accent } }));
  }
  if (row.checked) {
    leading.push(h("span", { key: "check", className: "row-check" }, CheckIcon({ size: "1em" })));
  }
  leading.push(
    h(
      "span",
      { key: "main", className: "row-main" },
      h("span", { className: "row-label" }, row.label),
      row.note ? h("em", { className: "row-note" }, row.note) : null,
    ),
  );

  return h(
    "button",
    {
      key: row.id,
      type: "button",
      "data-selected": selected ? "true" : "false",
      "aria-current": selected ? "true" : undefined,
      disabled: row.disabled ? true : undefined,
      onFocus: () => controller.selectRow(index),
      onClick: () => row.action(),
    },
    ...leading,
    row.checked ? null : ChevronRightIcon({ size: "1.1em" }),
  );
}

/** The full list screen body. */
export function renderList(controller: RadioController): ReactNode {
  const rows = controller.rows;
  return h(
    "div",
    {
      className: "screen-list",
      "aria-label": pageTitle(controller.page, controller.t),
    },
    rows.map((row, index) => renderRow(controller, row, index)),
    rows.length ? null : h("p", { className: "device-empty" }, emptyCopy(controller)),
  );
}