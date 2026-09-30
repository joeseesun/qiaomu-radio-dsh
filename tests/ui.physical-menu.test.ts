// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountRadio, type RadioMountHandle } from "../src/client/RadioApp";
import type { RadioHost } from "../src/client/api";
import { EMPTY_PROFILE } from "../src/core/recommendation";
import type { Station } from "../src/core/types";

const scenes = vi.hoisted(() => ({ options: null as any, menu: vi.fn(), dispose: vi.fn() }));
vi.mock("../src/client/skins/three/ramsScene", () => ({ mountRamsScene: (node: HTMLElement, options: any) => {
  scenes.options = options; node.append(options.menuElement); queueMicrotask(options.onReady);
  return { menu: scenes.menu, dispose: scenes.dispose, setScreen() {}, setVisual() {}, explode() {} };
} }));
vi.mock("../src/client/skins/three/fantasyScene", () => ({ mountFantasyScene: (node: HTMLElement, options: any) => {
  scenes.options = options; node.append(options.menuElement); queueMicrotask(options.onReady);
  return { menu: scenes.menu, dispose: scenes.dispose, setLines() {}, setVisual() {} };
} }));
const station: Station = { id: "one", name: "Test station", streamUrl: "https://example.test/one.mp3", homepage: "", favicon: "", tags: [], country: "", countryCode: "", language: "", codec: "MP3", bitrate: 128, votes: 0, clickCount: 0 };
let mounted: RadioMountHandle, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  localStorage.setItem("qiaomu-radio-locale-v1", "zh-CN");
  scenes.menu.mockClear(); scenes.dispose.mockClear();
  container = document.createElement("div"); document.body.append(container);
});
afterEach(() => { act(() => mounted?.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>(".physical-menu button")].find(b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name);
  expect(button, name).toBeTruthy();
  await act(async () => { button!.click(); });
}
for (const theme of ["rams", "fantasy"]) it(`${theme}: navigates inside the device, closes on station selection and Escape`, async () => {
  const resolvePlay = vi.fn(async () => ({ url: station.streamUrl, kind: "media" as const, source: "radio-browser" as const, cached: false }));
  const host: RadioHost = {
    baseUrl: "", storage: { loadTheme: () => null, saveTheme() {}, loadProfile: () => EMPTY_PROFILE, saveProfile() {} },
    api: { catalog: async () => ({ stations: [station], source: "radio-browser", cached: false }), catalogSafe: async () => ({ stations: [station], source: "radio-browser", cached: false }), resolvePlay, nowPlaying: async () => null, prefetch() {} },
  };
  await act(async () => { mounted = mountRadio({ host, initialTheme: theme }, container); });
  await act(async () => { scenes.options.actions.onScreenMenu(); });
  expect(scenes.menu).toHaveBeenLastCalledWith(true);
  expect(container.querySelector('.physical-menu [data-page="menu"]')).toBeTruthy();
  expect(container.querySelector(".native-panel,.fantasy-panel")).toBeNull();
  expect(resolvePlay).not.toHaveBeenCalled();
  await click("电台列表");
  const row = container.querySelector<HTMLButtonElement>('.physical-menu .screen-list > button')!;
  await act(async () => { row.click(); });
  expect(resolvePlay).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".physical-menu")).toBeNull();
  expect(scenes.menu).toHaveBeenLastCalledWith(false);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause"); pause.mockClear();
  await act(async () => { scenes.options.actions.onScreenMenu(); });
  await click("搜索电台");
  const input = container.querySelector<HTMLInputElement>(".physical-menu input")!;
  expect(input).toBeTruthy();
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(container.querySelector(".physical-menu")).toBeNull();
  expect(pause).not.toHaveBeenCalled();
  expect(scenes.dispose).not.toHaveBeenCalled();
});
