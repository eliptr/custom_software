function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, ordered(item)]));
  return value;
}
export function canonicalJSON(value: unknown, space?: number): string { return JSON.stringify(ordered(value), null, space); }
