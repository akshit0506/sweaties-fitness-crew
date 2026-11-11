-- ============================================================================
-- Family Workout — DEVELOPMENT seed (local dev only)
--
-- This file is for local development and testing ONLY. It is never used in
-- production — `supabase db push` (the command that deploys migrations to a
-- hosted project) does not run any seed file, and this one specifically is
-- wired up only via `supabase/config.toml`'s `[db.seed] sql_paths`, which
-- local `supabase db reset`/`supabase start` read and a hosted project
-- never does. Production instead uses `supabase/production_bootstrap.sql`,
-- a deliberately separate, much smaller file — see that file's header, and
-- "Development seed vs. production bootstrap" in DEPLOYMENT.md, for why
-- these are two files rather than two modes of one.
--
-- Populates the full 7-person roster plus ~30–45 days of realistic activity
-- history, comments, and kudos, so the app can be developed against
-- something that looks and behaves like real usage. Relative dates
-- (current_date - N) are used throughout instead of hardcoded calendar
-- dates, so this seed never goes stale no matter when it's applied.
--
-- Roster, activity taxonomy, and relative activity levels intentionally
-- match the story already established in PRODUCT.md — same 7 people, same
-- "Vivek is most active, Vishakha is least active" shape.
-- ============================================================================

select setseed(0.4242); -- rough run-to-run consistency for the probabilistic sections below

-- ----------------------------------------------------------------------------
-- Athletes. auth_user_id and phone_number both stay null until each person
-- claims their profile through the app (see claim_athlete_with_phone() in
-- supabase/migrations/20260726090000_phone_auth.sql) — nothing here
-- pre-links an identity or a number.
-- ----------------------------------------------------------------------------
insert into public.athletes (name) values
  ('Akshit'),
  ('Atharv'),
  ('Vidushi'),
  ('Anamika'),
  ('Vivek'),
  ('Amit'),
  ('Vishakha');

-- ----------------------------------------------------------------------------
-- One demo group containing everyone. Invite code is fixed so a second
-- local account can join with `DEMOCREW01` and see the seeded activity.
-- ----------------------------------------------------------------------------
insert into public.groups (name, invite_code, created_by)
select 'Demo Crew', 'DEMOCREW01', id from public.athletes where name = 'Akshit';

insert into public.group_members (group_id, athlete_id, role)
select g.id, a.id, case when a.name = 'Akshit' then 'admin' else 'member' end
from public.groups g
cross join public.athletes a
where g.invite_code = 'DEMOCREW01';

-- ----------------------------------------------------------------------------
-- Activity types: the 5 defaults, plus two "Add Your Own" customs (Cardio,
-- Pickleball) to demonstrate that path is real and family-visible once used.
-- ----------------------------------------------------------------------------
insert into public.activity_types (label, created_by) values
  ('Gym', null),
  ('Run', null),
  ('Walk', null),
  ('Cycle', null),
  ('Yoga', null);

insert into public.activity_types (label, created_by)
select 'Cardio', id from public.athletes where name = 'Atharv';

insert into public.activity_types (label, created_by)
select 'Pickleball', id from public.athletes where name = 'Akshit';

-- ----------------------------------------------------------------------------
-- Recent week (days_ago 0–6), hand-authored so the story is legible:
-- Akshit lands on a 3-day streak ending yesterday with today still open
-- (matching the "hold to log" demo state used throughout this project),
-- Vivek logs every day (most active), Vishakha/Amit log rarely.
-- ----------------------------------------------------------------------------
with recent_week (athlete_name, days_ago, time_of_day, duration_label, activity_labels) as (
  values
    ('Akshit', 6, time '18:20', '45 min', array['Gym']),
    ('Akshit', 5, time '07:30', '30 min', array['Yoga']),
    ('Akshit', 3, time '18:20', '90+',    array['Gym', 'Run', 'Cycle']),
    ('Akshit', 2, time '07:15', '40 min', array['Cycle']),
    ('Akshit', 1, time '19:00', null,     array['Yoga']),

    ('Atharv', 6, time '07:00', null,     array['Cardio']),
    ('Atharv', 5, time '18:00', '60 min', array['Gym']),
    ('Atharv', 4, time '06:45', '30 min', array['Run']),
    ('Atharv', 3, time '07:10', null,     array['Cardio']),
    ('Atharv', 1, time '17:30', '45 min', array['Gym']),
    ('Atharv', 0, time '07:05', '30 min', array['Cardio']),

    ('Vidushi', 6, time '08:00', null,     array['Yoga']),
    ('Vidushi', 5, time '17:45', '30 min', array['Walk']),
    ('Vidushi', 3, time '08:15', null,     array['Gym']),
    ('Vidushi', 2, time '08:00', null,     array['Yoga']),
    ('Vidushi', 1, time '18:30', null,     array['Walk']),
    ('Vidushi', 0, time '08:10', '45 min', array['Gym']),

    ('Anamika', 6, time '16:00', null,     array['Gym']),
    ('Anamika', 3, time '17:00', '20 min', array['Run']),
    ('Anamika', 1, time '09:00', null,     array['Yoga']),

    ('Vivek', 6, time '06:30', '60 min', array['Gym']),
    ('Vivek', 5, time '06:45', '30 min', array['Run']),
    ('Vivek', 4, time '06:30', null,     array['Gym']),
    ('Vivek', 3, time '17:15', '45 min', array['Cycle']),
    ('Vivek', 2, time '06:30', null,     array['Gym']),
    ('Vivek', 1, time '06:45', null,     array['Run']),
    ('Vivek', 0, time '06:30', '60 min', array['Gym']),

    ('Amit', 6, time '17:00', '45 min', array['Pickleball']),
    ('Amit', 5, time '19:00', null,     array['Yoga']),
    ('Amit', 2, time '18:00', null,     array['Walk']),

    ('Vishakha', 4, time '19:00', null,     array['Yoga']),
    ('Vishakha', 0, time '18:20', '20 min', array['Walk'])
),
recent_week_resolved as (
  select
    gen_random_uuid() as activity_id,
    a.id as athlete_id,
    (current_date - rw.days_ago) + rw.time_of_day as logged_at,
    rw.duration_label,
    rw.activity_labels
  from recent_week rw
  join public.athletes a on a.name = rw.athlete_name
),
inserted_recent_activities as (
  insert into public.activities (id, athlete_id, logged_at, duration_label)
  select activity_id, athlete_id, logged_at, duration_label
  from recent_week_resolved
  returning id
)
insert into public.activity_entry_types (activity_id, activity_type_id)
select rwr.activity_id, t.id
from recent_week_resolved rwr
join inserted_recent_activities ia on ia.id = rwr.activity_id
cross join unnest(rwr.activity_labels) as activity_label
join public.activity_types t on t.label = activity_label;

