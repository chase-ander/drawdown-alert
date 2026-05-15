# Claude Code: Build Spec

## Goal

Build a stateless service that monitors the S&P 500 daily and emails me when
it **crosses** from above -5% to at or below -5% drawdown from its all-time
high. This is a personal tool — single user, single subscriber, low traffic.

Because the trigger fires on the *crossing event* rather than on the *condition*,
no state needs to be persisted. The service is pure: fetch data → decide →
optionally email → exit.

## Why I want this

I'm executing a dollar-cost-averaging strategy from a bond portfolio into
equities. Baseline is $5k/week. On top of that, I want to deploy a $20k
lump-sum tranche whenever the S&P drops 5%+ from its recent ATH — a "buy
the dip" overlay. I don't want to manually watch the market, so I want an
automated email when the trigger condition is met.

I only want **one alert per drawdown cycle** — not a flood of duplicate
emails every day the market remains below the threshold.

## Tech stack preferences

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Hosting**: Render (https://render.com) — using a Cron Job service
- **Database**: **none**. State is derived from price history.
- **Email delivery**: pick one of Resend, SendGrid, or Postmark. Resend is
  probably simplest. Free tier sufficient.
- **My existing stack**: Node.js, TypeScript, React, PostgreSQL — but no
  Postgres needed for this project.

## Functional requirements

1. **Daily check** — runs Mon-Fri after US market close (around 4:30pm ET).
   Use Render Cron Job with a schedule like `0 22 * * 1-5` (22:00 UTC,
   weekdays).

2. **Data source** — fetch historical daily closes of the S&P 500. The
   `yahoo-finance2` npm package supports historical queries
   (`yahooFinance.historical()` or `chart()`). Fetch enough history to be
   confident about the all-time high — pulling 5+ years of daily closes is
   trivial and fast. The data source should be easy to swap (Alpha Vantage,
   Financial Modeling Prep, Polygon.io are alternatives).

3. **Stateless trigger logic** — given a series of daily closes ending with
   today:

   ```
   Let ATH = max(close) across the full series
   Let today_drawdown = (ATH - today_close) / ATH
   Let yesterday_drawdown = (ATH_as_of_yesterday - yesterday_close) / ATH_as_of_yesterday

   If today_drawdown >= 0.05 AND yesterday_drawdown < 0.05:
     → FIRE alert (this is the crossing event)
   Otherwise:
     → no-op
   ```

   Note: "ATH as of yesterday" means the max close in the series *excluding*
   today. This matters because if today simultaneously sets a new ATH (won't
   happen if today is also in a drawdown, but worth being precise) it
   shouldn't affect yesterday's drawdown calculation.

4. **Missed-run resilience** — if the cron job misses a day (Render outage,
   holiday, etc.), the simple "today vs yesterday" check could let a crossing
   event slip through. To handle this:

   - Walk backward through the last **3 trading days** (today, day-1, day-2)
   - For each, check if that day was a "crossing day" (drawdown ≥ 5% AND
     the prior day's drawdown < 5%)
   - If any of the last 3 days was a crossing AND no later day has set a new
     ATH → fire the alert
   - This is more permissive but catches missed days gracefully

   Document this logic clearly in code comments.

5. **Notification** — email. Use whichever provider you chose. Keep the
   recipient list configurable via env var (`ALERT_EMAILS`, comma-separated)
   so I can add my partner later without redeploying.

6. **Alert content** should include:
   - Current S&P close and date
   - All-time high value and date it was set
   - Current drawdown percentage from ATH
   - A reminder of the action to take ("deploy $20k tranche from Wealthfront
     bond portfolio")
   - A note that no further alerts will fire until the S&P sets a new ATH

## Non-functional requirements

- **Cost**: should run on Render's free tier.

- **Observability**: stdout/stderr logs visible in Render dashboard are fine.
  Log enough context on each run that I can diagnose issues from the log
  alone (current close, computed ATH, drawdown, decision).

- **Deployment**: deployable via `render.yaml` (Render's Blueprint spec).
  Commit infrastructure config alongside code so the whole thing can be
  recreated from the repo.

- **Local testing**: provide a `--dry-run` flag or separate local script
  that runs the full logic and prints what *would* happen, without sending
  an email. Useful for sanity-checking and for testing on specific historical
  dates.

- **Backtest mode (optional but nice)**: a flag like `--as-of YYYY-MM-DD`
  that runs the logic as if today were that date. Useful for validating the
  crossing-event logic against historical drawdowns (e.g., March 2020,
  late 2018, August 2024).

## Configuration knobs

All env vars:

- `DRAWDOWN_THRESHOLD` — default 0.05
- `SYMBOL` — default `^GSPC` (S&P 500). Could also be `^IXIC`, `^DJI`, etc.
- `LOOKBACK_DAYS` — default 1825 (5 years). How much history to fetch when
  determining ATH.
- `MISSED_RUN_LOOKBACK` — default 3. How many recent trading days to check
  for a crossing event.
- `ALERT_EMAILS` — comma-separated recipient list
- `RESEND_API_KEY` (or equivalent) — email provider credential

## Out of scope for v1

- Web UI — not needed
- Multiple thresholds (-5%, -7%, -10% separately) — single threshold only
- SMS — email only
- Database / persistent state — explicitly not needed

## Operational considerations to address

- **Idempotency**: running the job twice in one day cannot cause duplicate
  alerts, because the logic is purely a function of price history. If
  today's crossing event was detected on run 1, run 2 will detect the
  same crossing event — and that's where we need to think about it.

  **Two options to handle re-runs:**

  a) **Accept the duplicate** — for a personal tool with rare alerts
     (~1-3x/year), an occasional duplicate email is harmless and the
     simplicity is worth it.

  b) **De-dupe via email provider idempotency** — most email providers
     support idempotency keys. Compute a deterministic key like
     `sp500-drawdown-{ATH_date}-{crossing_date}` so a re-run sends the
     same logical email and the provider de-dupes.

  I lean toward (a) for simplicity. Note your choice in the README.

- **Holidays/weekends**: Yahoo Finance returns trading days only, so
  "yesterday" in the price series is the previous *trading* day, not the
  previous calendar day. This is the correct behavior — the missed-run
  lookback should also operate on trading days, not calendar days.

- **Logging on no-op runs**: even when no alert fires, log enough that I
  can see the system is healthy (e.g., "S&P 500 at 5800, ATH 6000 on
  2026-04-12, drawdown 3.33%, no action").

## Deliverables

1. Project structure (single TypeScript package)
2. Main entrypoint that the Cron Job invokes
3. `render.yaml` Blueprint with the cron service (no database)
4. `--dry-run` and `--as-of` modes for local testing
5. README with:
   - Architecture overview (emphasize the stateless design)
   - Setup steps (prerequisites, install, deploy to Render)
   - How to test locally and backtest against historical dates
   - How to swap the data source
   - How to add more email recipients
   - Note on duplicate-email behavior on re-runs
6. `.gitignore`
7. `.env.example` listing required env vars

## Style preferences

- Strict TypeScript, no `any`
- Functional style — the core decision logic should be a pure function
  `(priceSeries, threshold, lookback) => Decision` that's easy to unit test
- Comments only where logic is non-obvious. The crossing-event logic
  deserves a comment block explaining the design.
- Reasonable error handling. If the data fetch fails, log clearly and exit
  non-zero so Render flags the failure.

## Testing

Since the core logic is a pure function over a price series, include a
small set of unit tests covering:

- Normal market (no crossing) → no alert
- Today is the first crossing → alert
- Today is the second day below threshold → no alert
- New ATH was set yesterday, today crosses → alert
- Missed run scenario (crossing happened 2 days ago, no run since) → alert
- Crossing happened 5 days ago (beyond lookback) → no alert

Vitest or Node's built-in test runner — your call.

## What to ask me before starting

Before writing code, briefly confirm:

1. Your chosen project structure
2. Your choice of email provider (Resend, SendGrid, Postmark, other)
3. Your choice of test runner
4. Any deviations from this spec you're proposing and why

Then proceed.
