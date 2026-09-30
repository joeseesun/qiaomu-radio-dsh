/** `stations` — 当前队列列表（序号 / 名称 / 地区 / 编码）. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderStations(controller: RadioController): ReactNode {
  return renderList(controller);
}
