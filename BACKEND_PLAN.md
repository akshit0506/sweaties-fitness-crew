# Backend Plan — Supabase Integration

> **SweaTies note:** this document is a historical log written when the app was
> the single-roster "Family Workout". It records the original schema/RLS architecture decisions. The app is now **SweaTies** —
> self-serve sign-up, private groups and invite codes (see
> `supabase/migrations/20260801100000_groups.sql` and `README.md`). Where this
> file says "family" or describes claiming a pre-seeded roster, read it as the
> earlier design.


Design document only — no implementation code. See `PRODUCT.md` (why),
`DESIGN.md` (visual language), `ROADMAP.md` (sequencing) for context this
builds on.

> **Status: implemented**, across three milestones (schema/RLS foundation →
> read path → auth + write path). See `FRONTEND_INTEGRATION.md` and
> `ROADMAP.md`'s Milestone 9/10 for what actually shipped. Two real
> deviations from this plan, both deliberate:
>
> 1. **§2 `athletes` table**: planned as `id (= auth.users.id)` — a hard
>    1:1 identity. Implemented instead with `athletes.id` as its own UUID
>    plus a nullable `auth_user_id` column, because the full 7-person
>    roster needs to be seedable *before* anyone has signed in (you can't
>    know `auth.users.id` for someone who hasn't created an account yet).
>    A trigger (`20260725161000_auth_claim.sql`) links the two the moment
>    an account is created. §5's RLS policies use a
>    `current_athlete_id()` helper (`auth.uid()` → `athletes.id`) instead
>    of comparing directly against `auth.uid()`, as a direct consequence.
> 2. **§6 Board leaderboard**: planned as a `COUNT DISTINCT` SQL aggregate.
>    Implemented instead as one full-history fetch plus the existing
>    `lib/stats.ts`/`lib/ranking.ts` pure functions run in JS — decided
>    during the read-path milestone once "workout days" turned out to mean
>    a trailing-window count matching `AppStateProvider`'s own client-side
>    definition, not a calendar-boundary count a SQL aggregate would need
>    to duplicate. Revisit if per-athlete history grows large enough that a
>    full fetch stops being cheap (see `FRONTEND_INTEGRATION.md`).
>
> §3 recommended Magic Link without specifying *how* access would be
> gated to just the family. The first implementation was invitation-only
> (`scripts/invite-family.mjs`, a service-role-only script, was the sole
> way an `auth.users` row could be created). That was then explicitly
> replaced with a self-serve "claim your profile" flow: sign-up is open
> (anyone can request a code), but an account can only ever attach itself
> to one of the 7 existing, still-unclaimed `athletes` rows via a
> `claim_athlete()` RPC — never create a new one. Email **OTP** (a typed
> 6-digit code) turned out to fit better than a clicked Magic Link for
> this specific flow, since the claim wizard needs to stay on one page
> through name-selection → email → verification, and a link-click would
> navigate away mid-flow. See §3 and §8 for the full detail.
>
> **Superseded again, later**: Email OTP itself was replaced by **Supabase
> Auth Anonymous Sign-In + a phone-number RPC** — no email/SMS step at
> all. `athletes.email` → `athletes.phone_number` (excluded from client
> column grants); `claim_athlete()` → `claim_athlete_with_phone()` /
> `login_with_phone()`. `current_athlete_id()` and every RLS policy's
> *shape* are unchanged — only how `auth_user_id` gets populated changed.
> The phone number is a deliberate, explicitly-accepted shared-secret
> tradeoff (no proof of possession), judged appropriate for a 7-person
> private app. See `supabase/migrations/20260726090000_phone_auth.sql`
> and `FRONTEND_INTEGRATION.md`'s top milestone for the full reasoning.

## 1. Overall Architecture

The frontend already has the right shape for this migration — that's not
accidental, it's why `lib/data/*.ts` exists as a seam. Two things change,
nothing else:

**Server-side reads stay exactly where they are.** `(main)/layout.tsx` and
each `page.tsx` are Server Components that call `lib/data/*` functions once
per navigation and pass results down (into `AppStateProvider` or as props).
Post-migration, those same functions call Supabase via `@supabase/ssr`'s
`createServerClient` (reads the session from cookies) instead of reading
`lib/mock/*`. Signatures and return types are unchanged, so no page or
component touching them needs to change.

**Client-side mutations gain a persistence step.** `AppStateProvider`
(`"use client"`) currently mutates local React state only
(`saveActivity`, `deleteActivity`, `toggleKudos`, `addComment`,
`addCustomActivityType`). Each becomes: keep the existing optimistic
`setState` call for instant UI feedback (this is already our current UX —
don't lose it), then fire the matching Supabase call via
`createBrowserClient`, and roll back + show an error `Toast` (already
built) on failure. Public function signatures on `useAppState()` don't
change, so every consuming component is untouched.

**Direct client calls, not Server Actions.** Mutations go
browser-client → Supabase directly, protected by RLS, rather than routing
through Next.js Server Actions. Reasoning: our optimistic-update pattern
already exists and Server Actions would add a redundant network hop
without adding safety RLS doesn't already provide. Revisit only if
mutation logic later needs centralized server-side validation Postgres
can't express.

**Real-time is additive, not required for parity.** Supabase Realtime
(Postgres change subscriptions on `activities`/`kudos`/`comments`) can
later merge other family members' actions into `AppStateProvider` live.
Today's mock app never had multi-session sync to begin with, so this is a
Phase 2 enhancement, not a migration blocker.

## 2. Database Schema

Table names match existing TypeScript type names (`Athlete` → `athletes`)
to minimize the mental translation layer.

| Table | Key columns | Notes |
|---|---|---|
| `athletes` | `id` (= `auth.users.id`), `name`, `created_at` | 1:1 with Supabase Auth users. No client INSERT/UPDATE — roster stays admin-managed (see Open Decisions). |
| `activities` | `id`, `athlete_id → athletes`, `logged_at`, `duration_label`, `notes`, `achievement_note`, `photo_path`, `created_at` | One row per logged entry (matches `FeedEntry`). |
| `activity_types` | `id`, `label`, `created_by → athletes` (nullable) | Nullable `created_by` = one of the 5 defaults; non-null = a family "Add Your Own" custom type, now persistent instead of session-only. |
| `activity_entry_types` | `activity_id → activities`, `activity_type_id → activity_types` | Join table — an activity can have multiple types (multi-select, unchanged from today). |
| `comments` | `id`, `activity_id → activities`, `athlete_id → athletes`, `text`, `posted_at` | One row per comment. |
| `kudos` | `activity_id → activities`, `athlete_id → athletes`, `created_at` | Composite primary key `(activity_id, athlete_id)` — naturally enforces "one kudos per person per activity," which is exactly our toggle semantics. |

Relationships: `athletes 1—*  activities`, `activities 1—* comments`,
`activities *—* athletes` (through `kudos`), `activities *—* activity_types`
(through `activity_entry_types`).

`activity_types` + join table is the normalized choice the brief asked
for; the pragmatic alternative (a `text[]` column directly on
`activities`) is simpler and closer to the current `activities: string[]`
shape but loses a canonical type list and easy "who uses what" analytics.
`lib/data/feed.ts` reconstructs the exact `string[]` shape the frontend
already expects via an aggregate join, so this choice is invisible above
the data layer either way.

## 3. Authentication

| Option | Fit for a 7-person private family app |
|---|---|
| **Magic Link** | Native Supabase support, zero extra provider setup, no per-message cost. Friction is a **one-time cost per device** — once signed in, Supabase's refresh token keeps the installed PWA logged in indefinitely, matching "open it like a native app" expectations. |
| **OTP (SMS/email)** | Same trust model as Magic Link but worse: typing a code is more friction than clicking a link, and SMS costs money per message via Twilio for no real benefit here. |
| **Google OAuth** | Fastest *repeat* sign-in, but OAuth's browser-popup/redirect handoff is a known rough edge for installed PWAs (iOS Safari in particular sometimes breaks out of the PWA shell) — directly in tension with our own Platform Principle. Also requires Google Cloud console setup for 7 users. |
| **PIN** | Not real authentication on its own — a PIN alone doesn't identify *who*, only that *someone* knows it. Only viable as a secondary local app-lock layered on top of a real method. |

**Recommendation: Magic Link**, as the sole initial auth method. It's the
least infrastructure, has no recurring cost, avoids the PWA/OAuth popup
issue entirely, and its one real weakness (leaving the app to click a
link) only bites once per device, not on every open. A PIN-based local
app-lock (gate the already-authenticated session behind a 4-digit PIN
checked client-side, not a new Supabase auth call) is a reasonable later
polish for the daily-open habit loop — not needed for v1.

**Implemented as: Email OTP (typed 6-digit code), not a clicked link.**
Same underlying Supabase mechanism (`signInWithOtp`) and the same
per-device-not-per-open friction profile above still applies — the
difference is presentation. The "claim your profile" onboarding needs to
stay on a single page through name-selection → email → verification;
a clicked Magic Link navigates the browser to a new URL mid-flow, which
would need extra state (a query param, a cookie) to remember which name
was being claimed across that jump. `verifyOtp()` with a typed code keeps
the whole thing as one continuous client-side flow with no redirect at
all — simpler, and it's what
`supabase/templates/magic_link.html` (customized to surface `{{ .Token }}`
prominently) actually sends. **Access gating changed too**: rather than
an admin pre-inviting each email (`shouldCreateUser: false`), sign-up is
open (`shouldCreateUser: true`) and the real gate moved to "can this
account claim one of the 7 still-unclaimed roster rows" — see §8.

## 4. Storage

Proof photos go in a Supabase Storage bucket (`activity-photos`), private,
not public. Path convention: `{athlete_id}/{activity_id}.jpg` — ties
ownership and cleanup directly to the path. `activities` gets a nullable
`photo_path` column storing the object path; the frontend resolves it to
a signed URL at read time. Uploads go **directly from the browser to
Storage** via the browser Supabase client (not proxied through our Next
server), gated by a storage RLS policy restricting writes to each user's
own `{athlete_id}/` prefix. Client-side compression before upload is
worth doing but not a hard requirement for v1. This is exactly the
"real proof-photo upload" item already sitting in `ROADMAP.md` Milestone
10 — the form UI placeholder is already built, this is what fills it in.

## 5. Row Level Security

Every table's SELECT policy is "any authenticated family member" — this
is a shared-visibility app by design (`PRODUCT.md` §3: show absence,
don't hide it). **Updated once sign-up became open** (see §3): "family
member" now specifically means "has claimed a profile"
(`current_athlete_id() is not null`), not just "authenticated" — the
latter stopped implying the former the moment self-serve sign-up replaced
invite-only access, since a stranger could otherwise verify any email,
never claim anyone, and still read everything via a direct API call. A
separate narrow view, `athlete_claim_status` (name + claimed bool, no
email), is the only roster data readable *before* claiming — it's what
the "pick your name" screen renders.

The interesting policies are the mutation ones, which mirror what the UI
already enforces (edit/delete only shown on your own entries, kudos
disabled on your own entries):

- **activities**: INSERT/UPDATE/DELETE only where `athlete_id = auth.uid()` → *edit own activity, delete own activity*.
- **comments**: INSERT where the *commenter* is `auth.uid()`, with no restriction on which `activity_id` → *comment anyone*. No UPDATE/DELETE policy for now (not a current feature — absence of a policy means no access, the safe default).
- **kudos**: INSERT where `athlete_id = auth.uid()` (any `activity_id`) → *kudos anyone*. DELETE only your own row → *un-kudos your own reaction, not someone else's*.
- **activity_types**: SELECT all; INSERT any authenticated user (`created_by = auth.uid()`) → *Add Your Own*, family-visible once created (see Open Decisions).
- **activity_entry_types**: mutations allowed only where the parent `activity_id` is owned by `auth.uid()` (subquery against `activities`).
- **athletes claiming**: no direct client UPDATE policy at all — the
  `claim_athlete(target_athlete_id)` RPC is `SECURITY DEFINER` instead.
  First attempt used a plain RLS policy (`using: auth_user_id is null`),
  which turned out to be insufficient: Postgres RLS applies a table's
  SELECT policy to identify candidate rows for an UPDATE *in addition to*
  the UPDATE policy's own USING clause, and the not-yet-claimed caller
  fails the tightened SELECT policy above by definition (no claimed
  profile yet) — so the row was invisible to the UPDATE before its own
  policy ever got a chance to allow it, and it silently matched zero rows
  every time. `SECURITY DEFINER` sidesteps this cleanly (the function
  bypasses RLS for its own narrowly-scoped internal query, not a blanket
  bypass) rather than fighting the interaction. See the migration's own
  comment for the debugging trail.

Self-kudos is blocked at the RLS layer, not just the UI — see §8.

## 6. Data Fetching

- **Home**: unchanged shape — `getFeed()` and `getCurrentUserSummary()`,
  called once in `(main)/layout.tsx`, seed `AppStateProvider`.
  `getFeed()` becomes a single Supabase query joining `athletes`,
  `activity_entry_types → activity_types`, `kudos`, and a comment count,
  mapped into the existing `FeedEntry[]` shape. `lib/stats.ts`'s
  `useMemo` derivation of `summary` (streak, sparkline, week-status)
  doesn't change at all — it's pure JS over `FeedEntry[]` regardless of
  where that array came from.
- **Board**: `getLeaderboard()` does the count (`COUNT DISTINCT
  logged_at::date` per athlete, in-period) as a SQL aggregate rather than
  pulling raw rows — but rank computation stays in our existing
  `lib/ranking.ts` `computeCompetitionRanks()`, just called server-side
  now instead of only client-side in `LiveLeaderboard`. Same function,
  reused, not duplicated in SQL.
- **Profile**: `getActivityBreakdown()` is a `GROUP BY` aggregate over
  unnested activity types for the current user. Calendar/`DayDetailsSheet`
  queries filter `activities` by `athlete_id` + a `logged_at` date range —
  a straightforward indexed query.

One scaling nuance worth flagging now: `lib/stats.ts` today derives
`allTimeEntries` and `bestStreak` by scanning the *entire* entries array
client-side. That's fine at mock-data scale; once real history spans
years, pulling full history client-side to compute two numbers stops
being efficient. See Open Decisions.

## 7. Migration Strategy

No rewrites — each step is additive or a same-signature internal swap:

1. **Infrastructure only**: Supabase project, schema, RLS policies. Zero
   app code touched.
2. **Auth**: add sign-in (new screen, doesn't touch existing ones),
   protect `(main)` routes, replace the hardcoded current-user email
   stand-in (`CURRENT_ATHLETE_EMAIL`, introduced in the read-path
   milestone) with a real session lookup. This unblocks everything else,
   since every other table's RLS depends on `auth.uid()`.
3. **Swap `lib/data/*.ts` internals, one file at a time**, keeping every
   function signature identical:
   - `athletes.ts` → `getAthletes`, `getAthlete`, `getCurrentUser`,
     `getCurrentUserSummary`, `getActivityBreakdown`
   - `feed.ts` → `getFeed`
   - `leaderboard.ts` → `getLeaderboard`, `getPeriodOptions`, etc.
   - `comments.ts` → `getAllComments` (shape worth revisiting — see
     Open Decisions)
   Nothing calling these functions changes, because nothing needs to.
4. **Delete `lib/mock/*`** once no `lib/data/*` file imports from it
   anymore — a clean, grep-able "done" signal, and already the exact
   checkbox sitting in `ROADMAP.md` Milestone 10.
5. **Add persistence to `AppStateProvider`'s actions**, as described in
   §1 — optimistic update first, Supabase call second, rollback +
   `Toast` on failure third.
6. **`customActivityTypes`** goes from session-only local state to a real
   `activity_types` table read/insert — same `addCustomActivityType`
   signature, now durable.
7. **Realtime sync** (optional, after the above): additive subscriptions,
   no existing call site changes.

## 8. Open Decisions — resolved

- **Custom activity types**: ✅ resolved family-wide (the simpler-RLS
  option) — `activity_types_select_authenticated` is `to authenticated
  using (true)`, and `addCustomActivityType` inserts a real row everyone
  can see, not a private one.
- **Self-kudos**: ✅ resolved enforced at the RLS layer, not just the UI —
  `kudos_insert_not_self` rejects it at the database, verified against a
  real session (not just a mocked check) in this milestone's end-to-end
  test.
- **Roster management**: ✅ resolved fully static/manual for *creating* the
  roster (edit `supabase/seed.sql` or the `athletes` table directly, no
  admin UI) — but *claiming* a roster slot is now self-serve (see §3),
  not a separate admin step. Revisit the roster-creation side if it ever
  needs to change more often than "rarely."
- **Historical per-quarter rankings** (`getMyPeriodRankings`): still open —
  currently computes the live period only and honestly returns
  `rank: null` for others; still not solved by this milestone.
- **`getAllComments()`'s eager-fetch shape**: still open — unchanged from
  the read-path milestone, still fetches everything.
- **`lib/stats.ts` all-time/best-streak**: still open — still a full
  client-side scan over `getFeed()`'s result (see the
  `FRONTEND_INTEGRATION.md` note on why `getFeed()`'s window can't be
  trimmed without silently affecting these two numbers).
- **Storage bucket privacy**: still open — proof-photo upload itself isn't
  implemented yet, so this hasn't come up in practice.
