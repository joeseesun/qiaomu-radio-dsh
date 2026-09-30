/** `regions` — RADIO_REGIONS 与「自动判断地区」. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderRegions(controller: RadioController): ReactNode {
  return renderList(controller);
}
