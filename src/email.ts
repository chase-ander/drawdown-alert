import { Resend } from "resend";
import type { DrawdownAlertDecision } from "./decision.js";

function formatPct01(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

function buildBodies(params: {
  threshold: number;
  decision: DrawdownAlertDecision & { action: "alert" };
}): {
  subject: string;
  text: string;
  html: string;
} {
  const thresholdPct = formatPct01(params.threshold);
  const pct = formatPct01(params.decision.drawdown);
  const { decision } = params;
  const athFmt = `${decision.ath.value.toFixed(2)} (session ${decision.ath.date})`;
  const closeFmt = `${decision.latest.close.toFixed(2)} on ${decision.latest.date}`;

  const subject =
    `drawdown-alert: crossed below ${thresholdPct} drawdown (${decision.crossingDay.date})`;

  const text = [
    `S&P drawdown-crossing alert`,
    ``,
    `Latest close: ${closeFmt}`,
    `All-time high (within fetched history): ${athFmt}`,
    `Current drawdown from ATH: ${pct}`,
    `Crossing detected on trading session: ${decision.crossingDay.date}`,
    ``,
    `Action: Deploy a $20k lump-sum tranche from your Wealthfront bond portfolio.`,
    ``,
    `Note: You will not get another alert for this dip cycle unless the index sets a new all-time high (within fetched history); the next alert requires a fresh downward crossing.`,
  ].join("\n");

  const html = `
  <body style="font-family: system-ui, sans-serif; line-height: 1.45; color: #111">
    <h2>S&amp;P drawdown-crossing alert</h2>
    <ul>
      <li><strong>Latest close:</strong> ${closeFmt}</li>
      <li><strong>All-time high (within fetched history):</strong> ${athFmt}</li>
      <li><strong>Current drawdown from ATH:</strong> ${pct}</li>
      <li><strong>Crossing session:</strong> ${decision.crossingDay.date}</li>
    </ul>
    <p><strong>Action:</strong> Deploy a $20k lump-sum tranche from your Wealthfront bond portfolio.</p>
    <p style="opacity: .85;font-size:.95rem">No further alerts for this dip cycle until the index sets a new all-time high within the fetched lookback.</p>
  </body>`;

  return { subject: subject.trim(), text, html };
}

export async function sendDrawdownEmail(params: {
  apiKey: string;
  from: string;
  to: string[];
  threshold: number;
  decision: Extract<DrawdownAlertDecision, { action: "alert" }>;
}): Promise<void> {
  const resend = new Resend(params.apiKey);
  const { subject, html, text } = buildBodies({
    threshold: params.threshold,
    decision: params.decision,
  });

  const { error } = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}
