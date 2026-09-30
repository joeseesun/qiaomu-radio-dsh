/**
 * Physical-spring runtime shared by the two CSS-3D skins.
 *
 * The core modules own the maths — `radioPressFeedback` for damped key travel
 * and `fantasySpeakerMotion` for the speaker ambience — and this hook is the
 * only place where that maths is turned into pixels. It writes CSS custom
 * properties straight onto the skin root inside one animation frame loop, so a
 * knob or a speaker cone animates without re-rendering React on every frame.
 */

import { useEffect, useRef, type MutableRefObject } from "react";
import { speakerVisual, stepSpeakerMotion, type SpeakerMotion } from "../../core/fantasySpeakerMotion";
import {
  MAX_PRESS_DEPTH,
  pressDepthPx,
  pulsePressMotion,
  stepPressMotion,
  type PressMotion,
} from "../../core/radioPressFeedback";

export type MotionRuntime = {
  /** Pointer/touch is holding a control down. */
  hold(action: string, down: boolean): void;
  /** A tap shorter than one frame still gets a visible mechanical stroke. */
  pulse(action: string): void;
};

export type PhysicalMotionOptions = {
  rootRef: MutableRefObject<HTMLElement | null>;
  /** Names that get a `--press-<name>` travel variable. */
  actions: readonly string[];
  /** How many speaker cones this skin exposes. */
  speakers: number;
  reducedMotion: boolean;
  /** Live playback state, read every frame instead of re-subscribing. */
  audibleRef: MutableRefObject<boolean>;
  volumeRef: MutableRefObject<number>;
};

export function usePhysicalMotion(options: PhysicalMotionOptions): MotionRuntime {
  const rootRef = options.rootRef;
  const actions = options.actions;
  const speakers = options.speakers;
  const reducedMotion = options.reducedMotion;
  const audibleRef = options.audibleRef;
  const volumeRef = options.volumeRef;

  const motions = useRef<Record<string, PressMotion>>({});
  const held = useRef<Record<string, boolean>>({});
  const speakerStates = useRef<SpeakerMotion[]>([]);
  const runtime = useRef<MotionRuntime>({ hold: () => {}, pulse: () => {} });

  for (const action of actions) {
    if (!motions.current[action]) {
      motions.current[action] = { depth: 0, velocity: 0, pulse: 0 };
      held.current[action] = false;
    }
  }

  const writeDepth = (action: string, depth: number) => {
    rootRef.current?.style.setProperty(`--press-${action}`, pressDepthPx(depth));
  };

  const writeSpeakers = (frameDelta: number) => {
    const audible = Boolean(audibleRef.current) && !reducedMotion;
    const volume = volumeRef.current;
    for (let index = 0; index < speakers; index += 1) {
      const state = speakerStates.current[index] ?? { level: 0, phase: 0 };
      speakerStates.current[index] = stepSpeakerMotion(state, frameDelta, audible, volume, reducedMotion);
      const visual = speakerVisual(speakerStates.current[index], index);
      const root = rootRef.current;
      if (!root) continue;
      root.style.setProperty(`--speaker-scale-${index}`, visual.scale.toFixed(4));
      root.style.setProperty(`--speaker-opacity-${index}`, visual.opacity.toFixed(4));
      root.style.setProperty(`--speaker-travel-${index}`, `${(visual.excursion * 260).toFixed(2)}px`);
    }
  };

  runtime.current = {
    hold: (action, down) => {
      held.current[action] = down;
      if (reducedMotion) writeDepth(action, down ? MAX_PRESS_DEPTH : 0);
    },
    pulse: (action) => {
      const current = motions.current[action] ?? { depth: 0, velocity: 0, pulse: 0 };
      motions.current[action] = pulsePressMotion(current);
      if (!reducedMotion) return;
      writeDepth(action, MAX_PRESS_DEPTH * 0.9);
      setTimeout(() => writeDepth(action, held.current[action] ? MAX_PRESS_DEPTH : 0), 140);
    },
  };

  const actionKey = actions.join(",");

  useEffect(() => {
    if (speakers > 0) writeSpeakers(reducedMotion ? 1 : 0);
    if (reducedMotion) {
      for (const action of actions) writeDepth(action, 0);
      return;
    }
    let frame = 0;
    let previous = performance.now();
    const step = (time: number) => {
      const delta = Math.min(Math.max((time - previous) / 1000, 0), 0.05);
      previous = time;
      for (const action of actions) {
        const state = motions.current[action] ?? { depth: 0, velocity: 0, pulse: 0 };
        motions.current[action] = stepPressMotion(state, held.current[action] === true, delta, false);
        writeDepth(action, motions.current[action].depth);
      }
      writeSpeakers(delta);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // `actionKey` stands in for the actions array so the loop is not rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionKey, reducedMotion, speakers, rootRef]);

  return runtime.current;
}