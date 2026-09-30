// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FantasySkin } from "../src/client/skins/FantasySkin";
import type { SkinProps } from "../src/client/skins/types";
const state = vi.hoisted(() => ({ options: null as any, dispose: vi.fn() }));
vi.mock("../src/client/skins/three/fantasyScene", () => ({ mountFantasyScene: (_: unknown, options: unknown) => {
  state.options = options; return { dispose: state.dispose, setLines() {}, setVisual() {} };
} }));
vi.mock("../src/client/skins/FantasyFallback", () => ({ FantasyFallback: () => createElement("div", {"data-fallback":true}) }));
vi.mock("../src/client/skins/shared", () => ({useScreen: () => ({}),renderScreen: () => null,renderTransport: () => null}));
let root: Root, node: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); state.dispose.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as never);
  node=document.createElement("div");document.body.append(node);root=createRoot(node);
  const props={controller:{t:(key:string)=>key,current:null,track:null,volume:.72,page:"now"},compact:false,reducedMotion:true} as unknown as SkinProps;
  act(()=>root.render(createElement(FantasySkin,props)));
});
afterEach(()=>{act(()=>root.unmount());node.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it("falls back and disposes the scene after a stalled load",()=>{
  expect(node.querySelector('[data-fantasy-loading]')).not.toBeNull();
  act(()=>vi.advanceTimersByTime(15000));
  expect(node.querySelector('[data-fantasy-loading]')).toBeNull();
  expect(node.querySelector('[data-fallback]')).not.toBeNull();
  expect(state.dispose).toHaveBeenCalledTimes(1);
  act(()=>state.options.onReady());
  expect(node.querySelector('[data-fallback]')).not.toBeNull();
});
it("cancels the deadline when the model is ready",()=>{
  act(()=>state.options.onReady());act(()=>vi.advanceTimersByTime(15000));
  expect(node.querySelector('[data-fallback]')).toBeNull();
  expect(node.querySelector('[data-fantasy-loading]')).toBeNull();
  expect(state.dispose).not.toHaveBeenCalled();
});
it("cleans up immediately when loading fails",()=>{
  act(()=>state.options.onFail());
  expect(node.querySelector('[data-fallback]')).not.toBeNull();
  expect(state.dispose).toHaveBeenCalledTimes(1);
});
