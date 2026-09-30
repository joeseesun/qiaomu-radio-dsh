/**
 * The single JSX/factory outlet of the whole repository.
 *
 * Every other client module is a `.ts` file and therefore has no JSX syntax of
 * its own; they all describe their tree by calling `h(...)`. Keeping the single
 * `createElement` call in one place means the client bundle only ever depends on
 * `react` and never on a JSX runtime transform being wired into the plugin host.
 */

import { createElement } from "react";
import type { ReactNode } from "react";

/** `createElement` widened to our own contract: unknown tag, loose children. */
const create = createElement as unknown as (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: ReactNode[]
) => ReactNode;

/**
 * Tiny `createElement` wrapper used as the JSX replacement.
 *
 * Contract:
 *  - `null`, `undefined`, `true` and `false` children are dropped;
 *  - nested child arrays are flattened;
 *  - `key` is forwarded untouched, so React reconciles lists correctly;
 *  - a `children` prop is honoured when no positional child is given.
 */
export function h(
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactNode {
  const config: Record<string, unknown> = props ? { ...props } : {};
  const declared: unknown = config.children;
  delete config.children;

  const collected: ReactNode[] = [];
  const absorb = (value: unknown): void => {
    if (value === null || value === undefined || value === false || value === true) return;
    if (Array.isArray(value)) {
      for (const item of value) absorb(item);
      return;
    }
    collected.push(value as ReactNode);
  };
  for (const child of children) absorb(child);

  const merged: ReactNode[] =
    collected.length > 0 ? collected : declared === undefined ? [] : [declared as ReactNode];

  return merged.length > 0 ? create(type, config, ...merged) : create(type, config);
}

/** Convenience used by the list rows: joins truthy class names. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}