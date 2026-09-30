/** `console` — foobar2000: menu strip, tabs and a dense station table. */

import type { ReactNode } from "react";
import { h } from "../ui";
import { ClassicSkin } from "./classic";
import type { SkinProps } from "./types";

export function ConsoleSkin(props: SkinProps): ReactNode {
  return h(ClassicSkin, {
    controller: props.controller,
    compact: props.compact,
    reducedMotion: props.reducedMotion,
    variant: "console",
  });
}