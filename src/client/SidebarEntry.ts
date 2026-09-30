/**
 * Sidebar entry rendered in the harness panel list.
 *
 * The host sidebar calls this with `{size, active}` and paints its own active
 * tint; reusing that alias keeps the entry visually identical to its neighbours
 * (`dsh-qiaomu-home`, `qiaomu-reader-dsh`, `dsh-plugin-qiaomu-rss`). The glyph
 * is the existing `RadioIcon` — no new artwork, and `ui.ts` stays the single
 * JSX outlet of the repository.
 */

import type { ReactNode } from "react";

import { RadioIcon } from "./icons";
import { h } from "./ui";

export type SidebarEntryProps = {
  /** Pixel size the host sidebar hands its entries. */
  size?: number | string;
  /** True while this panel is the selected one. */
  active?: boolean;
};

export function RadioSidebarEntry(props: SidebarEntryProps = {}): ReactNode {
  const { size = 18, active = false } = props;
  return h(
    "span",
    {
      "data-radio-sidebar-entry": "1",
      style: {
        color: active ? "var(--dsw-alias-brand-primary)" : "inherit",
        display: "inline-flex",
        alignItems: "center",
      },
    },
    RadioIcon({ size }),
  );
}