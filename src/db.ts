import pg from "pg";
import { databaseUrl } from "./config.js";
import type { EarningPoint, ParsedHistory, SeriesPoint } from "./csv.js";

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
  year integer not null,
  quarter integer not null,
  report_date date not null,
  eps numeric not null,
  primary key (ticker, year, quarter),
  check (quarter between 1 and 4)
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
  epsYear: number | null;
  epsQuarter: number | null;
  earnings: Earning[];
};

export type HistoryPoint = {
  asOf: string;
  value: string;
};

export type Earning = {
  year: number;
  quarter: number;
  reportDate: string;
  value: string;
};

export type StockHistory = {
  ticker: string;
  name: string | null;
  prices: HistoryPoint[];
  earnings: Earning[];
};

type StockRow = {
  ticker: string;
  name: string | null;
  price: string | null;
  price_date: string | null;
  eps: string | null;
  eps_year: number | null;
  eps_quarter: number | null;
};

const EARNINGS_UPGRADE = `
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'velquaris' and table_name = 'earnings' and column_name = 'as_of'
  ) then
    alter table velquaris.earnings rename column as_of to report_date;
  end if;
end $$;

alter table velquaris.earnings add column if not exists year integer;
alter table velquaris.earnings add column if not exists quarter integer;

update velquaris.earnings
set year = extract(year from (report_date - 60))::integer,
    quarter = ceil(extract(month from (report_date - 60)) / 3.0)::integer
where year is null or quarter is null;

alter table velquaris.earnings alter column year set not null;
alter table velquaris.earnings alter column quarter set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'velquaris.earnings'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) like '%year%'
  ) then
    alter table velquaris.earnings drop constraint if exists earnings_pkey;
    alter table velquaris.earnings add primary key (ticker, year, quarter);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'velquaris.earnings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%quarter%'
  ) then
    alter table velquaris.earnings add constraint earnings_quarter check (quarter between 1 and 4);
  end if;
end $$;
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  await pool.query(EARNINGS_UPGRADE);
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
      e.year as eps_year,
      e.quarter as eps_quarter
    from velquaris.stocks s
    left join lateral (
      select price, as_of from velquaris.prices
      where ticker = s.ticker
      order by as_of desc
      limit 1
    ) p on true
    left join lateral (
      select eps, year, quarter from velquaris.earnings
      where ticker = s.ticker
      order by year desc, quarter desc
      limit 1
    ) e on true
    order by s.ticker
  `);
  const earnings = await pool.query<{
    ticker: string;
    year: number;
    quarter: number;
    report_date: string;
    value: string;
  }>(`
    select ticker, year, quarter, report_date::text as report_date, eps::text as value
    from velquaris.earnings
    order by ticker, year, quarter
  `);
  const earningsByTicker = new Map<string, Earning[]>();
  for (const row of earnings.rows) {
    const points = earningsByTicker.get(row.ticker) ?? [];
    points.push({
      year: row.year,
      quarter: row.quarter,
      reportDate: row.report_date,
      value: row.value,
    });
    earningsByTicker.set(row.ticker, points);
  }
  return result.rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.price,
    priceDate: row.price_date,
    eps: row.eps,
    epsYear: row.eps_year,
    epsQuarter: row.eps_quarter,
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
  const [prices, earnings] = await Promise.all([history(ticker), earningsFor(ticker)]);
  return { ticker: row.ticker, name: row.name, prices, earnings };
}

export type EarningInput = {
  year: number;
  quarter: number;
  reportDate: string;
  eps: number;
};

export type SavedEarning =
  | { ok: true; year: number; quarter: number; reportDate: string; eps: string }
  | { ok: false; reason: "missing" | "conflict" };

export async function saveEarning(
  ticker: string,
  earning: EarningInput,
  previous: { year: number; quarter: number } | null,
): Promise<SavedEarning> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const stock = await client.query("select 1 from velquaris.stocks where ticker = $1", [ticker]);
    if ((stock.rowCount ?? 0) === 0) {
      await client.query("rollback");
      return { ok: false, reason: "missing" };
    }

    const saved = previous
      ? await client.query<{ year: number; quarter: number; report_date: string; eps: string }>(
          `update velquaris.earnings
           set year = $3, quarter = $4, report_date = $5::date, eps = $6
           where ticker = $1 and year = $2 and quarter = $7
           returning year, quarter, report_date::text as report_date, eps::text as eps`,
          [ticker, previous.year, earning.year, earning.quarter, earning.reportDate, earning.eps, previous.quarter],
        )
      : await client.query<{ year: number; quarter: number; report_date: string; eps: string }>(
          `insert into velquaris.earnings (ticker, year, quarter, report_date, eps)
           values ($1, $2, $3, $4::date, $5)
           returning year, quarter, report_date::text as report_date, eps::text as eps`,
          [ticker, earning.year, earning.quarter, earning.reportDate, earning.eps],
        );
    const row = saved.rows[0];
    if (!row) {
      await client.query("rollback");
      return { ok: false, reason: "missing" };
    }
    await client.query("update velquaris.stocks set updated_at = now() where ticker = $1", [ticker]);
    await client.query("commit");
    return { ok: true, year: row.year, quarter: row.quarter, reportDate: row.report_date, eps: row.eps };
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) return { ok: false, reason: "conflict" };
    throw error;
  } finally {
    client.release();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
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
    await insertPrices(client, parsed.prices);
    await insertEarnings(client, parsed.earnings);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function history(ticker: string): Promise<HistoryPoint[]> {
  const result = await pool.query<{ as_of: string; value: string }>(
    `select as_of::text as as_of, price::text as value
     from velquaris.prices
     where ticker = $1
     order by as_of`,
    [ticker],
  );
  return result.rows.map((row) => ({ asOf: row.as_of, value: row.value }));
}

async function earningsFor(ticker: string): Promise<Earning[]> {
  const result = await pool.query<{ year: number; quarter: number; report_date: string; value: string }>(
    `select year, quarter, report_date::text as report_date, eps::text as value
     from velquaris.earnings
     where ticker = $1
     order by year, quarter`,
    [ticker],
  );
  return result.rows.map((row) => ({
    year: row.year,
    quarter: row.quarter,
    reportDate: row.report_date,
    value: row.value,
  }));
}

async function insertPrices(client: pg.PoolClient, points: SeriesPoint[]): Promise<void> {
  if (points.length === 0) return;
  await client.query(
    `insert into velquaris.prices (ticker, as_of, price)
     select * from unnest($1::text[], $2::date[], $3::numeric[])
     on conflict (ticker, as_of) do update set price = excluded.price`,
    [points.map((point) => point.ticker), points.map((point) => point.asOf), points.map((point) => point.value)],
  );
}

async function insertEarnings(client: pg.PoolClient, points: EarningPoint[]): Promise<void> {
  if (points.length === 0) return;
  await client.query(
    `insert into velquaris.earnings (ticker, year, quarter, report_date, eps)
     select * from unnest($1::text[], $2::integer[], $3::integer[], $4::date[], $5::numeric[])
     on conflict (ticker, year, quarter) do update
       set report_date = excluded.report_date, eps = excluded.eps`,
    [
      points.map((point) => point.ticker),
      points.map((point) => point.year),
      points.map((point) => point.quarter),
      points.map((point) => point.reportDate),
      points.map((point) => point.value),
    ],
  );
}
