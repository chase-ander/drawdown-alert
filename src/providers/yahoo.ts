import YahooFinance from "yahoo-finance2";
import type { DailyBar } from "./types.js";

function toUtcYmd(sessionDate: Date): string {
  return sessionDate.toISOString().slice(0, 10);
}

/**
 * Loads daily OHLC history from Yahoo Finance and normalizes chronological order.
 *
 * ATH / drawdown use this series only (`lookbackDays` bounds the Yahoo window).
 */
export async function fetchDailyClosesYahoo(params: {
  symbol: string;
  lookbackDays: number;
  /** If set, last bar is the latest session on or before this calendar date (UTC YMD) */
  asOf?: string;
}): Promise<DailyBar[]> {
  const yahooFinance = new YahooFinance();

  const end = params.asOf
    ? new Date(`${params.asOf}T23:59:59.000Z`)
    : new Date();
  const period2 = toUtcYmd(end);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - params.lookbackDays - 31);
  const period1 = toUtcYmd(start);

  const chart = await yahooFinance.chart(params.symbol, {
    period1,
    period2,
    interval: "1d",
  });

  const asOfCmp = params.asOf ?? period2;

  const bars: DailyBar[] = [];
  for (const q of chart.quotes) {
    if (q.close === null || q.close === undefined) {
      continue;
    }
    const date = toUtcYmd(q.date);
    if (params.asOf !== undefined && date > params.asOf) {
      continue;
    }
    bars.push({
      date,
      close: q.close,
    });
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));

  if (bars.length === 0) {
    throw new Error(
      `No Yahoo Finance bars returned for ${params.symbol} (period ${period1}..${period2}, as-of ${asOfCmp})`,
    );
  }

  return bars;
}
