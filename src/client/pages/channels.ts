/** `channels` — 六个心境频道（含 note 与 accent）. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderChannels(controller: RadioController): ReactNode {
  return renderList(controller);
}
