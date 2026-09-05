import { format, parseISO } from "date-fns";

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface ContributionDay {
  date: string;
  count: number;
  level: ContributionLevel;
  /** Pre-rendered tooltip text so the client script needs no date logic. */
  label: string;
}

export interface MonthLabel {
  label: string;
  /** Zero-based grid column the month starts at. */
  column: number;
  span: number;
}

export interface ContributionCalendar {
  total: number;
  /** Column-major: weeks[column][weekday], Sunday first. */
  weeks: (ContributionDay | null)[][];
  months: MonthLabel[];
  /** Consecutive contributing days counted back from the most recent. */
  streak: number;
  from: string;
  to: string;
}

interface ApiDay {
  date?: string;
  count?: number;
  level?: number;
}

interface ApiResponse {
  total?: Record<string, number>;
  contributions?: ApiDay[];
}

const TIMEOUT = 8000;

/**
 * Public, token-free contributions API — the same one iNiR's dashboard uses.
 * `y=last` returns a rolling 12-month window ending today.
 */
const endpoint = (username: string) =>
  `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`;

function toDay(day: ApiDay): ContributionDay | null {
  if (!day.date) return null;

  const count = Math.max(0, Math.trunc(day.count ?? 0));
  const raw = Math.trunc(day.level ?? 0);
  const level = Math.min(4, Math.max(0, raw)) as ContributionLevel;

  return {
    date: day.date,
    count,
    level,
    label: `${count || "No"} contribution${count === 1 ? "" : "s"} on ${format(parseISO(day.date), "MMM d, yyyy")}`,
  };
}

/**
 * Group days into calendar columns.
 *
 * The API returns a flat chronological list, so the grid is rebuilt from each
 * day's weekday rather than by slicing every 7 — a window that doesn't start
 * on a Sunday would otherwise put every day in the wrong row.
 *
 * `parseISO` on a date-only string gives local midnight, so the weekday must be
 * read locally too; `getUTCDay` would shift the grid a row when building west
 * of UTC.
 */
function buildWeeks(days: ContributionDay[]): (ContributionDay | null)[][] {
  const weeks: (ContributionDay | null)[][] = [];
  let column: (ContributionDay | null)[] = new Array(7).fill(null);
  let started = false;

  for (const day of days) {
    const weekday = parseISO(day.date).getDay();

    // A Sunday closes the previous column, except for the very first cell.
    if (weekday === 0 && started) {
      weeks.push(column);
      column = new Array(7).fill(null);
    }

    column[weekday] = day;
    started = true;
  }

  if (started) weeks.push(column);

  return weeks;
}

/** One label per month, skipping any column too narrow to read. */
function buildMonths(weeks: (ContributionDay | null)[][]): MonthLabel[] {
  const months: MonthLabel[] = [];

  weeks.forEach((week, column) => {
    const first = week.find((day) => day !== null);
    if (!first) return;

    const label = format(parseISO(first.date), "MMM");
    const previous = months[months.length - 1];

    if (previous?.label === label) {
      previous.span += 1;
    } else {
      months.push({ label, column, span: 1 });
    }
  });

  return months.filter((month) => month.span > 1);
}

function buildStreak(days: ContributionDay[]): number {
  let streak = 0;

  for (let i = days.length - 1; i >= 0; i -= 1) {
    // Today may legitimately be empty mid-day, so it never breaks a streak.
    if (days[i].count === 0) {
      if (i === days.length - 1) continue;
      break;
    }

    streak += 1;
  }

  return streak;
}

/**
 * Fetch a public contribution calendar at build time — username only, no token.
 *
 * Returns null on any failure (unknown user, network, unexpected shape) so the
 * section simply doesn't render rather than breaking the build.
 */
export async function getContributions(
  username: string,
): Promise<ContributionCalendar | null> {
  if (!username) return null;

  let payload: ApiResponse;

  try {
    const response = await fetch(endpoint(username), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!response.ok) {
      console.warn(`[activity] contributions API returned ${response.status} for ${username}`);
      return null;
    }

    payload = (await response.json()) as ApiResponse;
  } catch (error) {
    console.warn(`[activity] could not load contributions for ${username}:`, error);
    return null;
  }

  const days = (payload.contributions ?? [])
    .map(toDay)
    .filter((day): day is ContributionDay => day !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!days.length) {
    console.warn(`[activity] no contribution days returned for ${username}`);
    return null;
  }

  const weeks = buildWeeks(days);
  const summed = days.reduce((sum, day) => sum + day.count, 0);

  return {
    // Prefer the API's own total; fall back to summing, as iNiR does.
    total: payload.total?.lastYear ?? summed,
    weeks,
    months: buildMonths(weeks),
    streak: buildStreak(days),
    from: days[0].date,
    to: days[days.length - 1].date,
  };
}
