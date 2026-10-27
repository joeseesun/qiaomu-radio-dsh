import type { TasteProfile } from "../../src/core/types";
import { EMPTY_PROFILE, normalizeProfile } from "../../src/core/recommendation";
import type { PlayerPreferences, RadioStorage } from "../../src/client/api";

const PREFERENCES_KEY = "qiaomu-radio-preferences-v1";
const MOODS = new Set(["recommend", "unwind", "focus", "jazz", "classical", "energy", "world"]);
const PROFILE_KEY = "qiaomu-radio-profile-v1";
const THEME_KEY = "qiaomu-radio-theme-v2";
const LOCALE_KEY = "qiaomu-radio-locale-v1";

/** Taste memory and skin choice in this browser's own storage. */
export function createLocalStorage(): RadioStorage {
  let writable = true;
  // Preserve the exact original before normalizing malformed or older data.
  function archive(raw: string) {
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
    const base = PROFILE_KEY + '-recovery-' + (hash >>> 0).toString(16);
    for (let index = 0; index < 100; index++) {
      const key = base + '-' + index, existing = localStorage.getItem(key);
      if (existing === raw) return;
      if (existing === null) { localStorage.setItem(key, raw); return; }
    }
    throw Error('Could not preserve original radio profile');
  }
  return {
    loadPreferences(): PlayerPreferences | null {
      try {
        const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || 'null');
        return value && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 && MOODS.has(value.mood) ? { volume: value.volume, mood: value.mood } : null;
      } catch { return null; }
    },
    savePreferences(value: PlayerPreferences): void {
      if (!Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1 || !MOODS.has(value.mood)) return;
      try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* Same best-effort local storage contract as taste/theme. */ }
    },
    loadProfile(): TasteProfile {
      try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return { ...EMPTY_PROFILE };
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { archive(raw); return normalizeProfile(null); }
        const normalized = normalizeProfile(parsed);
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) archive(raw);
        return normalized;
      } catch {
        writable = false;
        return normalizeProfile(null);
      }
    },
    saveProfile(profile: TasteProfile): void {
      if (!writable) return;
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
      } catch {
        /* private mode or full quota: taste memory is best effort */
      }
    },
    loadTheme(): string | null {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    },
    saveTheme(themeId: string): void {
      try {
        localStorage.setItem(THEME_KEY, themeId);
      } catch {
        /* ignore */
      }
    },
  };
}

export { LOCALE_KEY };