import { cache } from "react";
import { startOfDay } from "@/lib/date";
import { computeCompetitionRanks } from "@/lib/ranking";
import {
  buildPeriods,
  currentPeriodIdFor,
  rankAthletesForPeriod,
} from "@/lib/periods";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveGroupMembers } from "@/lib/data/groups";
import { computeCurrentStreak, countLoggedDaysInWindow, getLoggedDateKeys } from "@/lib/stats";
import type { LeaderboardRow, PeriodOption, PeriodProgress, PeriodRankSummary } from "@/lib/types";
import {
  fetchActivitiesAsFeedEntries,
  fetchAllAthletes,
  fetchCurrentAthlete,
} from "@/lib/data/supabase-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

function quarterIndexOf(date: Date): number {
  return Math.floor(date.getMonth() / 3);
}

// Periods are pure calendar math, not user data — see lib/periods.ts.
export const getPeriodOptions = cache(async function getPeriodOptions(): Promise<PeriodOption[]> {
  return buildPeriods(new Date()).map(({ id, label }) => ({ id, label }));
});

export const getCurrentPeriodId = cache(async function getCurrentPeriodId(): Promise<string> {
  return currentPeriodIdFor(new Date());
});

export const getPeriodProgress = cache(async function getPeriodProgress(): Promise<PeriodProgress> {
  const today = new Date();
  const quarterIndex = quarterIndexOf(today);
  const quarterStart = new Date(today.getFullYear(), quarterIndex * 3, 1);
  const quarterEnd = new Date(today.getFullYear(), quarterIndex * 3 + 3, 1);

  return {
    periodLabel: `Q${quarterIndex + 1}`,
    currentDay: Math.floor((startOfDay(today).getTime() - quarterStart.getTime()) / DAY_MS) + 1,
    totalDays: Math.round((quarterEnd.getTime() - quarterStart.getTime()) / DAY_MS),
  };
});

/**
 * "Workout days this period" is defined the same way AppStateProvider
 * already defines it client-side (countLoggedDaysInWindow trailing back
 * periodDaysElapsed days from today) rather than a calendar quarter-boundary
 * query, so the SSR value and the client's live recompute never disagree.
 * At this scale (7 athletes, a few hundred rows) fetching full history and
 * ranking in JS via the existing pure helpers is simpler and cheaper than a
 * new SQL aggregate, and reuses code already covered by the client path.
 */
export const getLeaderboard = cache(async function getLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const [athletes, periodProgress, entries] = await Promise.all([
      fetchAllAthletes(),
      getPeriodProgress(),
      fetchActivitiesAsFeedEntries(),
    ]);

    const today = new Date();
    const rows = athletes.map((athlete) => {
      const loggedDateKeys = getLoggedDateKeys(entries, athlete.id);
      const streakDays = computeCurrentStreak(loggedDateKeys, today);
      const hasActiveStreak = streakDays >= 2;

      return {
        athleteId: athlete.id,
        workoutDays: countLoggedDaysInWindow(loggedDateKeys, today, periodProgress.currentDay),
        streakLabel: hasActiveStreak ? `${streakDays}-day streak` : undefined,
        recentCountLabel: hasActiveStreak
          ? undefined
          : `${countLoggedDaysInWindow(loggedDateKeys, today, 30)} in the last 30`,
      };
    });

    return computeCompetitionRanks(rows).sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
});

/**
 * Every logged-at timestamp for each member of the active group, all-time
 * (paginated — PostgREST caps a response at 1000 rows). The Board and the
 * profile's rankings history rank any period client- or server-side from
 * this one small payload instead of a query per period.
 */
export const getLoggedAtByAthlete = cache(async function getLoggedAtByAthlete(): Promise<
  Record<string, string[]>
> {
  const members = await getActiveGroupMembers();
  const result: Record<string, string[]> = Object.fromEntries(members.map((m) => [m.id, []]));
  if (members.length === 0) return result;

  const supabase = await createServerSupabaseClient();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("activities")
      .select("athlete_id, logged_at")
      .in("athlete_id", members.map((m) => m.id))
      .order("logged_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) result[row.athlete_id]?.push(row.logged_at);
    if ((data?.length ?? 0) < pageSize) break;
  }
  return result;
});

export const getMyPeriodRankings = cache(async function getMyPeriodRankings(): Promise<
  PeriodRankSummary[]
> {
  try {
    const [loggedAt, members, currentAthlete] = await Promise.all([
      getLoggedAtByAthlete(),
      fetchAllAthletes(),
      fetchCurrentAthlete(),
    ]);
    const athleteIds = members.map((member) => member.id);

    return buildPeriods(new Date()).map((period) => {
      const mine = rankAthletesForPeriod(athleteIds, loggedAt, period).find(
        (row) => row.athleteId === currentAthlete.id
      );
      const workoutDays = mine?.workoutDays ?? 0;
      return {
        periodId: period.id,
        rank: workoutDays > 0 ? (mine?.rank ?? null) : null,
        workoutDays,
      };
    });
  } catch {
    return [];
  }
});
