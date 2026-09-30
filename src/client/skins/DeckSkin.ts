/** `deck` — Winamp: pixel type, LED panel and an equaliser. */

import type { ReactNode } from "react";
import { h } from "../ui";
import { ClassicSkin } from "./classic";
import type { SkinProps } from "./types";

export function DeckSkin(props: SkinProps): ReactNode {
  return h(ClassicSkin, {
    controller: props.controller,
    compact: props.compact,
    reducedMotion: props.reducedMotion,
    variant: "deck",
  });
}