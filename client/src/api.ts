import type { StockHistory, StockSummary, UploadFeedback, UploadPolicy } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getStocks(): Promise<StockSummary[]> {
  return getJson<StockSummary[]>("/api/stocks");
}

export function getStock(ticker: string): Promise<StockHistory> {
  return getJson<StockHistory>(`/api/stocks/${encodeURIComponent(ticker)}`);
}

export function getUploadPolicy(): Promise<UploadPolicy> {
  return getJson<{ policy: UploadPolicy }>("/api/upload").then((body) => body.policy);
}

export async function uploadCsv(form: FormData): Promise<UploadFeedback> {
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const body: unknown = await response.json().catch(() => null);
  if (!isFeedback(body)) {
    throw new ApiError("The upload could not be read.", response.status);
  }
  return body;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = messageFrom(body) ?? "The request failed.";
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

function messageFrom(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return null;
}

function isFeedback(body: unknown): body is UploadFeedback {
  if (!body || typeof body !== "object") return false;
  const feedback = body as Partial<UploadFeedback>;
  return (
    (feedback.tone === "ok" || feedback.tone === "warn" || feedback.tone === "bad") &&
    typeof feedback.summary === "string" &&
    Array.isArray(feedback.tickers) &&
    Array.isArray(feedback.issues)
  );
}
