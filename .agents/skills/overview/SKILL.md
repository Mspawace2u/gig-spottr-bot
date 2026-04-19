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
This repo is a **live reference implementation** of Patty's Agent Army design system (see user Knowledge note). Patterns observed here are canonical for new SPAs.
