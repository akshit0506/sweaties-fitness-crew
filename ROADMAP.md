# Roadmap — SweaTies

> Milestones below v2 are a historical log from when the app was the
> single-roster "Family Workout"; they describe the earlier design.

This is the living source of truth for where the product is headed. Update
it as milestones ship, priorities shift, or new decisions get made — it
should always reflect current reality, not a plan frozen in time.

See [`PRODUCT.md`](./PRODUCT.md) for the full product spec (scope,
assumptions, open questions) and [`DESIGN.md`](./DESIGN.md) for the visual
language. This document is about **order and sequencing**, not the "what/why"
— those live in `PRODUCT.md`.

## Vision

Help small, closed groups — friends, teammates, colleagues (it started as a
7-person family) — stay consistent with working out by making each other's
effort visible — calm, simple, and motivating rather than
competitive or judgmental. Accountability through visibility, not pressure.

## Product Principles

(Full detail in `PRODUCT.md` §3 — summarized here for quick reference.)

- **Platform: mobile-first, installable PWA.** The primary experience is
  full-screen, launched from a phone's home screen — desktop is secondary.
  Installable as of Milestone 13 (manifest, icons, service worker, safe-area
  polish) — a built capability, not just a principle anymore.
- Manual logging is the trusted source of truth; no anti-cheat needed.
- Friction is deliberate in exactly one place: the daily log action.
- Show absence, don't hide it — empty states are shown, not omitted.
- Ranking motivates, it doesn't shame.
- Each screen answers exactly one question at a glance.

## Current Status

**Milestone 1 — Foundation** ✅
- [x] Next.js scaffold (TypeScript, Tailwind, ESLint, App Router)
- [x] Design token system (`globals.css` `@theme`) + font wiring
- [x] UI primitives: Button, Card, Avatar, Chip, SectionHeader, NumberTile, Divider, Eyebrow
- [x] `AppShell`, `Masthead`, bottom-tab `NavBar`
- [x] Home screen fully built on mock data (stats, sparkline, feed, log button)
- [x] `lib/mock` / `lib/data` seam so real data can replace mocks later with no call-site changes
- [x] Board, Profile, Settings routes exist as placeholders

**Milestone 2 — Home screen visual polish** ✅
- [x] Two-tier surface color (page vs. card), subtle borders
- [x] Rust as the primary-action color, green reserved for success states
- [x] Real relative timestamps (Today / Yesterday / weekday + date)
- [x] Calmer "logged" confirmation state
- [x] Inline streak indicator, tightened spacing throughout
- [x] Sticky log button restructured to a route-aware persistent action (fixed overlap bug with scrolling feed content)

**Milestone 3 — Board screen** ✅
- [x] Segmented period tabs (local-state only — not yet backed by real per-period data, see Milestone 12)
- [x] Progress rail ("Day X of Y", days remaining)
- [x] Podium (top 3, gradient medallions)
- [x] Ranked list (avatar, name, "You" tag, streak/recent-count note, entry-count tiles)
- [x] New `lib/data/leaderboard.ts` seam, consistent with Akshit's stats already shown on Home

**Milestone 4 — Profile screen** ✅
- [x] Streak card (day streak + 7-day check row + encouraging microcopy)
- [x] Stat strip (this period / all-time / best streak / kudos received)
- [x] Per-activity-type breakdown (taxonomy since refined in Milestone 7 to Gym/Run/Walk/Cycle/Yoga + session-only custom types)
- [x] `CurrentUserSummary` extended (not duplicated) with `weekStatus`/`allTimeEntries`/`bestStreak`/`kudosReceived`; new `getActivityBreakdown()` added to the existing `lib/data/athletes.ts`
- [x] Month calendar (tap-to-toggle a day, prev/next month, derived from the existing `sparkline` data — real local-state interaction, not just visual)
- [x] "My Activity" — the current user's own entries only, reusing `FeedCard` unchanged, with a working "Show all" expand
- [x] "Rankings" — the current user's rank across quarters, reusing `periodOptions`/`CURRENT_PERIOD_ID` from the Board milestone
- [x] Removed the "Before app" placeholder row entirely (no real pre-app history for this family) and every section now self-contains in its own `Card` for clearer visual separation, per direct feedback

