/**
 * Inline SVG icon set.
 *
 * The DSH client bundle may only depend on `react`, so there is no icon
 * package: every glyph is hand-authored geometry, stroked with
 * `currentColor` and sized in `em` so the surrounding font-size drives it.
 * Nothing here uses emoji (docs/CONTRACTS.md §5).
 */

import type { ReactNode } from "react";
import { h } from "./ui";

export type IconProps = {
  /** CSS length; defaults to `"1em"` so the parent font-size drives the icon. */
  size?: number | string;
  className?: string;
  /** Pass `"currentColor"` for solid glyphs (play / pause / stop / heart). */
  fill?: string;
  strokeWidth?: number;
};

function icon(props: IconProps, ...children: ReactNode[]): ReactNode {
  const raw = props.size ?? "1em";
  const length = typeof raw === "number" ? `${raw}px` : raw;
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      width: length,
      height: length,
      fill: props.fill ?? "none",
      stroke: "currentColor",
      strokeWidth: props.strokeWidth ?? 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: props.className,
      "aria-hidden": "true",
      focusable: "false",
    },
    ...children,
  );
}

/** Solid glyph: fills with the current text colour as well as stroking. */
function solid(props: IconProps, ...children: ReactNode[]): ReactNode {
  return icon({ ...props, fill: props.fill ?? "currentColor" }, ...children);
}

export function PlayIcon(props: IconProps = {}): ReactNode {
  return solid(props, h("path", { d: "M8 5.2v13.6L19.2 12z" }));
}

export function PauseIcon(props: IconProps = {}): ReactNode {
  return solid(
    props,
    h("rect", { x: 8, y: 5.4, width: 3.4, height: 13.2, rx: 1 }),
    h("rect", { x: 12.6, y: 5.4, width: 3.4, height: 13.2, rx: 1 }),
  );
}

export function StopIcon(props: IconProps = {}): ReactNode {
  return solid(props, h("rect", { x: 6.4, y: 6.4, width: 11.2, height: 11.2, rx: 1.4 }));
}

export function SkipBackIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M18.4 6.6v10.8L9.6 12z", fill: props.fill ?? "currentColor" }),
    h("path", { d: "M6 6.4v11.2" }),
  );
}

export function SkipForwardIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M5.6 6.6v10.8L14.4 12z", fill: props.fill ?? "currentColor" }),
    h("path", { d: "M18 6.4v11.2" }),
  );
}

export function VolumeIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M11.2 5.4 6.9 9H4.2v6h2.7l4.3 3.6z" }),
    h("path", { d: "M15.2 9.2a4.2 4.2 0 0 1 0 5.6" }),
    h("path", { d: "M17.8 6.6a7.8 7.8 0 0 1 0 10.8" }),
  );
}

export function HeartIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", {
      d: "M12 20.2C10.1 18.6 4.1 14.6 4.1 10a4.5 4.5 0 0 1 7.9-3 4.5 4.5 0 0 1 7.9 3c0 4.6-6 8.6-7.9 10.2z",
    }),
  );
}

export function ThumbsDownIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", {
      d: "M9.2 3.6h7.6a2.6 2.6 0 0 1 2.5 2.9l-.6 4.6a2.6 2.6 0 0 1-2.6 2.3h-2.2l.7 3.4a2.2 2.2 0 0 1-4.2 1.3L8.6 13.4H6.4A2.2 2.2 0 0 1 4.2 11.2V5.8a2.2 2.2 0 0 1 2.2-2.2z",
    }),
    h("path", { d: "M8.6 13.4V3.6" }),
  );
}

export function ListMusicIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M4 6.4h12.4" }),
    h("path", { d: "M4 11.2h9.4" }),
    h("path", { d: "M4 16h6" }),
    h("circle", { cx: 17.6, cy: 17.4, r: 2.1 }),
    h("path", { d: "M19.7 17.4V6.2l2.3 1" }),
  );
}

export function HistoryIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M3.8 12a8.2 8.2 0 1 0 2.5-5.9" }),
    h("path", { d: "M3.4 4.4v4.3h4.3" }),
    h("path", { d: "M12 8.2V12l3 1.8" }),
  );
}

export function SearchIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 10.6, cy: 10.6, r: 6.1 }),
    h("path", { d: "M15.2 15.2 20.4 20.4" }),
  );
}

export function GlobeIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 12, cy: 12, r: 8.4 }),
    h("path", { d: "M3.6 12h16.8" }),
    h("path", {
      d: "M12 3.6c2.4 2.4 3.6 5.3 3.6 8.4s-1.2 6-3.6 8.4c-2.4-2.4-3.6-5.3-3.6-8.4S9.6 6 12 3.6z",
    }),
  );
}

export function RadioIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("rect", { x: 3, y: 8.8, width: 18, height: 11.2, rx: 2 }),
    h("path", { d: "M6.4 8.8 15.6 3.6" }),
    h("circle", { cx: 16, cy: 14.4, r: 2.4 }),
    h("path", { d: "M6.6 13.2h5" }),
    h("path", { d: "M6.6 16.4h5" }),
  );
}

