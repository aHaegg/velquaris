import type { HistoryPoint } from "./types";

export type QuarterOption = {
  asOf: string;
  label: string;
  eps: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function listQuarters(
  prices: HistoryPoint[],
  earnings: HistoryPoint[],
  today = new Date(),
): QuarterOption[] {
  const epsByDate = new Map(earnings.map((point) => [point.asOf, displayEps(point.value)]));
  const months = quarterEndMonths(earnings);
  const startYear = startYearFor(prices, earnings, today);
  const latest = nextQuarterEnd(months, today);
  const endYear = Number(latest.slice(0, 4));
  const dates = new Set<string>();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const month of months) {
      const asOf = monthEnd(year, month);
      if (asOf <= latest) dates.add(asOf);
    }
  }
  for (const point of earnings) dates.add(point.asOf);

  return [...dates].sort((left, right) => right.localeCompare(left)).map((asOf) => {
    const eps = epsByDate.get(asOf) ?? null;
    const label = quarterLabel(asOf);
    return { asOf, eps, label: eps === null ? label : `${label} · ${eps}` };
  });
}

export function followsReportedMonths(earnings: HistoryPoint[]): boolean {
  return earnings.some((point) => {
    const month = Number(point.asOf.slice(5, 7));
    return month >= 1 && month <= 12;
  });
}

function quarterEndMonths(earnings: HistoryPoint[]): number[] {
  const counts = new Map<number, number>();
  for (const point of earnings) {
    const month = Number(point.asOf.slice(5, 7));
    if (month < 1 || month > 12) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  if (counts.size === 0) return [3, 6, 9, 12];

  let anchor = 3;
  let best = -1;
  for (const [month, count] of counts) {
    if (count > best || (count === best && month < anchor)) {
      best = count;
      anchor = month;
    }
  }
  return [0, 3, 6, 9].map((offset) => ((anchor - 1 + offset) % 12) + 1).sort((left, right) => left - right);
}

function nextQuarterEnd(months: number[], today: Date): string {
  const todayIso = isoFromDate(today);
  const year = today.getFullYear();
  const candidates: string[] = [];
  for (const candidateYear of [year, year + 1]) {
    for (const month of months) candidates.push(monthEnd(candidateYear, month));
  }
  return candidates.filter((asOf) => asOf >= todayIso).sort()[0] ?? monthEnd(year, months[months.length - 1] ?? 12);
}

function startYearFor(prices: HistoryPoint[], earnings: HistoryPoint[], today: Date): number {
  const years = [...prices, ...earnings]
    .map((point) => Number(point.asOf.slice(0, 4)))
    .filter((year) => year >= 1900 && year <= 2200);
  if (years.length === 0) return today.getFullYear() - 1;
  return Math.min(...years);
}

function monthEnd(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  const resolvedYear = date.getUTCFullYear();
  const resolvedMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${resolvedYear}-${resolvedMonth}-${day}`;
}

function quarterLabel(asOf: string): string {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const day = Number(asOf.slice(8, 10));
  const quarter = Math.ceil(month / 3);
  const name = MONTHS[month - 1] ?? "";
  return `${year} Q${quarter} · ${day} ${name} ${year}`;
}

function displayEps(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6, useGrouping: false }).format(number);
}

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
