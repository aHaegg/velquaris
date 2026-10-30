import type { Earning, HistoryPoint } from "./types";

const ROLLING_QUARTERS = 4;

export function latestPriceEarnings(
  price: string | null,
  priceDate: string | null,
  earnings: Earning[],
): { value: string | null; date: string | null } {
  if (!price || !priceDate) return { value: null, date: null };
  const point = priceEarnings([{ asOf: priceDate, value: price }], earnings)[0];
  return point ? { value: point.value, date: priceDate } : { value: null, date: null };
}

export function priceEarnings(prices: HistoryPoint[], earnings: Earning[]): HistoryPoint[] {
  const ordered = [...earnings].sort(comparePeriod);
  const points: HistoryPoint[] = [];
  for (const price of prices) {
    const known = ordered.filter((earning) => earning.reportDate <= price.asOf);
    const sum = trailingSum(known);
    const priceValue = Number(price.value);
    if (sum === null || sum === 0 || !Number.isFinite(priceValue)) continue;
    points.push({ asOf: price.asOf, value: String(priceValue / sum) });
  }
  return points;
}

function trailingSum(earnings: Earning[]): number | null {
  if (earnings.length < ROLLING_QUARTERS) return null;
  let sum = 0;
  for (const earning of earnings.slice(-ROLLING_QUARTERS)) {
    const value = Number(earning.value);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function comparePeriod(left: Earning, right: Earning): number {
  return left.year - right.year || left.quarter - right.quarter;
}

export function graphPriceEarnings(points: HistoryPoint[]): HistoryPoint[] {
  const sorted = [...points].sort((left, right) => left.asOf.localeCompare(right.asOf));
  let start = 0;
  let sum = 0;
  let count = 0;
  const visible: HistoryPoint[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    if (!point) continue;
    const cutoff = shiftYears(point.asOf, -2);
    while (start < index && (sorted[start]?.asOf ?? "") < cutoff) {
      sum -= Number(sorted[start]?.value);
      count -= 1;
      start += 1;
    }
    const value = Number(point.value);
    const average = count > 0 ? sum / count : null;
    if (average === null || !Number.isFinite(value) || !isExtreme(value, average)) visible.push(point);
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return visible;
}

function isExtreme(value: number, average: number): boolean {
  return Math.abs(value - average) > Math.abs(average) * 0.5;
}

function shiftYears(iso: string, years: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  const resolved = shifted.getUTCMonth() === month - 1 ? shifted : new Date(Date.UTC(year, month, 0));
  const textMonth = String(resolved.getUTCMonth() + 1).padStart(2, "0");
  const textDay = String(resolved.getUTCDate()).padStart(2, "0");
  return `${resolved.getUTCFullYear()}-${textMonth}-${textDay}`;
}
