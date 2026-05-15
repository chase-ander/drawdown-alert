import { Resend } from "resend";
import type { DrawdownAlertDecision } from "./decision.js";

function formatPct01(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

function buildAlertBodies(params: {
  symbol: string;
  threshold: number;
  decision: DrawdownAlertDecision & { action: "alert" };
}): {
  subject: string;
  text: string;
  html: string;
} {
  const thresholdPct = formatPct01(params.threshold);
  const pct = formatPct01(params.decision.drawdown);
  const { decision, symbol } = params;
  const athFmt = `${decision.ath.value.toFixed(2)} (session ${decision.ath.date})`;
  const closeFmt = `${decision.latest.close.toFixed(2)} on ${decision.latest.date}`;

  const subject =
    `drawdown-alert: ${symbol} crossed below ${thresholdPct} drawdown (${decision.crossingDay.date})`;

  const text = [
    `${symbol} drawdown-crossing alert`,
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
    <h2>${symbol} drawdown-crossing alert</h2>
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

function buildNoopBodies(params: {
  symbol: string;
  threshold: number;
  decision: Extract<DrawdownAlertDecision, { action: "noop" }>;
}): {
  subject: string;
  text: string;
  html: string;
} {
  const thresholdPct = formatPct01(params.threshold);
  const { decision, symbol } = params;
  const athFmt = `${decision.ath.value.toFixed(2)} (session ${decision.ath.date})`;
  const closeFmt = `${decision.latest.close.toFixed(2)} on ${decision.latest.date}`;
  const drawdownLine = Number.isFinite(decision.drawdown)
    ? `Current drawdown from ATH: ${formatPct01(decision.drawdown)} (alert threshold: ${thresholdPct})`
    : `Drawdown: n/a (need more history)`;

  const subject = `drawdown-alert: ${symbol} daily status (${decision.latest.date}) — no crossing`;

  const text = [
    `${symbol} daily drawdown check`,
    ``,
    `Latest close: ${closeFmt}`,
    `All-time high (within fetched history): ${athFmt}`,
    drawdownLine,
    `Status: no fresh downward crossing through ${thresholdPct} within the missed-run lookback.`,
    `Reason: ${decision.reason}`,
    ``,
    `This is your scheduled run; no deploy action from this message.`,
  ].join("\n");

  const drawdownHtml = Number.isFinite(decision.drawdown)
    ? `<li><strong>Current drawdown from ATH:</strong> ${formatPct01(decision.drawdown)} <span style="opacity:.85">(threshold ${thresholdPct})</span></li>`
    : `<li><strong>Drawdown:</strong> n/a (need more history)</li>`;

  const html = `
  <body style="font-family: system-ui, sans-serif; line-height: 1.45; color: #111">
    <h2>${symbol} daily drawdown check</h2>
    <p style="margin:0 0 .75rem">No new crossing alert for this run.</p>
    <ul>
      <li><strong>Latest close:</strong> ${closeFmt}</li>
      <li><strong>All-time high (within fetched history):</strong> ${athFmt}</li>
      ${drawdownHtml}
      <li><strong>Reason:</strong> ${decision.reason}</li>
    </ul>
    <p style="opacity: .85;font-size:.95rem">Scheduled daily message — no deploy action.</p>
  </body>`;

  return { subject: subject.trim(), text, html };
}

function buildBodies(params: {
  symbol: string;
  threshold: number;
  decision: DrawdownAlertDecision;
}): {
  subject: string;
  text: string;
  html: string;
} {
  if (params.decision.action === "alert") {
    return buildAlertBodies({
      symbol: params.symbol,
      threshold: params.threshold,
      decision: params.decision,
    });
  }
  return buildNoopBodies({
    symbol: params.symbol,
    threshold: params.threshold,
    decision: params.decision,
  });
}

export async function sendDrawdownEmail(params: {
  apiKey: string;
  from: string;
  to: string[];
  symbol: string;
  threshold: number;
  decision: DrawdownAlertDecision;
}): Promise<void> {
  const resend = new Resend(params.apiKey);
  const { subject, html, text } = buildBodies({
    symbol: params.symbol,
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
