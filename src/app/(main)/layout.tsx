import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppStateProvider } from "@/components/providers/AppStateProvider";
import { getActivityTypes } from "@/lib/data/activityTypes";
import { getAthletes, getCurrentUser, getCurrentUserSummary } from "@/lib/data/athletes";
import { getAllComments } from "@/lib/data/comments";
import { getFeed } from "@/lib/data/feed";
import { requireActiveGroup } from "@/lib/data/groups";
import { getPeriodProgress } from "@/lib/data/leaderboard";

// Every screen under this layout reads live Supabase data (per-request, not
// buildable statically) — see FRONTEND_INTEGRATION.md for why.
export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: { children: ReactNode }) {
  // No group yet (fresh sign-up, or left their last one) -> /onboarding.
  const group = await requireActiveGroup();
  const [summary, entries, athletes, currentUser, comments, periodProgress, activityTypes] =
    await Promise.all([
      getCurrentUserSummary(),
      getFeed(),
      getAthletes(),
      getCurrentUser(),
      getAllComments(),
      getPeriodProgress(),
      getActivityTypes(),
    ]);

  return (
    <AppStateProvider
      key={group.id}
      initialSummary={summary}
      initialEntries={entries}
      athletes={athletes}
      currentUser={currentUser}
      initialComments={comments}
      periodDaysElapsed={periodProgress.currentDay}
      initialActivityTypes={activityTypes}
      groupId={group.id}
      groupName={group.name}
    >
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  );
}
