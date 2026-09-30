/**
 * `deck` (Winamp) and `console` (foobar2000) — the two period-correct desktop
 * players. Both keep the reference layout: a title strip, a control block, a real
 * station list, and a status line. The screen panel is reused for every page
 * that is not the playlist.
 */

import { useEffect, useState, type ReactNode } from "react";
import { regionName } from "../../core/i18n";
import {
  HeartIcon,
  ListMusicIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  SearchIcon,
  SkipBackIcon,
  SkipForwardIcon,
  StopIcon,
  ThumbsDownIcon,
  VolumeIcon,
} from "../icons";
import { h } from "../ui";
import { renderDock, renderScreen, useScreen, type ScreenRuntime } from "./shared";
import type { SkinProps } from "./types";
import type { RadioController } from "../useRadio";

export type ClassicVariant = "deck" | "console";

function classicTransport(controller: RadioController): ReactNode {
  const station = controller.current;
  return h(
    "div",
    { className: "classic-transport skin-controls" },
    h(
      "button",
      { type: "button", "aria-label": controller.t("action.previous"), onClick: () => controller.previous() },
      SkipBackIcon({ size: "1.4em" }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.isPlaying ? controller.t("action.pause") : controller.t("action.play"),
        onClick: () => controller.toggle(),
      },
      controller.isPlaying ? PauseIcon({ size: "1.4em" }) : PlayIcon({ size: "1.4em" }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.t("action.stop"),
        onClick: () => {
          if (controller.isPlaying || controller.isLoading) controller.toggle();
        },
      },
      StopIcon({ size: "1.3em" }),
    ),
    h(
      "button",
      { type: "button", "aria-label": controller.t("action.next"), onClick: () => controller.next() },
      SkipForwardIcon({ size: "1.4em" }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.liked ? controller.t("action.unlike") : controller.t("action.like"),
        "aria-pressed": controller.liked ? "true" : "false",
        disabled: station ? undefined : true,
        onClick: () => controller.like(),
      },
      HeartIcon({ size: "1.3em", fill: controller.liked ? "currentColor" : "none" }),
    ),
    h(
      "button",
      {
        type: "button",
        "aria-label": controller.t("action.dislike"),
        disabled: station ? undefined : true,
        onClick: () => controller.dislike(),
      },
      ThumbsDownIcon({ size: "1.2em" }),
    ),
  );
}

function classicVolume(controller: RadioController): ReactNode {
  return h(
    "label",
    { className: "classic-volume" },
    VolumeIcon({ size: "1.15em" }),
    h("input", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.01,
      value: controller.volume,
      "aria-label": controller.t("action.volume"),
      onChange: (event: { target: { value: string } }) =>
        controller.setVolume(Number(event.target.value)),
    }),
  );
}

function classicSpectrum(controller: RadioController, bars: number): ReactNode {
  return h(
    "div",
    { className: `classic-spectrum ${controller.isPlaying ? "active" : ""}`, "aria-hidden": "true" },
    Array.from({ length: bars }, (_, index) =>
      h("i", {
        key: index,
        style: {
          "--level": `${15 + ((index * 17) % 70)}%`,
          "--delay": `${index * -0.08}s`,
        },
      }),
    ),
  );
}

/** The station list window shared by both desktop players. */
function playlist(controller: RadioController, runtime: ScreenRuntime): ReactNode {
  const stations = [
    ...(controller.current ? [controller.current] : []),
    ...controller.stations.filter((station) => station.id !== controller.current?.id),
  ].slice(0, 50);
  return h(
    "div",
    {
      // The playlist IS this skin's screen, so it keeps the contract element.
      className: "skin-screen device-screen classic-playlist",
      "data-page": controller.page,
      ref: runtime.screenRef,
      onKeyDown: runtime.onKeyDown,
    },
    h(
      "div",
      { className: "playlist-columns" },
      h("span", null, "#"),
      h("span", null, controller.t("label.station")),
      h("span", null, controller.t("label.region")),
      h("span", null, controller.t("label.format")),
    ),
    h(
      "div",
      { className: "playlist-scroll" },
      stations.map((station, index) =>
        h(
          "button",
          {
            key: station.id,
            type: "button",
            className: controller.current?.id === station.id ? "current-row" : undefined,
            "aria-current": controller.current?.id === station.id ? "true" : undefined,
            onClick: () => {
              controller.play(station);
              controller.openPage("now");
            },
          },
          h(
            "span",
            null,
            index === 0 && controller.isPlaying
              ? PlayIcon({ size: "1em" })
              : String(index + 1).padStart(2, "0"),
          ),
          h("span", null, station.name),
          h("span", null, regionName(controller.locale, station.countryCode, station.country)),
          h("span", null, station.codec || "LIVE"),
        ),
      ),
      stations.length
        ? null
        : h(
            "button",
            {
              type: "button",
              className: "playlist-empty",
              onClick: () => controller.openPage("channels"),
            },
            controller.isLoading ? controller.t("empty.loading") : controller.t("empty.stations"),
          ),
    ),
  );
}

