import type { Station, TasteProfile } from "../core/types";
export const RADIO_CHANNEL = 'qiaomu-radio-dsh/player/v1';
export type PlayerSnapshot = {
  current: Station | null; playing: boolean; loading: boolean; profile: TasteProfile; locale: string;
};
export type PlayerCommand = { kind: 'toggle' } | { kind: 'play'; stationId: string } | { kind: 'snapshot' } | { kind: 'updates' };
export function validPlayerCommand(value: unknown): value is PlayerCommand {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PlayerCommand> & { stationId?: unknown };
  return item.kind === 'updates' || item.kind === 'toggle' || item.kind === 'snapshot' || (item.kind === 'play' && typeof item.stationId === 'string' && item.stationId.length > 0 && item.stationId.length < 1000);
}
