/**
 * Browser entry for the standalone player page.
 *
 * The page is served by the plugin's own host routes (or by the preview server
 * during development), so the API is plain same-origin HTTP and taste memory
 * lives in this browser. Nothing here needs the harness page to be open.
 */

import { createRadioApi } from "../../src/client/transport";
import type { RadioHost } from "../../src/client/api";
import { createLocalStorage } from "./storage";

type BootConfig = {
  baseUrl?: string;
  presentation?: "page" | "float" | "inline";
  theme?: string;
};

declare global {
  interface Window {
    __DSH_RADIO__?: BootConfig;
  }
}

const config: BootConfig = (typeof window !== "undefined" && window.__DSH_RADIO__) || {};

const baseUrl = (config.baseUrl ?? new URL(".", window.location.href).pathname).replace(/\/$/, "");

const host: RadioHost = {
  baseUrl,
  assetUrl: (relativePath) => `${baseUrl}/${relativePath.replace(/^\/+/, "")}`,
  api: createRadioApi({ kind: "http", baseUrl }),
  storage: createLocalStorage(),
};

const mountTarget = document.getElementById("radio-root") ?? document.body;

async function boot(): Promise<void> {
  try {
    const { mountRadio } = await import("../../src/client/RadioApp");
    mountRadio({
      host,
      presentation: config.presentation ?? "page",
      initialTheme: config.theme,
      container: mountTarget,
    });
  } catch (error) {
    mountTarget.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "radio-boot-error";
    panel.setAttribute("role", "alert");
    const title = document.createElement("h1");
    title.textContent = "乔木电台未能启动";
    const detail = document.createElement("p");
    detail.textContent = error instanceof Error ? error.message : String(error);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重新加载";
    retry.addEventListener("click", () => window.location.reload());
    panel.append(title, detail, retry);
    mountTarget.append(panel);
  }
}

void boot();