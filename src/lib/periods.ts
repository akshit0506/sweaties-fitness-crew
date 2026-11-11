import { addDays, startOfDay, toDateKey } from "@/lib/date";
import { computeCompetitionRanks } from "@/lib/ranking";

/**
 * Leaderboard periods: each calendar quarter of this year (up to the
 * current one), this year, last year, and all time. `start` is inclusive
 * and `end` exclusive, both ISO strings so they can cross the server/client
 * boundary; null means unbounded.
 */
export type Period = {
  id: string;
  label: string;
  kind: "quarter" | "year" | "all";
  start: string | null;
  end: string | null;
};

export function buildPeriods(today: Date): Period[] {
  const year = today.getFullYear();
  const currentQuarter = Math.floor(today.getMonth() / 3);
  const periods: Period[] = [];

  for (let q = 0; q <= currentQuarter; q++) {
    periods.push({
      id: `q${q + 1}-${year}`,
      label: `Q${q + 1} '${String(year).slice(2)}`,
      kind: "quarter",
      start: new Date(year, q * 3, 1).toISOString(),
      end: new Date(year, q * 3 + 3, 1).toISOString(),
    });
  }
  for (const y of [year, year - 1]) {
    periods.push({
      id: String(y),
      label: String(y),
      kind: "year",
      start: new Date(y, 0, 1).toISOString(),
      end: new Date(y + 1, 0, 1).toISOString(),
    });
  }
  periods.push({ id: "all", label: "All time", kind: "all", start: null, end: null });
  return periods;
}

export function currentPeriodIdFor(today: Date): string {
  return `q${Math.floor(today.getMonth() / 3) + 1}-${today.getFullYear()}`;
}

/** Distinct local calendar days an athlete logged, as `toDateKey` keys. */
export function toDayKeySet(loggedAt: string[]): Set<string> {
  const keys = new Set<string>();
  for (const iso of loggedAt) keys.add(toDateKey(new Date(iso)));
  return keys;
}

export function countDaysInPeriod(loggedAt: string[], period: Period): number {
  const start = period.start ? new Date(period.start).getTime() : -Infinity;
  const end = period.end ? new Date(period.end).getTime() : Infinity;
  const days = new Set<string>();
  for (const iso of loggedAt) {
    const date = new Date(iso);
    const t = startOfDay(date).getTime();
    if (t >= start && t < end) days.add(toDateKey(date));
  }
  return days.size;
}

export function rankAthletesForPeriod(
  athleteIds: string[],
  loggedAtByAthlete: Record<string, string[]>,
  period: Period
) {
  const rows = athleteIds.map((athleteId) => ({
    athleteId,
    workoutDays: countDaysInPeriod(loggedAtByAthlete[athleteId] ?? [], period),
  }));
  return computeCompetitionRanks(rows).sort((a, b) => a.rank - b.rank);
}

/** Day x of y through the period, or null when it has no fixed length. */
export function periodProgress(period: Period, today: Date) {
  if (!period.start || !period.end) return null;
  const start = new Date(period.start);
  const end = new Date(period.end);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const elapsed = Math.floor((startOfDay(today).getTime() - start.getTime()) / 86_400_000) + 1;
  const currentDay = Math.min(totalDays, Math.max(0, elapsed));
  return { totalDays, currentDay, isOver: today >= end, endsOn: addDays(end, -1) };
}
