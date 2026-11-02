# Home and loading review 2 — local verification

Base: `b176ef045d6bb20c2e0f09598c08bc559448e491`, branch
`feat/home-thinking-orbs`. The first review's commit, ZIP, PNGs and videos remain
available. No server code, production system, model, remote branch or deployment
was changed. This document supersedes the first review's visual choices only.

## User review and implementation

The first mobile revision was too high. Centered the complete hero copy/CTA group
within the first viewport after the header, using symmetric safe-area padding.
Content may grow and scroll naturally on very short screens; there is no fixed
height or overflow clipping. Desktop details remain below the initial viewport.

Added `AnalysisLoading`, shared by V1/V2 checks and full room analysis. Each shows
a centered 64px Orb and one short Korean status, with no form, raw-text card,
edit/cancel buttons, privacy boilerplate or help/host tools during a normal check.
Removed the submission privacy paragraph from that panel. Existing room headers
and closed-input disclosures remain available as before.

The existing submission component and hooks stay mounted during minimal loading.
Polling, memory drafts, ownership generations, stale-response guards, transport,
timeouts and request UUIDs are unchanged. Failed reads/commands expose recovery;
terminal failures/timeouts restore the saved content and retry/edit/cancel flows.
Tests now observe retained drafts after leaving the hidden loading view rather
than requiring raw text to be visible while processing.

Motion choices remain searching/composing/solving, theme light and speed 0.8.
All actual UI contexts now use 64px. This does not identify Jev/LLM dispatch
stages: the current API does not expose that distinction. V2 uses browser-only
synthetic fixtures. Status text is polite/atomic and the canvas is decorative.
Reduced motion and offscreen pause are provided by the reviewed npm renderer.

## Validation

Node 24.19.0, Corepack pnpm 10.17.1, free system Chromium. Builds use explicit
`VITE_API_BASE_URL=''`; all browser APIs are mocked or served by the supported
loopback synthetic preview. No paid service or real provider was called.

| Check | Result |
| --- | --- |
| `pnpm api:check`, `lint`, `typecheck`, `build` | PASS |
| `pnpm test` | 826 PASS, 79 files |
| `pnpm test:evidence:preflight` | 3 PASS |
| `pnpm exec playwright test --config playwright.local.config.ts` | 537 PASS, existing skip 1, failure/flaky/retry 0 |
| `CHROMIUM_PATH=/usr/bin/chromium pnpm test:evidence` | 6 PASS |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:ui-preview` | 18 PASS |

The local browser config runs the standard CI suite/server and popup fixture
with the Desktop Chrome and Pixel 7 projects and retry 0. Together these cover
the repository CI verify sequence; no separate aggregate script exists. API,
authentication implementation, OpenAPI and conditional-v1 declarations are
unchanged from the base. The preview assets match the tested production build.

New/updated oracles cover central hero placement at 390×844 and 320×480, natural
scroll at 390×360, desktop intro below the fold, absent loading controls/cards,
64px real moving pixels, static reduced-motion pixels, offscreen pause/resume,
timeout→explicit cancellation and back navigation, failed-read recovery,
timeout→double retry sending one request, stale callbacks, and exact retained
drafts after processing/ownership transitions.

Initial unit run: 16 failures reflected the deliberately changed display and
control availability. Updated fixtures/oracles to observe processing and then
terminal/recovery states while retaining original transport/draft assertions.
One focused test additionally needed to await the terminal React render.
Initial mobile canvas oracle sampled the old 20px corner; corrected it to inspect
the canvas's actual backing dimensions. Initial media oracle counted a hidden
closed-input card; changed the oracle to visible cards. These failed logs are
preserved; they are not counted as final passes.

Known warnings: jsdom has no Canvas2D implementation (real pixels are tested in
Chromium); Vite emits a >500kB bundle warning. Not run: native backend/server
integration, rollout, real OAuth/model/map requests, Safari/Firefox, Windows or
physical-device battery tests. Real model and production API calls: **0**.

## User review media and preservation

New individual Library items contain desktop initial/intro PNGs, ordinary and
short mobile PNGs, and three actual UI MP4s. Every capture is marked local and
synthetic. Videos use the rendered component at 64px, include the short status,
and contain no edit/cancel controls. H.264/yuv420p videos are checked with full
decode and changing hashes of the actual Orb region. No synthetic progress or
generated image animation is used.

The new full artifact contains source, a self-contained Git bundle, incremental
and cumulative patches, distribution assets, screenshots/videos, raw logs,
capture source and SHA-256 manifests. Library IDs and final commit are returned
in the handoff. Remote push/PR/merge/deploy remain prohibited until user review.
