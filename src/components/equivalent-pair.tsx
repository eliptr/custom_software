import type { SavedMeasurements } from "@/lib/conversion/equivalents-schema";
import { formatFraction, kitchenDecimal } from "@/lib/conversion/format";
export function equivalentText(value: SavedMeasurements["metric"] | SavedMeasurements["cups"]): string {
  if (!value) return "Unavailable — original measurement is kept";
  const quantity = ["cup", "tbsp", "tsp"].includes(value.unit) ? formatFraction(value.amount) : kitchenDecimal(value.amount);
  return `${value.source === "estimated" ? "≈ " : ""}${quantity} ${value.unit}${value.source === "exact" ? " (exact unit math)" : " (AI estimate)"}`;
}
export function EquivalentPair({ measurements }: { measurements: SavedMeasurements | null }) {
  return <div className="small"><p>Metric: {equivalentText(measurements?.metric ?? null)}</p><p>Cups / Spoons: {equivalentText(measurements?.cups ?? null)}</p></div>;
}
