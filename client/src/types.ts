export type StockSummary = {
  ticker: string;
  name: string | null;
  price: string | null;
  priceDate: string | null;
  eps: string | null;
  epsDate: string | null;
  earnings: HistoryPoint[];
};

export type HistoryPoint = {
  asOf: string;
  value: string;
};

export type StockHistory = {
  ticker: string;
  name: string | null;
  prices: HistoryPoint[];
  earnings: HistoryPoint[];
};

export type UploadPolicy = "open" | "secret" | "disabled";

export type UploadFeedback = {
  tone: "ok" | "warn" | "bad";
  summary: string;
  tickers: string[];
  issues: string[];
};
