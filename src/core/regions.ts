/** Countries offered by the region picker, in menu order. */
export const RADIO_REGIONS = [
  "CN", "US", "GB", "DE", "FR", "ES", "JP", "KR", "CA", "AU",
  "BR", "MX", "IT", "NL", "SE", "CH", "AT", "IN", "SG", "HK",
] as const;

export type RadioRegion = (typeof RADIO_REGIONS)[number];

/** Human copy for a region code, falling back to the catalog country name. */
export const REGION_LABELS: Record<string, string> = {
  CN: "中国", US: "美国", GB: "英国", DE: "德国", FR: "法国", ES: "西班牙",
  JP: "日本", KR: "韩国", CA: "加拿大", AU: "澳大利亚", BR: "巴西", MX: "墨西哥",
  IT: "意大利", NL: "荷兰", SE: "瑞典", CH: "瑞士", AT: "奥地利", IN: "印度",
  SG: "新加坡", HK: "中国香港",
};