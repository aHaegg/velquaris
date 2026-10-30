import type { Earning, HistoryPoint } from "./types";

export type QuarterOption = {
  year: number;
  quarter: number;
  label: string;
};

export function listMissingQuarters(prices: HistoryPoint[], earnings: Earning[], today = new Date()): QuarterOption[] {
  const taken = new Set(earnings.map((earning) => periodKey(earning.year, earning.quarter)));
  const startYear = startYearFor(prices, earnings, today);
  const endYear = today.getFullYear();
  const endQuarter = Math.ceil((today.getMonth() + 1) / 3);
  const options: QuarterOption[] = [];
  for (let year = endYear; year >= startYear; year -= 1) {
    const lastQuarter = year === endYear ? endQuarter : 4;
    for (let quarter = lastQuarter; quarter >= 1; quarter -= 1) {
      if (taken.has(periodKey(year, quarter))) continue;
      options.push({ year, quarter, label: periodLabel(year, quarter) });
    }
  }
  return options;
}

export function periodLabel(year: number, quarter: number): string {
  return `${year} Q${quarter}`;
}

export function periodKey(year: number, quarter: number): string {
  return `${year}-${quarter}`;
}

function startYearFor(prices: HistoryPoint[], earnings: Earning[], today: Date): number {
  const years = [
    ...prices.map((point) => Number(point.asOf.slice(0, 4))),
    ...earnings.map((earning) => earning.year),
  ].filter((year) => year >= 1900 && year <= 2200);
  if (years.length === 0) return today.getFullYear() - 1;
  return Math.min(...years);
}
