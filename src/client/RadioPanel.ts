/**
 * Panel body shown in the harness `main` slot when the sidebar entry is picked.
 *
 * It *embeds* the host-served player page instead of re-mounting `RadioApp`
 * inside the GUI's React tree, and that is a deliberate trade:
 *
 *  - The player already ships as a complete same-origin page with its own
 *    styles, HLS runtime and route. An iframe shows *that* artifact, so what
 *    the panel renders is byte-identical to what `/qiaomu-radio/` renders.
 *  - Re-mounting `RadioApp` here was technically available (`react-dom/client`
 *    *is* in the harness module table), but it would mean a second React tree,
 *    a second copy of the player CSS to keep scoped, and a GUI-side dependency
 *    on the player's internals. One UI to keep correct is worth more than
 *    avoiding an iframe.
 *
 * `allow="autoplay"` matters: the page's Audio element only plays after a user
 * gesture, and a blocked autoplay raises the page's own retry notice.
 */

import type { ReactNode } from "react";

import { PLAYER_PATH } from "../core/mount";
import { h } from "./ui";

export function RadioPanel(): ReactNode {
  return h(
    "div",
    {
      "data-radio-panel": "1",
      style: {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minHeight: 0,
        height: "100%",
      },
    },
    h("iframe", {
      src: PLAYER_PATH,
      title: "乔木电台",
      allow: "autoplay",
      "data-radio-frame": "1",
      style: {
        border: "0",
        display: "block",
        flex: "1 1 auto",
        width: "100%",
        height: "100%",
        minHeight: 0,
        background: "#d9d8cf",
      },
    }),
  );
}