const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,15}$/;
const EXPORT_FILENAME = /^([A-Za-z0-9][A-Za-z0-9.\-]{0,15})_\d{8}(?:_\d+)?\.csv$/i;

const HEADER_FIELDS = {
  ticker: "ticker",
  symbol: "ticker",
  stock: "ticker",
  aktie: "ticker",
  name: "name",
  company: "name",
  bolag: "name",
  namn: "name",
  date: "date",
  datum: "date",
  "as of": "date",
  price: "price",
  close: "price",
  "close price": "price",
  "closing price": "price",
  "adj close": "price",
  "adjusted close": "price",
  last: "price",
  sista: "price",
  stangning: "price",
  stangningskurs: "price",
  pris: "price",
  kurs: "price",
  eps: "eps",
  earnings: "eps",
  "earnings per share": "eps",
  vpa: "eps",
  "vinst per aktie": "eps",
} as const;

type Field = (typeof HEADER_FIELDS)[keyof typeof HEADER_FIELDS];

export type SeriesPoint = {
  ticker: string;
  asOf: string;
  value: number;
};

export type ParseIssue = {
  source: string;
  row: number | null;
  message: string;
};

export type ParsedHistory = {
  tickers: { ticker: string; name: string | null }[];
  prices: SeriesPoint[];
  earnings: SeriesPoint[];
  issues: ParseIssue[];
};

export type CsvParseOptions = {
  filename?: string;
  ticker?: string | null;
};

const EMPTY_TOKENS = new Set(["", "-", "—", "n/a", "na"]);

export function canonicalTicker(value: string): string | null {
  const ticker = value.trim().toUpperCase();
  return TICKER.test(ticker) ? ticker : null;
}

export function parseCsv(buffer: Buffer, options: CsvParseOptions = {}): ParsedHistory {
  const source = options.filename?.split(/[/\\]/).pop() || "File";
  const text = decodeCsv(buffer);
  if (text.includes("\0")) {
    return empty(source, "This file is not a CSV.");
  }

  const prepared = splitSeparatorLine(text);
  const records = parseRecords(prepared.text, prepared.delimiter);
  if (records.length === 0) {
    return empty(source, "The file is empty.");
  }

  const header = findHeader(records);
  if (!header) {
    return empty(
      source,
      "The file needs a date column and at least one of price, closing price, or eps.",
    );
  }

  const fallback = fallbackTicker(options, source);
  if (fallback.issue) return empty(source, fallback.issue);
  const columns = header.columns;
  const hasTickerColumn = [...columns.values()].includes("ticker");
  if (!hasTickerColumn && !fallback.ticker) {
    return empty(
      source,
      "This file has no ticker column. Enter a ticker, such as HMB for Hennes & Mauritz B.",
    );
  }

  const prices = new Map<string, SeriesPoint>();
  const earnings = new Map<string, SeriesPoint>();
  const names = new Map<string, string | null>();
  const issues: ParseIssue[] = [];

  for (let index = header.index + 1; index < records.length; index += 1) {
    const cells = records[index] ?? [];
    readDataRow(
      source,
      prepared.firstLine + index,
      fallback.ticker,
      cells,
      columns,
      prices,
      earnings,
      names,
      issues,
    );
  }

  return {
    tickers: [...names.entries()]
      .map(([ticker, name]) => ({ ticker, name }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    prices: [...prices.values()],
    earnings: [...earnings.values()],
    issues,
  };
}

export function buildTemplate(): string {
  return "ticker,date,price,eps,name\nDEMO,2024-01-31,100,2.5,Sample company\n";
}

function empty(source: string, message: string): ParsedHistory {
  return { tickers: [], prices: [], earnings: [], issues: [{ source, row: null, message }] };
}

function fallbackTicker(
  options: CsvParseOptions,
  source: string,
): { ticker: string | null; issue: string | null } {
  const typed = options.ticker?.trim() ?? "";
  if (typed) {
    const ticker = canonicalTicker(typed);
    return ticker
      ? { ticker, issue: null }
      : { ticker: null, issue: `Invalid ticker “${typed}”. Use letters, numbers, dots, or hyphens.` };
  }
  return { ticker: tickerFromExportFilename(source), issue: null };
}

function tickerFromExportFilename(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const match = EXPORT_FILENAME.exec(base);
  return match?.[1] ? canonicalTicker(match[1]) : null;
}

function decodeCsv(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  try {
    return utf8.decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer).replace(/^\uFEFF/, "");
  }
}

function splitSeparatorLine(text: string): { text: string; delimiter: string; firstLine: number } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const breakAt = normalized.indexOf("\n");
  const first = (breakAt === -1 ? normalized : normalized.slice(0, breakAt)).trim();
  const separator = /^sep=(.)$/i.exec(first);
  if (separator?.[1]) {
    return {
      text: breakAt === -1 ? "" : normalized.slice(breakAt + 1),
      delimiter: separator[1],
      firstLine: 2,
    };
  }
  return { text: normalized, delimiter: sniffDelimiter(normalized), firstLine: 1 };
}

function sniffDelimiter(text: string): string {
  const line = text.split("\n").find((row) => row.trim()) ?? "";
  const semicolons = countOutsideQuotes(line, ";");
  const commas = countOutsideQuotes(line, ",");
  return semicolons > commas ? ";" : ",";
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char ?? "";
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) records.push(row);
      row = [];
      continue;
    }
    field += char ?? "";
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) records.push(row);
  }
  return records;
}

