// @vitest-environment happy-dom
/**
 * In-screen navigation, driven exactly like a user: `docs/CONTRACTS.md` §7 asks
 * for menu → channels → stations → now.
 *
 * The reference for this flow is the iPod-style in-screen browser
 * (`qiaomu-radio/plugin-src/radio-view.ts`), where choosing a channel pushes the
 * *station list* and the station row is what starts playback. Every host call is
 * an injected fake and `fetch` is trapped, so the suite never touches the
 * network.
 */

import { act } from "react-dom/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { mountRadio, unmountRadio, type RadioMountHandle } from "../src/client/RadioApp";
import type { RadioHost } from "../src/client/api";
import { EMPTY_PROFILE } from "../src/core/recommendation";
import type { CatalogRequest, CatalogResult, PlayTarget, Station, TasteProfile } from "../src/core/types";

/* ------------------------------------------------------------------ fixture */

const LOCALE_KEY = "qiaomu-radio-locale-v1";

const CATALOG: Station[] = Array.from({ length: 3 }, (_, index) => ({
  id: `station-${index + 1}`,
  name: `测试电台 ${index + 1}`,
  streamUrl: `https://example.test/stream-${index + 1}.mp3`,
  homepage: "https://example.test/",
  favicon: "",
  tags: ["jazz"],
  country: "中国",
  countryCode: "CN",
  language: "zh",
  codec: "MP3",
  bitrate: 128,
  votes: 10,
  clickCount: 3,
}));

type FakeHost = RadioHost & { requests: CatalogRequest[]; played: string[]; savedThemes: string[] };

function fakeHost(): FakeHost {
  const host: FakeHost = {
    baseUrl: "https://example.test/plugins/@qiaomu/radio",
    requests: [],
    played: [],
    savedThemes: [],
    storage: {
      loadProfile: (): TasteProfile => EMPTY_PROFILE,
      saveProfile: () => {},
      loadTheme: () => null,
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
      resolvePlay: async (source: Station): Promise<PlayTarget> => {
        host.played.push(source.id);
        return { url: source.streamUrl, kind: "media", source: "radio-browser", cached: false };
      },
      nowPlaying: async () => null,
      prefetch: () => {},
    },
  };
  return host;
}

/* ------------------------------------------------------------------ harness */

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const media = HTMLMediaElement.prototype as HTMLMediaElement & { __radioStubbed?: boolean };
  media.play = async () => {};
  media.pause = () => {};
  media.load = () => {};
  media.canPlayType = () => "";
  media.__radioStubbed = true;
});

let handle: RadioMountHandle | null = null;

