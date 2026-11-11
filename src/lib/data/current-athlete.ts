import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import type { Athlete } from "@/lib/types";

/**
 * Resolves "the current athlete" from the actual signed-in session —
 * proxy.ts guarantees every (main) request has one before this runs.
 * auth_user_id is populated by sign_up_with_phone() / sign_in_with_phone()
 * in 20260801100000_groups.sql, so this is a direct lookup, not a guess.
 *
 * A session can legitimately exist with no linked athlete yet: an anonymous
 * session gets created as soon as someone starts the claim/sign-in flow on
 * /login, and they might abandon it (close the tab, lose connection) before
 * a claim/login RPC actually links it to an athlete row. That's not a hard
 * failure — send them back to /login to pick up where they left off, rather
 * than crashing to error.tsx.
 */
export const fetchCurrentAthlete = cache(async function fetchCurrentAthlete(): Promise<Athlete> {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not resolve the current athlete for ${user.id}.`, {
      cause: error,
    });
  }

  if (!data) {
    redirect("/login");
  }

  return data;
});
