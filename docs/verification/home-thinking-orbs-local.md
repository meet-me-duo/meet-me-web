# Home layout and Thinking Orbs — local verification

Date: 2026-11-01. Base: remote main
`5976ccd640ba64331ac5c776e8b167b8978e74a8`, verified with `git ls-remote`.
Branch: `feat/home-thinking-orbs`, isolated worktree. Original web and server
checkouts are clean on `work`. No push, PR, merge, deploy, production access,
server modification or real model call was made.

The web checkout has no AGENTS.md, Worklog-named file or `.agents/skills` tree;
workspace `.agents` is empty. Read README, ARCHITECTURE, BRANCHING,
IMPLEMENTATION_LOG, CI, preview and Playwright instructions. Applied existing UI
rules, consulting the official UI/UX Pro Max SKILL.md and shadcn spinner docs
manually, plus the available React quality checklist. The requested deployed
main baseline takes precedence over generic develop-based branching here.

## Changes and boundaries

- Desktop hero fills at least the first small viewport height; removed the
  740px cap and tablet override. Introduction starts below the fold and remains
  reachable by normal scroll and the existing keyboard guide link.
- Mobile hero starts 24px below the header, with safe-area padding. Text, 48px
  create action, keyboard focus, header and narrow/short reflow are preserved.
- Public npm `thinking-orbs@0.3.2` supplies searching/composing/solving for
  existing V1 checking, V2 clarification checking and full analysis contexts.
  The API does not distinguish Jev from LLM dispatch within a check; these are
  decorative context choices, without invented progress or provider stages.
  V2 tests use browser fixtures, not server activation.
- Existing Korean status/error/cancel/timeout text and request/state machinery
  remain. Canvas is hidden from accessibility APIs; adjacent text has a polite,
  atomic live status. Package-native motion reduction and pause are used.
  [Dependency review](../third-party/thinking-orbs.md) records source, supported
  exports/props, compatibility and the distributed MIT license.
- API/auth sources and OpenAPI are byte-identical to base, including the
  `attendance_support=conditional-v1` guard and its tests.

## Verification

Node 24.19.0 / Corepack pnpm 10.17.1. This executor needs task-scoped writable
COREPACK_HOME/XDG cache/data directories in /tmp. Installation used
`pnpm install --frozen-lockfile --ignore-scripts`, then
`pnpm add thinking-orbs@0.3.2 --save-exact --ignore-scripts`.
Builds explicitly use `VITE_API_BASE_URL=''`.

| Command | Result |
| --- | --- |
| `pnpm api:check` | PASS — fixed local snapshot only |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS — includes new local Playwright config |
| `pnpm test` | PASS — 825/825, 79 files |
| `pnpm test:evidence:preflight` | PASS — 3/3 |
| `pnpm build` | PASS |
| `pnpm exec playwright test --config playwright.local.config.ts` | PASS — 535/536, existing desktop skip 1, retry 0 |
| `CHROMIUM_PATH=/usr/bin/chromium pnpm test:evidence` | PASS — 6/6 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:ui-preview` | PASS — 18/18 |
| Supported preview render QA | PASS — 6 layouts and 6 motion cases |
| `git diff --check` | PASS |

This covers the CI `verify` sequence with free system Chromium replacing the
platform-specific Edge/bundled executable. Local config inherits the standard
E2E server/popup fixture and Desktop Chrome/Pixel 7 projects, with retries off.
There is no separate aggregate script. Runtime JS/CSS/index bytes match between
the browser-tested build and final rebuild; the final build also ships MIT text.

New oracles check the fold at 1440×900, 1920×1080, 1280×600, 844×390, 390×844
and 320×480, real animated/static canvas pixels, offscreen pause/resume, double
cancel sending one request, cancelled re-entry without restart, absence of an
orb on failure/timeout/limits, and ANALYZING→ANALYSIS_DELAYED polling cleanup.
Existing submit/close/retry, stale-response, owner/draft, back/keyboard/contrast
and conditional-attendance regressions pass.

The artifact's `render-qa.mjs` starts the supported loopback synthetic preview,
blocks external browser requests and captures initial/scrolled viewport PNGs.
Six motion cases recorded 30–31 visible frames in 500ms and zero additional
frames under reduced motion, offscreen state and a simulated hidden-document
event. Instrumented Canvas2D calls averaged 0.11–0.70ms/frame on this executor;
this excludes geometry computation, compositing and real phone energy usage.
External requests and page errors: 0. Screenshots were visually inspected for
placement, wrapping and clipping.

## Failures, warnings and unexecuted checks

- Initial Orb pixel-change checks: 6 FAIL because the synthetic anonymous
  recovery notice placed the orb offscreen. The renderer correctly paused.
  Scrolling the canvas into view fixed the harness; all six passed without
  product changes. Initial logs/contexts are preserved.
- One rerun found the diagnostic preview still occupying port 4173 and ran no
  tests. Stopped that exact owned process and successfully reran.
- A standalone typecheck found nullable/array webServer spread in the new local
  config, outside original tsconfig coverage. Added a narrowing guard and the
  tsconfig include. Then repeated lint/typecheck/build and the full browser gate.
- Initial cache-directory setup failed; /tmp caches resolved it without sandbox
  bypass. jsdom emits unimplemented Canvas2D warnings; 825 semantic tests pass,
  and real pixels are verified in Chromium. Vite warns about the >500kB index
  chunk (about 600.87kB); build succeeds.
- NOT RUN: server/native integration, V2 rollout, real OAuth/model/map calls,
  paid services, production, Safari/Firefox, physical device and battery tests.
  Real model calls: **0**. Local fixtures do not establish server/provider success.

Full artifact: source archive, self-contained Git bundle, patch, distribution,
screenshots, raw logs, reproduction script and checksums. Only a separately
authorized remote phase should push for a develop-targeted review, recheck CI
and compatibility, then obtain the user's main merge/deployment approval.