export function LanguagesIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M3.4 6.2h8.6" }),
    h("path", { d: "M7.7 4v2.2" }),
    h("path", { d: "M10.8 6.2c-.9 2.8-2.7 5.1-5.4 6.8" }),
    h("path", { d: "M5.2 8.8c1.1 1.8 2.7 3.1 4.6 3.7" }),
    h("path", { d: "M12.6 20.2 16.3 11l3.7 9.2" }),
    h("path", { d: "M13.9 17.2h4.8" }),
  );
}

export function InfoIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 12, cy: 12, r: 8.4 }),
    h("path", { d: "M12 11.2v5.2" }),
    h("path", { d: "M12 7.6v.8" }),
  );
}

export function SupportIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 12, cy: 8.6, r: 4.3 }),
    h("path", { d: "M12 6.3v4.6" }),
    h("path", { d: "M3.6 17.6c1.7-2.1 4.5-3.3 8.4-3.3s6.7 1.2 8.4 3.3" }),
  );
}

export function ChevronLeftIcon(props: IconProps = {}): ReactNode {
  return icon(props, h("path", { d: "M14.6 5.4 8 12l6.6 6.6" }));
}

export function ChevronRightIcon(props: IconProps = {}): ReactNode {
  return icon(props, h("path", { d: "M9.4 5.4 16 12l-6.6 6.6" }));
}

export function CloseIcon(props: IconProps = {}): ReactNode {
  return icon(props, h("path", { d: "M6.2 6.2 17.8 17.8" }), h("path", { d: "M17.8 6.2 6.2 17.8" }));
}

export function RetryIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M20 12a8 8 0 1 1-2.4-5.7" }),
    h("path", { d: "M20.2 4.6v4.6h-4.6" }),
  );
}

export function CheckIcon(props: IconProps = {}): ReactNode {
  return icon(props, h("path", { d: "M5 12.8 9.4 17.2 19.2 7" }));
}

export function PaletteIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", {
      d: "M12 3.6a8.4 8.4 0 0 0 0 16.8c1.4 0 2.1-.9 2.1-1.8 0-1.6-1.6-1.9-1.6-3.1 0-.9.8-1.6 1.7-1.6h1.4a4.8 4.8 0 0 0 4.8-4.8c0-3.1-3.3-5.5-8.4-5.5z",
    }),
    h("circle", { cx: 8.4, cy: 9.4, r: 1 }),
    h("circle", { cx: 12, cy: 7.4, r: 1 }),
    h("circle", { cx: 15.6, cy: 9.6, r: 1 }),
  );
}

export function LoaderIcon(props: IconProps = {}): ReactNode {
  return icon(props, h("path", { d: "M12 3.6a8.4 8.4 0 1 0 8.4 8.4" }));
}

export function ExternalLinkIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M14 4.6h5.4V10" }),
    h("path", { d: "M19.4 4.6 11.8 12.2" }),
    h("path", {
      d: "M18 14.6v3.8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18.4V7.6A1.6 1.6 0 0 1 5.6 6h3.8",
    }),
  );
}

export function ZoomOutIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 10.6, cy: 10.6, r: 6.1 }),
    h("path", { d: "M15.2 15.2 20.4 20.4" }),
    h("path", { d: "M7.8 10.6h5.6" }),
  );
}

export function CodeIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M9.4 7.4 4.8 12l4.6 4.6" }),
    h("path", { d: "M14.6 7.4 19.2 12l-4.6 4.6" }),
  );
}

export function QrCodeIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("rect", { x: 3.6, y: 3.6, width: 6.4, height: 6.4, rx: 1 }),
    h("rect", { x: 14, y: 3.6, width: 6.4, height: 6.4, rx: 1 }),
    h("rect", { x: 3.6, y: 14, width: 6.4, height: 6.4, rx: 1 }),
    h("path", { d: "M14 14h2.6v2.6H14z" }),
    h("path", { d: "M17.8 17.8h2.6v2.6h-2.6z" }),
    h("path", { d: "M14 20.4h2.6" }),
    h("path", { d: "M20.4 14v2.6" }),
  );
}

export function BadgeDollarIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 12, cy: 12, r: 8.4 }),
    h("path", { d: "M12 6.8v10.4" }),
    h("path", {
      d: "M14.8 9.1a3 3 0 0 0-2.8-1.2c-1.6 0-2.7.9-2.7 2.1 0 3 5.6 1.6 5.6 4.6 0 1.3-1.2 2.2-2.9 2.2a3.2 3.2 0 0 1-2.9-1.3",
    }),
  );
}

export function MenuIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M4 7h16" }),
    h("path", { d: "M4 12h16" }),
    h("path", { d: "M4 17h16" }),
  );
}

export function SparkleIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("path", { d: "M11 4.4 12.9 9.6 18.2 11.5 12.9 13.4 11 18.6 9.1 13.4 3.8 11.5 9.1 9.6z" }),
    h("path", { d: "M18.4 15.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" }),
  );
}

export function CompassIcon(props: IconProps = {}): ReactNode {
  return icon(
    props,
    h("circle", { cx: 12, cy: 12, r: 8.4 }),
    h("path", { d: "M15.4 8.6 13.6 13.6 8.6 15.4 10.4 10.4z" }),
  );
}