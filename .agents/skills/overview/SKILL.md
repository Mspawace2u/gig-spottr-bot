---
name: gig-spottr-bot-overview
description: Repo fingerprint and guardrails for gig-spottr-bot. Covers the Astro 5 + React 19 + Tailwind 4 stack, the strict design-system tokens (brand colors, fonts, sticky-header layout), required env vars for local runs, Notion integration rules, V2/V3 backlog, and canonical UI recipes for the CTA "agent is processing" state and the shared .vibe-glass border opacity. Use when working in the gig-spottr-bot repo.
---

# gig-spottr-bot — repo fingerprint & guardrails

**Trigger:** When working in the `gig-spottr-bot` repo.

## Purpose of app
Analyzes job-description URLs (pasted by user) against the user's CV to return a fit score and concrete strengths/gaps. Uses a 6-agent pipeline (strategist, translator, analyst, creator, courier, manager) powered by Gemini. Writes history to Notion.

## Stack fingerprint
- Node **24.x** (`engines.node` pinned)
- Astro 5 SSR + `@astrojs/vercel` 8
- React 19 (`.jsx`)
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- Framer Motion 12, Lucide React, canvas-confetti
- Data: `cheerio` (scraping), `pdf-parse` (resume parsing), `axios`, `@notionhq/client@2.2.15`
- No test runner beyond `node --test` (`npm test` stub)

## Observed design system (strict — follow, don't silently "fix")
- **Base:** `#050505` bg, `#F3F4F6` text, `#5B6B7F` muted
- **Brights in use:** `#ff2f92` Punk Rock Pink (primary), `#2de2e6` Totes Turquoise (secondary), `#9b5cff` Electric Purple (tertiary)
- **Font tokens declared in `src/styles/global.css`:** `Red Hat Display` + `Red Hat Mono`
- **Opacity-70 rule:** tertiary emphasis (BIGGEST GAP chip, weakness labels) uses primary text color at `opacity-70`, NOT a new gray
- **Sticky header:** canonical implementation — PR #1. App icon left-edge aligns with `--shell-max-w` container left-edge; right nav element aligns with right-edge. Uses shared `--shell-max-w: 480px` and `--shell-pad-x: 1.5rem`.

### CTA "agent is processing" loading state — canonical recipe (PR #9)
Applies to the shared `<Button>` component used on Page 1 (ONBOARD — *Sync Baseline*), Page 2 (ANALYZE — *Analyze Fit*), and the REPORT/SUCCESS pages. Source: `src/components/UI/Button.jsx` + `.rainbow-border` / `@keyframes pulse-opacity` in `src/styles/global.css`.

