import path from "node:path";
import express from "express";
import multer from "multer";
import {
  activateAccount,
  canonicalUsername,
  createInvite,
  endSession,
  ensureAdminInvite,
  isOtp,
  listUsers,
  loginWithPassword,
  lookupLogin,
  openSession,
  userFromRequest,
  type SessionUser,
} from "./auth.js";
import { port } from "./config.js";
import { getStock, importHistory, listStocks, migrate, pingDatabase, pool, saveEarning } from "./db.js";
import { buildTemplate, canonicalTicker, parseAmount, parseCsv, type ParseIssue } from "./csv.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const clientDir = path.join(process.cwd(), "dist/client");
const devServer = import.meta.url.endsWith(".ts");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

type UploadFeedback = {
  tone: "ok" | "warn" | "bad";
  summary: string;
  tickers: string[];
  issues: string[];
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

app.get("/health", async (_req, res) => {
  try {
    const db = await pingDatabase();
    res.json({ status: "ok", database: db.database });
  } catch (error) {
    console.error(errorMessage(error));
    res.status(503).json({ status: "error", message: "database unavailable" });
  }
});

app.post("/api/auth/lookup", async (req, res) => {
  const username = canonicalUsername(textField(req.body?.username));
  if (!username) {
    res.status(400).json({ message: "Enter a username." });
    return;
  }
  const status = await lookupLogin(username);
  if (!status) {
    res.status(404).json({ message: "That username does not have an invite." });
    return;
  }
  res.json({ status });
});

app.post("/api/auth/activate", async (req, res) => {
  const username = canonicalUsername(textField(req.body?.username));
  const otp = textField(req.body?.otp);
  const password = textField(req.body?.password);
  if (!username || !isOtp(otp)) {
    res.status(400).json({ message: "Enter your username and the four-digit one-time password." });
    return;
  }
  const result = await activateAccount(username, otp, password);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  await openSession(res, result.user);
  res.json(publicUser(result.user));
});

app.post("/api/auth/login", async (req, res) => {
  const username = canonicalUsername(textField(req.body?.username));
  const password = textField(req.body?.password);
  if (!username || !password) {
    res.status(400).json({ message: "Enter your username and password." });
    return;
  }
  const user = await loginWithPassword(username, password);
  if (!user) {
    res.status(401).json({ message: "The username or password is wrong." });
    return;
  }
  await openSession(res, user);
  res.json(publicUser(user));
});

app.post("/api/auth/logout", async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }
  res.json(publicUser(user));
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  res.json(await listUsers());
});

app.post("/api/admin/invites", requireAdmin, async (req, res) => {
  const username = canonicalUsername(textField(req.body?.username));
  const otp = textField(req.body?.otp);
  if (!username) {
    res.status(400).json({ message: "Enter a username. Start with a letter." });
    return;
  }
  if (!isOtp(otp)) {
    res.status(400).json({ message: "The one-time password must be four digits." });
    return;
  }
  const result = await createInvite(username, otp);
  if (!result.ok) {
    res.status(409).json({ message: result.message });
    return;
  }
  res.status(result.replaced ? 200 : 201).json({ username, otp, replaced: result.replaced });
});

app.get("/api/stocks", requireAuth, async (_req, res) => {
  try {
    res.json(await listStocks());
  } catch (error) {
    console.error(errorMessage(error));
    res.status(500).json({ message: "The database could not be reached." });
  }
});

app.get("/api/stocks/:ticker", requireAuth, async (req, res) => {
  const ticker = canonicalTicker(routeParam(req.params.ticker));
  if (!ticker) {
    res.status(404).json({ message: "That stock is not in Velquaris." });
    return;
  }
  try {
    const stock = await getStock(ticker);
    if (!stock) {
      res.status(404).json({ message: "That stock is not in Velquaris." });
      return;
    }
    res.json(stock);
  } catch (error) {
    console.error(errorMessage(error));
    res.status(500).json({ message: "The database could not be reached." });
  }
});

app.post("/api/stocks/:ticker/earnings", requireAuth, async (req, res) => {
  const ticker = canonicalTicker(routeParam(req.params.ticker));
  const year = yearField(textField(req.body?.year));
  const quarter = quarterField(textField(req.body?.quarter));
  const reportDate = isoDate(textField(req.body?.reportDate));
  const previousYearText = textField(req.body?.previousYear);
  const previousQuarterText = textField(req.body?.previousQuarter);
  const previousYear = previousYearText ? yearField(previousYearText) : null;
  const previousQuarter = previousQuarterText ? quarterField(previousQuarterText) : null;
  const eps = parseAmount(textField(req.body?.eps));
  const previousPair = previousYearText !== "" || previousQuarterText !== "";
  if (!ticker || !year || !quarter || !reportDate || eps === null || (previousPair && (!previousYear || !previousQuarter))) {
    res.status(400).json({ message: "Enter a year, a quarter, a report date, and an EPS value." });
    return;
  }
  try {
    const previous = previousYear && previousQuarter ? { year: previousYear, quarter: previousQuarter } : null;
    const saved = await saveEarning(ticker, { year, quarter, reportDate, eps }, previous);
    if (!saved.ok && saved.reason === "conflict") {
      res.status(409).json({ message: "That year and quarter already have an EPS value." });
      return;
    }
    if (!saved.ok) {
      res.status(404).json({
        message: previous ? "That EPS value is no longer there." : "That stock is not in Velquaris.",
      });
      return;
    }
    res.json({ year: saved.year, quarter: saved.quarter, reportDate: saved.reportDate, eps: saved.eps });
  } catch (error) {
    console.error(errorMessage(error));
    res.status(500).json({ message: "The EPS value could not be saved." });
  }
});

