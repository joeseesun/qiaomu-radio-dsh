import type { TasteProfile, Station } from '../core/types';
/** Narrow host seam consumed by the unchanged original Home-provider logic. */
export default interface RadioHomeOwner {
  data: { profile: TasteProfile };
  t(text: string): string;
  player: {
    snapshot(): { station: Station | null; status: 'playing' | 'loading' | 'paused' };
    toggle(): void | Promise<void>;
  };
  activateView(): void;
  playStation(station: Station, queue: Station[]): void | Promise<void>;
}
