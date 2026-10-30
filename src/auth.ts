import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { bootstrapOtp } from "./config.js";
import { pool } from "./db.js";

const scryptAsync = promisify(scrypt);
const COOKIE = "velquaris_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_ATTEMPTS = 8;
const OTP_LOCK_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; lockedUntil: number }>();

export type SessionUser = {
  username: string;
  role: "admin" | "member";
};

type UserRow = {
  username: string;
  role: "admin" | "member";
  password_hash: string | null;
  otp_hash: string | null;
};

export function canonicalUsername(value: string): string | null {
  const username = value.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L}\p{N} .'-]{0,39}$/u.test(username)) return null;
  return username;
}

export function isOtp(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export async function ensureAdminInvite(): Promise<void> {
  const existing = await findUser("Andreas");
  if (existing?.password_hash) return;

  const configured = bootstrapOtp();
  const otp = configured ?? String(randomInt(0, 10000)).padStart(4, "0");
  const otpHash = await hashSecret(otp);
  if (existing) {
    if (!configured) return;
    await pool.query("update velquaris.users set otp_hash = $2 where username = $1 and password_hash is null", [
      existing.username,
      otpHash,
    ]);
    console.log("Andreas can sign in with BOOTSTRAP_OTP from the local .env file, then choose a password.");
    return;
  }

  await pool.query(
    `insert into velquaris.users (username, role, otp_hash)
     values ('Andreas', 'admin', $1)`,
    [otpHash],
  );
  if (configured) {
    console.log("Andreas can sign in with the BOOTSTRAP_OTP one-time password, then choose a password.");
  } else {
    console.log(`Andreas one-time password: ${otp}`);
  }
}

export async function lookupLogin(username: string): Promise<"invite" | "active" | null> {
  const user = await findUser(username);
  if (!user) return null;
  return user.password_hash ? "active" : "invite";
}

export async function activateAccount(
  username: string,
  otp: string,
  password: string,
): Promise<{ ok: true; user: SessionUser } | { ok: false; message: string; status: number }> {
  if (!acceptablePassword(password)) {
    return { ok: false, status: 400, message: "Choose a password of at least 8 characters." };
  }
  if (locked(username)) {
    return { ok: false, status: 429, message: "Too many attempts. Try again in 15 minutes." };
  }
  const user = await findUser(username);
  if (!user || !user.otp_hash || user.password_hash) {
    noteFailure(username);
    return { ok: false, status: 401, message: "The one-time password is wrong." };
  }
  if (!(await verifySecret(otp, user.otp_hash))) {
    noteFailure(username);
    return { ok: false, status: 401, message: "The one-time password is wrong." };
  }
  clearFailures(username);
  await pool.query(
    `update velquaris.users
     set password_hash = $2, otp_hash = null, activated_at = now()
     where username = $1`,
    [user.username, await hashSecret(password)],
  );
  return { ok: true, user: { username: user.username, role: user.role } };
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<SessionUser | null> {
  const user = await findUser(username);
  if (!user?.password_hash || locked(username)) {
    await hashSecret(password);
    return null;
  }
  if (!(await verifySecret(password, user.password_hash))) {
    noteFailure(username);
    return null;
  }
  clearFailures(username);
  return { username: user.username, role: user.role };
}

export async function createInvite(
  username: string,
  otp: string,
): Promise<{ ok: true; replaced: boolean } | { ok: false; message: string }> {
  const existing = await findUser(username);
  if (existing?.password_hash) {
    return { ok: false, message: "That username already has an account." };
  }
  const otpHash = await hashSecret(otp);
  if (existing) {
    await pool.query("update velquaris.users set otp_hash = $2 where username = $1", [existing.username, otpHash]);
    return { ok: true, replaced: true };
  }
  try {
    await pool.query(
      `insert into velquaris.users (username, role, otp_hash) values ($1, 'member', $2)`,
      [username, otpHash],
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "That username already has an account." };
    throw error;
  }
  return { ok: true, replaced: false };
}

export async function listUsers(): Promise<{ username: string; role: SessionUser["role"]; status: "invited" | "active" }[]> {
  const result = await pool.query<{ username: string; role: SessionUser["role"]; password_hash: string | null }>(
    `select username, role, password_hash
     from velquaris.users
     order by created_at, username`,
  );
  return result.rows.map((row) => ({
    username: row.username,
    role: row.role,
    status: row.password_hash ? "active" : "invited",
  }));
}

export async function openSession(res: Response, user: SessionUser): Promise<void> {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MS);
  await pool.query("insert into velquaris.sessions (id, username, expires_at) values ($1, $2, $3)", [
    id,
    user.username,
    expires.toISOString(),
  ]);
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS,
  });
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const id = readCookie(req, COOKIE);
  if (id) await pool.query("delete from velquaris.sessions where id = $1", [id]);
  res.clearCookie(COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function userFromRequest(req: Request): Promise<SessionUser | null> {
  const id = readCookie(req, COOKIE);
  if (!id) return null;
  await pool.query("delete from velquaris.sessions where expires_at <= now()");
  const result = await pool.query<{ username: string; role: SessionUser["role"] }>(
    `select u.username, u.role
     from velquaris.sessions s
     join velquaris.users u on u.username = s.username
     where s.id = $1 and s.expires_at > now()`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function findUser(username: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `select username, role, password_hash, otp_hash
     from velquaris.users
     where lower(username) = lower($1)`,
    [username],
  );
  return result.rows[0] ?? null;
}

function acceptablePassword(password: string): boolean {
  return password.length >= 8 && password.length <= 200;
}

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(secret, salt, 32)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const key = (await scryptAsync(secret, salt, expected.length)) as Buffer;
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

function locked(username: string): boolean {
  const state = attempts.get(username.toLowerCase());
  if (!state) return false;
  if (state.lockedUntil > Date.now()) return true;
  if (state.lockedUntil > 0) attempts.delete(username.toLowerCase());
  return false;
}

function noteFailure(username: string): void {
  const key = username.toLowerCase();
  const state = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  state.count += 1;
  if (state.count >= OTP_ATTEMPTS) {
    state.lockedUntil = Date.now() + OTP_LOCK_MS;
    state.count = 0;
  }
  attempts.set(key, state);
}

function clearFailures(username: string): void {
  attempts.delete(username.toLowerCase());
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
