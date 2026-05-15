/**
 * One daily bar used by decision logic.
 * Dates are ISO `YYYY-MM-DD` (exchange session date as returned by the provider).
 */
export type DailyBar = {
  date: string;
  close: number;
};
