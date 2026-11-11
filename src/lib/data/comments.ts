import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Comment } from "@/lib/types";

type CommentRow = {
  id: string;
  activity_id: string;
  athlete_id: string;
  text: string;
  posted_at: string;
  comment_reactions: { athlete_id: string; emoji: string }[] | null;
};

function groupReactions(rows: { athlete_id: string; emoji: string }[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const row of rows) (grouped[row.emoji] ??= []).push(row.athlete_id);
  return grouped;
}

export const getAllComments = cache(async function getAllComments(): Promise<
  Record<string, Comment[]>
> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, activity_id, athlete_id, text, posted_at, comment_reactions ( athlete_id, emoji )")
      .order("posted_at", { ascending: true });

    if (error) throw error;

    const grouped: Record<string, Comment[]> = {};
    for (const row of (data ?? []) as CommentRow[]) {
      const list = grouped[row.activity_id] ?? (grouped[row.activity_id] = []);
      list.push({
        id: row.id,
        athleteId: row.athlete_id,
        text: row.text,
        postedAt: row.posted_at,
        reactions: groupReactions(row.comment_reactions ?? []),
      });
    }
    return grouped;
  } catch {
    return {};
  }
});
