import { periodKey, periodLabel } from "./quarters";
import type { Earning, StockSummary } from "./types";

export type ReportTodo = {
  ticker: string;
  name: string | null;
  kind: "eps" | "date";
  year: number;
  quarter: number;
  reportDate: string | null;
  epsOptional: boolean;
  text: string;
};

export function reportTodos(stocks: StockSummary[], today = new Date()): ReportTodo[] {
  const iso = isoToday(today);
  const eps: ReportTodo[] = [];
  const dates: ReportTodo[] = [];
  const ordered = [...stocks].sort((left, right) => left.ticker.localeCompare(right.ticker));
  for (const stock of ordered) {
    const waiting = stock.earnings
      .filter((earning) => earning.value === null && earning.reportDate < iso)
      .sort((left, right) => left.reportDate.localeCompare(right.reportDate) || left.year - right.year || left.quarter - right.quarter);
    for (const earning of waiting) {
      eps.push({
        ticker: stock.ticker,
        name: stock.name,
        kind: "eps",
        year: earning.year,
        quarter: earning.quarter,
        reportDate: earning.reportDate,
        epsOptional: false,
        text: epsTask(earning),
      });
    }
    const missing = oldestMissingPeriod(stock.earnings, today);
    if (missing && !laterQuarterIsAlreadyScheduled(stock.earnings, missing, iso)) {
      dates.push({
        ticker: stock.ticker,
        name: stock.name,
        kind: "date",
        year: missing.year,
        quarter: missing.quarter,
        reportDate: null,
        epsOptional: stock.earnings.every((earning) => isBeforePeriod(earning.year, earning.quarter, missing.year, missing.quarter)),
        text: `Add ${periodLabel(missing.year, missing.quarter)}.`,
      });
    }
  }
  return [...eps, ...dates];
}

function oldestMissingPeriod(earnings: Earning[], today: Date): { year: number; quarter: number } | null {
  const currentQuarter = Math.ceil((today.getMonth() + 1) / 3);
  const horizon = advancePeriod(today.getFullYear(), currentQuarter);
  if (earnings.length === 0) return { year: today.getFullYear(), quarter: currentQuarter };
  const taken = new Set(earnings.map((earning) => periodKey(earning.year, earning.quarter)));
  const first = [...earnings].sort((left, right) => left.year - right.year || left.quarter - right.quarter)[0];
  if (!first) return null;
  let year = first.year;
  let quarter = first.quarter;
  while (isBeforePeriod(year, quarter, horizon.year, horizon.quarter) || (year === horizon.year && quarter === horizon.quarter)) {
    if (!taken.has(periodKey(year, quarter))) return { year, quarter };
    const next = advancePeriod(year, quarter);
    year = next.year;
    quarter = next.quarter;
  }
  return null;
}

function laterQuarterIsAlreadyScheduled(
  earnings: Earning[],
  missing: { year: number; quarter: number },
  today: string,
): boolean {
  const scheduled = earnings.some((earning) => earning.reportDate >= today);
  return scheduled && earnings.every((earning) => isBeforePeriod(earning.year, earning.quarter, missing.year, missing.quarter));
}

function advancePeriod(year: number, quarter: number): { year: number; quarter: number } {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
}

function isBeforePeriod(year: number, quarter: number, otherYear: number, otherQuarter: number): boolean {
  return year < otherYear || (year === otherYear && quarter < otherQuarter);
}

function epsTask(earning: Earning): string {
  return `Add the EPS for ${periodLabel(earning.year, earning.quarter)}. The report date ${earning.reportDate} has passed.`;
}

function isoToday(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
