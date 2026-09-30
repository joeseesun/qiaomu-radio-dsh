/**
 * Pointer maths shared by the physical skins (Braun knobs, fantasy panel).
 * These are the reference formulas, retargeted from three.js meshes onto CSS 3D
 * transforms: a drag produces the same signed arc and detent count.
 */

export function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Drag distance converted to tuning detents. */
export function tuningSteps(dx: number, dy: number): number {
  return Math.trunc((dx - dy) / 18);
}

/** Trailing integer of a hit-target name (`knob-3` → 3). */
export function radioPartIndex(name: string): number {
  return Number(name.match(/(\d+)$/)?.[1]);
}

/** Radians swept by a full volume travel. */
export const VOLUME_SWEEP = Math.PI * 1.5;
export const TUNING_DETENT = Math.PI / 10;

/** Shortest signed arc, continuous across the atan2 seam. Clockwise is positive. */
export function clockwiseArc(previous: number, next: number): number {
  return Math.atan2(Math.sin(previous - next), Math.cos(previous - next));
}

export function turnVolume(value: number, radians: number): number {
  return clampVolume(value + radians / VOLUME_SWEEP);
}

export function volumeAngle(value: number): number {
  return (0.5 - clampVolume(value)) * VOLUME_SWEEP;
}

export function detents(radians: number): number {
  return Math.round(radians / TUNING_DETENT);
}