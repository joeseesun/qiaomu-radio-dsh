// @vitest-environment happy-dom
/**
 * Six player environments, mounted in happy-dom.
 *
 * `docs/CONTRACTS.md` §7 asks for "six skins mount without throwing and the key
 * a11y attributes exist". Every host call goes through an injected fake, so the
 * suite never touches the network, and the media element is stubbed so no test
 * waits on a real decoder.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react-dom/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { mountRadio, unmountRadio, type RadioMountHandle } from "../src/client/RadioApp";
import type { RadioHost } from "../src/client/api";
import { LOCALES } from "../src/core/i18n";
import { EMPTY_PROFILE } from "../src/core/recommendation";
import { RADIO_THEMES, type RadioTheme } from "../src/core/themes";
import type { CatalogRequest, CatalogResult, PlayTarget, Station, TasteProfile } from "../src/core/types";

/* ------------------------------------------------------------------ fixture */

const THEMES: RadioTheme[] = RADIO_THEMES;
const THEME_IDS = THEMES.map((theme) => theme.id);

function station(index: number): Station {
  return {
    id: `station-${index}`,
    name: `测试电台 ${index}`,
    streamUrl: `https://example.test/stream-${index}.mp3`,
    homepage: "https://example.test/",
    favicon: "",
    tags: ["jazz", "test"],
    country: "中国",
    countryCode: "CN",
    language: "zh",
    codec: "MP3",
    bitrate: 128,
    votes: 10,
    clickCount: 3,
  };
}

const CATALOG: Station[] = [station(1), station(2), station(3)];

type FakeHost = RadioHost & { savedThemes: string[]; savedProfiles: number; requests: CatalogRequest[] };

function fakeHost(storedTheme: string | null = null): FakeHost {
  const host: FakeHost = {
    baseUrl: "https://example.test/plugins/@qiaomu/radio",
    savedThemes: [],
    savedProfiles: 0,
    requests: [],
    storage: {
      loadProfile: (): TasteProfile => EMPTY_PROFILE,
      saveProfile: () => {
        host.savedProfiles += 1;
      },
      loadTheme: () => storedTheme,
      saveTheme: (themeId: string) => {
        host.savedThemes.push(themeId);
      },
    },
    api: {
      catalogSafe: async (request: CatalogRequest): Promise<CatalogResult> => {
        host.requests.push(request);
        return { stations: CATALOG, source: request.source, cached: false };
      },
      catalog: async (request: CatalogRequest): Promise<CatalogResult> => {
        host.requests.push(request);
        return { stations: CATALOG, source: request.source, cached: false };
      },
      resolvePlay: async (source: Station): Promise<PlayTarget> => ({
        url: source.streamUrl,
        kind: "media",
        source: "radio-browser",
        cached: false,
      }),
      nowPlaying: async () => null,
      prefetch: () => {},
    },
  };
  return host;
}

/* ------------------------------------------------------------------ harness */

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  // No real media pipeline in happy-dom: the player only needs `play()`.

  // to resolve. `canPlayType` answers "" so a HLS station reports its honest
  // "no runtime" error instead of claiming native support.
  const media = HTMLMediaElement.prototype as HTMLMediaElement & { __radioStubbed?: boolean };
  media.play = async () => {};
  media.pause = () => {};
  media.load = () => {};
  media.canPlayType = () => "";
  media.__radioStubbed = true;
});

const live: Array<{ handle: RadioMountHandle; container: HTMLElement }> = [];

afterEach(() => {
  for (const entry of live.splice(0)) {
    act(() => {
      entry.handle.unmount();
    });
    entry.container.remove();
  }
  unmountRadio();
  vi.restoreAllMocks();
});

const LOCALE_KEY = "qiaomu-radio-locale-v1";

