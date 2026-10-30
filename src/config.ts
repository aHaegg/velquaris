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

export function bootstrapOtp(): string | null {
  const otp = process.env.BOOTSTRAP_OTP?.trim() ?? "";
  if (!otp) return null;
  if (!/^\d{4}$/.test(otp)) {
    throw new Error("BOOTSTRAP_OTP must be four digits.");
  }
  return otp;
}
