export type ParsedCli = {
  dryRun: boolean;
  asOf?: string;
};

function isoDateLooksValid(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return false;
  }
  const d = new Date(`${ymd}T12:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === ymd;
}

export function parseCli(argv: string[]): ParsedCli {
  const positional: string[] = [];
  let dryRun = false;
  let asOf: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) {
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--as-of") {
      const next = argv[i + 1];
      i++;
      if (next === undefined || next.startsWith("--")) {
        throw new Error("--as-of requires YYYY-MM-DD argument");
      }
      if (!isoDateLooksValid(next)) {
        throw new Error(
          `--as-of must be UTC calendar date YYYY-MM-DD (invalid: ${JSON.stringify(next)})`,
        );
      }
      asOf = next;
    } else if (!a.startsWith("--")) {
      positional.push(a);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positional.join(" ")}`);
  }

  return { dryRun, asOf };
}