-- ----------------------------------------------------------------------------
-- Bulk history (days_ago 7–44): per-athlete activity rate, giving enough
-- volume for all-time/leaderboard totals to look real without hand-authoring
-- 200 rows. Single activity type per row.
--
-- The day/no-day coin flip is a deterministic hash of (name, days_ago)
-- rather than random() < rate: random()'s draw order depends on the query
-- planner's row-processing order, which is NOT guaranteed stable across
-- Postgres restarts even with setseed() — confirmed empirically here (a
-- fresh `db reset` after a container restart shifted Vivek, meant to be the
-- most active, down to near-last). hashtext() is a pure function of its
-- input, so the same (name, days_ago) always lands on the same side of the
-- threshold, on any machine, forever.
-- ----------------------------------------------------------------------------
with athlete_rate (athlete_name, rate) as (
  values
    ('Akshit', 0.50),
    ('Atharv', 0.72),
    ('Vidushi', 0.70),
    ('Anamika', 0.42),
    ('Vivek', 0.78),
    ('Amit', 0.32),
    ('Vishakha', 0.22)
),
bulk_candidates as (
  select a.id as athlete_id, ar.athlete_name, gs.days_ago, ar.rate
  from athlete_rate ar
  join public.athletes a on a.name = ar.athlete_name
  cross join generate_series(7, 44) as gs (days_ago)
),
bulk_rolled as (
  select athlete_id, days_ago
  from bulk_candidates
  where (abs(hashtext(athlete_name || ':' || days_ago::text)) % 1000) < (rate * 1000)::int
),
bulk_resolved as (
  select
    gen_random_uuid() as activity_id,
    athlete_id,
    (current_date - days_ago)
      + time '06:00'
      + make_interval(hours => floor(random() * 14)::int, mins => floor(random() * 60)::int) as logged_at,
    (array['15 min', '30 min', '45 min', '60 min', '90+'])[1 + floor(random() * 5)::int] as duration_label,
    (array['Gym', 'Run', 'Walk', 'Cycle', 'Yoga'])[1 + floor(random() * 5)::int] as activity_label
  from bulk_rolled
),
inserted_bulk_activities as (
  insert into public.activities (id, athlete_id, logged_at, duration_label)
  select activity_id, athlete_id, logged_at, duration_label
  from bulk_resolved
  returning id
)
insert into public.activity_entry_types (activity_id, activity_type_id)
select br.activity_id, t.id
from bulk_resolved br
join inserted_bulk_activities iba on iba.id = br.activity_id
join public.activity_types t on t.label = br.activity_label;

-- ----------------------------------------------------------------------------
-- Kudos: any family member other than the activity's own athlete, ~30%
-- chance per eligible pair. Composite PK makes this naturally dedupe-safe.
-- ----------------------------------------------------------------------------
insert into public.kudos (activity_id, athlete_id)
select a.id, giver.id
from public.activities a
cross join public.athletes giver
where giver.id <> a.athlete_id
  and random() < 0.30
on conflict (activity_id, athlete_id) do nothing;

-- ----------------------------------------------------------------------------
-- Comments: ~10% chance per eligible (activity, commenter) pair, capped at
-- 2 comments per activity so no single entry is swamped.
-- ----------------------------------------------------------------------------
with comment_candidates as (
  select
    a.id as activity_id,
    commenter.id as athlete_id,
    (array[
      'Proud of you, keep it up!',
      'Nice work today!',
      'Wish I could''ve joined!',
      'That''s the spirit!',
      'Way to keep the streak alive 🔥',
      'Love seeing this',
      'Let''s go!',
      'Great consistency this week'
    ])[1 + floor(random() * 8)::int] as text,
    row_number() over (partition by a.id order by random()) as rn
  from public.activities a
  cross join public.athletes commenter
  where commenter.id <> a.athlete_id
    and random() < 0.10
)
insert into public.comments (activity_id, athlete_id, text)
select activity_id, athlete_id, text
from comment_candidates
where rn <= 2;