afterEach(() => {
  if (handle) {
    const closing = handle;
    act(() => {
      closing.unmount();
    });
    handle = null;
  }
  unmountRadio();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

type Surface = {
  container: HTMLElement;
  host: FakeHost;
  page: () => string | undefined;
  rows: () => HTMLButtonElement[];
  row: (needle: string) => HTMLButtonElement;
  screen: () => HTMLElement;
  state: () => string | undefined;
};

async function mount(theme = "editorial"): Promise<Surface> {
  localStorage.setItem(LOCALE_KEY, "zh-CN");
  const container = document.createElement("div");
  container.className = "radio-mount";
  document.body.appendChild(container);
  Object.defineProperty(container, "clientWidth", { value: 1024, configurable: true });
  const host = fakeHost();
  await act(async () => {
    handle = mountRadio({ host, initialTheme: theme, presentation: "inline" }, container);
    // Let the first catalog request and its state updates settle inside `act`.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const screen = () => container.querySelector<HTMLElement>(".skin-screen[data-page]")!;
  const rows = () =>
    [...container.querySelectorAll<HTMLButtonElement>(".skin-screen .screen-list > button")];
  return {
    container,
    host,
    page: () => screen()?.dataset.page,
    rows,
    screen,
    state: () => container.querySelector<HTMLElement>(".radio-root")?.dataset.state,
    row: (needle: string) => {
      const found = rows().find((button) => button.textContent?.includes(needle));
      if (!found) {
        throw new Error(`no row containing ${needle}; rows: ${rows().map((b) => b.textContent).join(" | ")}`);
      }
      return found;
    },
  };
}

async function click(surface: Surface, needle: string): Promise<void> {
  const target = surface.row(needle);
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function press(surface: Surface, key: string): Promise<void> {
  await act(async () => {
    surface.screen().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settle(1);
}

/* -------------------------------------------------------------------- tests */

describe("ui.navigation — in-screen browsing", () => {
  it("walks menu → channels → stations → now", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no network in tests")));
    vi.stubGlobal("fetch", fetchSpy);

    const surface = await mount();
    expect(surface.page()).toBe("now");

    // The now screen's title button is the way back to the menu.
    expect(surface.screen().querySelector<HTMLButtonElement>(".screen-title button")!.getAttribute("aria-label"))
      .toBe("打开菜单");
    await press(surface, "Escape");
    expect(surface.page()).toBe("menu");
    expect(surface.rows().length).toBeGreaterThanOrEqual(10);
    expect(surface.row("频道").textContent).toContain("频道");

    // menu → channels: a list of scene channels, nothing plays yet.
    await click(surface, "频道");
    expect(surface.page()).toBe("channels");
    const channels = surface.rows().map((button) => button.textContent ?? "");
    expect(channels.length).toBeGreaterThanOrEqual(6);
    expect(surface.host.played).toEqual([]);

    // channels → stations: a channel pushes the station list, it does not
    // hijack playback (reference: radio-view.ts pocketPage = "stations").
    const channel = surface.rows()[1];
    await act(async () => {
      channel.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(surface.page()).toBe("stations");
    expect(surface.rows()).toHaveLength(CATALOG.length);
    expect(surface.host.requests.at(-1)?.source).toBeDefined();
    expect(surface.host.played).toEqual([]);
    for (const station of CATALOG) {
      expect(surface.rows().some((button) => button.textContent?.includes(station.name))).toBe(true);
    }

    // stations → now: tapping a station is what starts playback.
    await click(surface, CATALOG[1].name);
    expect(surface.page()).toBe("now");
    expect(surface.host.played).toEqual([CATALOG[1].id]);
    expect(surface.container.querySelector(".skin-screen")!.textContent).toContain(CATALOG[1].name);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the page selection reachable from the keyboard", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    const surface = await mount();
    await press(surface, "Escape");
    expect(surface.page()).toBe("menu");

    // The screen owns the roving selection: ArrowDown marks exactly one row.
    await press(surface, "ArrowDown");
    let selected = [...surface.container.querySelectorAll<HTMLElement>('.skin-screen [data-selected="true"]')];
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("频道");

    await press(surface, "ArrowDown");
    selected = [...surface.container.querySelectorAll<HTMLElement>('.skin-screen [data-selected="true"]')];
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("地区电台");

    // Back up to 频道 before opening it.
    await press(surface, "ArrowUp");

    await press(surface, "Enter");
    expect(surface.page()).toBe("channels");

    // Escape steps back out of a page instead of leaving the surface.
    await press(surface, "Escape");
    expect(surface.page()).toBe("menu");
  });

  it("reaches the station list directly from the menu", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    const surface = await mount("pocket");
    await press(surface, "Escape");
    await click(surface, "电台列表");
    expect(surface.page()).toBe("stations");
    expect(surface.host.requests.length).toBeGreaterThan(0);
    expect(surface.rows().length).toBe(CATALOG.length);
  });

  it("browses the curated sources without starting playback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    const surface = await mount("deck");
    await press(surface, "Escape");
    await click(surface, "搜索电台");
    expect(surface.page()).toBe("search");

    const china = [...surface.container.querySelectorAll<HTMLButtonElement>(".source-choice")].find(
      (button) => button.textContent?.includes("中国电台"),
    )!;
    expect(china).toBeTruthy();
    await act(async () => {
      china.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(surface.page()).toBe("stations");
    expect(surface.host.requests.at(-1)?.source).toBe("china-curated");
    expect(surface.host.played).toEqual([]);
  });

  it("switches the environment from the picker and keeps the page", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    const surface = await mount("editorial");
    await press(surface, "Escape");

    const trigger = surface.container.querySelector<HTMLButtonElement>(".theme-trigger")!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle(1);
    const items = [...surface.container.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toContain("true");

    const fantasy = items.find((item) => item.textContent?.includes("魔兽世界"))!;
    await act(async () => {
      fantasy.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle(1);
    const root = surface.container.querySelector<HTMLElement>(".radio-root")!;
    expect(root.dataset.theme).toBe("fantasy");
    expect(surface.container.querySelector(".skin-fantasy")).toBeTruthy();
    expect(surface.container.querySelector(".skin-editorial")).toBe(null);
    expect(surface.page()).toBe("menu");
    expect(surface.host.savedThemes.at(-1)).toBe("fantasy");
  });
});