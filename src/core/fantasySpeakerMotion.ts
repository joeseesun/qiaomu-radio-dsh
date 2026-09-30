/**
 * Speaker ambience for the physical skins. This is deliberately a smoothed
 * level envelope, not a measured audio spectrum; the reference plugin documents
 * the same boundary.
 */

export type SpeakerMotion = { level: number; phase: number };

export function stepSpeakerMotion(
  state: SpeakerMotion,
  delta: number,
  audible: boolean,
  volume: number,
  reduced = false,
): SpeakerMotion {
  const dt = Math.min(0.05, Math.max(0, delta));
  const target = audible && !reduced ? Math.sqrt(Math.min(1, Math.max(0, volume))) : 0;
  const level = reduced
    ? 0
    : state.level + (target - state.level) * (1 - Math.exp(-dt * (target > state.level ? 12 : 20)));
  const phase = (state.phase + dt * Math.PI * 2 * 3.2) % (Math.PI * 2);
  return { level: level < 0.0001 ? 0 : level, phase };
}

/** Playback ambience, deliberately not advertised as measured audio spectrum. */
export function speakerExcursion(state: SpeakerMotion, index: number): number {
  return state.level === 0 ? 0 : state.level * 0.012 * Math.sin(state.phase + index * 0.32);
}

/** Visible companion for baked-texture assemblies, where depth-only vertex motion is imperceptible. */
export function speakerVisual(state: SpeakerMotion, index: number) {
  const excursion = speakerExcursion(state, index);
  return {
    excursion,
    scale: 1 + excursion * 7,
    opacity: state.level * Math.max(0.08, 0.2 + excursion * 2.5),
  };
}

/** Speaker cone inset percentage for a CSS-3D grille. */
export function speakerInset(state: SpeakerMotion, index: number, maxPx = 3): string {
  return `${(speakerExcursion(state, index) * maxPx * 8.33).toFixed(2)}px`;
}