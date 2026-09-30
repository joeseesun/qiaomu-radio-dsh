/** `now` — the station on air, its now-playing track and the signal state. */

import type { ReactNode } from "react";
import { regionName } from "../../core/i18n";
import { h } from "../ui";
import type { RadioController } from "../useRadio";

export type NowOptions = {
  /** Winamp-style equaliser bars under the track line. */
  spectrum?: boolean;
  bars?: number;
};

export function renderNow(controller: RadioController, options: NowOptions = {}): ReactNode {
  const station = controller.current;
  const track = controller.track;
  const status = controller.isLoading
    ? controller.t("status.connecting")
    : controller.isPlaying
      ? controller.t("status.live")
      : controller.t("status.paused");
  const bars = options.bars ?? 28;

  const tags = track
    ? `${track.artist} · ${station?.name ?? ""}`
    : station
      ? `${station.tags.slice(0, 3).join(" · ")} · ${controller.t("live.radio")}`
      : controller.t("now.prompt");

  return h(
    "div",
    { className: "now-playing" },
    h(
      "div",
      { className: "now-country" },
      station ? regionName(controller.locale, station.countryCode, station.country) : "WORLD RADIO",
      h("span", null, station?.codec || ""),
    ),
    h("h1", null, track?.title || station?.name || controller.t("now.title")),
    h("p", { className: "now-tags" }, tags),
    options.spectrum
      ? h(
          "div",
          { className: `spectrum ${controller.isPlaying ? "active" : ""}`, "aria-hidden": "true" },
          Array.from({ length: bars }, (_, index) =>
            h("i", {
              key: index,
              style: {
                "--level": `${20 + ((index * 37) % 75)}%`,
                "--delay": `${index * -0.13}s`,
              },
            }),
          ),
        )
      : null,
    h(
      "div",
      { className: "now-bottom" },
      h(
        "span",
        { className: "signal-state" },
        h("i", { className: controller.isPlaying ? "live" : "" }),
        status,
      ),
      h("span", null, station?.bitrate ? `${station.bitrate} kbps` : "LIVE RADIO"),
    ),
  );
}