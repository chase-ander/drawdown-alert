import { describe, expect, it } from "vitest";
import { decideDrawdownAlert } from "./decision.js";

const T = 0.05;

function bar(date: string, close: number) {
  return { date, close };
}

describe("decideDrawdownAlert", () => {
  it("normal market → no alert", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 101),
      bar("2024-01-03", 102),
      bar("2024-01-04", 100),
    ];
    const d = decideDrawdownAlert(bars, T, 3);
    expect(d.action).toBe("noop");
  });

  it("first downward crossing → alert", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 101),
      bar("2024-01-03", 104),
      bar("2024-01-04", 98),
    ];
    const d = decideDrawdownAlert(bars, T, 3);
    expect(d.action).toBe("alert");
    expect(d.reason).toBe("crossing_within_lookback");
    if (d.action === "alert") {
      expect(d.crossingDay.date).toBe("2024-01-04");
      expect(d.latest.date).toBe("2024-01-04");
    }
  });

  it("today is strictly the second session below threshold (lookback 1) → noop", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 103),
      bar("2024-01-03", 95),
      bar("2024-01-04", 93),
      bar("2024-01-05", 92),
    ];
    const d = decideDrawdownAlert(bars, T, 1);
    expect(d.action).toBe("noop");
  });

  it("fresh ATH yesterday, today crosses again → alert", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 109),
      bar("2024-01-03", 114),
      bar("2024-01-04", 107),
    ];
    const d = decideDrawdownAlert(bars, T, 3);
    expect(d.action).toBe("alert");
    if (d.action === "alert") {
      expect(d.crossingDay.date).toBe("2024-01-04");
    }
  });

  it("missed cron: crossing 2 sessions ago → still alert today", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 101),
      bar("2024-01-03", 95),
      bar("2024-01-04", 93),
      bar("2024-01-05", 91),
    ];
    const d = decideDrawdownAlert(bars, T, 3);
    expect(d.action).toBe("alert");
    if (d.action === "alert") {
      expect(d.crossingDay.date).toBe("2024-01-03");
    }
  });

  it("crossing older than MISS window → noop", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 110),
      bar("2024-01-03", 103),
      bar("2024-01-04", 100),
      bar("2024-01-05", 103),
      bar("2024-01-08", 100),
      bar("2024-01-09", 98),
      bar("2024-01-10", 103),
      bar("2024-01-11", 107),
      bar("2024-01-12", 99),
      bar("2024-01-15", 100),
      bar("2024-01-16", 102),
      bar("2024-01-17", 99),
      bar("2024-01-18", 100),
    ];
    const d = decideDrawdownAlert(bars, T, 3);
    expect(d.action).toBe("noop");
  });

  it("crossing invalidated by ATH reset after session → noop", () => {
    const bars = [
      bar("2024-01-01", 100),
      bar("2024-01-02", 112),
      bar("2024-01-03", 106),
      bar("2024-01-04", 117),
      bar("2024-01-05", 102),
      bar("2024-01-08", 101),
      bar("2024-01-09", 100),
      bar("2024-01-10", 97),
    ];
    const d = decideDrawdownAlert(bars, T, 3);
    expect(d.action).toBe("noop");
  });
});