- **Rainbow gradient hairline stays at 100%** during loading. Don't reintroduce a `border border-white/80` swap or any solid-color border on the `<button>` while loading — it overlays the rainbow and reads as a bright white outline (this was the original bug).
- The `.rainbow-border:hover::before { opacity: 0 }` rule is scoped via `:not(:disabled)` so the rainbow stays at 100% while the button is `disabled` (loading). Don't drop the `:not(:disabled)` guard.
- **Slight diffuse soft-purple glow** while loading: `shadow-[0_0_16px_rgba(155,92,255,0.35)]` (matches brand tertiary `#9b5cff`). Glow is intentionally subtle, not the louder `0_0_30px` hover-pink glow used in the non-loading hover state.
- **Label cycles bright white** (inherits the button's `text-white`); the loading branch must NOT add `text-brand-primary`.
- **Pulse animation:** `@keyframes pulse-opacity` goes `0%, 100% { opacity: 1 }` → `50% { opacity: 0.5 }` (dips to half-bright, never to 0). `.animate-pulse-opacity` runs at `0.8s ease-in-out infinite`.
- **Target icon shares the parent's pulse.** Apply `animate-pulse-opacity` to the inner wrapper `<div>` once — both the `<span>` label and the `<Target>` icon inherit the cascading opacity, so they cycle in lockstep at the same speed and opacity. The icon keeps its explicit `text-brand-tertiary` purple.
- **Suppress `disabled:opacity-50` while loading.** Branch the className: loading branch gets `cursor-wait shadow-[0_0_16px_rgba(155,92,255,0.35)] hover:bg-transparent hover:text-white hover:shadow-[0_0_16px_rgba(155,92,255,0.35)]`; not-loading branch keeps the normal `hover:bg-brand-primary` / `disabled:opacity-50` / `disabled:hover:*` chain. Otherwise the rainbow + glow render at 50% during processing.

What stays unchanged: rest state (transparent fill, rainbow at 100%, white text), hover state when not loading (solid pink fill + black text + hot-pink glow), and plain-disabled state (`loading=false, disabled=true`: 50% opacity, `not-allowed` cursor, hover effects suppressed).

## Layout
- **`.vibe-glass` border token = white 20%** (PR #9, was 5%). Defined once in `src/styles/global.css`:
  ```css
  .vibe-glass {
    background-color: rgba(15, 15, 15, 0.7);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.20);
  }
  ```
  This single class wraps the Page 1 (ONBOARD) callout `<Card>`, the Page 2 (ANALYZE) callout `<Card>`, the three Results Report `<Card>`s (overall score + Competitive Edge + Resistance Points), and the Progress Log items (`ProgressItemCard` directly applies `vibe-glass`). Bumping this value moves all four surfaces in lockstep — don't fork it per surface.
  Surfaces that intentionally set their own border and do **not** share this token: form inputs (`border-white/30`), the inline `inputMode` toggle row (`border-white/10`), the SUCCESS modal (`border-white/10`), and the empty-state placeholder (`border-dashed border-white/5`). The colored left-edge `border-l-2` accents on Report's Competitive Edge / Resistance Points cards are separate accents on top of the `.vibe-glass` outline.

## Font loading — resolved
Red Hat Display + Red Hat Mono are loaded via `@import url('https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@400;700;900&family=Red+Hat+Mono:wght@400;700&display=swap');` at top of `src/styles/global.css`. Resolved in PR #8 (2026-04-18). Do NOT remove the import — declared font tokens elsewhere in the file depend on it.

## Run locally (if needed)
```bash
npm install
npm run dev       # astro dev --host
```
Required env vars (not in repo — source from user or `.env`):
- `GOOGLE_GENERATIVE_AI_API_KEY` (Gemini)
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `NOTION_USER_CV_DATABASE_ID`

## Testing tips
- **LLM scoring has temperature 0.7** → expect ±10 points of variance across identical runs on the same JD+CV. Not a bug.
- Regression URLs to validate scraper changes: StitchFix, Unity, Change Healthcare.
- For scraper work: `lib/parser.js` + resolvers in `src/lib/parser.js`. Check tier: direct API (Greenhouse, Lever direct, Ashby direct) vs aggregator-relayed (Ashby-on-custom-domain, Lever on bot-protected host).

## Notion integration rules
- **Schema-drift defensive write** (PR #4): When writing to Notion, catch "unknown property" errors, log, retry with problematic field omitted rather than failing the whole write. Implementation: `lib/notion-client.js`.
- Never commit Notion API key or DB IDs. Reference as `$NOTION_API_KEY` etc.

## V2 / V3 backlog (do not auto-implement — ask first)
- **V2 I1-I5:** matching improvements — see `/home/ubuntu/gsb-matching-improvements-spec.md` (ephemeral, regenerate if needed)
- **V2 I6:** fail-closed on empty job-requirements. Currently a Workday-style garbage extraction can yield a false 100% match. Fix: explicit flag, surface manual-fallback UI, do NOT default score to 100 on empty input.
- **V3:** Workday URL-parse resolver (URL carries tenant/region/site, no lookup table needed), SmartRecruiters, Workable, Recruitee Tier 1 resolvers

## Agent Army alignment
This repo is a **live reference implementation** of Patty's Agent Army design system (see user Knowledge note). Patterns observed here are canonical for new SPAs. Recent reference points:
- Sticky header canonical implementation → PR #1
- Notion schema-drift defensive write → PR #4
- Red Hat Display + Mono Google Fonts import → PR #8
- CTA loading-state recipe + `.vibe-glass` border token at white 20% → PR #9
