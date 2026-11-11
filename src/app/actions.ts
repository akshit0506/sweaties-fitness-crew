"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE, getMyGroups } from "@/lib/data/groups";
import { getFeed } from "@/lib/data/feed";
import { getAllComments } from "@/lib/data/comments";
import type { Comment, FeedEntry } from "@/lib/types";

type ActionResult = { error?: string };

async function setActiveGroupCookie(groupId: string) {
  (await cookies()).set(ACTIVE_GROUP_COOKIE, groupId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function createGroupAction(name: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_group", { group_name: name });
  if (error) return { error: error.message };
  await setActiveGroupCookie(data as string);
  revalidatePath("/", "layout");
  return {};
}

export async function joinGroupAction(code: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("join_group", { code });
  if (error) return { error: error.message };
  await setActiveGroupCookie(data as string);
  revalidatePath("/", "layout");
  return {};
}

export async function switchGroupAction(groupId: string): Promise<ActionResult> {
  const groups = await getMyGroups();
  if (!groups.some((group) => group.id === groupId)) {
    return { error: "You're not in that group." };
  }
  await setActiveGroupCookie(groupId);
  revalidatePath("/", "layout");
  return {};
}

export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("leave_group", { target_group: groupId });
    if (error) return { error: error.message };
    const remaining = (await getMyGroups()).filter((group) => group.id !== groupId);
    if (remaining[0]) await setActiveGroupCookie(remaining[0].id);
    else (await cookies()).delete(ACTIVE_GROUP_COOKIE);
    revalidatePath("/", "layout");
    return {};
  } catch (error) {
    return { error: message(error, "Couldn't leave that group.") };
  }
}

export async function rotateInviteCodeAction(
  groupId: string
): Promise<ActionResult & { code?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rotate_invite_code", { target_group: groupId });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { code: data as string };
}

/**
 * Re-reads the feed and comments for the active group. Called by the
 * realtime listener when a friend logs, comments or reacts — photo URLs
 * must be signed server-side, so this can't be a plain client query.
 */
export async function refreshAppData(): Promise<{
  entries: FeedEntry[];
  comments: Record<string, Comment[]>;
}> {
  const [entries, comments] = await Promise.all([getFeed(), getAllComments()]);
  return { entries, comments };
}
