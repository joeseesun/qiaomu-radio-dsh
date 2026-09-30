/** `info` — data provenance, privacy note and the station's own website. */

import type { ReactNode } from "react";
import { ExternalLinkIcon } from "../icons";
import { h } from "../ui";
import type { RadioController } from "../useRadio";

function externalLink(href: string, label: string): ReactNode {
  return h(
    "a",
    { href, target: "_blank", rel: "noreferrer" },
    label,
    ExternalLinkIcon({ size: 14 }),
  );
}

export function renderInfo(controller: RadioController): ReactNode {
  const station = controller.current;
  const homepage = station?.homepage || "";
  const safeHomepage = /^https?:\/\//.test(homepage) ? homepage : "";
  return h(
    "div",
    { className: "device-info" },
    h("h2", null, "Qiaomu Radio"),
    h("p", null, controller.t("info.text")),
    safeHomepage ? externalLink(safeHomepage, controller.t("info.website")) : null,
    externalLink("https://www.radio-browser.info/", "Radio Browser"),
    externalLink("https://radio.qiaomu.ai/", "radio.qiaomu.ai"),
  );
}