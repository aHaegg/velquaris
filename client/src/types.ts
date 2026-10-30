export type StockSummary = {
  ticker: string;
  name: string | null;
  price: string | null;
  priceDate: string | null;
  eps: string | null;
  epsYear: number | null;
  epsQuarter: number | null;
  earnings: Earning[];
};

export type HistoryPoint = {
  asOf: string;
  value: string;
};

export type Earning = {
  year: number;
  quarter: number;
  reportDate: string;
  value: string;
};

export type StockHistory = {
  ticker: string;
  name: string | null;
  prices: HistoryPoint[];
  earnings: Earning[];
};

export type SessionUser = {
  username: string;
  role: "admin" | "member";
};

export type AccountStatus = "invite" | "active";

export type Member = {
  username: string;
  role: SessionUser["role"];
  status: "invited" | "active";
};

export type UploadFeedback = {
  tone: "ok" | "warn" | "bad";
  summary: string;
  tickers: string[];
  issues: string[];
};
