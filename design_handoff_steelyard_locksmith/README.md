# Handoff: Apex Locksmith — Steelyard Direction

## Overview

A marketing website for **Apex Locksmith**, a fictional Denver-area 24/7 locksmith company. The primary goal of the site is to drive **emergency "call now" phone clicks** from people who are locked out. Secondary goals are credibility (trust signals, reviews, years in business) and showcasing the five service categories.

This is the **"Steelyard"** direction — a brutalist, heavy-industrial aesthetic with high-vis safety orange accents, caution-stripe motifs, and chunky black sans-serif type. There was a second direction explored in parallel ("Forge", blueprint industrial); this handoff is **Steelyard only**.

## About the Design Files

The files in this bundle are **design references created in HTML/React** — clickable prototypes showing the intended look and behavior. They are **not production code to copy directly.**

The task is to **recreate this design in the target codebase's existing environment** — whatever framework, component library, routing, and CSS approach is already in use. If no target codebase exists yet, choose the most appropriate stack for a marketing site (Next.js + Tailwind is a sensible default) and implement there. The HTML prototype runs entirely on inline styles + Babel-transpiled JSX because it lives in a no-build playground; do not ship it that way.

## Fidelity

**High-fidelity (hifi).** All colors, type scales, spacing, layout proportions, and component states are intentional. The developer should recreate the UI pixel-perfectly while adapting to the target codebase's primitives. Where the prototype uses inline styles, translate into the codebase's CSS approach (Tailwind utilities, CSS modules, styled-components, etc.).

Photo placeholders in the prototype are striped SVG with mono-font labels (e.g. `HERO PHOTO · van at warehouse loading dock`). These describe the photography brief — the developer should ask product/marketing for real photos before launch, but the labels and aspect ratios indicate what each slot expects.

---

## Brand & Content (canonical)

All copy and data lives in `brand.js` (the `window.APEX` object). Treat that file as the canonical content source — port it verbatim into the target codebase as JSON / a CMS schema / TS constants.

Key facts:
- **Name**: Apex Locksmith
- **Phone**: `(555) 273-9425` (placeholder — replace with real number)
- **Service area**: Denver Metro
- **Founded**: 2008 (18 years in business)
- **Rating**: 4.9★ · 847 Google reviews
- **License**: CO-LIC #LSM-7791, bonded $1M, insured, ALOA member
- **Owner**: Marcus Holloway
- **Address (placeholder)**: 2244 Curtis St, Denver, CO 80205
- **Email (placeholder)**: dispatch@apexlocksmith.co

### Five services
1. **24/7 Emergency Lockouts** — from $65, ~15 min ETA
2. **Residential Rekey & Lock Install** — from $89, same day
3. **Commercial & Business Locks** — from $135, same day
4. **Smart Locks & Access Control** — from $159, by appointment
5. **Safes — Open, Move, Install** — from $115, same day

### Service-area ZIPs
The full list is in `brand.js` → `APEX.serviceZips`. Approximate logic for the ZIP checker:
- In array → "Covered"
- Starts with `80` or `81` but not in array → "Fringe (call for surcharge)"
- Anything else → "Out of area"
- Non-5-digit input → "Invalid input"

---

## Design Tokens

### Colors

| Token | Hex | Usage |
|---|---|---|
| `--steel-bg` (default, dark) | `#18181a` | Page background, primary "ink" surface |
| `--steel-bg-2` | `#26262a` | Card surfaces on dark |
| `--steel-bg-3` | `#34343a` | Hover / secondary on dark |
| `--steel-ink` (on dark) | `#ece6da` | Primary text on dark bg |
| `--steel-ink-dim` (on dark) | `#a8a39a` | Secondary text on dark |
| `--steel-rule` (on dark) | `#3a3a3e` | Dividers on dark |
| `--hivis` (dark mode) | `#ee5a1a` | Primary accent — high-vis safety orange |
| `--hivis-dk` (light mode) | `#c64210` | Primary accent — light-mode variant (slightly darker for AA contrast) |
| `--caution` (dark mode) | `#f4c20a` | Yellow caution stripes, hazard tags |
| `--caution-lt` (light mode) | `#c79a08` | Caution — light-mode variant |
| `--green` (dark mode) | `#5cd97a` | Live status indicator |
| `--green-lt` (light mode) | `#2a8a3e` | Status — light-mode variant |
| **Light mode tokens** | | |
| `--steel-paper` | `#ebe7df` | Page background, light mode |
| `--steel-paper-2` | `#dcd5c3` | Card surfaces, light mode |
| `--steel-paper-3` | `#cdc4ad` | Tertiary, light mode |
| `--steel-ink-lt` | `#18181a` | Primary text on light bg |
| `--steel-ink-dim-lt` | `#5a5852` | Secondary text on light |
| `--steel-rule-lt` | `#bbb2a0` | Dividers on light |

