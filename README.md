# velquaris

Node.js and TypeScript service. It connects to Supabase Postgres and runs as a Render web service.

## Local

```bash
npm install
cp .env.example .env
# paste the Supabase session pooler URI into DATABASE_URL
npm run dev
```

`GET /` returns the service name. `GET /health` checks the database.

## Render

The repo includes `render.yaml`. In the Render dashboard, create a Blueprint from this repository and set `DATABASE_URL` to the Supabase **session pooler** connection string (port 5432).

That host is IPv4. The direct `db.<project-ref>.supabase.co` host is often IPv6-only, which Render cannot reach.

Supabase path: Project Settings → Database → Connection string → Session pooler.
