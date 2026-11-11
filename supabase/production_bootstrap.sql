-- ============================================================================
-- SweaTies — production bootstrap
--
-- Run this ONCE against a freshly-migrated hosted Supabase project — via
-- Studio's SQL editor, or `psql` against the project's connection string —
-- after `supabase db push`. See DEPLOYMENT.md for the full sequence.
--
-- This is NOT part of the automatic seed pipeline: `supabase/config.toml`'s
-- `[db.seed]` only points at `supabase/seed.sql` (local dev), and
-- `supabase db push` never runs any seed file against a hosted project.
-- This file exists specifically so production can never accidentally
-- inherit `seed.sql`'s demo workout history, comments, or kudos — the two
-- are deliberately separate files with different audiences, not two modes
-- of the same file. See "Development seed vs. production bootstrap" in
-- DEPLOYMENT.md for the full rationale.
--
-- Contains only what the app functionally needs to be usable on day one:
-- the 5 default activity types. The logging form's type chips are entirely
-- sourced from the activity_types table (lib/data/activityTypes.ts) with no
-- hardcoded fallback list, so skipping this would leave everyone with zero
-- activity types to select from. There is no roster to seed any more —
-- people sign up themselves and create or join groups with invite codes.
--
-- Deliberately NOT included: any activities, comments, kudos, or custom
-- activity types (e.g. the "Cardio"/"Pickleball" additions in seed.sql are
-- demo flavor demonstrating the "Add Your Own" feature, not something
-- production needs pre-seeded). A freshly bootstrapped production project
-- should show an empty feed, an empty leaderboard, and zero streaks for
-- everyone until real workouts start getting logged.
-- ============================================================================

insert into public.activity_types (label, created_by) values
  ('Gym', null),
  ('Run', null),
  ('Walk', null),
  ('Cycle', null),
  ('Yoga', null);