**Default theme is dark.** A light mode is supported and inverts bg↔text plus uses the dimmer accent variants. Both themes ship.

### Typography

- **Display**: `Archivo Black, sans-serif` — chunky, brutalist. Used for all headings, the phone number, numeric stats. Common letter-spacing: `-0.025em` to `-0.04em` for large sizes; positive `0.02em` for short caps. No font-weight prop needed (it's one weight).
- **Body**: `DM Sans, sans-serif` — clean geometric. Used for paragraph copy. Weights 400/500/700.
- **Mono / labels**: `Space Grotesk, sans-serif` — used as the "mono" accent (it's a sans, but with rectangular glyphs that feel technical). Used for hazard tags, status labels, fine print. Weights 600/700. Letter-spacing: `0.18em–0.24em`, uppercase.

Type scale (px, 1280px viewport baseline):
- H1 hero: 144 / line-height .85 / tracking -.025em
- H2 section: 56 / .95 / -.005em
- H3 card title: 26–30 / 1 / .01em
- Body large: 18–19 / 1.45–1.55
- Body: 14–15 / 1.5–1.55
- Caption / mono label: 10–11 / .18em tracking / uppercase

### Spacing & layout

- **Page max-width**: 1180px, centered with 32px horizontal padding.
- **Section vertical rhythm**: 72px top/bottom on most home sections; 56–64px on subpage hero sections.
- **Gaps**: 14, 18, 24, 32, 48 — that's basically the whole scale.
- **Border radii**: **0px everywhere.** The aesthetic is brutalist; nothing is rounded.
- **Borders**: chunky black `2px` or `3px` solid borders on cards, panels, the header bottom edge, photo wrappers. The 3px borders are reserved for section dividers and primary cards (the phone-CTA block in /contact).
- **Shadows**: none. Brutalism is flat — depth comes from caution stripes and contrasting solid blocks, not soft shadows.

### Motif components

These appear repeatedly and should become reusable primitives in the target codebase:

#### `<CautionStripe height colorA colorB />`
A horizontal band of `repeating-linear-gradient(135deg, colorA 0 14px, colorB 14px 28px)`. Used as a graphic accent at the top of the page (full-width, 6px tall), above ETA widget, top of the bottom CTA strip, etc. Always 135° diagonal stripes.

#### `<HazardTag color bg>{children}</HazardTag>`
Small uppercase pill rendered as a rectangle with a 2px border in `color`, padding `4px 10px`, font Space Grotesk 11px bold 700 with `.22em` tracking. Used for service numbers (`SVC·01`), credential badges (`LICENSED · BONDED · INSURED`), section markers (`NO.02`).

#### Service section block (numbered)
Each top-level home section uses a `<SteelSection>` heading: a HazardTag with the section number on the left, then a small uppercase Space-Grotesk subtitle, then a 56px Archivo Black title, all aligned to a 3px black `border-bottom` rule.

---

## Pages & Screens

The prototype implements a **5-page** site via React `useState`. In a real codebase these should be **separate routes** (`/`, `/services`, `/about`, `/reviews`, `/contact`).

### Global chrome (every page)

**Top dispatch bar** (`SteelTopBar`):
- Above the header. Full-bleed.
- A 6px CautionStripe sits on top of the very top of the page.
- Below it: black bg, 8px vertical padding, Space Grotesk 11px uppercase.
- Left: green pulse dot + "ON-DUTY · 24/7" + license number (dim).
- Right: phone number in high-vis orange Archivo Black 14px, with phone icon. Wrapped in `<a href="tel:+15552739425">`.

**Header** (`SteelHeader`):
- Solid bg, 22px vertical padding, 3px black border-bottom.
- Left: logo lockup. A 48×48 orange square with a 2px black border, bold "A" in Archivo Black 32px. To its right: "APEX LOCKSMITH" in Archivo Black 24px + "UNIT 04 · DENVER YARD" in Space Grotesk 10px dim.
- Right: nav (5 links). Each link is `10–14px` padding, Archivo Black 12px tracking `.12em`. The number prefix (`01`, `02`, etc.) is rendered in Space Grotesk 10px at 50% opacity.
- Active nav state: inverted — solid black bg, light text. Inactive: transparent bg, dark text.
- Rightmost: a "CALL NOW" CTA — orange bg, black text, 2px black border, padded 14×18, Archivo Black 14px.

**Bottom CTA strip + Footer** (`SteelFooter`):
- Black bg, 6px CautionStripe on top edge.
- Left: a yellow HazardTag "IF YOU'RE LOCKED OUT" + 80px headline "Stop reading. / Start dialing." in Archivo Black.
- Right: a huge orange phone CTA block with a 2px yellow border, "CALL DISPATCH" label + the phone number in Archivo Black 52px.
- Below the strip: a thin footer row with copyright, license, "DENVER METRO · COLORADO", "PRIVACY · TERMS · WARRANTY" — all in Space Grotesk 10px 70% opacity.

---

### Page 1 — Home (`/`)

The longest page. Sections from top to bottom:

#### 1. Hero
- 2-column grid, 1.3fr / 1fr, 40px gap, 56px top / 64px bottom padding.
- Left column:
  - Two HazardTags: yellow "EMERGENCY · 24/7" + plain "Denver Metro".
  - H1: "We open / [locked] things." — 144px Archivo Black, line-height .85, tracking -.025em. "locked" is wrapped in an orange highlight block (`background:#ee5a1a; color:#18181a; padding:0 8px; display:inline-block`).
  - Sub: 19px DM Sans, dim. ~540px max-width.
  - Two-up CTA block: a 3px black bordered container with two 50/50 cells. Left cell is the orange "TAP TO CALL" + phone-number block. Right cell is the "Get a quote ↗" button.
  - Trust row: three inline pieces (shield + LICENSED·BONDED·INSURED, stars + 4.9·847 GOOGLE, clock + 18 YRS·EST. 2008), each Space Grotesk 11px tracking `.2em`.
- Right column:
  - ETA widget (see below).
  - Hero photo placeholder. Caution stripe at the bottom. A yellow "UNIT 04" HazardTag overlaid top-left.

#### 2. Trust strip (full-width)
- Black bg, 6px CautionStripe on top edge, 32px vertical padding.
- 4-column grid of big stats: 18 / 4.9 / 15m / 5. Each: orange Archivo Black 72px number, 14px label below, 10px dim sub. Right-borders between columns at 25% opacity.

#### 3. Service finder + ZIP check (2-column, 1.5fr / 1fr)
- Service finder card (left): black header bar with "SERVICE FINDER" + step indicator. Below: 4-up grid of selectable tile buttons (House / Car / Office / Safe). Active tile: orange bg, 2px orange border. Each tile shows an icon + label in Archivo Black 14px.
- On selection: a "DISPATCH PLAN" panel reveals below, 2px orange border, with a 4px caution stripe on its top edge. Shows the selected lockout type as a 28px Archivo Black headline, plus ETA + price-range cells, plus 3 numbered instruction lines, plus a black "Dispatch · phone" CTA.
- ZIP checker (right top): black header bar, 16px input + orange "Check" button on the right (border 2px black, no left-border on the button so they fuse). Result panel appears below with check/x/pin icon + verdict.
- Fair Price Guarantee panel (right bottom): black bg, orange-colored body type, small caution stripe top edge.

#### 4. Services grid
- 3×2 grid using `border:3px solid black` on the container, with `2px solid black` interior dividers.
- 5 cards (one per service) + a 6th "Not sure? We'll figure it out" tile.
- Each service card has an `SVC·NN` hazard tag in the corner, an icon in orange, the service name (Archivo Black 26px), a short blurb, and a price + ETA row at the bottom. The CTA tile is full-orange.

#### 5. Process — 3 steps
- 3 equal columns, each is a card with a top caution stripe, a giant orange `01/02/03` number (Archivo Black 96px), then step title + body.

#### 6. Reviews (3 featured)
- 3 columns. Each card has a 2px black border, stars at top, the review body (DM Sans 15px), and the reviewer name at the bottom (Archivo Black 16px, uppercase).
- Section heading right side: "READ ALL 847 ↗" link with an orange `border-bottom` underline.

#### 7. About snippet
- 2-column. Left: section heading + paragraph + a row of credential HazardTags. Right: portrait placeholder with a "FOUNDER · HOLLOWAY" hazard tag overlaid.

---

### Page 2 — Services (`/services`)

Full catalogue. Each service is a horizontal 3-column card:
- 260px photo placeholder (left).
- Middle: hazard tag (SVC·NN), service name (42px Archivo Black), description, and a wrap of small tag-style chips (sub-services).
- 240px right cell: **black background**, "FROM $XX" stat in orange Archivo Black 56px, an ETA line, and a "Book this →" button in orange.

5 cards stacked, alternating bg between `#26262a` and `#18181a`, separated by 2px black borders. The whole thing wrapped in a 3px black border.

---

### Page 3 — About (`/about`)

- Section heading.
- 2-column intro: 3 paragraphs on the left, a hero photo + 2 small photos on the right.
- Below: 5-up team grid. Each member card: 2px black border, photo placeholder, 2px divider, then a footer with name + role + "SINCE YYYY" in orange Space Grotesk.

---

### Page 4 — Reviews (`/reviews`)

- Section heading.
- 2-column: 320px summary aside (left) + reviews list (right).
- Aside: a black card with a 96px orange "4.9" rating, 5 stars, and a 5-bar histogram. Below it a small "we don't filter" note.
- Reviews list: 6 cards stacked, each with name + stars + date at top, "VERIFIED · GOOGLE" hazard tag on the right, and review body below.

---

### Page 5 — Contact (`/contact`)

- 2-column.
- Left: a **giant orange phone CTA block** (the biggest button on the entire site). Padding 30×36, 3px black border, 6px caution stripe on its top edge. "DISPATCH · OPEN NOW" label, then the phone number rendered at Archivo Black 104px. Below: 2×2 grid of info cards (Hours / Shop / Email / Credentials), each with a hazard tag header.
- Right: contact form. 3px black border, header hazard tag "NON-URGENT REQUEST", title "Send a note", then 4 fields (Name / Phone / ZIP / What's up textarea), then a full-width orange submit button.

---

## Interactive Behavior

### Live ETA widget (`SteelEtaWidget`)
- Renders inside the hero (right column) on the home page.
- Shows a number-of-minutes ETA that **drifts every ~5.8 seconds** by ±1 minute, clamped to [11, 24].
- "Techs on road" counter (2–7) drifts in lockstep.
- Initial ETA depends on time of day:
  - 22:00–06:00 → 22
  - 07:00–18:00 → 14
  - other → 17
- Visual: green pulse dot + "LIVE · DISPATCH OPEN" header → 104px orange ETA number + "MIN" + descriptor → horizontal progress bar with diagonal-stripe fill at `pct = (24 - eta) / (24 - 11)` → "FASTEST 11 MIN / NIGHT MAX 24 MIN" labels.
- The drift is purely cosmetic — in production this should either be a real signal (if you have a dispatch API) or removed. **Don't ship the random drift to production without grounding it in real data.**

### Service Finder (`SteelServiceFinder`)
- Four options: `home` / `car` / `office` / `safe`. Each option carries: label, icon name, diagnostic method, ETA, price range, and three preparation instructions.
- Click a tile → state `sel` updates → the "DISPATCH PLAN" panel below re-renders with that option's contents.
- The CTA at the bottom of the plan is always a `tel:` link to the main phone number.
- Full data in `shared.jsx` → `FINDER_OPTIONS`.

### ZIP Checker (`SteelZipChecker`)
- Numeric-only input, max 5 digits (stripped via `replace(/\D/g,"")`).
- Submit (form `onSubmit`) calls `checkZip(value)` from `shared.jsx`:
  - Not exactly 5 digits → `state: "invalid"`
  - In `APEX.serviceZips` → `state: "in"` (green check)
  - 80*/81* but not in list → `state: "edge"` (yellow pin)
  - Else → `state: "out"` (X icon)
- Result panel border color and icon vary by state.
- Test values to keep in QA: `80205` (in) / `80439` (edge) / `90210` (out).

### Multi-page navigation
- Currently a `useState('home')` swap inside one React component. **In the target codebase use real routing** (Next.js routes, React Router, etc.). The page param maps directly to the route.
- Header logo click → home. Nav links → corresponding page. The active page's nav link inverts (black bg / light text).

### Form
- Contact form `onSubmit` currently just `e.preventDefault()` + an alert. In production: post to the backend / form service. Required fields: name, phone, ZIP. Textarea is optional but encouraged.

### Hover / focus states
The prototype is intentionally restrained — no hover treatments beyond the inverted active-state on nav. The dev can add subtle hover (e.g., button bg darkens 6%, link gets a 2px hivis underline) but should not introduce shadows, scale transforms, or anything that breaks the brutalist flatness.

---

## State Management

Minimal. In the prototype:
- `page` — current page (top-level component)
- `sel` — selected service-finder option (Service Finder component)
- `val` — ZIP input string (ZIP Checker)
- `result` — ZIP check result object (ZIP Checker)
- `eta`, `techsOnRoad` — ETA widget internal timer state

In the target codebase, all of these are local component state. There's no global store needed unless you wire the ETA widget to a real backend.

---

## Responsive Behavior

**The prototype is designed at a fixed 1280px desktop width.** The handoff bundle does not include mobile mocks. The developer should produce mobile + tablet breakpoints with the following defaults:
- **Mobile (≤ 640px)**: single column everywhere; hero H1 drops to ~64px; the giant `<Stop reading. / Start dialing.>` text drops to ~40px; nav collapses to a hamburger; the trust strip 4-up becomes a 2-up grid; service finder tiles become 2×2; services grid becomes 1-up.
- **Tablet (641–1023px)**: 2-column hero collapses to stack; services grid becomes 2-up; 3-up reviews become 1-up with horizontal scroll or stack.
- **Critical CTAs (call-now phone button + bottom CTA) must remain prominent and tappable at all sizes.** A sticky bottom call button on mobile is recommended even though it's not in the desktop mocks.

---

## Assets

The prototype uses **no real images.** Photo placeholders are striped SVG rectangles labeled with what photo should go there. The labels are the photography brief:
- "HERO PHOTO · van at warehouse loading dock"
- "OWNER · Marcus, in shop"
- "THE SHOP · CURTIS STREET"
- "VAN 04", "KEY MACHINE"
- Per-service field photos
- 5× team headshots

Icons (House, Car, Office, Safe, Lock, Key, Shield, Phone, Star, Check, X, Arrow, Clock, Pin) are drawn inline as simple SVG strokes in `shared.jsx` → `Icon`. Replace with the target codebase's icon library (Lucide / Phosphor / Heroicons) if one is already in use — the visual weight should remain `stroke-width: 1.6–2.2px`, square line caps, no rounded joins.

The "A" logo lockup is a placeholder — replace with the final wordmark when available. Until then, the orange-square + black-A treatment is the working logo.

---

## Files in this bundle

| File | Role |
|---|---|
| `Steelyard - Standalone.html` | Runnable prototype. Open in a browser to see the full design. |
| `brand.js` | Canonical content (copy, services, reviews, team, badges, ZIPs). Port to the target codebase's content system. |
| `shared.jsx` | Shared utilities: ETA hook, ZIP checker, Service Finder data, photo-placeholder component, icon set, star widget. |
| `steel-atoms.jsx` | Steelyard primitives: palette function, `CautionStripe`, `HazardTag`, `SteelEtaWidget`, `SteelServiceFinder`, `SteelZipChecker`. |
| `steelyard.jsx` | Page composer: header, footer, and the 5 page bodies (Home / Services / About / Reviews / Contact). |

To preview locally: open `Steelyard - Standalone.html` directly in a modern browser. No build step required.

---

## Things to confirm with the client before implementation

1. Real phone number, address, license number.
2. Real Google Business listing URL (for the "READ ALL 847 ↗" link and the "VERIFIED · GOOGLE" anchors).
3. Service-area ZIP list (currently approximate — Denver Metro).
4. Photography — the 12+ placeholder slots all need real photos.
5. Whether the live ETA widget should be driven by a real dispatch API, hard-coded to a static value, or removed.
6. Whether the form submits to a backend, an email forwarder (e.g. Formspree), or a CRM.