function findHeader(records: string[][]): { index: number; columns: Map<number, Field> } | null {
  let header: { index: number; columns: Map<number, Field> } | null = null;
  let bestScore = 0;
  const limit = Math.min(records.length, 15);
  for (let index = 0; index < limit; index += 1) {
    const columns = columnsForHeader(records[index] ?? []);
    const fields = new Set(columns.values());
    const useful = fields.has("date") && (fields.has("price") || fields.has("eps"));
    if (useful && fields.size > bestScore) {
      bestScore = fields.size;
      header = { index, columns };
    }
  }
  return header;
}

function columnsForHeader(cells: string[]): Map<number, Field> {
  const columns = new Map<number, Field>();
  const seen = new Set<Field>();
  cells.forEach((cell, index) => {
    const field = fieldForHeader(cell);
    if (!field || seen.has(field)) return;
    seen.add(field);
    columns.set(index, field);
  });
  return columns;
}

function fieldForHeader(value: string): Field | null {
  const text = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_/\-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!text) return null;
  return HEADER_FIELDS[text as keyof typeof HEADER_FIELDS] ?? null;
}

function readDataRow(
  source: string,
  line: number,
  fallbackTicker: string | null,
  cells: string[],
  columns: Map<number, Field>,
  prices: Map<string, SeriesPoint>,
  earnings: Map<string, SeriesPoint>,
  names: Map<string, string | null>,
  issues: ParseIssue[],
): void {
  const picked = new Map<Field, string>();
  for (const [index, field] of columns) picked.set(field, cells[index] ?? "");

  const tickerText = (picked.get("ticker") ?? "").trim();
  const dateResult = parseDateText(picked.get("date") ?? "");
  const price = parseMetric(picked.get("price") ?? "");
  const eps = parseMetric(picked.get("eps") ?? "");
  const name = parseName(picked.get("name") ?? "");
  const hasMetric = typeof price === "number" || typeof eps === "number";
  const invalidMetric = price === "invalid" || eps === "invalid";

  if (!tickerText && !dateResult.value && !hasMetric && !invalidMetric && !name) return;
  if (!hasMetric && !invalidMetric) return;

  const ticker = tickerText ? canonicalTicker(tickerText) : fallbackTicker;
  if (!ticker) {
    addIssue(issues, {
      source,
      row: line,
      message: tickerText
        ? `Invalid ticker “${tickerText}”. Use letters, numbers, dots, or hyphens.`
        : "Missing ticker.",
    });
    return;
  }

  if (!dateResult.value) {
    addIssue(issues, {
      source,
      row: line,
      message: dateResult.invalid
        ? `Invalid date “${dateResult.invalid}”. Use YYYY-MM-DD or DD.MM.YYYY.`
        : "Missing date.",
    });
    return;
  }

  let stored = false;
  if (price === "invalid") addIssue(issues, { source, row: line, message: "Price is not a number." });
  if (eps === "invalid") addIssue(issues, { source, row: line, message: "EPS is not a number." });
  if (typeof price === "number") {
    prices.set(pointKey(ticker, dateResult.value), { ticker, asOf: dateResult.value, value: price });
    stored = true;
  }
  if (typeof eps === "number") {
    earnings.set(pointKey(ticker, dateResult.value), { ticker, asOf: dateResult.value, value: eps });
    stored = true;
  }
  if (stored) {
    const existing = names.get(ticker) ?? null;
    names.set(ticker, name ?? existing);
  }
}

function parseName(value: string): string | null {
  const name = value.trim();
  return name ? name.slice(0, 200) : null;
}

function parseDateText(value: string): { value: string | null; invalid: string | null } {
  const text = value.trim();
  if (!text || EMPTY_TOKENS.has(text.toLowerCase())) return { value: null, invalid: null };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return dated(Number(iso[1]), Number(iso[2]), Number(iso[3]), text);
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  if (dotted) return dated(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]), text);
  return { value: null, invalid: text };
}

function dated(
  year: number,
  month: number,
  day: number,
  original: string,
): { value: string | null; invalid: string | null } {
  const value = calendarDate(year, month, day);
  return value ? { value, invalid: null } : { value: null, invalid: original };
}

function parseMetric(value: string): number | null | "invalid" {
  const text = value.trim();
  if (!text || EMPTY_TOKENS.has(text.toLowerCase())) return null;
  const parsed = parseLocaleNumber(text);
  return parsed === null ? "invalid" : parsed;
}

function parseLocaleNumber(value: string): number | null {
  let normalized = value.replace(/[\s\u00a0"]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replaceAll(".", "").replace(",", ".");
    } else {
      normalized = normalized.replaceAll(",", "");
    }
  } else if (normalized.includes(",")) {
    const commaCount = normalized.match(/,/g)?.length ?? 0;
    const thousands = /[+-]?\d{1,3}(,\d{3})+/.test(normalized);
    normalized = thousands && commaCount > 0 && !normalized.includes(".")
      ? normalized.replaceAll(",", "")
      : normalized.replace(",", ".");
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function calendarDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pointKey(ticker: string, asOf: string): string {
  return `${ticker}|${asOf}`;
}

function addIssue(issues: ParseIssue[], issue: ParseIssue): void {
  if (issues.length < 50) issues.push(issue);
}