app.get("/template.csv", requireAuth, (_req, res) => {
  res
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", 'attachment; filename="velquaris-template.csv"')
    .send(buildTemplate());
});

app.post("/api/upload", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json(bad("That file is larger than 15 MB."));
      return;
    }
    if (error) {
      res.status(400).json(bad("The upload could not be read."));
      return;
    }
    void receiveUpload(req, res).catch(next);
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Not found" });
});

if (devServer) {
  app.use((_req, res) => {
    res
      .status(404)
      .type("html")
      .send("<!doctype html><p>The local site is at <a href=\"http://localhost:5173\">http://localhost:5173</a>.</p>");
  });
} else {
  app.use(express.static(clientDir));

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    res.sendFile(path.join(clientDir, "index.html"), (error) => {
      if (error) next();
    });
  });
}

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(errorMessage(error));
  if (res.headersSent) return;
  res.status(500).json(bad("The upload could not be saved."));
});

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  await requireRole(req, res, next, null);
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  await requireRole(req, res, next, "admin");
}

async function requireRole(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
  role: SessionUser["role"] | null,
): Promise<void> {
  try {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ message: "Sign in to continue." });
      return;
    }
    if (role && user.role !== role) {
      res.status(403).json({ message: "Only an admin can invite people." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

async function receiveUpload(req: express.Request, res: express.Response): Promise<void> {
  const file = req.file;
  if (!file || !file.originalname.toLowerCase().endsWith(".csv")) {
    res.status(400).json(bad("Choose a .csv file."));
    return;
  }
  if (file.buffer.subarray(0, 2).equals(Buffer.from("PK")) || file.buffer.includes(0)) {
    res.status(400).json(bad("Choose a .csv file, not an Excel workbook."));
    return;
  }

  let parsed;
  try {
    parsed = parseCsv(file.buffer, {
      filename: file.originalname,
      ticker: textField(req.body?.ticker),
    });
  } catch (error) {
    console.error(errorMessage(error));
    res.status(400).json(bad("This file could not be read as CSV."));
    return;
  }

  const imported = parsed.prices.length + parsed.earnings.length;
  const issues = parsed.issues.map(formatIssue);
  if (imported === 0) {
    res.status(400).json({
      tone: "bad",
      summary: issues.length > 0 ? "Nothing was saved." : "No price or EPS values were found.",
      tickers: [],
      issues,
    } satisfies UploadFeedback);
    return;
  }

  try {
    await importHistory(parsed, textField(req.body?.replace) === "1");
  } catch (error) {
    console.error(errorMessage(error));
    res.status(500).json(bad("The rows could not be saved."));
    return;
  }

  const counts = [
    countPhrase(parsed.prices.length, "price"),
    countPhrase(parsed.earnings.length, "EPS value"),
  ].filter((part) => !part.startsWith("0 "));
  const feedback: UploadFeedback = {
    tone: issues.length > 0 ? "warn" : "ok",
    summary: `Saved ${counts.join(", ")} for ${parsed.tickers.length} ${parsed.tickers.length === 1 ? "ticker" : "tickers"}.`,
    tickers: parsed.tickers.map((stock) => stock.ticker),
    issues,
  };
  res.status(200).json(feedback);
}

function formatIssue(issue: ParseIssue): string {
  return issue.row === null ? `${issue.source}: ${issue.message}` : `${issue.source}, row ${issue.row}: ${issue.message}`;
}

function countPhrase(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function bad(summary: string): UploadFeedback {
  return { tone: "bad", summary, tickers: [], issues: [] };
}

function publicUser(user: SessionUser): SessionUser {
  return { username: user.username, role: user.role };
}

function yearField(value: string): number | null {
  if (!/^\d{4}$/.test(value.trim())) return null;
  const year = Number(value);
  return year >= 1900 && year <= 2200 ? year : null;
}

function quarterField(value: string): number | null {
  const quarter = Number(value.trim());
  return quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4 ? quarter : null;
}

function isoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function textField(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const server = await start().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});

async function start(): Promise<ReturnType<typeof app.listen>> {
  const db = await pingDatabase();
  console.log(`connected to database ${db.database}`);
  await migrate();
  await ensureAdminInvite();
  return app.listen(port(), () => {
    console.log(`velquaris listening on ${port()}`);
    if (devServer) console.log("Open http://localhost:5173");
  });
}

let stopping = false;

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await pool.end();
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
