import type { TasteProfile } from "../../src/core/types";
import { EMPTY_PROFILE, normalizeProfile } from "../../src/core/recommendation";
import type { RadioStorage } from "../../src/client/api";

const PROFILE_KEY = "qiaomu-radio-profile-v1";
const THEME_KEY = "qiaomu-radio-theme-v2";
const LOCALE_KEY = "qiaomu-radio-locale-v1";

/** Taste memory and skin choice in this browser's own storage. */
export function createLocalStorage(): RadioStorage {
  return {
    loadProfile(): TasteProfile {
      try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return { ...EMPTY_PROFILE };
        return normalizeProfile(JSON.parse(raw));
      } catch {
        return { ...EMPTY_PROFILE };
      }
    },
    saveProfile(profile: TasteProfile): void {
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