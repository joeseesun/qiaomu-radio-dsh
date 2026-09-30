/**
 * The screen registry: what each page renders, and which rows it offers.
 *
 * `rowsForPage` is deliberately part of the controller input rather than the
 * skins' local state: every skin shares one navigation model, so the iPod wheel,
 * the Braun tuning knob and the foobar2000 tab strip all move through the same
 * list. `renderPage` is the body renderer used inside `.skin-screen`.
 */

import { LOCALE_LABELS, LOCALES, regionName } from "../../core/i18n";
import { RADIO_REGIONS } from "../../core/regions";
import type { Station } from "../../core/types";
import { h } from "../ui";
import type { RadioController } from "../useRadio";
import { renderChannels } from "./channels";
import { renderExplore } from "./explore";
import { renderFavorites } from "./favorites";
import { renderHistory } from "./history";
import { renderInfo } from "./info";
import { renderLanguage } from "./language";
import { renderMenu } from "./menu";
import { renderNow, type NowOptions } from "./now";
import { renderRegions } from "./regions";
import { renderSearch } from "./search";
import { renderStations } from "./stations";
import { SupportPanel } from "./support";
import type { PageRow } from "./types";

export {
  PAGE_IDS,
  isListPage,
  isSubPage,
  type PageRow,
  type RadioPage,
} from "./types";
export { pageTitle } from "./titles";
export { SEARCH_INPUT_ID } from "./search";

/** Every station this device already knows about, newest first. */
function knownStations(controller: RadioController): Station[] {
  const merged = new Map<string, Station>();
  for (const entry of controller.profile.history) merged.set(entry.station.id, entry.station);
  for (const station of controller.stations) merged.set(station.id, station);
  if (controller.current) merged.set(controller.current.id, controller.current);
  return [...merged.values()];
}

function stationRow(
  controller: RadioController,
  station: Station,
  index: number,
  prefix?: string,
): PageRow {
  const region = regionName(controller.locale, station.countryCode, station.country);
  const serial = prefix ?? String(index + 1).padStart(2, "0");
  return {
    id: station.id,
    label: station.name,
    note: `${serial} · ${region} · ${station.codec || "LIVE"}`,
    action: () => {
      controller.play(station);
      controller.openPage("now");
    },
  };
}

/** Rows for the active page. Empty on the non-list screens. */
export function rowsForPage(controller: RadioController): PageRow[] {
  const { t, locale, profile } = controller;
  switch (controller.page) {
    case "menu":
      return [
        { id: "now", label: t("page.now"), action: () => controller.openPage("now") },
        { id: "channels", label: t("page.channels"), action: () => controller.openPage("channels") },
        { id: "regions", label: t("page.regions"), action: () => controller.openPage("regions") },
        { id: "stations", label: t("page.stations"), action: () => controller.openPage("stations") },
        { id: "search", label: t("page.search"), action: () => controller.openPage("search") },
        { id: "favorites", label: t("page.favorites"), action: () => controller.openPage("favorites") },
        { id: "history", label: t("page.history"), action: () => controller.openPage("history") },
        { id: "language", label: t("page.language"), action: () => controller.openPage("language") },
        { id: "explore", label: t("action.explore"), action: () => controller.openPage("explore") },
        { id: "support", label: t("page.support"), action: () => controller.openPage("support") },
        { id: "info", label: t("page.info"), action: () => controller.openPage("info") },
      ];
    case "channels":
      return [
        {
          id: "global",
          label: t("search.global"),
          note: t("live.radio"),
          action: () => {
            controller.chooseSource("global-curated", false);
            controller.openPage("stations");
          },
        },
        ...controller.moods.map<PageRow>((mood) => ({
          id: mood.id,
          label: mood.label,
          note: mood.note,
          accent: mood.accent,
          action: () => {
            controller.chooseMood(mood.id, false);
            controller.openPage("stations");
          },
        })),
        {
          id: "china",
          label: t("search.china"),
          action: () => {
            controller.chooseSource("china-curated", false);
            controller.openPage("stations");
          },
        },
      ];
    case "regions":
      return [
        {
          id: "auto",
          label: t("region.auto"),
          checked: !profile.preferredCountryCode,
          action: () => {
            controller.chooseRegion(null, false);
            controller.openPage("stations");
          },
        },
        ...RADIO_REGIONS.map<PageRow>((code) => ({
          id: code,
          label: regionName(locale, code, code),
          note: code,
          checked: profile.preferredCountryCode === code,
          action: () => {
            controller.chooseRegion(code, false);
            controller.openPage("stations");
          },
        })),
      ];
    case "language":
      return LOCALES.map<PageRow>((item) => ({
        id: item,
        label: LOCALE_LABELS[item],
        checked: item === locale,
        action: () => {
          controller.setLocale(item);
          controller.openPage("menu");
        },
      }));
    case "stations":
      return controller.stations.map((station, index) => stationRow(controller, station, index));
    case "favorites":
      return knownStations(controller)
        .filter((station) => profile.likedStationIds.includes(station.id))
        .map((station, index) => stationRow(controller, station, index, "♥"));
    case "history":
      return profile.history
        .map((entry) => entry.station)
        .map((station, index) => stationRow(controller, station, index));
    case "explore":
      return [
        {
          id: "explode",
          label: controller.exploded ? t("action.collapse") : t("action.explode"),
          note: "CSS 3D",
          action: () => controller.toggleExplode(),
        },
        {
          id: "reset",
          label: t("action.restore"),
          action: () => {
            controller.resetView();
            controller.openPage("now");
          },
        },
        { id: "back", label: t("action.back"), action: () => controller.openPage("menu") },
      ];
    default:
      return [];
  }
}

/** The body of the active screen, shared by all six skins. */
export function renderPage(controller: RadioController, options: NowOptions = {}) {
  switch (controller.page) {
    case "now":
      return renderNow(controller, options);
    case "menu":
      return renderMenu(controller);
    case "channels":
      return renderChannels(controller);
    case "regions":
      return renderRegions(controller);
    case "stations":
      return renderStations(controller);
    case "favorites":
      return renderFavorites(controller);
    case "history":
      return renderHistory(controller);
    case "search":
      return renderSearch(controller);
    case "info":
      return renderInfo(controller);
    case "support":
      return h(SupportPanel, { controller });
    case "language":
      return renderLanguage(controller);
    case "explore":
      return renderExplore(controller);
    default:
      return null;
  }
}