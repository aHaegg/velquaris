# velquaris

Web app for stocks you keep in Supabase: price, earnings per share, and P/E over time. History is added by uploading `.csv` files.

## Local

```bash
npm install
cp .env.example .env
# paste the Supabase session pooler URI into DATABASE_URL
npm run dev
```

Open http://localhost:5173. The Vite app proxies API requests to the server on port 3000. `GET /health` checks the database.

`npm run build` compiles the server and the React app. `npm start` serves both from port 3000.

## CSV files

A Nasdaq historical-price export can be uploaded directly. It is semicolon-separated, starts with `sep=;`, and stores `Closing price`. The file has no ticker, so enter one on the upload form. A name like `hmb_20261028_202013.csv` is treated as `HMB` when the ticker box is empty.

A table can use columns `ticker`, `date`, `price`, `eps`, `pe`, and optional `name`. A row can leave price, EPS, or P/E blank. Comma and semicolon files both work.

Uploading the same ticker and date again updates that point. “Replace existing history” deletes stored history for the tickers in the file, then saves the file.

## Render

`render.yaml` defines the web service. Set `DATABASE_URL` to the Supabase session pooler URI (port 5432) from **Connect** at the top of the project. That host is IPv4. Also set `UPLOAD_SECRET`; without it, production uploads stay off.

Tables are created in the `velquaris` schema.
