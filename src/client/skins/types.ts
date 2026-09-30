/**
 * Skin contract (docs/CONTRACTS.md §4).
 *
 * A skin is a pure function of the controller plus the two presentation flags;
 * it owns the look of one player environment and nothing else. Skins never talk
 * to `host`, `fetch` or `localStorage` — every action goes through the
 * controller so the same skin renders in the preview harness and the DSH shell.
 */

import type { ReactNode } from "react";
import type { ThemeId } from "../../core/types";
import type { RadioController } from "../useRadio";

export type SkinProps = {
  controller: RadioController;
  /** Narrow container (right rail / floating panel): width < 720px. */
  compact: boolean;
  /** The user asked for less motion (`prefers-reduced-motion` or a host flag). */
  reducedMotion: boolean;
};

export type SkinRenderer = (props: SkinProps) => ReactNode;

/** The five environment ids, in picker order. */
export const SKIN_IDS: ThemeId[] = ["fantasy", "rams", "pocket", "deck", "console"];