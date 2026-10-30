import pg from "pg";
import { databaseUrl } from "./config.js";
import type { ParsedHistory, SeriesPoint } from "./csv.js";

const { Pool } = pg;

pg.types.setTypeParser(1082, (value) => value);

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

const SCHEMA = `
create schema if not exists velquaris;

create table if not exists velquaris.stocks (
  ticker text primary key,
  name text,
  updated_at timestamptz not null default now()
);

create table if not exists velquaris.prices (
  ticker text not null references velquaris.stocks (ticker) on delete cascade,
  as_of date not null,
  price numeric not null,
  primary key (ticker, as_of)
);

create table if not exists velquaris.earnings (
  ticker text not null references velquaris.stocks (ticker) on delete cascade,
  as_of date not null,
  eps numeric not null,
  primary key (ticker, as_of)
);

drop table if exists velquaris.valuations;

create table if not exists velquaris.users (
  username text primary key,
  role text not null check (role in ('admin', 'member')),
  password_hash text,
  otp_hash text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create unique index if not exists users_username_lower on velquaris.users (lower(username));

create table if not exists velquaris.sessions (
  id text primary key,
  username text not null references velquaris.users (username) on delete cascade,
  expires_at timestamptz not null
);

revoke all on schema velquaris from public;
`;

export type DatabaseStatus = {
  database: string;
  user: string;
};

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

type StockRow = {
  ticker: string;
  name: string | null;
  price: string | null;
  price_date: string | null;
  eps: string | null;
  eps_date: string | null;
};

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}

export async function pingDatabase(): Promise<DatabaseStatus> {
  const result = await pool.query<DatabaseStatus>(
    "select current_database() as database, current_user as user",
  );
  const row = result.rows[0];
  if (!row) throw new Error("Database ping returned no row");
  return row;
}

export async function listStocks(): Promise<StockSummary[]> {
  const result = await pool.query<StockRow>(`
    select
      s.ticker,
      s.name,
      p.price::text as price,
      p.as_of::text as price_date,
      e.eps::text as eps,
      e.as_of::text as eps_date
    from velquaris.stocks s
    left join lateral (
      select price, as_of from velquaris.prices
      where ticker = s.ticker
      order by as_of desc
      limit 1
    ) p on true
    left join lateral (
      select eps, as_of from velquaris.earnings
      where ticker = s.ticker
      order by as_of desc
      limit 1
    ) e on true
    order by s.ticker
  `);
  const earnings = await pool.query<{ ticker: string; as_of: string; value: string }>(`
    select ticker, as_of::text as as_of, eps::text as value
    from velquaris.earnings
    order by ticker, as_of
  `);
  const earningsByTicker = new Map<string, HistoryPoint[]>();
  for (const row of earnings.rows) {
    const points = earningsByTicker.get(row.ticker) ?? [];
    points.push({ asOf: row.as_of, value: row.value });
    earningsByTicker.set(row.ticker, points);
  }
  return result.rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.price,
    priceDate: row.price_date,
    eps: row.eps,
    epsDate: row.eps_date,
    earnings: earningsByTicker.get(row.ticker) ?? [],
  }));
}

export async function getStock(ticker: string): Promise<StockHistory | null> {
  const stock = await pool.query<{ ticker: string; name: string | null }>(
    "select ticker, name from velquaris.stocks where ticker = $1",
    [ticker],
  );
  const row = stock.rows[0];
  if (!row) return null;
  const [prices, earnings] = await Promise.all([
    history("prices", "price", ticker),
    history("earnings", "eps", ticker),
  ]);
  return { ticker: row.ticker, name: row.name, prices, earnings };
}

export async function saveEarning(
  ticker: string,
  asOf: string,
  eps: number,
): Promise<{ asOf: string; eps: string } | null> {
  const saved = await pool.query<{ as_of: string; eps: string }>(
    `insert into velquaris.earnings (ticker, as_of, eps)
     select $1, $2::date, $3
     where exists (select 1 from velquaris.stocks where ticker = $1)
     on conflict (ticker, as_of) do update set eps = excluded.eps
     returning as_of::text as as_of, eps::text as eps`,
    [ticker, asOf, eps],
  );
  const row = saved.rows[0];
  if (!row) return null;
  await pool.query("update velquaris.stocks set updated_at = now() where ticker = $1", [ticker]);
  return { asOf: row.as_of, eps: row.eps };
}

export async function importHistory(parsed: ParsedHistory, replace: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const tickers = parsed.tickers.map((stock) => stock.ticker);
    const names = parsed.tickers.map((stock) => stock.name);
    await client.query(
      `insert into velquaris.stocks (ticker, name)
       select * from unnest($1::text[], $2::text[])
       on conflict (ticker) do update
         set name = coalesce(excluded.name, velquaris.stocks.name),
             updated_at = now()`,
      [tickers, names],
    );
    if (replace) {
      await client.query("delete from velquaris.prices where ticker = any($1::text[])", [tickers]);
      await client.query("delete from velquaris.earnings where ticker = any($1::text[])", [tickers]);
    }
    await insertSeries(client, "prices", "price", parsed.prices);
    await insertSeries(client, "earnings", "eps", parsed.earnings);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function history(
  table: "prices" | "earnings",
  column: "price" | "eps",
  ticker: string,
): Promise<HistoryPoint[]> {
  const result = await pool.query<{ as_of: string; value: string }>(
    `select as_of::text as as_of, ${column}::text as value
     from velquaris.${table}
     where ticker = $1
     order by as_of`,
    [ticker],
  );
  return result.rows.map((row) => ({ asOf: row.as_of, value: row.value }));
}

async function insertSeries(
  client: pg.PoolClient,
  table: "prices" | "earnings",
  column: "price" | "eps",
  points: SeriesPoint[],
): Promise<void> {
  if (points.length === 0) return;
  await client.query(
    `insert into velquaris.${table} (ticker, as_of, ${column})
     select * from unnest($1::text[], $2::date[], $3::numeric[])
     on conflict (ticker, as_of) do update set ${column} = excluded.${column}`,
    [points.map((point) => point.ticker), points.map((point) => point.asOf), points.map((point) => point.value)],
  );
}
