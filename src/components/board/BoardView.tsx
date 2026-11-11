"use client";

import { useMemo, useState } from "react";
import { Podium } from "@/components/board/Podium";
import { ProgressRail } from "@/components/board/ProgressRail";
import { RankedList } from "@/components/board/RankedList";
import { SegmentedTabBar } from "@/components/board/SegmentedTabBar";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { useAppState } from "@/components/providers/AppStateProvider";
import {
  countDaysInPeriod,
  periodProgress,
  rankAthletesForPeriod,
  toDayKeySet,
  type Period,
} from "@/lib/periods";
import { computeCurrentStreak } from "@/lib/stats";

type BoardViewProps = {
  periods: Period[];
  currentPeriodId: string;
  loggedAtByAthlete: Record<string, string[]>;
};

export function BoardView({ periods, currentPeriodId, loggedAtByAthlete }: BoardViewProps) {
  const { athletes, currentUser, entries } = useAppState();
  const [selectedId, setSelectedId] = useState(currentPeriodId);
  const period = periods.find((p) => p.id === selectedId) ?? periods[0];

  // Server history plus anything logged/received live in this session
  // (optimistic adds, realtime updates) — duplicates collapse because
  // everything is counted by distinct calendar day.
  const merged = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const athlete of athletes) result[athlete.id] = [...(loggedAtByAthlete[athlete.id] ?? [])];
    for (const entry of entries) result[entry.athleteId]?.push(entry.loggedAt);
    return result;
  }, [athletes, entries, loggedAtByAthlete]);

  const ranked = useMemo(() => {
    const today = new Date();
    const nameById = new Map(athletes.map((a) => [a.id, a.name]));
    return rankAthletesForPeriod(
      athletes.map((a) => a.id),
      merged,
      period
    ).map((row) => {
      const streak = computeCurrentStreak(toDayKeySet(merged[row.athleteId] ?? []), today);
      const last30Start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      const last30 = countDaysInPeriod(merged[row.athleteId] ?? [], {
        ...period,
        start: last30Start.toISOString(),
        end: null,
      });
      return {
        ...row,
        name: nameById.get(row.athleteId) ?? "Unknown",
        isCurrentUser: row.athleteId === currentUser.id,
        streakLabel: streak >= 2 ? `${streak}-day streak` : undefined,
        recentCountLabel: streak >= 2 ? undefined : `${last30} in the last 30`,
      };
    });
  }, [athletes, merged, period, currentUser.id]);

  const top3 = ranked.slice(0, 3).map(({ athleteId, name, workoutDays }) => ({
    athleteId,
    name,
    workoutDays,
  }));
  const progress = periodProgress(period, new Date());
  const isLive = period.id === currentPeriodId;

  return (
    <>
      <SegmentedTabBar
        periods={periods}
        currentPeriodId={currentPeriodId}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {progress && !progress.isOver && (
        <ProgressRail
          progress={{
            periodLabel: period.kind === "year" ? period.label : period.label.split(" ")[0],
            currentDay: progress.currentDay,
            totalDays: progress.totalDays,
          }}
        />
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Eyebrow>{isLive ? "The Podium" : "Final standings"}</Eyebrow>
          <Eyebrow>{`${period.label} · Workout days`}</Eyebrow>
        </div>
        <Podium entries={top3} />
      </div>

      <RankedList entries={ranked} />
    </>
  );
}
