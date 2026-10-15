export function kitchenDecimal(value: number): string {
  return Number(value.toPrecision(4)).toString();
}
export function formatFraction(value: number): string {
  if (value === 0) return "0";
  for (const denominator of [1, 2, 3, 4, 8, 16]) {
    const numerator = Math.round(value * denominator);
    if (numerator > 0 && Math.abs(numerator / denominator - value) / value <= 0.01) {
      const whole = Math.floor(numerator / denominator), rest = numerator % denominator;
      return rest === 0 ? String(whole) : `${whole ? whole + " " : ""}${rest}/${denominator}`;
    }
  }
  return kitchenDecimal(value);
}