**Milestone 6 — Interactive prototype** ✅ (Settings, Milestone 5, postponed — see below)
- [x] `AppStateProvider` (`components/providers/`) — client context seeded once from `lib/data` in `(main)/layout.tsx`, holding the mutable slice (current-user summary, feed entries, comments) so it survives client-side navigation between screens without a backend
- [x] Hold-to-log now calls a real `logToday()` action: streak, entries-this-period, sparkline, and the week-check row all update immediately, and stay in sync on Profile and Board too (Board live-recomputes the current user's workout days and rank via a new `computeCompetitionRanks` helper)
- [x] Kudos: add/remove, immediate visual feedback (filled vs. outline), disabled on your own entries
- [x] Comments: new `BottomSheet` primitive (portal, Escape + backdrop to close, focus-on-open, slide-up transition) + `CommentsSheet` with seeded mock conversations and locally-added comments reflected live in the card's count
- [x] Clicking any avatar or name now opens that person's profile (`FeedCard`, `RankedListRow`, `Podium`) via a new `/profile/[athleteId]` dynamic route; the current user gets the full personal dashboard, everyone else gets a lighter read-only summary + their activity (no invented per-person stats)
- [x] `/profile` is now a redirect to `/profile/{you}`; `NavBar` is context-aware and links there directly
- [x] Shared `INTERACTIVE_CLASSES` constant for consistent hover/press/focus-ring states, applied across `Button`, `Chip` (now supports an interactive/button mode), `NavBar`, calendar days, avatar/name links
- [x] `FeedCard`/`Feed` converted from server-fetched to context-driven client components; `MyDispatches`/`MyDispatchesList` superseded by a generalized `AthleteActivityFeed`

**Milestone 7 — Activity logging refinement** ✅
- [x] Hold-to-log no longer silently toggles — it opens **Add Activity** (empty day) or **Today's Activities** (day already has entries); the Activity Entry is now genuinely the single source of truth, not a counter
- [x] `ActivityModal` + `ActivityForm` (`components/activity/`) — reusable for both create and edit, multi-select activity types (Gym/Run/Walk/Cycle/Yoga + session-only custom types via "Add Your Own"), duration presets + custom, optional notes, proof-photo UI placeholder (no upload)
- [x] `DayDetailsSheet` (`components/profile/`) — the calendar is now the real entry point for history: tapping a day with activities lists them with an edit action + "Add Activity"; tapping an empty day opens Add Activity pre-filled with that date
- [x] Edit and delete work from both the feed and the calendar, with a reusable `ConfirmationDialog` (stacked on `BottomSheet`, higher z-index) always gating delete, and a `Toast` primitive confirming save/update/delete
- [x] **Architectural shift**: `summary` (streak, entries-this-period, sparkline, week-status, all-time, kudos-received) is no longer a set of hand-incremented counters — it's derived via `useMemo` from the real `entries` array (`lib/stats.ts`). This is what makes edits and deletes propagate to Feed/Calendar/Home/Profile/Board/Streaks automatically, per the requirement, instead of needing separate update logic per screen
- [x] Streaks/workout-days/leaderboard now correctly count **unique calendar days**, not activity or entry count — multiple activities logged the same day only count once
- [x] Stat numbers are now honest, not flavor text: "all-time" and "kudos received" dropped from their old inflated seed values (75, 8) to what's actually derivable from real entries — smaller, but for the first time actually true

**Milestone 10 — Backend integration, part 1: read path** ✅
- [x] Chose Supabase (`BACKEND_PLAN.md`); schema/RLS/storage bucket/seed
      data shipped (`supabase/migrations/*`, `supabase/seed.sql`,
      `SUPABASE_SETUP.md`) — no frontend changes in that step by design
- [x] `lib/data/*` now reads from Supabase (`FRONTEND_INTEGRATION.md`);
      every function kept its exact signature, `AppStateProvider`/
      `lib/stats.ts`/`lib/ranking.ts`/components untouched

**Milestone 9/10 — Identity, authentication & real persistence** ✅
(Merged identity/auth with the write-path, per the decision to treat this as
one cohesive "demo → real product" milestone rather than separate tasks.)
- [x] **Real roster.** The 7 placeholder identities (Dad/Mom/Uncle/Aunt/
      Cousin Sister/Cousin Brother + Akshit) are gone — replaced with the
      actual family (Akshit, Atharv, Vidushi, Anamika, Vivek, Amit,
      Vishakha) in `supabase/seed.sql`, preserving the same relative
      activity levels (most/least active, etc.) by design, not just names.
      Seed emails are realistic `@familyworkout.local` placeholders —
      claiming a profile now overwrites this automatically with whatever
      real email that family member actually verifies, so there's no
      separate "set the real email first" step (`DEPLOYMENT.md`).
- [x] **Self-serve "claim your profile" Supabase Auth (Email OTP).**
      Superseded an initial invite-only design (an admin-run
      `scripts/invite-family.mjs` was the sole way to create an account) —
      replaced because it put an admin in the loop for every new sign-in
      rather than letting each family member onboard themselves. Sign-up
      is now open (anyone can request a 6-digit email code), but an
      account can only ever attach itself to one of the 7 existing,
      still-unclaimed `athletes` rows — never create a new one. First use:
      pick your name from the family list → verify your email via a
      6-digit code → permanently claimed. Returning visits: just email +
      code, auto-resolved to the right profile. See
      `FRONTEND_INTEGRATION.md`.
- [x] **Claiming, not auto-linking.** `claim_athlete()` (SECURITY DEFINER
      RPC, `supabase/migrations/20260725161000_auth_claim.sql`) atomically
      links the session to the chosen athlete row and updates its email to
      the one just verified — replacing the seeded placeholder address —
      or raises a clear error if someone already claimed it first. A
      narrow `athlete_claim_status` view (name + claimed bool, no email)
      is the only pre-auth-readable roster data.
- [x] **Read policies tightened accordingly.** Since sign-up is no longer
      invite-gated, "authenticated" alone no longer implies "is a family
      member" — every table's SELECT policy now also requires
      `current_athlete_id() is not null`, closing the gap where a stranger
      could self-verify an email, never claim anyone, and still read
      family data via a direct API call.
- [x] `CURRENT_ATHLETE_EMAIL` removed entirely. `getCurrentUser()` resolves
      via the real session (`auth.uid()` → `athletes.auth_user_id`); if a
      session exists but hasn't claimed a profile yet (abandoned mid-flow),
      it redirects back to `/login?resume=1` to resume claiming rather than
      crashing.
- [x] `lib/supabase/server.ts` swapped from a service-role client to a
      cookie-based, session-aware `@supabase/ssr` client — RLS is now
      actually enforced on every read, not bypassed.
- [x] `src/proxy.ts` (Next.js 16 renamed Middleware → Proxy) redirects
      signed-out visitors to `/login`. Deliberately does *not* redirect
      signed-in visitors away from `/login` — a session can exist without
      a claimed profile, and bouncing those back to `/` would just loop
      against the redirect above. This is an optimistic UX check only —
      real enforcement is RLS + `fetchCurrentAthlete()`, per Next's own
      guidance that layout-level checks alone aren't sufficient.
- [x] `/login` — a single page, no separate callback route needed (sign-in
      is code entry via `verifyOtp`, not a clicked link): email/code
      returning-user flow by default, with a "first time" path that shows
      the family picker first. A working sign-out control wired into
      Settings.
- [x] **Real persistence.** `AppStateProvider`'s `saveActivity` (add +
      edit), `deleteActivity`, `toggleKudos`, `addComment`, and
      `addCustomActivityType` all write to Supabase now. Optimistic local
      updates are unchanged UX-wise; each write rolls back with an error
      toast on failure. Client-generated `crypto.randomUUID()` ids mean the
      optimistic id and the persisted id are the same value — no
      reconciliation step needed.
