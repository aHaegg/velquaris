import { adjustedEpsNumber } from "./splits";
import type { Earning, HistoryPoint, Split } from "./types";

const ROLLING_QUARTERS = 4;

export function latestPriceEarnings(
  price: string | null,
  priceDate: string | null,
  earnings: Earning[],
  splits: Split[] = [],
): { value: string | null; date: string | null } {
  if (!price || !priceDate) return { value: null, date: null };
  const point = priceEarnings([{ asOf: priceDate, value: price }], earnings, splits)[0];
  return point ? { value: point.value, date: priceDate } : { value: null, date: null };
}

export function priceEarnings(prices: HistoryPoint[], earnings: Earning[], splits: Split[] = []): HistoryPoint[] {
  const ordered = [...earnings].sort(comparePeriod);
  const points: HistoryPoint[] = [];
  for (const price of prices) {
    const known = ordered.filter((earning) => earning.reportDate <= price.asOf);
    const sum = trailingSum(known, splits);
    const priceValue = Number(price.value);
    if (sum === null || sum === 0 || !Number.isFinite(priceValue)) continue;
    points.push({ asOf: price.asOf, value: String(priceValue / sum) });
  }
  return points;
}

function trailingSum(earnings: Earning[], splits: Split[]): number | null {
  if (earnings.length < ROLLING_QUARTERS) return null;
  let sum = 0;
  for (const earning of earnings.slice(-ROLLING_QUARTERS)) {
    const value = adjustedEpsNumber(earning.value, earning.reportDate, splits);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function comparePeriod(left: Earning, right: Earning): number {
  return left.year - right.year || left.quarter - right.quarter;
}

export function ttmEpsGrowth(earnings: Earning[], splits: Split[] = []): HistoryPoint[] {
  return growthPoints(earnings, splits)
    .sort((left, right) => left.asOf.localeCompare(right.asOf) || left.year - right.year || left.quarter - right.quarter)
    .map(({ asOf, value }) => ({ asOf, value }));
}

export function latestTtmEpsGrowth(
  earnings: Earning[],
  splits: Split[] = [],
): { value: string | null; year: number | null; quarter: number | null } {
  const latest = growthPoints(earnings, splits).at(-1);
  if (!latest) return { value: null, year: null, quarter: null };
  return { value: latest.value, year: latest.year, quarter: latest.quarter };
}

function growthPoints(
  earnings: Earning[],
  splits: Split[],
): Array<HistoryPoint & { year: number; quarter: number }> {
  const byPeriod = new Map<number, Earning>();
  for (const earning of earnings) {
    if (earning.quarter < 1 || earning.quarter > 4) continue;
    byPeriod.set(periodIndex(earning.year, earning.quarter), earning);
  }
  const points: Array<HistoryPoint & { year: number; quarter: number }> = [];
  for (const index of [...byPeriod.keys()].sort((left, right) => left - right)) {
    const current = ttmSum(byPeriod, index, splits);
    const prior = ttmSum(byPeriod, index - ROLLING_QUARTERS, splits);
    const earning = byPeriod.get(index);
    if (current === null || prior === null || prior === 0 || !earning) continue;
    const growth = (current - prior) / Math.abs(prior);
    points.push({
      asOf: earning.reportDate,
      value: String(Math.round(growth * 1e8) / 1e8),
      year: earning.year,
      quarter: earning.quarter,
    });
  }
  return points;
}

function ttmSum(byPeriod: Map<number, Earning>, end: number, splits: Split[]): number | null {
  let sum = 0;
  for (let offset = 0; offset < ROLLING_QUARTERS; offset += 1) {
    const earning = byPeriod.get(end - offset);
    if (!earning) return null;
    const value = adjustedEpsNumber(earning.value, earning.reportDate, splits);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function periodIndex(year: number, quarter: number): number {
  return year * ROLLING_QUARTERS + (quarter - 1);
}

export function pegRatio(prices: HistoryPoint[], earnings: Earning[], splits: Split[] = []): HistoryPoint[] {
  const growth = growthPoints(earnings, splits).sort(
    (left, right) => left.asOf.localeCompare(right.asOf) || left.year - right.year || left.quarter - right.quarter,
  );
  const ratios = priceEarnings(prices, earnings, splits).sort((left, right) => left.asOf.localeCompare(right.asOf));
  const points: HistoryPoint[] = [];
  let growthIndex = 0;
  let known: (typeof growth)[number] | null = null;
  for (const ratio of ratios) {
    while (growthIndex < growth.length && (growth[growthIndex]?.asOf ?? "") <= ratio.asOf) {
      known = growth[growthIndex] ?? null;
      growthIndex += 1;
    }
    if (!known) continue;
    const growthRate = Number(known.value);
    const priceEarningsRatio = Number(ratio.value);
    if (!Number.isFinite(growthRate) || growthRate <= 0 || !Number.isFinite(priceEarningsRatio)) continue;
    const peg = priceEarningsRatio / (growthRate * 100);
    points.push({ asOf: ratio.asOf, value: String(Math.round(peg * 1e8) / 1e8) });
  }
  return points;
}

export function latestPegRatio(
  price: string | null,
  priceDate: string | null,
  earnings: Earning[],
  splits: Split[] = [],
): { value: string | null; date: string | null } {
  if (!price || !priceDate) return { value: null, date: null };
  const point = pegRatio([{ asOf: priceDate, value: price }], earnings, splits)[0];
  return point ? { value: point.value, date: priceDate } : { value: null, date: null };
}

export type PriceEarningsCap = {
  from: string;
  to: string;
  side: "high" | "low";
};

export function graphBounded(
  points: HistoryPoint[],
  min: number,
  max: number,
): { visible: HistoryPoint[]; caps: PriceEarningsCap[] } {
  const sorted = [...points].sort((left, right) => left.asOf.localeCompare(right.asOf));
  const visible: HistoryPoint[] = [];
  const caps: PriceEarningsCap[] = [];
  let cap: PriceEarningsCap | null = null;
  const finishCap = () => {
    if (!cap) return;
    caps.push(cap);
    cap = null;
  };
  for (const point of sorted) {
    const value = Number(point.value);
    if (!Number.isFinite(value)) continue;
    if (value < min || value > max) {
      const side = value > max ? "high" : "low";
      if (cap && cap.side === side) cap.to = point.asOf;
      else {
        finishCap();
        cap = { from: point.asOf, to: point.asOf, side };
      }
    } else {
      finishCap();
      visible.push(point);
    }
  }
  finishCap();
  return { visible, caps };
}

export function graphPriceEarnings(points: HistoryPoint[]): { visible: HistoryPoint[]; caps: PriceEarningsCap[] } {
  const sorted = [...points].sort((left, right) => left.asOf.localeCompare(right.asOf));
  let start = 0;
  let sum = 0;
  let count = 0;
  const visible: HistoryPoint[] = [];
  const caps: PriceEarningsCap[] = [];
  let cap: PriceEarningsCap | null = null;
  const finishCap = () => {
    if (!cap) return;
    caps.push(cap);
    cap = null;
  };
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
    if (average !== null && Number.isFinite(value) && isExtreme(value, average)) {
      const side = value > average ? "high" : "low";
      if (cap && cap.side === side) cap.to = point.asOf;
      else {
        finishCap();
        cap = { from: point.asOf, to: point.asOf, side };
      }
    } else {
      finishCap();
      visible.push(point);
    }
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  finishCap();
  return { visible, caps };
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
