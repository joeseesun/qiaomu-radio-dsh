/** `explore` — 拆解展示与恢复视角. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderExplore(controller: RadioController): ReactNode {
  return renderList(controller);
}
