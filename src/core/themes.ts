import type { MoodId, StationSource, ThemeId } from "./types";

/** One player environment offered by the theme picker. */
export type RadioTheme = {
  id: ThemeId;
  label: string;
  family: string;
  note: string;
  mood: MoodId;
  source: StationSource;
  accent: string;
};

/** The five reference environments, in picker order. */
export const RADIO_THEMES: RadioTheme[] = [
  {
    id: "fantasy",
    label: "魔兽世界 3D",
    family: "奇幻实体播放器",
    note: "魔法屏幕与可操作按键",
    mood: "energy",
    source: "radio-browser",
    accent: "#e3a33d",
  },
  {
    id: "rams",
    label: "博朗 · 3D",
    family: "立体收音机",
    note: "实体旋钮与实时屏幕",
    mood: "focus",
    source: "radio-browser",
    accent: "#c36a35",
  },
  {
    id: "pocket",
    label: "iPod",
    family: "便携播放器",
    note: "单色屏与触控圆盘",
    mood: "jazz",
    source: "radio-browser",
    accent: "#758167",
  },
  {
    id: "deck",
    label: "Winamp",
    family: "复古桌面播放器",
    note: "频谱、像素字与紧凑控制",
    mood: "energy",
    source: "radio-browser",
    accent: "#c8ef55",
  },
  {
    id: "console",
    label: "foobar2000",
    family: "资料库播放器",
    note: "密集信息与专业监听",
    mood: "classical",
    source: "radio-browser",
    accent: "#75a7bd",
  },
];

export function getTheme(themeId: ThemeId): RadioTheme {
  return (
    RADIO_THEMES.find((theme) => theme.id === themeId) ||
    (RADIO_THEMES.find((theme) => theme.id === "rams") as RadioTheme)
  );
}

export function themeQuery(themeId: ThemeId): { mood: MoodId; source: StationSource } {
  const theme = getTheme(themeId);
  return { mood: theme.mood, source: theme.source };
}

/** Scene channel copy, matching the reference picker. */
export const MOODS: Array<{ id: MoodId; label: string; note: string; accent: string }> = [
  { id: "unwind", label: "松一口气", note: "轻柔、松弛、缓慢", accent: "#d75f3b" },
  { id: "focus", label: "安静做事", note: "氛围、器乐、低干扰", accent: "#2f6f69" },
  { id: "jazz", label: "爵士时刻", note: "爵士、灵魂、即兴", accent: "#a66a26" },
  { id: "classical", label: "古典留白", note: "古典、巴洛克、歌剧", accent: "#816b56" },
  { id: "energy", label: "需要能量", note: "摇滚、独立、另类", accent: "#b53a38" },
  { id: "world", label: "去远方", note: "世界、民谣、拉丁", accent: "#35718a" },
];