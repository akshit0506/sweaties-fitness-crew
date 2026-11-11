# Design System

Reverse-engineered from reference screenshots in `docs/reference/`. This describes a
**visual language and interaction pattern**, not a literal copy — no proprietary
names, wordmarks, or exact assets from the reference are reused. Hex values below
are close approximations read off the screenshots, not sampled from a source file;
treat them as a starting palette to refine, not gospel.

No code yet. This is the spec code will be built against once we get to implementation.

---

## 1. Design Philosophy

The reference app reads as **"scoreboard meets logbook"** — a deliberately blunt,
stamped/printed aesthetic (heavy type, hard black borders, flat colors) crossed with
a warm, hand-kept-ledger feel (cream paper background, a serif accent for personal
notes). Two moods coexist on purpose:

- **Competitive/scoreboard mood** — big bold numbers, rank lists, podium, streaks.
  Communicated through: heavy condensed type, black borders, high-contrast tiles.
- **Personal/warm mood** — "your records", kudos, streak calendars.
  Communicated through: cream background, a softer accent serif, green checkmarks.

Everything is numbers-first: any statistic (streak count, rank, entry count) is
rendered much larger and bolder than its label. The label is always small,
uppercase, and letter-spaced — supporting text never competes with data for
attention.

---

## 2. Color Palette

| Role | Approx. value | Used for |
|---|---|---|
| Background (paper) | `#F1ECE1` warm off-white/cream | Page background — never pure white |
| Ink (primary text) | `#1C1A17` near-black | Headlines, body text, primary numbers |
| Border (structural) | `#1C1A17` black, 1.5–2px | Card outlines, buttons, avatar rings |
| Accent — rust/brick | `#9C3B32` muted terracotta red | Section eyebrows, rank numbers, "kudos given" text, current-user tag |
| Accent — olive/gold | `#8A7A3D` muted mustard | Streak callouts, secondary links ("your ledger"), in-progress stats |
| Success — green | `#4C9A5B` medium leaf green | Completed-day checkmarks, progress bars, positive deltas |
| Muted gray | `#8A8578` warm gray | Meta text, timestamps, dividers, disabled/pre-app data |
| Divider hairline | `#D8D2C4` | Row separators within list-style (non-card) sections |
| Metallic accents (sparingly) | silver/gold/bronze gradients | Only for celebratory, rare moments (e.g. a top-3 podium) — not a general UI color |

**Rules:**
- Background is *always* warm cream, never white — this is what makes black
  borders and dark text feel "printed" rather than sterile.
- Black is used structurally (borders, key buttons, number tiles) — not just as
  a text color. Reserve pure-black fills for the 1–2 highest-priority actions per
  screen (e.g. the primary "log" action).
