import type { RadioController } from './useRadio';
import { useEffect, useRef } from 'react';
import { RADIO_CHANNEL, validPlayerCommand, type PlayerCommand, type PlayerSnapshot } from "./player-wire";
export function executePlayerCommand(controller: RadioController, command: PlayerCommand) {
  if (command.kind === 'updates') controller.showUpdates();
  if (command.kind === 'toggle') controller.toggle();
  if (command.kind === 'play') {
    const known = [controller.current, ...controller.stations, ...controller.profile.history.map(item => item.station)];
    const station = known.find(item => item?.id === command.stationId);
    if (station) controller.play(station);
  }
}
/** This only runs in the host-served player page; standalone playback works without a parent. */
export function useParentPlayerChannel(controller: RadioController) {
  const live = useRef(controller); live.current = controller;
  const emit = () => {
    if (window.parent === window) return;
    const value = live.current;
    window.parent.postMessage({ channel: RADIO_CHANNEL, type: 'snapshot', value: {
      current: value.current, playing: value.isPlaying, loading: value.isLoading,
      profile: value.profile, locale: value.locale,
    } satisfies PlayerSnapshot }, window.location.origin);
  };
  useEffect(() => {
    if (window.parent === window) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== RADIO_CHANNEL || event.data?.type !== 'command' || !validPlayerCommand(event.data.value)) return;
      executePlayerCommand(live.current, event.data.value);
      if (event.data.value.kind === 'snapshot') emit();
    };
    window.addEventListener('message', receive); emit();
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(emit, [controller.current, controller.isPlaying, controller.isLoading, controller.profile, controller.locale]);
}
