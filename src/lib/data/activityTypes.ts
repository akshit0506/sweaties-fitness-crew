import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActivityType } from "@/lib/types";

/**
 * The full app-wide activity type list — the 5 seeded defaults plus any
 * "Add Your Own" customs anyone has ever added (activity_types.created_by
 * set). Previously the defaults were a hardcoded constant
 * (lib/activityTypes.ts) and customs were a browser-session-only array in
 * AppStateProvider; both are now this one real, shared, persisted list.
 */
export const getActivityTypes = cache(async function getActivityTypes(): Promise<ActivityType[]> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("activity_types")
      .select("id, label")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
});
