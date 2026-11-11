# SweaTies

A mobile-first, installable PWA for private workout crews — friends,
teammates, colleagues. Think Strava's social side for a closed group:
log a workout in a couple of taps, see your crew's feed, hand out kudos,
and climb the leaderboard. Accountability through visibility, not pressure.

## Features

- **Private groups with invite codes** — anyone can sign up, create a
  group and share its code or `/join/<code>` link. You can belong to
  several groups and switch between them in Settings. Admins can reset a
  group's invite code. People only see workouts of athletes they share a
  group with (enforced by Postgres Row Level Security, not just the UI).
- **Home** — today's stats, an activity sparkline, and a live feed of the
  group's workouts. Updates arrive in real time (Supabase Realtime).
- **Board** — leaderboard with podium and full rankings for every quarter
  of the year, this year, last year and all time.
- **Kudos, comments and emoji reactions** — react to comments, with an
  optional kudos chime (toggle in Settings).
- **Celebration + share card** — logging today's workout triggers a
  confetti moment and a shareable 4:5 image card (native share sheet or
  download).
- **Profile** — streaks, month calendar, activity breakdown and ranking
  history per period.
- **Phone sign-in** — Anonymous Sign-In plus a phone-number RPC; no
  email or SMS codes. The number is a lightweight credential, not proof
  of ownership (see "Known limitations").
- **Installable PWA** — add-to-home-screen, standalone launch, offline
  app-shell caching, safe-area-aware layout.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [Supabase](https://supabase.com) — Postgres, Row Level Security, Auth
  (Anonymous Sign-In + phone-number RPC), Realtime, Storage
- Tailwind CSS v4
- TypeScript

## Getting started

### Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Docker (required by the Supabase CLI to run Postgres locally)

### 1. Install dependencies

```bash
npm install
```

### 2. Start local Supabase

```bash
npx supabase start
```

This spins up a local Postgres instance, runs the migrations in
`supabase/migrations/`, and seeds it with realistic demo data
(`supabase/seed.sql`) — a "Demo Crew" group (invite code `DEMOCREW01`)
with 7 athletes, weeks of activity history, comments, and kudos. Sign up
in the app, then join with that code to see it populated. See
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) for the full local-dev setup.

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in the two values from `npx supabase status` (or Studio → Project
Settings → API for a hosted project):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose **I'm new**,
enter a name and any 10-digit number (there's no code to look up anywhere,
local or otherwise), then join the seeded group with invite code
`DEMOCREW01` — or create your own group.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |

## Project documentation

This repo is documentation-heavy on purpose — the "why," not just the
"what," lives in these files:

| File | Covers |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | Product spec: scope, assumptions, open questions |
| [`DESIGN.md`](./DESIGN.md) | Visual language and design tokens |
| [`ROADMAP.md`](./ROADMAP.md) | Milestone history and what's next |
| [`BACKEND_PLAN.md`](./BACKEND_PLAN.md) | Supabase schema/RLS architecture decisions |
| [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) | Local Supabase dev workflow |
| [`FRONTEND_INTEGRATION.md`](./FRONTEND_INTEGRATION.md) | What's actually wired up vs. mock data |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Production deployment guide, PWA checklist, browser support, known limitations |

## Deployment

Live at <https://sweaties-fitness.vercel.app> (the Vercel project is still
named `family-workout`, a legacy name).
`DEPLOYMENT.md` has the full runbook — hosted Supabase project setup,
migrations, auth configuration, Vercel deployment and a PWA checklist.

## License

Private project — not licensed for reuse.

## Known limitations

- Sign-in is by phone number only (no SMS verification), so anyone who
  knows a member's number could sign in as them. Fine for a trusted crew;
  add SMS OTP or a PIN before opening the app up more widely.
- Phone numbers are +91 (India) only.
- Push notifications (as in the app this was modelled on) are not
  implemented yet.
