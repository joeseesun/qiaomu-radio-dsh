/** `history` — profile.history. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderHistory(controller: RadioController): ReactNode {
  return renderList(controller);
}
