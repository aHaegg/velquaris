import express from "express";
import { port } from "./config.js";
import { pingDatabase, pool } from "./db.js";

const app = express();

app.get("/", (_req, res) => {
  res.json({ name: "velquaris" });
});

app.get("/health", async (_req, res) => {
  try {
    const db = await pingDatabase();
    res.json({ status: "ok", database: db.database });
  } catch (error) {
    const message = error instanceof Error ? error.message : "database unavailable";
    res.status(503).json({ status: "error", message });
  }
});

const server = app.listen(port(), () => {
  console.log(`velquaris listening on ${port()}`);
  void pingDatabase()
    .then((db) => {
      console.log(`connected to postgres database ${db.database} as ${db.user}`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`postgres connection failed: ${message}`);
    });
});

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
