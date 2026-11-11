# Frontend Integration

> **SweaTies note:** this document is a historical log written when the app was
> the single-roster "Family Workout". It documents how the frontend was wired to Supabase. The app is now **SweaTies** —
> self-serve sign-up, private groups and invite codes (see
> `supabase/migrations/20260801100000_groups.sql` and `README.md`). Where this
> file says "family" or describes claiming a pre-seeded roster, read it as the
> earlier design.


This document covers five milestones, newest first. The read-path
milestone (bottom of this file) swapped `lib/data/*` from `lib/mock/*` to
Supabase reads, with writes still local-only. **Authentication &
Persistence** (below that) added real auth, real writes, and the real
family roster — its auth mechanism (admin-run invites) was then replaced
by **Self-Serve Profile Claiming**, which itself got a UX/hardening pass
in **Auth UX Polish & Hardening**, before the whole email-OTP mechanism
was replaced outright by **Phone-Based Anonymous Auth** (top of this
file, the most recent milestone) for a simpler threat model appropriate
to a 7-person private app. Every function's signature and return type
stayed the same across all five; nothing above `lib/data/*` (pages,
`AppStateProvider`, `lib/stats.ts`, `lib/ranking.ts`, components) was
redesigned, only swapped underneath.

## Milestone: Phone-Based Anonymous Auth (replaces Email OTP)

Product decision, not a bug fix: email OTP (and the SMTP/rate-limit/DLT
problems chronicled in the milestones below) was more auth than a private
7-person family app's threat model needs. Replaced entirely with Supabase
Auth **Anonymous Sign-In** (a real, signed session — `auth.uid()` still
works, RLS is unchanged in shape) plus a 10-digit Indian mobile number
that acts as a lightweight shared secret, not proof of phone ownership —
no OTP/SMS code is ever sent. See `supabase/migrations/20260726090000_phone_auth.sql`
for the schema/RPC changes and the security reasoning (why RLS still
holds, why the phone comparison happens server-side only, why
`phone_number` is excluded from client-readable columns even though the
row itself is visible).

**What changed:**
- `athletes.email` → `athletes.phone_number` (nullable, unique, checked
  `^\+91[0-9]{10}$`, excluded from `authenticated`/`service_role` column
  grants — stricter than `email` ever was, since a phone number now
  doubles as a login credential)
- `claim_athlete(uuid)` → two RPCs: `claim_athlete_with_phone(athlete_id, phone)`
  for first-time claims, `login_with_phone(athlete_id, phone)` for
  re-signing-in after sign-out or on a new device (re-points
  `auth_user_id` at a fresh anonymous session)
- `src/app/login/page.tsx` rewritten: no email input, no OTP-code screen,
  no `resend`/`resume` states. Every roster name is clickable (claimed
  names now mean "sign in," not "already taken and disabled") — the phone
  step's copy and backend call branch on `athlete.claimed` from
  `athlete_claim_status` (unchanged view, still excludes sensitive fields)
- `fetchCurrentAthlete()` simplified: dropped the `?resume=1` distinction
  entirely, since the roster is now the same landing state either way
- Removed: `supabase/templates/magic_link.html`, the SMTP/email-template
  dashboard configuration steps in `DEPLOYMENT.md`, `config.toml`'s
  `[auth.email.template.magic_link]` block

**Accepted tradeoff, stated explicitly (not an oversight):** since no code
is ever sent to verify possession, anyone who *knows* a family member's
number can sign in as them from any device. For 7 trusted people this was
judged an acceptable simplification; it would not be appropriate at a
larger scale or lower-trust user base.

## Milestone: Auth UX Polish & Hardening

Manual testing of the self-serve claim flow (previous milestone) surfaced
one real bug, one missing safety net, and three UX gaps the milestone
asked for explicitly. All in `src/app/login/page.tsx` unless noted.

### 1. OTP "not being received" — root cause: local dev, not a bug

**Diagnosis, not a guess.** Called the exact endpoint
`signInWithOtp()` hits directly
(`POST /auth/v1/otp` with the anon key) and confirmed: the request
succeeds (`200 {}`), a message lands in Mailpit within ~1 second, and its
content renders the 6-digit code perfectly
(`supabase/templates/magic_link.html` working exactly as designed). This
was then independently reconfirmed by finding **real prior messages
already sitting in Mailpit addressed to the actual family member's real
Gmail address** — proof the manual test had already gone through
`/login`, requested a code with a real address, and gotten a real,
correctly-formatted email... that just never left the local Docker
network, because that's what local Supabase's SMTP catch-all
(`[local_smtp]` in `config.toml`) does *by design*: every outbound auth
email is intercepted and stored in Mailpit, never actually delivered
anywhere, specifically so local development never accidentally emails a
real address.

