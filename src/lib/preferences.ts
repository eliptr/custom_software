import { type MeasurementSystem } from "./measurements";
export const MEASUREMENT_PREFERENCE_KEY = "recipe-measurements-v1";
export function readMeasurementPreference(storage?: Pick<Storage, "getItem">): MeasurementSystem {
  try { return (storage || window.localStorage).getItem(MEASUREMENT_PREFERENCE_KEY) === "cups" ? "cups" : "metric"; } catch { return "metric"; }
}
export function writeMeasurementPreference(value: MeasurementSystem, storage?: Pick<Storage, "setItem">): boolean {
  try { (storage || window.localStorage).setItem(MEASUREMENT_PREFERENCE_KEY, value); return true; } catch { return false; }
}