- Rust and olive are both used as accents but for different jobs: rust = identity/
  social ("you", "gave kudos", rank), olive = progress/momentum ("streak", "in the
  last 30 days"). Don't swap their roles.
- Green is reserved for "done/positive" states only (checkmarks, filled progress).
  It should never appear as decoration.

---

## 3. Typography

Three distinct type roles, deliberately contrasting:

1. **Display / masthead** — a heavy, condensed, all-caps grotesque (bold weight,
   tight tracking). Used exactly once per screen for the app's own name/logo
   treatment. Very large (~40–48px mobile). This is the one place the type is
   allowed to be loud.
2. **Accent serif/slab** — a warm serif or slab-serif, mixed case, medium-bold.
   Used only for personalized, human moments (e.g. a "records" subheading naming
   the current user). Sits directly under the display headline to soften it.
3. **UI grotesque (body/interface)** — a clean, neutral sans (system font /
   Inter-style) for everything else: labels, body copy, buttons, list rows.
   Two weights only: regular (meta/body) and bold (names, primary values).

**Recurring "eyebrow" treatment:** any label that annotates a number or section
(section headers, stat captions, nav labels, timestamps, tab names) is rendered
small, uppercase, and letter-spaced (~0.08–0.12em), in muted gray or the accent
colors — never in primary ink color. This is the single most repeated typographic
pattern in the system and should be a shared component/utility class, not
re-implemented per screen.

**Numeral treatment:** any standalone statistic (streak days, rank, counts) is
set 2–4x the size of its label, bold, tabular/monospaced-feeling digits, in
primary ink or black-tile-with-white-text. Numbers are the visual hierarchy
anchor of this system — bigger than any headline except the masthead.

| Role | Weight/case | Approx. size (mobile) |
|---|---|---|
| Display masthead | Heavy, ALL CAPS, tight tracking | 40–48px |
| Accent serif subheading | Bold, mixed case | 22–26px |
| Section header (eyebrow) | Bold, UPPERCASE, letter-spaced | 12–13px |
| Hero stat number | Bold/black, tabular | 28–40px |
| Body / list title | Bold, mixed case | 16–17px |
| Meta / caption | Regular, UPPERCASE or mixed, muted | 11–12px |

---

## 4. Spacing & Layout

- **Mobile-first, single column.** Reference is phone-width only; see §8 for how
  this should extend to desktop.
- **Card padding:** generous, consistent inner padding (~16–20px) regardless of
  card content density.
- **Corner radius:** small and consistent (~6–10px) on cards, buttons, and pill
  tags. Full circles only for avatars and status dots. Nothing is fully
  "pill-rounded" except small tag/badge chips — this keeps the "stamped/printed"
  feel rather than a soft/bouncy one.
- **Section rhythm:** every section starts with an eyebrow label optionally
  followed by a thin horizontal rule extending to the section's right edge —
  used consistently as a section divider, not just under headings.
- **List vs. card density (important hierarchy signal):**
  - Lists of *people* (leaderboard rows) are lightweight: no per-row border, just
    hairline dividers between rows. Optimized for fast scanning.
  - Lists of *events* (feed/activity posts) are full bordered cards, one per
    entry, with more breathing room. Optimized for reading detail.
  - Don't upgrade a scanning list into cards, or downgrade an event feed into
    plain rows — the density difference is intentional and communicates
    "this is a quick ranking" vs. "this is a story."
- **Stat strips:** groups of 3–4 related numbers are laid out as equal-width
  columns separated by thin vertical rules, each column = big number over small
  label. Used for quick-glance summary blocks at the top of a screen.

---

## 5. Component Hierarchy

```
AppShell
├─ Masthead (eyebrow meta line + display logo + accent-serif subheading)
├─ Page content (scrollable)
│  ├─ SegmentedTabBar (period switcher — pill tabs, active = filled black)
│  ├─ ProgressRail (thin bar + start/end meta labels, e.g. "day X of Y")
│  ├─ StatStrip (2–4 columns, big-number-over-label, divided by rules)
│  ├─ Podium (rare/celebratory — top-3 only, skeuomorphic medallions)
│  ├─ StreakCard (bordered card: icon + hero number + 7-day check row)
│  ├─ ActivityBreakdown (labeled horizontal bars, one row per category)
│  ├─ RankedList (lightweight rows: rank, avatar, name, streak tag, stat tiles)
│  └─ Feed (bordered event cards: author, timestamp, tag chips, kudos/comments)
├─ PrimaryAction (sticky, full-width, press-and-hold, pinned above nav)
├─ BottomNav (3 flat text tabs; active tab = bordered box, not fill/underline)
└─ SettingsDrawer (right-side overlay panel with scrim)
```

### Component notes

- **Number tile ("odometer" digit):** a small black rounded-square with a bold
  white numeral — used whenever a raw count needs scoreboard emphasis inline
  with other content (e.g. entries this period). Reusable atom, not bespoke per
  screen.
- **Streak/tag chip:** small bold pill, either solid-black-fill/white-text (primary
  tag, e.g. an activity category) or bordered/outline (secondary/inactive state,
  e.g. an unselected toggle). The filled-vs-outline contrast is the system's
  general way of showing on/active vs. off/inactive — reuse it for toggles,
  tags, and buttons alike rather than inventing a new state style per component.
- **Avatar:** circle, thin black ring border, single capital initial, no photos
  in the reference set. Stacks (overlapping circles) represent multiple people
  in a compact space (e.g. "who gave kudos").
- **Podium:** the one skeuomorphic/decorative element in an otherwise flat
  system (gradient medallions with a glossy highlight). Reserve this kind of
  ornamentation for rare, celebratory moments only — don't extend the metallic
  treatment to everyday UI.

---

## 6. Navigation Pattern

- **Bottom tab bar**, exactly 3 destinations, flat uppercase text labels (no
  icons in the reference). Active tab is indicated by a bordered rectangle
  drawn around the label — not a fill, not an underline, not a color change.
  This is a distinctive, low-noise selection indicator worth keeping as-is.
- **Horizontal segmented control** for switching time periods (e.g. quarter/
  year), rendered as adjoining pill tabs; the active pill is solid black with
  white text and carries a small live-status dot when it represents "current."
- **Drawer/panel navigation** (settings) slides in from the right, covering
  roughly 75% of the width, with a dimmed scrim over the remaining visible
  strip of the underlying page — signals "temporary overlay," not "new page."

---

## 7. Interaction Patterns

- **Press-and-hold to commit the primary action** (logging an entry), rather
  than a single tap. This is a deliberate friction/ritual — it prevents
  accidental submissions and gives the action weight. Any "this is the one
  important thing you do today" action is a good candidate for this pattern;
  don't apply it to secondary actions.
- **Toggles as labeled buttons, not switches** — "ON"/"OFF" text inside a
  button that changes fill (filled green = on, outlined = off) rather than an
  iOS-style sliding switch. Consistent with the bordered-button visual language
  used everywhere else, so switches don't look like a foreign control.
  **Note for the design/product owner:** a "sign in as X" model implies single-device,
  single-user-at-a-time sessions per person — confirm this matches how account
  switching should actually work for a shared crew app before building it.
- **Lightweight social feedback** (kudos = one-tap acknowledgment, comments =
  optional thread) attached per feed entry — kept visually secondary to the
  entry's own stats (smaller, below the main content, muted until given).
- **Edit affordance** appears only on entries owned by the current viewer
  (small icon button, top-right of that card) — never shown on others' entries.
- **Empty/inactive states** are shown, not hidden: unchecked days in a streak
  row render as outlined (not filled) circles rather than disappearing, and
  pre-existing/out-of-scope data is shown grayed out with a explanatory label
  rather than omitted. General principle: show the absence of data
  explicitly, don't just leave blank space.

---

## 8. Responsive Behavior

**Primary design target: iPhone 15/16 Pro, 390×844.** This product should
feel like a native mobile app, not a responsive website that happens to
work on phones. That distinction drives everything below.

| Breakpoint | Behavior |
|---|---|
| Mobile (all widths up to ~448px) | The design target. Single column, bottom tab bar, sticky primary action above it, comfortable fixed horizontal margins. |
| Wider viewports (tablet, desktop) | The same phone-width column (capped, currently `max-w-md` / 448px) stays centered on screen — it does **not** grow to fill the available width. No sidebar nav, no multi-column stat strips, no wide feed. Desktop is the mobile layout, scaled and centered, not a distinct layout. |
| All breakpoints | Card border weights, type scale ratios, and the eyebrow-label treatment stay constant — there is no "desktop density" to design for. |

This supersedes an earlier draft of this section that proposed a sidebar nav
and 2-column layouts above 1024px — that direction was reversed in favor of
staying phone-width everywhere.

---

## 9. What This Deliberately Does *Not* Specify

- Exact hex values as final/locked — treat §2 as a starting point to test for
  contrast/accessibility (some combinations, e.g. olive-on-cream, should be
  checked against WCAG AA before use in real UI).
- Icon set — reference uses emoji as placeholder iconography (🔥, 👏, 💬, ⚙️);
  a real icon set (e.g. an outline icon library) should replace these
  consistently rather than mixing emoji and icons.
- Font family names — described by role/character (e.g. "heavy condensed
  grotesque") rather than a specific commercial typeface, since the reference
  source's exact font isn't verifiable from screenshots alone. Pick actual
  fonts that match the described character during implementation.
- Any literal product name, logo, or wordmark from the reference — intentionally
  excluded per your instruction not to copy proprietary branding.
