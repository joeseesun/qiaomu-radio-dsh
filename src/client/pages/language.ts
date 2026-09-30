/** `language` — 六种界面语言. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderLanguage(controller: RadioController): ReactNode {
  return renderList(controller);
}