function classicStatus(controller: RadioController, time: string): ReactNode {
  const state = controller.isLoading
    ? controller.t("status.connecting")
    : controller.isPlaying
      ? `${controller.current?.codec || "LIVE"} · ${controller.track ? controller.track.title : controller.t("status.broadcast")}`
      : controller.t("status.stopped");
  return h(
    "div",
    { className: "classic-status" },
    h("span", null, state),
    h("span", null, `${time} · ${Math.round(controller.volume * 100)}%`),
  );
}

export function ClassicSkin(props: SkinProps & { variant: ClassicVariant }): ReactNode {
  const controller = props.controller;
  const runtime = useScreen(controller);
  const amp = props.variant === "deck";
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
  }, [controller.current?.id]);

  useEffect(() => {
    if (!controller.isPlaying) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [controller.isPlaying]);

  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const trackLine = controller.track
    ? `${controller.track.artist} – ${controller.track.title}`
    : controller.current?.name || "QIAOMU RADIO";
  const panel =
    controller.page === "now"
      ? playlist(controller, runtime)
      : renderScreen(controller, runtime, { className: "classic-panel", spectrum: true });

  if (amp) {
    return h(
      "section",
      { className: "skin-deck skin-body classic-amp", "aria-label": controller.t("theme.deck") },
      h(
        "div",
        { className: "classic-title" },
        h("span", null, RadioIcon({ size: "1.1em" })),
        h("strong", null, "WINAMP"),
        h(
          "button",
          {
            type: "button",
            "aria-label": controller.t("action.about"),
            onClick: () => controller.openPage("info"),
          },
          "···",
        ),
      ),
      h(
        "div",
        { className: "skin-faceplate amp-main" },
        h(
          "div",
          { className: "amp-led" },
          h("span", { className: "amp-led-time" }, controller.isLoading ? "··:··" : time),
          classicSpectrum(controller, 24),
        ),
        h(
          "div",
          { className: "amp-info" },
          h("div", { className: "amp-track" }, trackLine),
          h(
            "div",
            { className: "amp-codec" },
            h("b", null, controller.current?.bitrate || "—"),
            " kbps ",
            h("b", null, controller.current?.codec || "LIVE"),
          ),
          classicVolume(controller),
          h(
            "div",
            { className: "amp-toggles" },
            h(
              "button",
              { type: "button", onClick: () => controller.openPage("channels") },
              controller.t("page.channels"),
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => controller.openPage(controller.page === "now" ? "search" : "now"),
              },
              controller.t("page.search"),
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => controller.openPage(controller.page === "history" ? "now" : "history"),
              },
              controller.t("page.history"),
            ),
          ),
        ),
      ),
      h(
        "div",
        { className: "amp-transports" },
        classicTransport(controller),
        h(
          "button",
          {
            type: "button",
            className: "amp-library",
            onClick: () => controller.openPage(controller.page === "favorites" ? "now" : "favorites"),
          },
          controller.t("page.favorites"),
        ),
      ),
      h("div", { className: "amp-section-label" }, "WINAMP PLAYLIST"),
      panel,
      classicStatus(controller, time),
      renderDock(controller),
    );
  }

  return h(
    "section",
    { className: "skin-console skin-body classic-foobar", "aria-label": controller.t("theme.console") },
    h(
      "div",
      { className: "classic-title" },
      h("span", null, ListMusicIcon({ size: "1.1em" })),
      h("strong", null, `${controller.current?.name || "Qiaomu Radio"} [foobar2000]`),
      h(
        "button",
        {
          type: "button",
          "aria-label": controller.t("action.about"),
          onClick: () => controller.openPage("info"),
        },
        "···",
      ),
    ),
    h(
      "div",
      { className: "foobar-menu" },
      h("button", { type: "button", onClick: () => controller.openPage("search") }, "File"),
      h("button", { type: "button", onClick: () => controller.openPage("favorites") }, "Edit"),
      h("button", { type: "button", onClick: () => controller.openPage("now") }, "View"),
      h("button", { type: "button", onClick: () => controller.toggle() }, "Playback"),
      h("button", { type: "button", onClick: () => controller.openPage("channels") }, "Library"),
      h("button", { type: "button", onClick: () => controller.openPage("info") }, "Help"),
    ),
    h(
      "div",
      { className: "skin-faceplate foobar-toolbar" },
      classicTransport(controller),
      h(
        "button",
        {
          type: "button",
          className: "classic-search-button",
          "aria-label": controller.t("page.search"),
          onClick: () => controller.openPage("search"),
        },
        SearchIcon({ size: "1.4em" }),
      ),
      classicVolume(controller),
    ),
    h(
      "div",
      { className: "foobar-tabs" },
      h(
        "button",
        {
          type: "button",
          "aria-pressed": controller.page === "now" ? "true" : "false",
          onClick: () => controller.openPage("now"),
        },
        "Default Playlist",
      ),
      h(
        "button",
        {
          type: "button",
          "aria-pressed": controller.page === "favorites" ? "true" : "false",
          onClick: () => controller.openPage("favorites"),
        },
        controller.t("page.favorites"),
      ),
      h(
        "button",
        {
          type: "button",
          "aria-pressed": controller.page === "history" ? "true" : "false",
          onClick: () => controller.openPage("history"),
        },
        controller.t("page.history"),
      ),
    ),
    panel,
    classicStatus(controller, time),
    renderDock(controller),
  );
}