- [x] New `lib/data/activityTypes.ts` — the activity-type taxonomy (5
      defaults + any "Add Your Own" customs) is now a real, shared,
      persisted table instead of a hardcoded constant plus a
      browser-session-only array that reset on every reload.
- [x] End-to-end tested as 2+ real accounts: login, logout, session
      persistence across refresh, add/edit/delete activity, kudos,
      comments, leaderboard/streak/profile/calendar updates — all verified
      to survive a hard refresh. RLS verified against real sessions:
      cross-user edits denied, cross-user kudos allowed, self-kudos denied,
      impersonation denied. Re-verified after the switch to self-serve
      claiming: fresh claim end-to-end, re-claiming an already-claimed
      profile rejected, resuming an abandoned claim, an unclaimed session
      correctly denied read access, and returning-login auto-resolution.
      See `FRONTEND_INTEGRATION.md` for the full
      verification log.
- [x] Retired `lib/mock/*` entirely (had been fully unused since the read-path milestone).
- [ ] Real proof-photo upload — the form UI placeholder still exists and
      still isn't wired up; unrelated to this milestone's scope.

**Milestone 10.1 — Auth UX polish & hardening** ✅
- [x] **OTP "not received" root-caused**: not a bug — local Supabase's
      SMTP catch-all never delivers to a real inbox by design, and nothing
      in the UI said so. Confirmed the whole pipeline (Supabase config,
      email template, SMTP, app code) was already working correctly by
      testing the exact endpoint directly and finding real prior test
      emails already sitting in Mailpit. Fixed the actual gap — a
      local-dev-only hint on the code-entry screen pointing at Mailpit —
      not a delivery mechanism, since nothing was broken there.
