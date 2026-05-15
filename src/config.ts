import { z } from "zod";

const rawEnvSchema = z.object({
  DRAWDOWN_THRESHOLD: z.string().optional(),
  SYMBOL: z.string().optional(),
  LOOKBACK_DAYS: z.string().optional(),
  MISSED_RUN_LOOKBACK: z.string().optional(),
  ALERT_EMAILS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
});

export type AppConfig = {
  threshold: number;
  symbol: string;
  lookbackDays: number;
  missedRunLookback: number;
  alertEmails: string[];
  resendApiKey: string | undefined;
  resendFrom: string;
};

function parseEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
}

function parsePositiveInt(raw: string | undefined, defaultVal: number): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultVal;
  }
  const v = Number.parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 1) {
    throw new Error(`Expected positive integer env value, got: ${JSON.stringify(raw)}`);
  }
  return v;
}

function parseRatio(raw: string | undefined, defaultVal: number): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultVal;
  }
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0 || v >= 1) {
    throw new Error(
      `DRAWDOWN_THRESHOLD must be a finite number in (0, 1); got ${JSON.stringify(raw)}`,
    );
  }
  return v;
}

/**
 * Validates process.env once per invocation.
 *
 * When `dryRun` is true, recipients and API key can be omitted; if both are
 * set, a real daily status email is sent during `--dry-run` on each run.
 */
export function loadConfig(dryRun: boolean): AppConfig {
  const parsed = rawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }

  const d = parsed.data;
  const threshold = parseRatio(d.DRAWDOWN_THRESHOLD, 0.05);
  const symbol = d.SYMBOL?.trim() || "^GSPC";
  const lookbackDays = parsePositiveInt(d.LOOKBACK_DAYS, 1825);
  const missedRunLookback = parsePositiveInt(d.MISSED_RUN_LOOKBACK, 3);
  const alertEmails = parseEmails(d.ALERT_EMAILS);
  const resendApiKey = d.RESEND_API_KEY?.trim() || undefined;
  const resendFrom = d.RESEND_FROM?.trim() || "onboarding@resend.dev";

  if (!dryRun) {
    if (alertEmails.length === 0) {
      throw new Error(
        "ALERT_EMAILS is required unless --dry-run (comma-separated list)",
      );
    }
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is required unless --dry-run");
    }
  }

  return {
    threshold,
    symbol,
    lookbackDays,
    missedRunLookback,
    alertEmails,
    resendApiKey,
    resendFrom,
  };
}
