import type { DailyBar } from "./providers/types.js";

/**
 * Drawdown alert is edge-triggered (crossing), not level-triggered:
 *
 * - Uses **trading-day** adjacency: the "prior day" for bar i is bar i-1 in the
 *   series Yahoo returns (weekends/holidays omitted). That matches how the market
 *   actually evolves between closes.
 *
 * - For bar index i (today in the local sense), ATH through i uses max(close[0..i]),
 *   and ATH through the prior day uses max(close[0..i-1]). We fire when today's
 *   drawdown is at/above the threshold AND the prior day's drawdown was strictly
 *   below — i.e. the index just crossed downward through the threshold.
 *
 * Missed cron runs:
 * - We inspect the last `missedRunLookback` indices (still trading days only).
 *   If **any** of those days were a crossing day, we alert (subject to ATH reset below).
 *
 * - After a candidate crossing day i, if a later session prints a close **above**
 *   the ATH that held through day i (`max(close[0..i])`), the dip cycle ended and
 *   we suppress the alert for that crossing (new ATH resets the playbook).
 */

export type AthInfo = {
  value: number;
  /** Latest session date whose close attained `value` within the fetched series */
  date: string;
};

export type DrawdownAlertDecision =
  | {
      action: "alert";
      reason: string;
      crossingDay: { date: string; barIndex: number };
      /** Current session (latest bar): close and date shown in notifications */
      latest: { date: string; close: number };
      ath: AthInfo;
      /** Drawdown of latest close vs ATH over the full series (0..1) */
      drawdown: number;
    }
  | {
      action: "noop";
      reason: string;
      latest: { date: string; close: number };
      ath: AthInfo;
      drawdown: number;
    };

function maxCloseThrough(bars: readonly DailyBar[], endIdx: number): number {
  let m = bars[0]?.close ?? -Infinity;
  for (let k = 1; k <= endIdx && k < bars.length; k++) {
    const row = bars[k];
    if (row) {
      m = Math.max(m, row.close);
    }
  }
  return m;
}

function maxCloseRange(
  bars: readonly DailyBar[],
  startIdx: number,
  endIdx: number,
): number {
  let m = -Infinity;
  for (let k = Math.max(startIdx, 0); k <= endIdx && k < bars.length; k++) {
    const row = bars[k];
    if (row) {
      m = Math.max(m, row.close);
    }
  }
  return m;
}

/** ATH value through end of session i inclusive; bar index bounds apply */
function athThrough(bars: readonly DailyBar[], i: number): number {
  return maxCloseThrough(bars, i);
}

function computeAthLatestDate(bars: readonly DailyBar[]): AthInfo {
  let value = bars[0]?.close ?? NaN;
  let date = bars[0]?.date ?? "";

  for (let k = 1; k < bars.length; k++) {
    const b = bars[k];
    if (!b) {
      continue;
    }
    if (b.close >= value) {
      value = b.close;
      date = b.date;
    }
  }

  return { value, date };
}

function isCrossingAt(
  bars: readonly DailyBar[],
  i: number,
  threshold: number,
): boolean {
  if (i < 1) {
    return false;
  }
  const athPrev = maxCloseThrough(bars, i - 1);
  const athToday = athThrough(bars, i);

  const barPrev = bars[i - 1];
  const barI = bars[i];
  if (!barPrev || !barI || athPrev <= 0 || athToday <= 0) {
    return false;
  }

  const priorDrawdown = (athPrev - barPrev.close) / athPrev;
  const todayDrawdown = (athToday - barI.close) / athToday;

  return todayDrawdown >= threshold && priorDrawdown < threshold;
}

/** True if any session after i printed a close above the ATH that held through i */
function hadNewAthAfterSession(bars: readonly DailyBar[], i: number): boolean {
  const athAtI = athThrough(bars, i);
  if (i >= bars.length - 1) {
    return false;
  }
  const maxAfter = maxCloseRange(bars, i + 1, bars.length - 1);
  return maxAfter > athAtI;
}

export function decideDrawdownAlert(
  bars: readonly DailyBar[],
  threshold: number,
  missedRunLookback: number,
): DrawdownAlertDecision {
  if (bars.length < 2) {
    return {
      action: "noop",
      reason: "need_at_least_two_trading_days",
      latest: {
        date: bars[0]?.date ?? "",
        close: bars[0]?.close ?? NaN,
      },
      ath: computeAthLatestDate(bars),
      drawdown: NaN,
    };
  }

  const ath = computeAthLatestDate(bars);
  const last = bars[bars.length - 1];
  if (!last) {
    return {
      action: "noop",
      reason: "internal_no_last_bar",
      latest: { date: "", close: NaN },
      ath,
      drawdown: NaN,
    };
  }

  const drawdown = (ath.value - last.close) / ath.value;

  const n = bars.length;
  const startIdx = Math.max(1, n - missedRunLookback);
  let chosen: number | undefined;

  for (let i = n - 1; i >= startIdx; i--) {
    if (isCrossingAt(bars, i, threshold) && !hadNewAthAfterSession(bars, i)) {
      chosen = i;
      break;
    }
  }

  if (chosen !== undefined) {
    const crossingBar = bars[chosen];
    if (!crossingBar) {
      return {
        action: "noop",
        reason: "internal_missing_crossing_bar",
        latest: { date: last.date, close: last.close },
        ath,
        drawdown,
      };
    }
    return {
      action: "alert",
      reason: "crossing_within_lookback",
      crossingDay: { date: crossingBar.date, barIndex: chosen },
      latest: { date: last.date, close: last.close },
      ath,
      drawdown,
    };
  }

  return {
    action: "noop",
    reason: "no_recent_crossing",
    latest: { date: last.date, close: last.close },
    ath,
    drawdown,
  };
}