- [x] **Fixed a real bug**: `/login` always showed the sign-in form even
      for an already-signed-in, already-claimed visitor. Now checks for an
      existing session once on mount and hands off to a real navigation to
      `/`, which resolves correctly either way. Verified against a
      simulated real browser restart (fresh browser context, same cookie
      storage — not just "still in memory"), not just a same-session
      refresh.
- [x] Email is documented as intentionally immutable for v1 — no code
      change (already true), just written down clearly
      (`DEPLOYMENT.md`, `FRONTEND_INTEGRATION.md`).
- [x] `ConfirmationDialog` (same component `ActivityModal` uses) now gates
      the actual claim RPC call — cancelling returns to the name picker
      instead of stranding the visitor on an already-used code form (a bug
      caught only by testing the cancel path, not just the happy path).
- [x] Lightweight success celebration after a first claim, auto-advancing
      into the app — no new component, reused the existing flow's `Card`.

**Milestone 10.2 — Production data hygiene** ✅
- [x] Split dev and production data into two separate files:
      `supabase/seed.sql` (local dev only — realistic history, comments,
      kudos, demo custom activity types) and the new
      `supabase/production_bootstrap.sql` (hosted projects — just the 7
      unclaimed athletes + 5 default activity types, nothing else). Two
      files with unmistakably different names, not one file with a mode
      flag — see `DEPLOYMENT.md`'s "Development seed vs. production
      bootstrap".
- [x] Verified the actual first-time-production experience (not just the
      SQL): reset the local database with *only* the production bootstrap
      applied (`supabase db reset --sql-paths ./production_bootstrap.sql`
      — local-only, safe), then drove a real claim + first workout through
      the UI. Confirmed empty feed, empty leaderboard, zero streaks before
      logging anything, and that a first workout correctly creates the
      streak/feed/board numbers from scratch.
- [x] Found and fixed a real gap this surfaced: `Feed.tsx` (Home's
      activity feed) had no empty-state message at all — a blank section
      when `entries` is `[]`, which is exactly production's day-one state.
      Directly contradicted the "show absence, don't hide it" product
      principle. Fixed with the same pattern `AthleteActivityFeed`/
      `DayDetailsSheet` already used elsewhere.
- [x] Audited for anything dev-specific that shouldn't ship: no stray
      `console.log`/debug output, no TODO/FIXME markers, no hardcoded
      `localhost`/Mailpit references outside the one intentionally-gated
      hint added in Milestone 10.1, no leftover feature flags or dev-only
      bypasses in the auth path. Came back clean.
- [x] `DEPLOYMENT.md` rewritten as a single ordered sequence (create
      project → migrate → bootstrap → configure auth → configure SMTP →
      configure env vars → deploy → verify), with the two-seed-files
      explainer up front and a day-one-specific block added to the
      verification checklist.