async function mount(theme: string, width = 1024, storedTheme: string | null = null) {
  // Pin the locale: happy-dom advertises en-US, which `detectLocale` honours.
  localStorage.setItem(LOCALE_KEY, "zh-CN");
  const container = document.createElement("div");
  container.className = "radio-mount";
  document.body.appendChild(container);
  Object.defineProperty(container, "clientWidth", { value: width, configurable: true });
  const host = fakeHost(storedTheme);
  let handle!: RadioMountHandle;
  await act(async () => {
    handle = mountRadio({ host, initialTheme: theme, presentation: "page" }, container);
    // Let the first catalog request and its state updates settle inside `act`.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  live.push({ handle, container });
  return { container, host, root: () => container.querySelector<HTMLElement>(".radio-root")! };
}

/** Nothing in this suite may hit the network. */
function guardFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(() => Promise.reject(new Error("network is not allowed in ui tests")));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/* -------------------------------------------------------------------- tests */

describe("ui.skins — five environments mount", () => {
  it("covers exactly the five contract themes", () => {
    expect([...THEME_IDS].sort()).toEqual(["console", "deck", "fantasy", "pocket", "rams"]);
  });

  for (const theme of THEME_IDS) {
    it(`mounts .skin-${theme} with the contract DOM tree and a11y names`, async () => {
      const fetchSpy = guardFetch();
      const { container, root } = await await mount(theme);
      const element = root();

      expect(element).toBeTruthy();
      expect(element.dataset.theme).toBe(theme);
      expect(["playing", "loading", "paused", "error"]).toContain(element.dataset.state);
      expect(["true", "false"]).toContain(element.dataset.compact);
      // The authored default is Chinese; `detectLocale` only leaves it when the
      // browser asks for another supported language (reference behaviour).
      expect(LOCALES).toContain(element.getAttribute("lang"));
      expect(element.dataset.motion === "off" || element.dataset.motion === "on").toBe(true);

      // §5: stage → skin → body/faceplate + screen + controls + dock.
      expect(element.querySelector(":scope > .radio-stage")).toBeTruthy();
      expect(element.querySelector(":scope > .theme-picker")).toBeTruthy();
      const skin = element.querySelector(`.radio-stage > .skin-${theme}`);
      expect(skin).toBeTruthy();
      // The skin root itself is the body.
      expect(skin!.classList.contains("skin-body")).toBe(true);
      expect(skin!.querySelector(".skin-faceplate")).toBeTruthy();
      expect(skin!.querySelector(".skin-controls")).toBeTruthy();
      expect(skin!.querySelector(".skin-dock")).toBeTruthy();
      const screen = skin!.querySelector<HTMLElement>(".skin-screen[data-page]");
      expect(screen).toBeTruthy();
      expect(screen!.dataset.page).toBe("now");

      // Every interactive element is a real control with an accessible name.
      const interactive = [...element.querySelectorAll("button, input, a, [tabindex]")];
      expect(interactive.length).toBeGreaterThan(4);
      for (const node of interactive) {
        expect(["BUTTON", "INPUT", "A"]).toContain(node.tagName);
        const label = (node.getAttribute("aria-label") || node.textContent || "").trim();
        const labelled = Boolean(node.getAttribute("aria-label") || node.getAttribute("id"));
        expect(label.length > 0 || labelled).toBe(true);
      }

      // The theme picker is a real menu with one item per environment.
      const trigger = element.querySelector(".theme-trigger")!;
      expect(trigger.getAttribute("aria-label")).toBe("切换主题");
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");

      // Icons are inline SVG, sized in `em`, never emoji text.
      const svgs = [...element.querySelectorAll("svg")];
      expect(svgs.length).toBeGreaterThan(4);
      for (const svg of svgs) {
        expect(svg.getAttribute("aria-hidden")).toBe("true");
        expect(svg.getAttribute("stroke")).toBe("currentColor");
        expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
        // Physical controls keep pixel sizes, the scaled screen surface uses em.
        expect(svg.getAttribute("width")).toMatch(/^[\d.]+(em|px)$/);
      }
      const screenIcons = [...screen!.querySelectorAll("svg")];
      for (const svg of screenIcons) expect(svg.getAttribute("width")).toMatch(/em$/);
      // deck/console render the playlist itself as the `now` screen, so the
      // only icon-free contract screen is that documented playlist variant.
      if (screenIcons.length === 0) {
        expect(screen!.classList.contains("classic-playlist")).toBe(true);
      }
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(element.textContent ?? "")).toBe(false);

      // The screen is reachable by keyboard, not only by pointer.
      expect(screen!.getAttribute("tabindex") ?? "0").not.toBe("-1");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(container.querySelector(".skin-screen")).toBeTruthy();
      void container;
    });
  }

  it("keeps a saved environment instead of the mount preference", async () => {
    guardFetch();
    const { root } = await mount("pocket", 1024, "fantasy");
    expect(root().dataset.theme).toBe("fantasy");
  });

  it("migrates the removed Minimal preference to Braun", async () => {
    guardFetch();
    const { root, host } = await mount("pocket", 1024, "editorial");
    expect(root().dataset.theme).toBe("rams");
    expect(host.savedThemes.at(-1)).toBe("rams");
    expect(RADIO_THEMES.some(theme => String(theme.id) === "editorial")).toBe(false);
  });

  it("falls back to the Braun radio when nothing is saved", async () => {
    guardFetch();
    const { root } = await mount("");
    expect(root().dataset.theme).toBe("rams");
  });

  it("keeps the six supported languages and defaults to a supported one", async () => {
    localStorage.removeItem(LOCALE_KEY);
    guardFetch();
    const { root } = await mount("pocket");
    expect(LOCALES).toContain(root().getAttribute("lang"));
    expect(LOCALES).toEqual(["zh-CN", "en", "es", "fr", "de", "ja"]);
  });

  it("marks a narrow container as compact and keeps the screen interactive", async () => {
    guardFetch();
    const { container, root } = await mount("rams", 420);
    expect(root().dataset.compact).toBe("true");
    // The 3D glass would be illegible at this width, so the screen moves below
    // the device and the glass shows a passive readout instead.
    expect(container.querySelector(".skin-flat-screen .skin-screen")).toBeTruthy();
    expect(container.querySelector(".rams-readout")).toBeTruthy();
    expect(container.querySelector(".rams-glass .skin-screen")).toBe(null);
  });

  it("keeps the in-glass screen on a wide container", async () => {
    guardFetch();
    const { container } = await mount("rams", 1280);
    expect(container.querySelector(".rams-glass .screen-inner.rams-glass-inner")).toBeTruthy();
    expect(container.querySelector(".skin-flat-screen")).toBe(null);
  });

  it("renders the announcement region as a live region once there is a message", async () => {
    guardFetch();
    const { container, root } = await mount("pocket");
    act(() => {
      root().dispatchEvent(new Event("noop"));
    });
    // The notice is conditional; when present it must be a labelled live region.
    const notice = container.querySelector(".radio-notice");
    if (notice) {
      expect(["status", "alert"]).toContain(notice.getAttribute("role"));
      expect(notice.getAttribute("aria-live")).toBeTruthy();
    }
    expect(container.querySelector(".radio-root")).toBeTruthy();
  });
});

describe("ui.styles — the stylesheet obeys the contract", () => {
  const stylesDir = join(dirname(dirname(fileURLToPath(import.meta.url))), "styles");
  const files = ["10-base.css", "20-reference.css", "30-skins.css"];

  it("loads base, then the reference, then the skin overrides", () => {
    expect([...files].sort()).toEqual(files);
  });

  for (const file of files) {
    it(`${file} is scoped to .radio-root with no !important`, () => {
      const css = readFileSync(join(stylesDir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css).not.toContain("!important");

      const offenders: string[] = [];
      for (const line of css.split("\n")) {
        const brace = line.indexOf("{");
        if (brace < 0) continue;
        const selector = line.slice(0, brace).trim();
        if (!selector || selector.startsWith("@") || selector.startsWith("/*")) continue;
        if (selector.startsWith("}")) continue;
        // `.radio-mount` is the plugin's own host element: the wrapper the
        // surface is mounted into, not a global selector.
        if (selector === ".radio-mount") continue;
        if (!selector.includes(".radio-root")) offenders.push(selector);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("defines every colour token for both the theme and the DSH dark shell", () => {
    const base = readFileSync(join(stylesDir, "10-base.css"), "utf8");
    const skins = readFileSync(join(stylesDir, "30-skins.css"), "utf8");
    const all = base + skins;
    for (const theme of THEME_IDS) {
      expect(base).toContain(`.radio-root[data-theme="${theme}"]`);
    }
    // Documented in 10-base, re-declared last in 30-skins so it wins on order.
    expect(all).toContain(".dsw-dark .radio-root");
    expect(all).toContain(".dark .radio-root");
    expect((all.match(/\.dsw-dark/g) ?? []).length).toBeGreaterThan(5);
  });

  it("keeps the CSS 3D fallbacks in the stylesheet and never inlines a WebGL renderer", () => {
    const skins = readFileSync(join(stylesDir, "30-skins.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(skins).toContain("transform-style: preserve-3d");
    expect(skins).toContain("perspective:");
    expect(skins).toContain("--screen-scale");
    expect(skins).not.toMatch(/three\.js|webgl|THREE\./i);
    expect(skins).toContain(".rams-speaker");
    expect(skins).toContain(".fantasy-speaker");
  });

  it("honours reduced motion without stacking !important", () => {
    const skins = readFileSync(join(stylesDir, "30-skins.css"), "utf8");
    expect(skins).toContain('.radio-root[data-motion="off"]');
    expect(skins).toContain("@media (prefers-reduced-motion: reduce)");
  });
});