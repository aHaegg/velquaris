# velquaris

Web app for stocks you keep in Supabase: price and quarterly earnings per share over time. P/E is the price divided by the sum of the last four EPS figures. A date with fewer than four quarters has no P/E. History is added by uploading `.csv` files, and a quarterly EPS can also be entered on the stock page.

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

A table can use columns `ticker`, `date`, `price`, `eps`, and optional `name`. A row can leave price or EPS blank. Comma and semicolon files both work.

Uploading the same ticker and date again updates that point. “Replace existing history” deletes stored prices and EPS for the tickers in the file, then saves the file. P/E is not stored.

## Render

`render.yaml` defines the web service. Set `DATABASE_URL` to the Supabase session pooler URI (port 5432) from **Connect** at the top of the project. That host is IPv4. Set `BOOTSTRAP_OTP` to four digits before the first deploy so Andreas can sign in. After that sign-in, the one-time password is no longer used.

Tables are created in the `velquaris` schema.
