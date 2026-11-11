import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchCurrentAthlete } from "@/lib/data/current-athlete";
import type { Athlete, Group } from "@/lib/types";

export const ACTIVE_GROUP_COOKIE = "sweaties_group";

type MembershipRow = {
  role: "admin" | "member";
  groups: { id: string; name: string; invite_code: string } | null;
};

/** Every group the signed-in athlete belongs to, oldest membership first. */
export const getMyGroups = cache(async function getMyGroups(): Promise<Group[]> {
  const athlete = await fetchCurrentAthlete();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("group_members")
    .select("role, groups ( id, name, invite_code )")
    .eq("athlete_id", athlete.id)
    .order("joined_at", { ascending: true });
  if (error) throw error;

  const memberships = ((data ?? []) as unknown as MembershipRow[]).filter((row) => row.groups);
  if (memberships.length === 0) return [];

  const { data: allMembers, error: countError } = await supabase
    .from("group_members")
    .select("group_id")
    .in(
      "group_id",
      memberships.map((row) => row.groups!.id)
    );
  if (countError) throw countError;

  const counts = new Map<string, number>();
  for (const row of allMembers ?? []) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return memberships.map((row) => ({
    id: row.groups!.id,
    name: row.groups!.name,
    inviteCode: row.groups!.invite_code,
    role: row.role,
    memberCount: counts.get(row.groups!.id) ?? 1,
  }));
});

/**
 * The group the user is viewing: the one in their cookie if they still
 * belong to it, otherwise their first group. Null means they have none yet
 * (the cookie is only a preference — RLS is the real boundary).
 */
export const getActiveGroup = cache(async function getActiveGroup(): Promise<Group | null> {
  const groups = await getMyGroups();
  if (groups.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_GROUP_COOKIE)?.value;
  return groups.find((group) => group.id === preferred) ?? groups[0];
});

export async function requireActiveGroup(): Promise<Group> {
  const group = await getActiveGroup();
  if (!group) redirect("/onboarding");
  return group;
}

/** Members of the active group, in join order. */
export const getActiveGroupMembers = cache(async function getActiveGroupMembers(): Promise<
  Athlete[]
> {
  const group = await requireActiveGroup();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("group_members")
    .select("joined_at, athletes ( id, name )")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as { athletes: Athlete | null }[])
    .map((row) => row.athletes)
    .filter((athlete): athlete is Athlete => athlete !== null);
});
