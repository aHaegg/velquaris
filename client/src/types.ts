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
