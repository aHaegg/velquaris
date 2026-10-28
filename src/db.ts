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

create table if not exists velquaris.valuations (
  ticker text not null references velquaris.stocks (ticker) on delete cascade,
  as_of date not null,
  pe numeric not null,
  primary key (ticker, as_of)
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
  pe: string | null;
  peDate: string | null;
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
  valuations: HistoryPoint[];
};

type StockRow = {
  ticker: string;
  name: string | null;
  price: string | null;
  price_date: string | null;
  eps: string | null;
  eps_date: string | null;
  pe: string | null;
  pe_date: string | null;
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
      e.as_of::text as eps_date,
      v.pe::text as pe,
      v.as_of::text as pe_date
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
    left join lateral (
      select pe, as_of from velquaris.valuations
      where ticker = s.ticker
      order by as_of desc
      limit 1
    ) v on true
    order by s.ticker
  `);
  return result.rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.price,
    priceDate: row.price_date,
    eps: row.eps,
    epsDate: row.eps_date,
    pe: row.pe,
    peDate: row.pe_date,
  }));
}

export async function getStock(ticker: string): Promise<StockHistory | null> {
  const stock = await pool.query<{ ticker: string; name: string | null }>(
    "select ticker, name from velquaris.stocks where ticker = $1",
    [ticker],
  );
  const row = stock.rows[0];
  if (!row) return null;
  const [prices, earnings, valuations] = await Promise.all([
    history("prices", "price", ticker),
    history("earnings", "eps", ticker),
    history("valuations", "pe", ticker),
  ]);
  return { ticker: row.ticker, name: row.name, prices, earnings, valuations };
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
      await client.query("delete from velquaris.valuations where ticker = any($1::text[])", [tickers]);
    }
    await insertSeries(client, "prices", "price", parsed.prices);
    await insertSeries(client, "earnings", "eps", parsed.earnings);
    await insertSeries(client, "valuations", "pe", parsed.valuations);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function history(
  table: "prices" | "earnings" | "valuations",
  column: "price" | "eps" | "pe",
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
  table: "prices" | "earnings" | "valuations",
  column: "price" | "eps" | "pe",
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
