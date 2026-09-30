/**
 * Screen-inside-the-player pages (docs/CONTRACTS.md §4).
 *
 * All six skins share this exact page set, mirroring the reference iPod
 * navigation in `qiaomu-radio/plugin-src/radio-view.ts`.
 */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";

/** Twelve screens reachable from the in-device navigation. */
export type RadioPage =
  | "now"
  | "menu"
  | "channels"
  | "regions"
  | "stations"
  | "favorites"
  | "history"
  | "search"
  | "info"
  | "support"
  | "language"
  | "explore";

export const PAGE_IDS: RadioPage[] = [
  "now",
  "menu",
  "channels",
  "regions",
  "stations",
  "favorites",
  "history",
  "search",
  "info",
  "support",
  "language",
  "explore",
];

/** One selectable row on a list screen. */
export type PageRow = {
  id: string;
  label: string;
  note?: string;
  /** Small colour chip used by the channels screen. */
  accent?: string;
  /** Renders a leading tick on the language / region screens. */
  checked?: boolean;
  disabled?: boolean;
  action: () => void;
};

/** Pages whose body is a keyboard-navigable row list. */
const LIST_PAGES: RadioPage[] = [
  "menu",
  "channels",
  "regions",
  "stations",
  "favorites",
  "history",
  "language",
  "explore",
];

export function isListPage(page: RadioPage): boolean {
  return LIST_PAGES.includes(page);
}

/** Pages the user reaches through the menu rather than the top navigation. */
export function isSubPage(page: RadioPage): boolean {
  return page !== "now" && page !== "menu";
}

export type PageRender = (controller: RadioController) => ReactNode;