**Milestone 10.3 — Phone-based anonymous auth (replaces Email OTP)** ✅
- [x] Product decision, not a bug fix: email OTP (and the SMTP/rate-limit
      problems hit trying to deploy it — Supabase's default sender caps
      at ~2 emails/hour, not viable even for 7 people) was more auth than
      a private 7-person app's threat model needs. Replaced with Supabase
      Auth **Anonymous Sign-In** (still a real signed session — RLS
      unchanged in shape) plus a 10-digit Indian mobile number acting as
      a lightweight shared secret, not proof of possession — no code is
      ever sent anywhere, so no SMTP/SMS provider/DLT registration needed
      at all.
- [x] `athletes.email` → `athletes.phone_number`, plus new column-level
      grants so phone numbers (unlike email before them) are never
      readable by other family members' sessions, only via the
      SECURITY DEFINER RPCs. `claim_athlete()` → `claim_athlete_with_phone()`
      / `login_with_phone()` (new migration, old one left untouched since
      it's already applied to the hosted project — see
      `supabase/migrations/20260726090000_phone_auth.sql`).
- [x] `/login` rewritten: every roster name is clickable now (claimed
      names mean "sign in," not "disabled, already taken") — picking a
      name branches to claim-with-confirmation or direct sign-in based on
      `athlete_claim_status`. Sign-out now genuinely requires re-entering
      the phone number, matching the product ask.
- [x] Accepted tradeoff, stated explicitly: since no code is sent, anyone
      who *knows* a family member's number can sign in as them from any
      device. Judged acceptable for 7 trusted people; documented in
      `DEPLOYMENT.md` and `FRONTEND_INTEGRATION.md` so it's a known
      decision, not a surprise.

**Open product decisions — tracked, not blocking** (full detail in
`PRODUCT.md` §8): day-boundary/timezone handling for a family that may not
share a timezone, leaderboard opt-out, a roster-management UI (today:
adding/removing a family member means editing the `athletes` table
directly — claiming itself is now self-serve, only the roster's existence
is admin-managed).

## Upcoming Milestones

### Phase A — Remaining UI

**Milestone 5 — Settings screen** (postponed — resume here)
- [ ] Setting row pattern (icon, title, subtitle, control)
- [ ] Notification toggle (UI only, not yet functional)
- [ ] Sign-out control (UI only)
- [ ] Placeholder row for future auto-logging setting (Future scope, UI only)

**Milestone 8 — Wide-viewport polish** (revised — see decision below)
- [ ] Confirm the constrained phone-width column (`max-w-md`) reads cleanly on tablet/desktop, not just "not broken"
- [ ] Decide whether the empty space beside the column on wide screens needs any treatment, or stays plain background
- [ ] Full pass across all four screens at a range of widths above 448px

> **Decision (superseding the original Milestone-1 plan):** iPhone 15/16 Pro
> (390×844) is the primary design target — this should feel like a native
> mobile app, not a responsive website. Desktop does **not** get a sidebar
> nav or multi-column layouts; it's the same phone-width column, centered
> and scaled, never stretched. `AppShell`'s max-width was narrowed from
> `max-w-2xl` to `max-w-md` to match. `DESIGN.md` §8 updated accordingly.

### Phase B — Accounts & real data

Identity, authentication, and persistence (formerly planned as separate
Milestones 9 and 10) shipped together — see Milestone 9/10 above. What's
left in this phase:

- [ ] Decide day-boundary/timezone handling now that real sessions exist
      (family may not share a timezone)
- [ ] Real proof-photo upload

### Phase C — Social features & depth

**Milestone 11 — Notifications**
- [ ] Decide notification channel (push / email / in-app only)
- [ ] "Family member logged" notification (opt-in)
- [ ] Preferences wired to the Settings screen

**Milestone 12 — Leaderboard depth**
- [x] ~~Live rank recomputation for the current user~~ — done in Milestone 6 (`computeCompetitionRanks`)
- [ ] Multi-period switching backed by real data
- [ ] Real rank computation for *all* members (not just live-adjusting the current user against static data)
- [ ] Historical period browsing

### Phase D — Ship it

