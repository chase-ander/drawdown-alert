import { loadConfig } from "./config.js";
import { parseCli } from "./cli.js";
import { decideDrawdownAlert } from "./decision.js";
import { fetchDailyClosesYahoo } from "./providers/yahoo.js";
import { sendDrawdownEmail } from "./email.js";

function logJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload));
}

export async function runFromArgv(argv: string[]): Promise<number> {
  const cli = parseCli(argv.slice(2));
  const config = loadConfig(cli.dryRun);

  logJson({
    ok: true,
    phase: "start",
    dryRun: cli.dryRun,
    asOf: cli.asOf ?? null,
    symbol: config.symbol,
    threshold: config.threshold,
    lookbackDays: config.lookbackDays,
    missedRunLookback: config.missedRunLookback,
    alertRecipients: cli.dryRun ? config.alertEmails.length : undefined,
  });

  const bars = await fetchDailyClosesYahoo({
    symbol: config.symbol,
    lookbackDays: config.lookbackDays,
    asOf: cli.asOf,
  });

  const decision = decideDrawdownAlert(bars, config.threshold, config.missedRunLookback);

  const baseLog = {
    ok: true,
    phase: "decision",
    action: decision.action,
    symbol: config.symbol,
    latestDate: decision.latest.date,
    latestClose: decision.latest.close,
    athValue: decision.ath.value,
    athSessionDate: decision.ath.date,
    drawdown: decision.drawdown,
    reason: decision.reason,
    crossingDay:
      decision.action === "alert" ? decision.crossingDay.date : undefined,
    crossingBarIndex:
      decision.action === "alert" ? decision.crossingDay.barIndex : undefined,
  } as const;

  logJson(baseLog);

  const key = config.resendApiKey;
  const hasRecipients = config.alertEmails.length > 0;

  if (cli.dryRun && (!key || !hasRecipients)) {
    logJson({
      ok: true,
      phase: "dry_run_skip_send",
      message:
        "Would send daily email; set ALERT_EMAILS and RESEND_API_KEY to deliver during --dry-run, or run without --dry-run",
    });
  } else {
    if (!key) {
      throw new Error("RESEND_API_KEY missing");
    }
    if (!hasRecipients) {
      throw new Error("ALERT_EMAILS missing");
    }
    await sendDrawdownEmail({
      apiKey: key,
      from: config.resendFrom,
      to: config.alertEmails,
      symbol: config.symbol,
      threshold: config.threshold,
      decision,
    });
    logJson({
      ok: true,
      phase: "email_sent",
      ...(cli.dryRun ? { dryRun: true } : {}),
      decisionAction: decision.action,
      to: config.alertEmails,
    });
  }

  return 0;
}

void runFromArgv(process.argv).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logJson({ ok: false, phase: "fatal", error: message });
    process.exit(1);
  },
);
