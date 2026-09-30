/** `search` — station-name search plus the two curated sources. */

import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { ChevronRightIcon, SearchIcon } from "../icons";
import { h } from "../ui";
import type { RadioController } from "../useRadio";

export const SEARCH_INPUT_ID = "qiaomu-radio-search";

export function renderSearch(controller: RadioController): ReactNode {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    controller.search(controller.searchDraft.trim());
    controller.openPage("stations");
  };
  return h(
    "form",
    { className: "device-search", onSubmit: submit },
    h("label", { htmlFor: SEARCH_INPUT_ID }, controller.t("search.name")),
    h(
      "div",
      null,
      h("input", {
        id: SEARCH_INPUT_ID,
        name: "station",
        type: "search",
        value: controller.searchDraft,
        placeholder:
          controller.source === "china-curated" ? "北京、央广、音乐" : "Jazz24, FIP, KEXP…",
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          controller.setSearchDraft(event.target.value),
      }),
      h("button", { type: "submit", "aria-label": controller.t("search.submit") }, SearchIcon({ size: 18 })),
    ),
    h("p", null, controller.t("search.current")),
    h(
      "button",
      {
        type: "button",
        className: "source-choice",
        onClick: () => {
          controller.chooseSource("china-curated", false);
          controller.openPage("stations");
        },
      },
      controller.t("search.china"),
      ChevronRightIcon({ size: 16 }),
    ),
    h(
      "button",
      {
        type: "button",
        className: "source-choice",
        onClick: () => {
          controller.chooseSource("global-curated", false);
          controller.openPage("stations");
        },
      },
      controller.t("search.global"),
      ChevronRightIcon({ size: 16 }),
    ),
  );
}