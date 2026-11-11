# Product Specification — SweaTies

> **Update (v2):** the app was originally a single fixed 7-person family
> roster ("Family Workout"/"Octopus"). It is now **SweaTies**: users sign up
> themselves and create or join private groups via invite codes; feeds and
> leaderboards are scoped per group. Sections below that describe a fixed
> roster, a single group, or "family" members predate this change.

## 1. Problem & Goal

A 7-person extended family (two related adult households, no kids) wants
shared visibility into each other's workouts for motivation and light social
accountability — not coaching, not competition for its own sake. Success =
family members work out more consistently because they can see each other
doing it.

## 2. Users

7 adults, one shared group, no sub-groups. All members have equal standing —
no admin/coach role. Kids are explicitly out of scope for MVP.

## 3. Product Principles

- **Platform Principle: this is a mobile-first Progressive Web App (PWA).**
  The primary experience is an installable, full-screen web app launched
  from a phone's home screen — not a page opened in a browser tab each
  time. Desktop browsers are supported but are a secondary experience;
  design and engineering decisions should default to the installed-PWA
  case, not compromise it for desktop parity.
- **Manual logging is the trusted source of truth.** No verification or
  anti-cheat mechanism — this only works because it's family, not strangers.
- **Friction is deliberate in exactly one place**: the daily log action
  (press-and-hold). Everywhere else — browsing, giving kudos — must stay
  low-friction.
- **Show absence, don't hide it.** Empty states and gaps (a missed day, an
  inactive member) are shown plainly rather than omitted.
- **Ranking motivates, it doesn't shame.** The leaderboard must degrade
  gracefully for whoever is least active — no punitive framing.
- **Each screen answers one question**: Home = "what's happening today?",
  Board = "how do we compare?", Profile = "how am I doing?", Settings = "how
  do I control my experience?"

## 4. Core User Journey (open app → log a workout)

1. Open the app → land on **Home**.
2. See own snapshot (streak, rank, entries this period) and the family's
   recent activity feed.
3. Press and hold the primary action to log today's workout.
4. Select the activity type(s) logged (from the default taxonomy or a
   custom one), optionally add a note/duration.
5. Confirm — the entry appears in the shared feed immediately and the
   member's own streak/stats update.
6. From there, a member can browse **Board** to see the family ranking, open
   **Profile** to review their own history, or react to others' entries with
   kudos/comments directly from the Home feed.

This flow is real as of Milestone 7 — holding the button opens an Add
Activity form (or Today's Activities, if something's already logged),
not a silent toggle.

## 5. Screens & Primary Use Cases

| Screen | Primary use case |
|---|---|
| **Home** | Daily check-in — see family activity, log today's workout, glance at your own snapshot. |
| **Board** | Comparison — see the full family ranking for a period, spot who's most active. |
| **Profile** | Reflection — review your own full history, streak calendar, and activity mix. |
| **Settings** | Control — manage notification/logging preferences, sign out. |

## 6. Feature Scope

**Must Have (MVP)**
- Manual workout logging, attributed to a specific member
- Activity type selection at log time (default taxonomy: Gym, Cardio,
  Cycling, Running, Yoga) plus custom types
- Personal streak tracking (current + best)
- Shared activity feed visible to all members
- Kudos (one-tap reaction) on feed entries
- Leaderboard/ranking for a defined period
- Home, Board, Profile, Settings navigation shell
- Mobile-first, installable PWA (see Platform Principle, §3)

**Should Have**
- Comments on feed entries
- Multiple leaderboard periods (e.g. quarter/year toggle)
- Per-activity-type breakdown on Profile
- Editing a logged entry after submission
- Notification when a family member logs

**Future / Explicitly Out of Scope for MVP**
- Wearable / auto-logging integration
- Invite flow for adding or removing family members
- Push notification infrastructure and sound preferences
- Native mobile app
- Multiple family groups
- Coach-assigned or planned workouts (ruled out early — this product is
  about shared accountability, not coaching)

## 7. Assumptions to Validate

- All 7 members will adopt manual daily logging without any enforcement.
- A visible, shared leaderboard motivates rather than discourages, across an
  age range that spans multiple generations.
- No entry verification is acceptable — trust alone is sufficient.
- Members are in close-enough timezones that "Today"/"Yesterday" labels are
  unambiguous without per-user timezone handling.
- PWA installation (add-to-home-screen) is acceptable distribution — no
  app-store listing is required, and members are willing to install it
  that way rather than just visiting a URL each time.

## 8. Open Questions

- **Identity**: there is currently no login. How does the app know who is
  logging? (Options range from "no auth, device = identity" to a lightweight
  name/PIN selection — this blocks real usage with more than one device.)
- **Backdating**: resolved as of Milestone 7 — the calendar's empty-day tap opens Add Activity pre-filled with that date, so past-day logging is supported.
- **Day boundary**: whose midnight defines a "day" for streaks, if members
  aren't in the same location?
- **Visibility**: can a member opt out of the leaderboard while still
  logging privately, or is full visibility mandatory for everyone?
- **Nudges**: is there any reminder for an inactive member, or is the
  product fully passive?
- **Roster management**: is the 7-person list static forever, or does it
  eventually need a real add/remove flow?
