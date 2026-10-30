/**
 * Parses a list of positive integer deal IDs from arguments or environment variables.
 * Precedence: argv > env > default [1, 2].
 */
export function parseDealIds(
  argv: string[] = [],
  env: Record<string, string | undefined> = process.env,
): number[] {
  // Check argv first
  const raw: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--deals" || arg === "--deal-ids") {
      if (i + 1 < argv.length) {
        raw.push(argv[++i]);
      }
    } else if (arg.startsWith("--deals=") || arg.startsWith("--deal-ids=")) {
      raw.push(arg.split("=")[1]);
    } else if (arg.startsWith("--")) {
      // ignore unknown flags
    } else {
      raw.push(arg);
    }
  }

  // If no argv, check env
  if (raw.length === 0) {
    const envVal = env.MAKHZAN_DEAL_IDS ?? env.MAKHZAN_DEALS;
    if (envVal !== undefined && envVal.trim() !== "") {
      raw.push(envVal);
    }
  }

  // Default if neither argv nor env provided
  if (raw.length === 0) {
    return [1, 2];
  }

  // Split comma or space separated strings
  const items = raw
    .flatMap((s) => s.split(/[,\s]+/))
    .map((s) => s.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return [1, 2];
  }

  const ids: number[] = [];
  for (const item of items) {
    if (!/^\d+$/.test(item)) {
      throw new Error(`invalid dealId "${item}": must be a positive integer`);
    }
    const num = Number(item);
    if (!Number.isSafeInteger(num) || num <= 0) {
      throw new Error(`invalid dealId "${item}": must be a positive integer`);
    }
    ids.push(num);
  }

  return ids;
}
