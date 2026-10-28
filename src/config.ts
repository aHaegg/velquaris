import "dotenv/config";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set the Supabase session pooler connection string.",
    );
  }
  return url;
}

export function port(): number {
  const raw = process.env.PORT ?? "3000";
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return value;
}

export function uploadSecret(): string | null {
  const secret = process.env.UPLOAD_SECRET?.trim();
  return secret ? secret : null;
}

export type UploadPolicy = "open" | "secret" | "disabled";

export function uploadPolicy(): UploadPolicy {
  if (uploadSecret()) return "secret";
  if (process.env.NODE_ENV === "production") return "disabled";
  return "open";
}
