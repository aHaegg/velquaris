import type { Split } from "./types";

export function adjustedEpsNumber(value: string, reportDate: string, splits: Split[]): number {
  const actual = Number(value);
  if (!Number.isFinite(actual)) return Number.NaN;
  const later = splits.filter((split) => split.date > reportDate && split.newShares > 0 && split.oldShares > 0);
  if (later.length === 0) return actual;
  let adjusted = actual;
  for (const split of later) adjusted = (adjusted * split.oldShares) / split.newShares;
  return Math.round(adjusted * 1e8) / 1e8;
}

export function formatSplit(split: Split): string {
  return `${split.newShares} for ${split.oldShares}`;
}