**Root cause: local development setup**, not Supabase configuration, not
the email template, not SMTP, not application code — all four of those
were independently verified working. The actual gap was that nothing in
the app told a local tester where to actually look. Ruled out explicitly:

- **Supabase configuration** — correct; the OTP request succeeds and rate
  limits weren't hit.
- **Email template** — correct; content renders the code prominently and
  cleanly (verified by reading a captured message's body directly).
- **SMTP** — correct; it's doing exactly what local dev SMTP is supposed
  to do (capture, don't deliver).
- **Application code** — correct; `signInWithOtp` fires with the right
  parameters and the server accepts it.

**Fix**: not a delivery fix (nothing was broken to fix) but a
discoverability one — a small local-dev-only hint on the "enter your
code" screen (`IS_LOCAL_SUPABASE`, detected from
`NEXT_PUBLIC_SUPABASE_URL` containing `127.0.0.1`/`localhost`) linking
straight to `http://127.0.0.1:54324` (Mailpit), so this can't be mistaken
for broken delivery again. It renders as nothing at all once
`NEXT_PUBLIC_SUPABASE_URL` points at a real hosted project — production
readiness for *real* delivery (a configured SMTP provider) was already
covered in `DEPLOYMENT.md` §2.7 and remains unchanged by this milestone.

### 2. Repeated login after a successful claim — a real bug, now fixed

Previously, `/login` always rendered the sign-in form on load, even for a
visitor with an already-valid, already-claimed session — `proxy.ts`
deliberately doesn't redirect signed-in visitors away from `/login`
(removing that redirect was the previous milestone's fix for an infinite
loop against the `?resume=1` recovery path). That was correct for
avoiding the loop, but left a real gap: anyone who happened to land on
`/login` directly (a bookmark, browser history, typing the URL) while
fully signed in saw the login form again, unnecessary.

Fixed at the point closest to the problem, without touching `proxy.ts`
again: `/login` now checks `supabase.auth.getUser()` once on mount
(unless already mid-recovery via `?resume=1`, which skips this check and
goes straight to the athlete picker). If a session exists, it hands off
to a real navigation to `/` — the server resolves it properly (Home if
claimed; bounced back to `/login?resume=1` if not, which this check
correctly doesn't re-trigger, since `resuming` is then true). A brief
loading state (not the sign-in form) covers the moment this check takes,
so a returning, already-claimed visitor never sees so much as a flash of
the email field.

Verified this is a real fix, not just "should work": a simulated browser
restart (Playwright's `storageState` export/import — a fresh browser
context seeded with the same cookies, not the same running process, which
is what actually tests "does this survive a restart" rather than just "is
the variable still in memory") lands directly on Home with the right
athlete's data, and separately, navigating to `/login` directly while
signed in redirects to Home rather than showing the form. Also confirmed
the session cookie itself has a real `expires` timestamp, not a
session-only cookie that would die with the browser process regardless of
any app-level logic.

### 3. Email is intentionally immutable — documented, not built

No code change: `claim_athlete()` already only succeeds once per athlete
(`where auth_user_id is null`), and there was never a "change your email"
UI to remove. This is a deliberate v1 scope decision, now written down
explicitly rather than left implicit — see `DEPLOYMENT.md`'s Production
Supabase Project section and the note below. If this needs to change
later, it's a new, separate flow (re-verify a new email, then update both
`athletes.email` and, separately, the `auth.users` email via Supabase's
own email-change flow) — not something to bolt onto claiming.

### 4. Confirmation before claiming

Claiming reached the point of actually calling `claim_athlete()`
immediately in two places — right after OTP verification (first-time
path) and immediately on tapping a name (already-authenticated/resumed
path). Both now go through the existing `ConfirmationDialog` component
first (same one `ActivityModal`'s delete flow uses — `destructive` for
the solid, emphasized confirm button, even though "claim" isn't
destructive in the delete sense; it's the closest existing visual
language for "this is the deliberate, primary action here, and it's
permanent"). Confirming calls the RPC as before; cancelling returns to
the name picker (reloading claimed-status first, in case someone else
claimed it in the meantime) rather than stranding the visitor on an
already-used OTP form — an actual bug caught by testing the cancel path,
not just the happy path.

### 5. Success celebration

A brief `"success"` phase (🎉 Welcome, {name}! Your profile has been
successfully linked. You're all set!) renders in the same `Card` used
throughout the flow after a successful claim, auto-advancing to `/` after
1.8s, with an explicit "Continue" button for anyone who'd rather not wait
or prefers not to rely on a timed transition. No new component — this
didn't warrant one, per "don't over-design it."

### Testing

Re-verified end-to-end, 23/23 checks: OTP delivery via the real UI flow
(not the admin API — see the previous milestone's note on why that
distinction matters) landing in Mailpit with the local-dev hint visible,
first-time onboarding, the confirmation dialog appearing before any write
happens and correctly blocking a cancelled claim, the success screen and
its auto-advance, a simulated real browser restart landing straight on
Home, direct navigation to `/login` while signed in redirecting away, sign
out, sign back in via the returning (no name list) flow, and the session
cookie's real expiry.

---

Replaced the previous milestone's invitation-only auth (an admin ran
`scripts/invite-family.mjs` with the service-role key to pre-create each
family member's account) with self-service onboarding: **on first use, a
visitor picks their name from the family list, verifies their own email
via a 6-digit code, and that permanently claims the matching profile.**
On every visit after that, they authenticate with just their email and a
code — no name list, straight to their own profile.

### Why this replaced invitation-only

Invitation-only put an admin (Akshit) in the loop for every account
creation — fine for a one-time initial rollout, but a worse fit for
"anyone in the family should be able to just open the app and get in."
Self-serve claiming keeps the same *closed roster* property (only 7
`athletes` rows will ever exist, and each can only ever be claimed once)
without needing an admin to act first. The invite script and its
migration-installed auto-claim-by-email trigger are both gone.

### Auth mechanism: Email OTP, not Magic Link

`signInWithOtp()` is the same Supabase call either way — the difference
is entirely in the email template and which client method verifies it.
Magic Link (clicking a link, `exchangeCodeForSession` on a callback route)
was the previous milestone's approach; it doesn't fit a multi-step wizard
well, since navigating away mid-flow (to click the link) loses whatever
UI state said "which name are you claiming" unless that state is smuggled
through a redirect URL. **Switched to a typed 6-digit code**
(`verifyOtp({ email, token, type: "email" })`), verified without ever
leaving `/login` — the claim wizard's state (`claimAthlete`, `email`,
`phase`) just stays in the page's own React state throughout.

This meant customizing the email template
(`supabase/templates/magic_link.html`, referenced from
`config.toml`'s `[auth.email.template.magic_link]`) to surface `{{
.Token }}` prominently instead of just a clickable link, and it meant
`src/app/auth/callback/route.ts` could be deleted outright — there's no
redirect to catch anymore. `additional_redirect_urls` in `config.toml`
shrank back down to just what's needed for `site_url` itself.

### The claim mechanism

**`public.athlete_claim_status`** (new view, `anon`-readable) exposes
`id`, `name`, and a computed `claimed` boolean — nothing else. This is
what the "pick your name" screen renders *before* the visitor has signed
in at all. It deliberately excludes `email`: someone picking a name to
claim has no legitimate reason to see everyone else's registered address,
and the real `athletes` table now requires a claimed profile to read at
all (see below).

**`public.claim_athlete(target_athlete_id uuid)`** (new RPC,
`SECURITY DEFINER`) atomically does the actual claim: sets
`auth_user_id = auth.uid()` and `email = auth.jwt() ->> 'email'` (the
caller's own verified email — never a client-supplied value, so a claim
can't misattribute a different address than what was actually verified),
scoped to `where id = target_athlete_id and auth_user_id is null`. If
zero rows match (already claimed by someone else), it raises a clear
`This profile has already been claimed.` exception rather than silently
no-op'ing.

**This needed `SECURITY DEFINER`, not `SECURITY INVOKER` — a real bug,
not just a design choice.** The first implementation used the default
(`security invoker`) plus a plain RLS UPDATE policy
(`using: auth_user_id is null`, `with check: auth_user_id = auth.uid()`).
It looked correct and matched the pattern used everywhere else in this
project, but empirically always reported "already claimed" even for a
genuinely fresh, unclaimed row. Root cause, confirmed with temporary
`RAISE WARNING` debug output showing `auth.uid()` and the target id both
correct but the `UPDATE` still matching zero rows: **Postgres RLS applies
a table's SELECT policy to identify candidate rows for an UPDATE, in
addition to the UPDATE policy's own USING clause.** The tightened SELECT
policy (next section) requires `current_athlete_id() is not null` — which
is exactly false for the not-yet-claimed caller trying to claim in the
first place. So the row was invisible to the UPDATE before its own USING
clause ever got evaluated, and it silently affected zero rows every time,
which read identically to "already claimed" from the caller's side.
`SECURITY DEFINER` sidesteps the whole interaction: the function runs
with its owner's privileges (bypasses RLS for this one, narrowly-scoped,
hardcoded-condition query), so there's no SELECT-policy visibility
problem to fight. No table-level GRANT or RLS policy is needed for
claiming at all now — simpler than the first attempt, not just a
workaround for it, since nothing outside this function can UPDATE
`athletes`.

### Read access tightened

Every table's SELECT policy changed from `to authenticated using (true)`
to `to authenticated using (current_athlete_id() is not null)`
(`athletes`, `activity_types`, `activities`, `activity_entry_types`,
`comments`, `kudos`). This wasn't optional cleanup — it closes a real gap
the invite-only milestone didn't have: since sign-up is now open,
"authenticated" no longer implies "is a family member." Without this
tightening, a stranger could self-verify any email via OTP, never claim a
profile, and still read every activity/comment/kudos through a direct API
call, even though the app's own UI would never show them anything
(`fetchCurrentAthlete()` redirects to `/login?resume=1` with no linked
athlete). Verified directly: an authenticated-but-unclaimed session reads
zero rows from `activities` and `athletes`, but can still read
`athlete_claim_status` (needed to resume claiming) — and once that same
session claims a profile, it can immediately read `activities` with no
further action.

### `fetchCurrentAthlete()` and `proxy.ts`, revisited

A session can now legitimately exist with **no linked athlete** —
someone verified a code and then closed the tab before picking a name.
`fetchCurrentAthlete()` treats this as recoverable, not fatal: instead of
throwing, it calls `redirect("/login?resume=1")`. The login page reads
that query param and, on mount, skips straight to the name-picker step
(and fetches the athlete list itself — an early version of this forgot
that fetch entirely, leaving the resumed picker permanently empty until
caught in testing).

This also required removing `proxy.ts`'s previous "redirect signed-in
users away from `/login`" rule. That rule was correct under the old
model (a session always implied a claimed profile), but now creates a
real infinite loop: proxy sees a session and bounces `/login` → `/`;
`fetchCurrentAthlete()` sees no linked athlete and bounces `/` back to
`/login?resume=1`; proxy sees the same session again and bounces away
from `/login` again. Removing that rule breaks the cycle — a fully
claimed user who navigates to `/login` by mistake just sees the sign-in
form again, which is harmless, and is a better trade than a loop.

### Testing

Re-verified end-to-end with real Supabase Auth OTP codes (fetched from
local Mailpit, not the admin API's `generateLink` — that call produces an
implicit-flow redirect with no server-exchangeable code, which isn't
representative of what `verifyOtp` actually does; it was only useful for
directly probing the RPC bug above, not for simulating a real user):
fresh claim end-to-end (name → email → code → claimed, verified in
Supabase directly, including that the placeholder seed email gets
overwritten with the real verified one), attempting to re-claim an
already-claimed name (shown disabled in the picker, and rejected by the
RPC if attempted anyway), an abandoned claim resuming correctly via
`?resume=1`, RLS denying an unclaimed session and then opening up
immediately after claiming, sign-out, and returning login (email + code
only, auto-resolved, no name list shown). 22/22 checks passed.

---

## Milestone: Authentication & Persistence (original milestone record)

Historical record of the milestone that came before the one above — kept
as-is for context on decisions made at the time, most notably the
invitation-only auth model this milestone shipped and the one above then
replaced. Where later work changed something described here, the section
above says so explicitly rather than silently editing history.

Treated as one cohesive milestone rather than separate auth/persistence
tasks, since writes can't be attributed to anyone without a real session,
and a session isn't worth much without anywhere to write.

### Real roster

`supabase/seed.sql` no longer seeds placeholder identities (Dad, Mom,
Uncle, Aunt, Cousin Sister, Cousin Brother). The real 7: Akshit, Atharv,
Vidushi, Anamika, Vivek, Amit, Vishakha — mapped positionally onto the old
roster so relative activity levels (who's most/least active) carried over
unchanged, not just the names. Emails are realistic `@familyworkout.local`
placeholders; **these must be replaced with real, deliverable addresses
before real invites go out** (`DEPLOYMENT.md`) — Magic Link auth can't
reach a fake inbox.

While verifying the roster swap, the bulk-history generator in `seed.sql`
turned out to be less deterministic than its own comment claimed: it used
`setseed()` + `random()`, whose draw order depends on the query planner's
row-processing order — not guaranteed stable across a fresh `db reset`
even with the same seed. A reset right after the rename knocked Vivek
(meant to be most active) down to third-to-last. Fixed by replacing
`random() < rate` with a deterministic hash of `(athlete_name, days_ago)`
via `hashtext()` — a pure function of its input, so the same names always
land the same way, on any machine, forever. Verified via three consecutive
`db reset`s producing identical per-athlete counts before treating it as
done.

### Authentication — invitation-only Magic Link

No public sign-up, no password, no OAuth. The invitation boundary is
entirely: **`scripts/invite-family.mjs` is the only thing that can ever
create an `auth.users` row.** It's a service-role-key script, run by an
admin from a terminal, never imported by the app. The public `/login` page
calls `signInWithOtp({ email, options: { shouldCreateUser: false } })` —
that flag means an email with no existing account gets a rejection, not a
new account, no matter who submits the form.

Once invited, how does the new `auth.users` row become "that person" in
the app? A new migration, `20260725161000_auth_claim.sql`, adds a
`SECURITY DEFINER` trigger on `auth.users` insert that finds the
`public.athletes` row with a matching email and sets its `auth_user_id` —
automatically, the instant the account is created. No app code runs this;
it can't be skipped or raced by a bug in a request handler. This is also
exactly the mechanism the schema's own original comment
(`20260725120000_schema.sql`) described as the plan, from the foundation
milestone, before auth existed to build it against.

`src/lib/supabase/server.ts` was rewritten from the service-role client
(the read-path milestone's stand-in) to a cookie-based, session-aware
`@supabase/ssr` client — not cached at module scope, since a session-bound
client can't be safely reused across different users' requests in the
same server process. Reads now run as whichever athlete is actually signed
in, so RLS is enforced for real rather than bypassed.

`src/lib/data/supabase-helpers.ts`'s `fetchCurrentAthlete()` no longer
takes a hardcoded email — it resolves the signed-in user via
`getAuthUser()` and looks up `athletes` by `auth_user_id`, throwing (to
`error.tsx`) if there's no session, which shouldn't be reachable anyway
since `proxy.ts` redirects first.

**`src/proxy.ts`** (not `middleware.ts` — Next.js 16 renamed Middleware to
Proxy, confirmed via `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
before writing this) reads the session cookie and redirects signed-out
visitors to `/login`, signed-in visitors away from it. Per Next's own
authentication guide
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`), this
is explicitly called out as an *optimistic* check only — not a security
boundary, since layout-level checks don't re-run on every client-side
navigation. The actual enforcement is `fetchCurrentAthlete()` throwing
with no session, plus RLS at the database itself; Proxy only exists so a
signed-out visitor gets redirected before a page renders, for UX.

**`src/app/login/page.tsx`** — email in, `signInWithOtp` out, a "check
your email" state. Lives outside `(main)`, so it doesn't go through
`AppStateProvider` (there's no athlete to seed it with pre-login) or get
the bottom nav.

**`src/app/auth/callback/route.ts`** — a Route Handler (not a Server
Component — only Route Handlers/Server Actions can set cookies) that
exchanges the PKCE `code` param for a session via
`exchangeCodeForSession`, then redirects to `/`. `@supabase/ssr`'s browser
client defaults to the PKCE flow, so a real `signInWithOtp` call from
`/login` always produces a `?code=` redirect here — confirmed by testing
the actual UI flow end-to-end, not by simulating it via the admin API (see
Testing below, which explains why that distinction mattered).

**`src/components/settings/SignOutButton.tsx`** — the "Sign-out control
(UI only)" placeholder that had been sitting in `ROADMAP.md` since
Milestone 5 is now real: `supabase.auth.signOut()` then a full
`window.location.assign("/login")` (not a client-side route push) so
`AppStateProvider`'s in-memory state doesn't carry over to whoever signs
in next on the same device.

### Persistence — real writes, same UX

`AppStateProvider`'s five write actions (`saveActivity` for both add and
edit, `deleteActivity`, `toggleKudos`, `addComment`, plus
`addCustomActivityType`) all write to Supabase now, via the browser client.
The optimistic-update shape is unchanged — apply the local state update
immediately, exactly as before — each one just gained a Supabase call
after it, with rollback + an error `Toast` (already built, from the
activity-logging-refinement milestone) if that call fails.

The one real technique worth naming: every new row (`activities`,
`comments`, `activity_types`) gets its id from `crypto.randomUUID()`
**on the client**, used for both the optimistic local entry and the
Supabase insert payload. That means there's no reconciliation step where
a temporary `local-...` id gets swapped for a server-assigned one after
the fact — the id never changes between "optimistic" and "confirmed," so
a kudos or comment added a moment later against that same entry never has
to guess which id is current.

`deleteActivity` relies on the schema's existing `on delete cascade` —
one `DELETE` on `activities`, and `activity_entry_types`/`comments`/`kudos`
for that row go with it, no separate cleanup calls needed.

`saveActivity`'s edit path resolves selected activity-type *labels* to
`activity_type_id`s via a map built from the new `activityTypes` context
field (see below), deletes all existing `activity_entry_types` rows for
that activity, and re-inserts the current set — a full replace rather than
a diff, which is simpler and cheap at this data volume (an activity has at
most a handful of types).

**New: `src/lib/data/activityTypes.ts`** — `getActivityTypes()` fetches
the full, real, shared `activity_types` table (the 5 defaults plus any
"Add Your Own" customs anyone has ever added). This replaces two things at
once: the hardcoded `DEFAULT_ACTIVITY_TYPES` constant (deleted from
`lib/activityTypes.ts`) and `AppStateProvider`'s old
`customActivityTypes: string[]` (browser-session-only, reset on every
reload, invisible to other family members even though the database already
supported family-wide visibility). Both are now the one real
`activityTypes: ActivityType[]` field, seeded from the layout and updated
optimistically the same way entries are. `addCustomActivityType` became
`async` as a result (`ActivityForm`'s call site was updated to `await`
it) — same external behavior, just a network round trip where there
wasn't one before.

### Row Level Security

No new policies were needed — the foundation milestone's policies were
already written against real auth (`current_athlete_id()`, `to
authenticated`), just unenforceable until a session existed to test them
against. This milestone is what finally exercised them for real. See
Testing below for what was actually verified, not just assumed.

### Testing

Verified end-to-end as two real accounts (Akshit and Atharv), scripted
with Playwright driving the actual UI plus direct Supabase assertions
confirming each action really persisted (not just "the toast appeared"):
login, logout, session persistence across a hard refresh, add/edit/delete
activity, kudos, comments, and RLS — cross-user edit denied, cross-user
kudos allowed, self-kudos denied, impersonation denied. A third account
(Vidushi) additionally confirmed streak/calendar/leaderboard propagation
after a fresh write. 25/25 core checks passed; the streak/calendar
follow-up passed 3/3.

One methodology note worth keeping, since it cost real debugging time:
**`supabase.auth.admin.generateLink()` cannot be used to simulate a real
user's login for end-to-end testing.** It produces an implicit-flow
redirect (`#access_token=...` in a URL fragment) because there's no
browser-held PKCE `code_verifier` to redeem against — fragments never
reach the server, so `/auth/callback`'s `code`-based exchange correctly
sees nothing and redirects to `/login`, which looks like a login failure
but isn't. The fix was to drive the *real* `/login` form in a real
Playwright browser context (so the PKCE cookie actually exists), then
fetch the real email from the local Mailpit API
(`http://127.0.0.1:54324/api/v1/messages`) instead of minting a link via
the admin API. This is also just... what a real user's flow is — testing
it any other way was testing something the app doesn't actually do.

For direct RLS assertions (not just UI-level pass/fail), the two accounts'
real session cookies were read out of their Playwright browser contexts
(`sb-<ref>-auth-token`, `base64-` prefixed JSON, chunked across
`.0`/`.1`/... cookies if long) to extract each one's real access token,
then used to build a plain `supabase-js` client with that token as a
bearer `Authorization` header for direct table-level probes — a real
session's real privileges, not a re-derived approximation of one.

### Architectural observations, now resolved

The read-path milestone (below) flagged two things as priorities before
going further. Both are done:

- ~~RLS is currently bypassed, not enforced~~ — resolved; see above.
- ~~"Current user" is a hardcoded email, not a session~~ — resolved; see
  above.

---

## Read Path (original milestone record)

Historical record of the milestone that came before the one above — kept
as-is for context on decisions made at the time. Where later work changed
something described here, the section above says so explicitly rather
than silently editing history.

## What changed

**`src/lib/supabase/server.ts`** (new) — a server-only client built with the
**service-role key**, not the anon key. Auth isn't wired up yet, so there's
no Supabase session to satisfy the `to authenticated` RLS policies from the
foundation milestone; an anon-key request would come back as the `anon`
role and silently return zero rows everywhere. The service role bypasses
RLS, which is the only way to read real data before auth exists. This
should be swapped for a session-aware `@supabase/ssr` client, and RLS should
start actually being enforced, once magic-link sign-in lands.

**`src/lib/supabase/client.ts`** (new) — a browser client via
`createBrowserClient`. Scaffolded for the auth milestone; nothing calls it
yet.

**`src/lib/data/supabase-helpers.ts`** (new, internal) — the query logic
shared across the four `lib/data/*` files: reconstructing `FeedEntry[]` from
`activities` joined to `activity_entry_types → activity_types` and `kudos`
in one query, resolving "the current athlete" by a hardcoded email
(`CURRENT_ATHLETE_EMAIL`, matching today's "Akshit is always you" behavior
until real auth exists), and fetching the full roster.

**`src/lib/data/athletes.ts`** — `getCurrentUser` resolves by email and
throws on failure (no session to fall back to, so a fabricated identity
would be worse than an explicit error). `getCurrentUserSummary` runs the
current athlete's real activities through the same `lib/stats.ts` functions
`AppStateProvider` already uses, with the same window definitions
(`entriesThisPeriod` = workout days in the trailing `periodDaysElapsed`
days, not a calendar-quarter count; `bestStreak` floored by the current
streak) — see the architectural note below on why most of these fields are
actually superseded by the client. `getAthlete` uses `maybeSingle()` so an
unknown id resolves to `undefined` (→ `notFound()`) rather than throwing.
`getAthletes` and `getActivityBreakdown` degrade to `[]` on failure.

**`src/lib/data/feed.ts`** — one bounded, joined query (400 days — see
below for why not a tighter "recent activity" window). Degrades to `[]` on
failure.

**`src/lib/data/leaderboard.ts`** — `getPeriodOptions`, `getCurrentPeriodId`,
and `getPeriodProgress` became pure calendar math (which real quarter is
"today" in, how far through it), replacing hardcoded mock values ("Q3", day
24 of 92) that would otherwise silently go stale. `getLeaderboard` fetches
all athletes' activities once and computes workout-days/streak/rank per
athlete in JS via the existing `getLoggedDateKeys` + `computeCompetitionRanks`
helpers, rather than a new SQL aggregate. `getMyPeriodRankings` reuses that
same leaderboard computation for the current period and honestly returns
`rank: null, workoutDays: 0` for other periods — deeper historical ranking
was an explicit open decision in `BACKEND_PLAN.md §8`, not something to
invent unilaterally here.

**`src/lib/data/comments.ts`** — one flat query, grouped by `activity_id`
in JS. Degrades to `{}` on failure.

**`src/app/(main)/layout.tsx`** — added `export const dynamic =
"force-dynamic"`, so every screen under it is rendered per-request instead
of at build time (there's no live Supabase connection at build time, and
the data is per-family-member real-time anyway).

**`src/app/(main)/error.tsx`** (new) — catches failures thrown by the
`page.tsx`/nested-layout level (e.g. `getAthlete` inside the profile route)
and shows a retry UI instead of crashing.

**`src/app/global-error.tsx`** (new) — required in addition to the above.
Per this Next.js version's own docs
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`),
`error.js` never wraps the `layout.js` in its own segment — only what's
nested inside it. `(main)/layout.tsx` is exactly where `getCurrentUser()`
runs, so a failure there skips `(main)/error.tsx` entirely and only
`global-error.tsx` at the app root catches it. Verified this live: with no
`.env.local` present, hitting `/`, `/board`, and `/profile` all render the
`global-error` boundary (confirmed via the RSC payload's `pagePath`), and
the dev server stays up and keeps serving — it doesn't crash the process.

## Query optimizations

- `getFeed` and `getActivityBreakdown` bound their queries by date instead
  of scanning the whole `activities` table.
- Everything else (leaderboard ranking, per-athlete stats) fetches the full
  history and computes in JS via the existing pure helpers rather than new
  SQL aggregates or RPC functions — deliberately, given the real data volume
  (7 athletes, a few hundred rows): it maximizes reuse of code the client
  path already exercises, at negligible cost at this scale.
- `getCurrentUserSummary` and `getLeaderboard` both end up fetching
  activities independently (once filtered to the current athlete, once for
  everyone) — a known duplicate round trip per request, left as-is rather
  than introducing a request-scoped cache, which would be more machinery
  than this milestone's "swap implementations, don't redesign" scope calls
  for.

## Components/files that stayed untouched

`AppStateProvider`, `lib/stats.ts`, `lib/ranking.ts`, `lib/date.ts`, every
component under `src/components/`, and both `board/page.tsx` and
`profile/[athleteId]/page.tsx` (confirmed before writing any code — they
already called `lib/data/*` with exactly the signatures preserved here).
`lib/mock/*` is left in place, unused — deleting it wasn't asked for, and
"avoid unnecessary refactors" argued for leaving it as a candidate for a
future, separately-reviewed cleanup.

## Architectural observations before writes

- **`AppStateProvider` recomputes almost the entire summary itself, on
  every render including the first.** Its `useMemo` takes `initialSummary`
  and only actually keeps `periodLabel` and `rank` — every other field
  (`entriesThisPeriod`, `sparkline`, streaks, `allTimeEntries`, etc.) is
  re-derived from the `entries` prop (i.e., `getFeed()`'s result) using the
  same `lib/stats.ts` functions. This is why `getFeed()` can't be trimmed to
  a short "recent activity" window without silently truncating all-time
  stats once real usage outgrows it — it's the de facto source for those
  numbers, not just the visible feed list. Worth keeping in mind before the
  writes milestone: any new entry written locally already flows through
  this same recompute path today, so the derived numbers should stay
  correct without extra wiring — the risk is entirely in the read window,
  not the write path.
- **RLS is currently bypassed, not enforced.** The service-role key was the
  only honest way to read anything before auth exists, but it means the
  policies written in the foundation milestone aren't actually being
  exercised yet. Auth + a session-aware client should be a priority before
  this goes anywhere real people other than the family can reach — right
  now any code with access to the service-role key sees everything,
  regardless of RLS.
- **"Current user" is a hardcoded email, not a session.** Every write in
  the next milestone will need a real `athlete_id` to attribute the write
  to; using `CURRENT_ATHLETE_EMAIL` as a stand-in for now was fine for
  reads, but writes will make the missing-auth gap much more visible (RLS's
  `with check (athlete_id = current_athlete_id())` policies will reject
  anything written under the service-role key with no matching
  `auth.uid()` unless auth is wired up first, or those inserts also go
  through the service-role key and re-implement the ownership check in
  application code — worth deciding explicitly rather than defaulting into
  it).
- **Missing photos are a non-issue at this layer.** `activities.photo_path`
  is nullable and nothing in `FeedEntry` or any component references it —
  the "Proof Photo" field in `ActivityForm` is still a UI-only placeholder.
  Nothing needed to change here; flagging it mainly so it isn't mistaken for
  an oversight.

## What I could and couldn't verify

Originally written without a reachable Supabase project (no Docker in that
environment). Once the app was run against a real local Supabase instance
(`npx supabase start` + `db reset`), two issues surfaced and were fixed —
see "Post-milestone fix" below. After both fixes:

- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass cleanly;
  every `(main)` route builds as dynamic (ƒ), not statically prerendered.
- Live, with no `.env.local` present: `/`, `/board`, and `/profile` all hit
  the Supabase client, fail to connect, and correctly render
  `global-error.tsx` rather than crashing — the dev server stays up and
  keeps responding to further requests.
- Live, against the real local database: `/`, `/board`, `/profile/[id]`,
  `/settings` all return 200, and the rendered Board page shows the real
  seeded roster (Akshit, Atharv, Vidushi, Anamika, Vivek, Amit, Vishakha)
  with Vivek leading, matching the relative activity levels
  `supabase/seed.sql` was written to produce.

Still worth a manual look: `getActivityBreakdown`'s percent-of-workout-days
definition and `getLeaderboard`'s streak-vs-recent-count-label threshold
(`>= 2` days) were judgment calls made to fit the original mock data's
shape rather than something explicitly specified — worth confirming they
feel right against the real seeded history.

## Post-milestone fix — read path failed against real local Supabase

Two independent bugs surfaced the first time this ran against a real
database (symptom: `Could not resolve current athlete
(akshit@familyworkout.local)` on every route):

1. **`.env.local` had the wrong key format.** It was filled in with
   Supabase's newer `sb_publishable_.../sb_secret_...` API keys instead of
   the legacy JWT-based `anon`/`service_role` keys `npx supabase status`
   also prints. `@supabase/supabase-js` v2 (pinned here) expects the JWT
   form — fixed by copying `ANON_KEY`/`SERVICE_ROLE_KEY` (the `eyJ...`
   values) from `npx supabase status` instead.
2. **The real root cause: missing table-level GRANTs.** RLS policies only
   add row-level filtering on top of base SQL privileges — they don't
   replace them. `20260725120100_rls_policies.sql` enabled RLS and added
   policies for every table but never granted `SELECT`/`INSERT`/`UPDATE`/
   `DELETE` to `anon`/`authenticated`/`service_role`. Confirmed directly
   against PostgREST: querying `athletes` with either key format returned
   `permission denied for table athletes` — the exact same error under
   both keys, which is what proved the key-format fix alone wasn't the
   real issue. `service_role` bypasses RLS (`BYPASSRLS`) but still needs
   the base grant to touch the table at all. Fixed by adding the missing
   `grant` statements to the same migration, then `npx supabase db reset`.

See the conversation/commit history for the exact grants added; in short,
every table now grants the privileges its RLS policies already assume to
both `authenticated` (for when real auth lands) and `service_role` (used
for all reads today).

**To avoid this going forward:** whenever a migration adds
`enable row level security` + `create policy`, add the matching
`grant ... to authenticated, service_role` in the same migration, and
smoke-test with `npx supabase db reset` before treating a migration as
done. Prefer copying JWT-format keys from `npx supabase status` (or Studio
→ Project Settings → API) into `.env.local`, not the newer
`sb_publishable_`/`sb_secret_` keys, until the Supabase client library
version here officially adopts them.
