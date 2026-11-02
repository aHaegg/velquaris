# velquaris

Web app for stocks you keep in Supabase: price, quarterly earnings per share, and stock splits. Each EPS row has a year, a quarter, and the report date, which is the day the report is released. Prices are stored as imported, already adjusted for splits. EPS is stored as reported. A stock split on the stock page, such as 4 for 1, divides every EPS reported before that date by 4. Later splits multiply. The stock page shows the reported EPS and the adjusted EPS. The EPS graph and P/E use the adjusted figures. P/E is the price divided by the sum of the last four adjusted EPS figures whose report date is on or before that price. A price with fewer than four reported quarters has no P/E. History is added by uploading `.csv` files, and a quarterly EPS or a stock split can also be entered on the stock page.

## Local

```bash
npm install
cp .env.example .env
# paste the Supabase session pooler URI into DATABASE_URL
npm run dev
```

Open http://localhost:5173. The Vite app proxies API requests to the server on port 3000. `GET /health` checks the database.

Set `BOOTSTRAP_OTP` to four digits before the first start. Sign in as **Andreas** with that one-time password and choose your own password. Andreas is the admin. From People, invite someone by choosing their username and a four-digit one-time password, then tell them both. The first time they sign in, they enter that code and choose their own password.

`npm run build` compiles the server and the React app. `npm start` serves both from port 3000.

## CSV files

A Nasdaq historical-price export can be uploaded directly. It is semicolon-separated, starts with `sep=;`, and stores `Closing price`. The file has no ticker, so enter one on the upload form. A name like `hmb_20261028_202013.csv` is treated as `HMB` when the ticker box is empty.

A table can use columns `ticker`, `date`, `price`, `year`, `quarter`, `report_date`, `eps`, and optional `name`. A price row uses `date`. An EPS row uses `year`, `quarter`, and `report_date`. A row can leave price or EPS blank. If year and quarter are blank, they are taken from about two months before the report date. Comma and semicolon files both work.

Uploading the same ticker and date again updates that price. Uploading the same ticker, year, and quarter again updates that EPS. “Replace existing history” deletes stored prices and EPS for the tickers in the file, then saves the file. Stock splits stay. P/E is not stored.

## Render

`render.yaml` defines the web service. Set `DATABASE_URL` to the Supabase session pooler URI (port 5432) from **Connect** at the top of the project. That host is IPv4. Set `BOOTSTRAP_OTP` to four digits before the first deploy so Andreas can sign in. After that sign-in, the one-time password is no longer used.

Tables are created in the `velquaris` schema.
