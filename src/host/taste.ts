import type { TasteProfile } from "../core/types";
import { EMPTY_PROFILE, normalizeProfile } from "../core/recommendation";
import type { TasteStore } from "./contract";

/** Backing functions a host adapter supplies: read and write one JSON document. */
export type TasteStorageAdapter = {
  read(): string | null;
  write(serialized: string): void;
};

/**
 * A taste store over any read/write pair (plugin data file, harness storage
 * domain, tests). Corrupt or partial documents degrade to an empty profile
 * instead of throwing, because taste memory is a convenience, never a source of
 * truth for the catalog.
 */
export function createTasteStore(adapter: TasteStorageAdapter): TasteStore {
  return {
    read(): TasteProfile {
      try {
        const raw = adapter.read();
        if (!raw) return { ...EMPTY_PROFILE };
        return normalizeProfile(JSON.parse(raw));
      } catch {
        return { ...EMPTY_PROFILE };
      }
    },
    write(profile: TasteProfile): void {
      adapter.write(JSON.stringify(normalizeProfile(profile)));
    },
  };
}

/**
 * Volatile store used when the host has no persistent data seat. The player
 * also keeps taste in the browser's own storage, so nothing is lost for a
 * session even when this store cannot persist.
 */
export function createMemoryTasteStore(initial?: TasteProfile): TasteStore {
  let current: TasteProfile = initial ? normalizeProfile(initial) : { ...EMPTY_PROFILE };
  return {
    read: () => current,
    write: (profile) => {
      current = normalizeProfile(profile);
    },
  };
}