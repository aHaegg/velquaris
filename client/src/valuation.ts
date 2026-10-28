import type { HistoryPoint } from "./types";

const ROLLING_QUARTERS = 4;

export function latestPriceEarnings(
  price: string | null,
  priceDate: string | null,
  earnings: HistoryPoint[],
): { value: string | null; date: string | null } {
  if (!price || !priceDate) return { value: null, date: null };
  const point = priceEarnings([{ asOf: priceDate, value: price }], earnings)[0];
  return point ? { value: point.value, date: priceDate } : { value: null, date: null };
}

export function priceEarnings(prices: HistoryPoint[], earnings: HistoryPoint[]): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  let included = 0;
  for (const price of prices) {
    while (included < earnings.length && (earnings[included]?.asOf ?? "") <= price.asOf) {
      included += 1;
    }
    const sum = trailingSum(earnings, included);
    const priceValue = Number(price.value);
    if (sum === null || sum === 0 || !Number.isFinite(priceValue)) continue;
    points.push({ asOf: price.asOf, value: String(priceValue / sum) });
  }
  return points;
}

function trailingSum(earnings: HistoryPoint[], included: number): number | null {
  if (included < ROLLING_QUARTERS) return null;
  let sum = 0;
  for (let index = included - ROLLING_QUARTERS; index < included; index += 1) {
    const value = Number(earnings[index]?.value);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}
