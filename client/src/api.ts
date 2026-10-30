import type { AccountStatus, Member, SessionUser, StockHistory, StockSummary, UploadFeedback } from "./types";

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

export function saveEarning(ticker: string, asOf: string, eps: string): Promise<{ asOf: string; eps: string }> {
  return postJson(`/api/stocks/${encodeURIComponent(ticker)}/earnings`, { asOf, eps });
}

export async function currentUser(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError("Sign in could not be checked.", response.status);
  return response.json() as Promise<SessionUser>;
}

export function lookupAccount(username: string): Promise<{ status: AccountStatus }> {
  return postJson("/api/auth/lookup", { username });
}

export function activateAccount(username: string, otp: string, password: string): Promise<SessionUser> {
  return postJson("/api/auth/activate", { username, otp, password });
}

export function login(username: string, password: string): Promise<SessionUser> {
  return postJson("/api/auth/login", { username, password });
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new ApiError("Could not sign out.", response.status);
}

export function listMembers(): Promise<Member[]> {
  return getJson("/api/admin/users");
}

export function inviteMember(username: string, otp: string): Promise<{ username: string; otp: string; replaced: boolean }> {
  return postJson("/api/admin/invites", { username, otp });
}

export async function uploadCsv(form: FormData): Promise<UploadFeedback> {
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const body: unknown = await response.json().catch(() => null);
  if (!isFeedback(body)) {
    throw new ApiError("The upload could not be read.", response.status);
  }
  return body;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(messageFrom(payload) ?? "The request failed.", response.status);
  }
  return payload as T;
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
