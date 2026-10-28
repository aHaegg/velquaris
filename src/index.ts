import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import express from "express";
import multer from "multer";
import { port, uploadPolicy, uploadSecret } from "./config.js";
import { getStock, importHistory, listStocks, migrate, pingDatabase, pool } from "./db.js";
import { buildTemplate, canonicalTicker, parseCsv } from "./csv.js";
import { formatIssue, notFoundPage, problemPage, stockPage, stocksPage, uploadPage, type UploadFeedback } from "./html.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", async (_req, res) => {
  try {
    const db = await pingDatabase();
    res.json({ status: "ok", database: db.database });
  } catch (error) {
    console.error(errorMessage(error));
    res.status(503).json({ status: "error", message: "database unavailable" });
  }
});

app.get("/", async (_req, res) => {
  try {
    sendHtml(res, 200, stocksPage(await listStocks()));
  } catch (error) {
    console.error(errorMessage(error));
    sendHtml(res, 500, problemPage("The database could not be reached."));
  }
});

app.get("/stocks/:ticker", async (req, res) => {
  const ticker = canonicalTicker(routeParam(req.params.ticker));
  if (!ticker) {
    sendHtml(res, 404, notFoundPage());
    return;
  }
  try {
    const stock = await getStock(ticker);
    if (!stock) {
      sendHtml(res, 404, notFoundPage());
      return;
    }
    sendHtml(res, 200, stockPage(stock));
  } catch (error) {
    console.error(errorMessage(error));
    sendHtml(res, 500, problemPage("The database could not be reached."));
  }
});

app.get("/template.csv", (_req, res) => {
  res
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", "attachment; filename=\"velquaris-template.csv\"")
    .send(buildTemplate());
});

app.get("/upload", (_req, res) => {
  sendHtml(res, 200, uploadPage(uploadPolicy(), null));
});

app.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      sendHtml(res, 400, uploadPage(uploadPolicy(), bad("That file is larger than 15 MB.")));
      return;
    }
    if (error) {
      sendHtml(res, 400, uploadPage(uploadPolicy(), bad("The upload could not be read.")));
      return;
    }
    void receiveUpload(req, res).catch(next);
  });
});

app.use((_req, res) => {
  sendHtml(res, 404, notFoundPage());
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(errorMessage(error));
  if (res.headersSent) return;
  sendHtml(res, 500, problemPage("The upload could not be saved."));
});

async function receiveUpload(req: express.Request, res: express.Response): Promise<void> {
  const policy = uploadPolicy();
  if (policy === "disabled") {
    sendHtml(res, 403, uploadPage(policy, bad("Uploads are turned off until UPLOAD_SECRET is set.")));
    return;
  }
  if (policy === "secret" && !secretMatches(field(req.body?.secret), uploadSecret() ?? "")) {
    sendHtml(res, 401, uploadPage(policy, bad("The upload secret is wrong.")));
    return;
  }

  const file = req.file;
  if (!file || !file.originalname.toLowerCase().endsWith(".csv")) {
    sendHtml(res, 400, uploadPage(policy, bad("Choose a .csv file.")));
    return;
  }
  if (file.buffer.subarray(0, 2).equals(Buffer.from("PK")) || file.buffer.includes(0)) {
    sendHtml(res, 400, uploadPage(policy, bad("Choose a .csv file, not an Excel workbook.")));
    return;
  }

  let parsed;
  try {
    parsed = parseCsv(file.buffer, {
      filename: file.originalname,
      ticker: field(req.body?.ticker),
    });
  } catch (error) {
    console.error(errorMessage(error));
    sendHtml(res, 400, uploadPage(policy, bad("This file could not be read as CSV.")));
    return;
  }

  const imported = parsed.prices.length + parsed.earnings.length + parsed.valuations.length;
  const issues = parsed.issues.map(formatIssue);
  if (imported === 0) {
    sendHtml(
      res,
      400,
      uploadPage(policy, {
        tone: "bad",
        summary: issues.length > 0 ? "Nothing was saved." : "No price, EPS, or P/E values were found.",
        tickers: [],
        issues,
      }),
    );
    return;
  }

  try {
    await importHistory(parsed, field(req.body?.replace) === "1");
  } catch (error) {
    console.error(errorMessage(error));
    sendHtml(res, 500, uploadPage(policy, bad("The rows could not be saved.")));
    return;
  }

  const counts = [
    countPhrase(parsed.prices.length, "price"),
    countPhrase(parsed.earnings.length, "EPS value"),
    countPhrase(parsed.valuations.length, "P/E value"),
  ].filter((part) => !part.startsWith("0 "));
  const feedback: UploadFeedback = {
    tone: issues.length > 0 ? "warn" : "ok",
    summary: `Saved ${counts.join(", ")} for ${parsed.tickers.length} ${parsed.tickers.length === 1 ? "ticker" : "tickers"}.`,
    tickers: parsed.tickers.map((stock) => stock.ticker),
    issues,
  };
  sendHtml(res, 200, uploadPage(policy, feedback));
}

function countPhrase(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function bad(summary: string): UploadFeedback {
  return { tone: "bad", summary, tickers: [], issues: [] };
}

function secretMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

function field(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function sendHtml(res: express.Response, status: number, html: string): void {
  res.status(status).set("Cache-Control", "no-store").type("html").send(html);
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
  return app.listen(port(), () => {
    console.log(`velquaris listening on ${port()}`);
  });
}

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
