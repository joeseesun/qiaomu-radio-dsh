/** Localised screen titles, shared by the screen frame and the row lists. */

import type { MessageKey } from "../../core/i18n";
import type { RadioPage } from "./types";

const TITLE_KEYS: Record<RadioPage, MessageKey> = {
  now: "page.now",
  menu: "page.menu",
  channels: "page.channels",
  regions: "page.regions",
  stations: "page.stations",
  favorites: "page.favorites",
  history: "page.history",
  search: "page.search",
  info: "page.info",
  support: "page.support",
  language: "page.language",
  explore: "action.explore",
};

export function pageTitle(page: RadioPage, t: (key: MessageKey) => string): string {
  return t(TITLE_KEYS[page]);
}