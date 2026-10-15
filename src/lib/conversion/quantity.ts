import type { MeasurementContext } from "./schema";
const fractions: Record<string, string> = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅐": "1/7", "⅑": "1/9", "⅒": "1/10", "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

export function parseQuantity(raw: string | null, locale: MeasurementContext["numberFormat"] = "auto"): number | null {
  if (!raw) return null;
  const text = raw.trim().replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, c => " " + fractions[c]).replace(/\u2044/g, "/").trim().replace(/^(\d+)-(\d+\/\d+)$/, "$1 $2");
  let value: number;
  const fraction = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) {
    if (Number(fraction[3]) === 0) return null;
    value = Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]);
  } else if (locale !== "auto") {
    const decimal = locale === "en-US" ? "." : ",", grouping = locale === "en-US" ? "," : ".";
    const escapedDecimal = decimal === "." ? "\\." : ",", escapedGrouping = grouping === "." ? "\\." : ",";
    const pattern = new RegExp(`^(?:(?:\\d{1,3}(?:${escapedGrouping}\\d{3})+|\\d+)(?:${escapedDecimal}\\d+)?|${escapedDecimal}\\d+)$`);
    if (!pattern.test(text)) return null;
    value = Number(text.replaceAll(grouping, "").replace(decimal, "."));
  } else {
    // A single three-digit suffix may be a decimal OR a thousands separator.
    // A leading zero or leading decimal point removes the grouping interpretation.
    if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(text)) return null;
    if (/^\d+(?:[.,]\d+)?$/.test(text) || /^[.,]\d+$/.test(text)) value = Number(text.replace(",", "."));
    else if (/^\d{1,3}(?:,\d{3}){2,}$/.test(text)) value = Number(text.replaceAll(",", ""));
    else if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(text)) value = Number(text.replaceAll(".", ""));
    else return null;
  }
  return Number.isFinite(value) && value >= 0 && value <= 1e9 ? value : null;
}
