/** The skin registry: one renderer per environment id. */

import type { ThemeId } from "../../core/types";
import { ConsoleSkin } from "./ConsoleSkin";
import { DeckSkin } from "./DeckSkin";
import { FantasySkin } from "./FantasySkin";
import { PocketSkin } from "./PocketSkin";
import { RamsSkin } from "./RamsSkin";
import type { SkinRenderer } from "./types";

export const SKINS: Record<ThemeId, SkinRenderer> = {
  pocket: PocketSkin,
  deck: DeckSkin,
  console: ConsoleSkin,
  rams: RamsSkin,
  fantasy: FantasySkin,
};

export { SKIN_IDS, type SkinProps, type SkinRenderer } from "./types";