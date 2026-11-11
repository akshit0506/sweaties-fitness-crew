# Supabase Setup — SweaTies

> **Note:** the intro and "not done in this milestone" sections below are from
> the original backend milestone and are kept for history. The app now runs
> on this backend end to end; for the current model see `README.md`.

This is the Supabase foundation for the backend — schema, RLS, storage, and
seed data. **Nothing in `src/` has changed.** The frontend still runs
entirely on `lib/mock/*`; this milestone exists independently of it so the
two can be verified separately before wiring them together (that wiring is
the next milestone, per `BACKEND_PLAN.md` §7).

## What's here

```
supabase/
├── config.toml                              # local dev config (ports, auth, storage)
├── migrations/
│   ├── 20260725120000_schema.sql            # tables, indexes, constraints
│   ├── 20260725120100_rls_policies.sql      # RLS on every table
│   ├── 20260725120200_storage.sql           # activity-photos bucket + policies
│   ├── 20260725161000_auth_claim.sql        # superseded — see 20260726090000_phone_auth.sql
│   ├── 20260726090000_phone_auth.sql        # superseded roster-claim RPCs, phone_number column
│   ├── 20260727100000_activity_photos.sql   # activity_photos table
│   └── 20260801100000_groups.sql            # groups, invite codes, shared-group RLS, reactions, realtime
├── seed.sql                                 # LOCAL DEV ONLY — "Demo Crew" group (code DEMOCREW01), 7 athletes, ~30–45 days of activity, comments, kudos
└── production_bootstrap.sql                 # PRODUCTION — the 5 default activity types, nothing else
```

`seed.sql` and `production_bootstrap.sql` are two deliberately separate
files, not two modes of one — see "Development seed vs. production
bootstrap" in `DEPLOYMENT.md` for why.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (already used to scaffold this — `npx supabase <command>` works without a global install).
- **Docker Desktop**, running, for local development (`supabase start` spins up Postgres/Auth/Storage/Studio in containers). Not required if you only intend to push straight to a hosted project.

## Local development

```bash
npx supabase start      # first run pulls images, ~2-3 min; applies migrations + seed.sql automatically
```

This gives you:
- **Studio** at `http://127.0.0.1:54323` — browse tables, run SQL, inspect the seeded data visually.
- **API URL** at `http://127.0.0.1:54321` and a local anon/service-role key pair (printed by `supabase start`, also available via `npx supabase status`).
- Sign-in is Anonymous Sign-In + a phone-number RPC (see `20260726090000_phone_auth.sql`) — no email/SMS involved, so there's no local mail catcher to check.

To re-apply migrations and re-run the seed from a clean slate at any point
(e.g. after editing a migration):

```bash
npx supabase db reset
```

To stop the local stack:

```bash
npx supabase stop
```

## Verifying the seed

After `supabase start`, open Studio → Table Editor and check:
- `athletes` — 7 rows, `auth_user_id` null on all of them (expected — nobody's signed in yet).
- `groups` / `group_members` — one "Demo Crew" group (`invite_code` `DEMOCREW01`) with all 7 athletes.
- `activities` — should be roughly 150–200 rows, spread across the last ~45 days, varying in frequency per athlete.
- `activity_types` — 7 rows: 5 defaults (`created_by` null) + `Cardio` and `Pickleball` (`created_by` set).
- `kudos` / `comments` — non-empty, no row where the giver/commenter equals the activity's own athlete.

Or from the SQL editor, a quick sanity check:

```sql
select a.name, count(*) as workout_days
from public.activities act
join public.athletes a on a.id = act.athlete_id
group by a.name
order by workout_days desc;
```

Vivek should come out on top, Vishakha at the bottom — matching the
relative activity levels described in `PRODUCT.md`.

## Connecting to a hosted Supabase project

Local dev is for iterating on schema/RLS/seed. To actually deploy:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies supabase/migrations/* to the hosted project
```

`db push` does **not** run any seed file against a hosted project — never
`seed.sql`, and never automatically. **Do not run `supabase/seed.sql`
against a hosted project, staging included** — it's realistic-looking
demo activity history, comments, and kudos that would misrepresent real
usage to anyone who sees it. Hosted projects (production or otherwise) use
`supabase/production_bootstrap.sql` instead — see `DEPLOYMENT.md`'s
"Development seed vs. production bootstrap" section for the full
reasoning and exact steps.

`supabase/config.toml`'s `auth.site_url`/`additional_redirect_urls` are
local-dev-only settings — a hosted project doesn't read `config.toml` at
all, so its Site URL and auth settings are configured separately in
Studio (see `DEPLOYMENT.md` §4).

## Environment variables

`.env.local.example` lists what the frontend needs to talk to Supabase:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
  `supabase status` (local) or Studio → Project Settings → API (hosted).

That's the whole list — no service-role key. Sign-up and group creation
are self-serve (see `20260801100000_groups.sql`), so there's no admin script that needs elevated
access; if you ever need the service-role key for a one-off admin task,
grab it fresh from Studio when you need it rather than keeping it on file.

## What's deliberately not done in this milestone

- No frontend code changed. `AppStateProvider` and every component still
  run on `lib/mock/*`.
- No authentication wired up — `athletes.auth_user_id` is null for all 7
  seeded rows by design (see the schema comment in
  `20260725120000_schema.sql` and the deviation notes in this milestone's
  summary).
- No real photo uploads — the `activity-photos` bucket and its policies
  exist, but nothing calls them yet.

These were exactly the next steps tracked in `ROADMAP.md` at the time —
since then, reads (`FRONTEND_INTEGRATION.md`), and later auth + writes
(`FRONTEND_INTEGRATION.md`'s Authentication & Persistence section) have
both landed. Photo upload is still the one item above still not done. This
file remains accurate for local dev setup either way — see
`DEPLOYMENT.md` for the production equivalent.
