export function formatNumber(value: string | number | null): string {
  if (value === null || value === "") return "—";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(number);
}