**Milestone 13 — Hardening & deployment**
- [x] Deployment plan documented (`DEPLOYMENT.md`): env vars, production
      Supabase project setup, Vercel deployment, PWA checklist, production
      verification checklist — documented ahead of actually deploying, so
      this is a plan, not a shipped state yet
- [x] PWA installability: web app manifest, icon set, `theme-color`/viewport
      meta, service worker, safe-area/mobile polish — the Platform
      Principle (§3) is now a built capability, not just a design intention
      (`DEPLOYMENT.md` §9–10 tracks the specifics, browser support, and
      known limitations; still needs a real-device pass before family
      rollout)
- [ ] Accessibility audit (contrast, focus states, screen-reader labels)
- [ ] Performance pass (Lighthouse, bundle size, image optimization)
- [ ] Decide static vs. dynamic rendering strategy (timestamp formatting already depends on render-time `Date`)
- [ ] Stand up the production Supabase project + Vercel deployment (`DEPLOYMENT.md`)
- [ ] Basic uptime/error monitoring

## Product Backlog

Planned, not yet scheduled to a milestone:

- [ ] Lightweight, privacy-respecting usage analytics to inform product decisions
- [ ] Family-level weekly digest/recap (aggregated, not per-person surveillance)
- [ ] Gentle reminder nudge for an inactive member
- [ ] Opt out of the leaderboard while still logging privately

## Nice-to-have Ideas

Speculative, in the spirit of accountability + motivation + simplicity —
not commitments:

- [ ] Monthly family goal/challenge (collective target, not head-to-head)
- [ ] Milestone badges (e.g. 30-day streak, 100 entries) — celebratory, not punitive
- [ ] Gentle "who hasn't logged this week" prompt, shown in aggregate only
- [ ] End-of-quarter recap card
- [ ] Optional photo or emoji attached to an entry
- [ ] "Repeat my last entry" quick-log template

## Technical Debt

Resolved this milestone: hardcoded current-user email, service-role reads
bypassing RLS, local-only writes, "only the current user can act" (any
claimed family member can now act as themselves), and manual admin-invite
provisioning (replaced by self-serve claiming — see Milestone 9/10 above).

Still open:

- [ ] No roster-change UI — adding or removing a family member (as opposed
      to claiming an existing one) still means editing `supabase/seed.sql`
      or the `athletes` table directly
- [ ] Streak/day-boundary logic uses the browser's local `Date()` with no timezone awareness — fine for one device, not yet correct for a family that might span timezones
- [ ] No automated tests (unit, integration, or visual regression) — this milestone's verification was a scripted end-to-end pass (Playwright + direct Supabase assertions), run once, not a repeatable suite committed to the repo
- [x] Error boundaries around data fetching (`(main)/error.tsx`, `global-error.tsx`) — no loading states yet, since routes are dynamic but data usually resolves fast at this data volume
- [ ] No accessibility audit performed yet (though focus states and keyboard nav were addressed as part of Milestone 6)
- [ ] Desktop layout untested beyond the mobile-first default
- [ ] Real proof-photo upload still not wired up (form UI placeholder only)

## SweaTies v2 — private groups (shipped)

Rebrand from "Family Workout"/"Octopus" to **SweaTies**, and from a fixed
roster to a Strava-style closed social app.

- [x] Self-serve sign-up (name + phone) replaces roster claiming
- [x] Private groups with invite codes, `/join/<code>` links, multi-group
      switching, admin code reset; visibility scoped to shared groups in RLS
- [x] Quarterly, yearly (this/last) and all-time leaderboards; real ranking
      history on Profile
- [x] Realtime feed updates, comment emoji reactions, kudos chime
- [x] Celebration overlay and shareable workout card
- [x] Existing roster migrated into a "Family" group
- [ ] SMS OTP or PIN for sign-in (phone number alone is a weak credential)
- [ ] Push notifications for groupmate workouts
- [ ] Member removal / richer admin tools; non-+91 phone numbers

## Future Improvements

Longer-horizon, beyond MVP:

- [ ] Wearable / auto-logging integration
- [ ] Native mobile app
- [x] Multi-group support — shipped in SweaTies v2 (see below)
- [ ] Data export
- [ ] Multi-timezone support
- [ ] Push notification infrastructure at scale
