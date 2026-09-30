/** `menu` — 菜单：正在播放 / 频道 / 地区 / 电台列表 / 搜索 / 喜欢 / 最近 / 语言 / 支持. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderMenu(controller: RadioController): ReactNode {
  return renderList(controller);
}
