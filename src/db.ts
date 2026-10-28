import pg from "pg";
import { databaseUrl } from "./config.js";

const { Pool } = pg;

function needsSsl(connectionString: string): boolean {
  return !/@(localhost|127\.0\.0\.1)(:|\/|\?|$)/.test(connectionString);
}

const connectionString = databaseUrl();

export const pool = new Pool({
  connectionString,
  ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  max: 5,
  connectionTimeoutMillis: 10_000,
});

export type DatabaseStatus = {
  database: string;
  user: string;
};

export async function pingDatabase(): Promise<DatabaseStatus> {
  const result = await pool.query<DatabaseStatus>(
    "select current_database() as database, current_user as user",
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Database ping returned no row");
  }
  return row;
}
