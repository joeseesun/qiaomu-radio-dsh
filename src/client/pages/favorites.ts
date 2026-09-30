/** `favorites` — profile.likedStationIds. */

import type { ReactNode } from "react";
import type { RadioController } from "../useRadio";
import { renderList } from "./list";

export function renderFavorites(controller: RadioController): ReactNode {
  return renderList(controller);
}
