# Unified searching and compact room header — local verification

Base `b9cec019901d9eafbfdd06b8498d2621ee190a5d`, branch
`feat/home-thinking-orbs`. Previous commits and Library artifacts remain intact.

## User decisions and resulting UI

All loading contexts now use the user's selected first effect, `searching`, at
64px, theme light, speed 0.8. `AnalysisOrb` and `AnalysisLoading` accept no
provider/protocol phase. V1/V2 checks and full room analysis share that wrapper.
Normal loading stays minimal and recovery/error/timeout behavior is unchanged.

Correction to earlier review terminology: the two check videos changed only
`room.submission_protocol` on the same CHECKING fixture (PRE_SUBMIT_V1/V2).
They did not demonstrate original-input checking followed by supplemental-answer
checking, or identify Jev/LLM dispatch. No such stages are inferred here. The
representative video is labeled only as unified searching and local synthetic UI.

The room header retains its role label, entire title, exclusive date range,
meeting mode and guest-record information. Reduced its padding, label/title/body
typography and spacing. The label uses darker brand ink for small-text contrast.
On narrow layouts the share control shows its icon with the unchanged accessible
name "초대 링크 복사", retaining at least a 44×44px target. Long titles wrap rather
than truncate. Copy feedback/manual fallback grows naturally when needed.

Mobile hero copy/CTA is now visually 24px above the prior centered layout. This
uses extra bottom padding, preserving natural growth and scroll on short screens.
It does not restore the earlier top-aligned design. Desktop details remain below
the initial viewport.

## Validation and scope

Node 24.19.0, Corepack pnpm 10.17.1, free system Chromium. All APIs are isolated
fixtures or the supported loopback synthetic preview; builds explicitly set
`VITE_API_BASE_URL=''`. No server modifications, real model/API calls, remote
push, PR, merge, deployment or sharing changes were made.

Final results: lint/typecheck/API/build PASS; unit826 (79 files), browser545 PASS/
existing skip1/failure0/flaky0/retry0, evidence6, UI preview18, preflight3 PASS.
Commands and full output are in the new artifact's verification.json and logs:
`pnpm api:check`, `lint`, `typecheck`, `test`, `test:evidence:preflight`, `build`,
`pnpm exec playwright test --config playwright.local.config.ts`,
`CHROMIUM_PATH=/usr/bin/chromium pnpm test:evidence`, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:ui-preview`.
These cover CI verify with the same standard browser suite/server/popup fixture
and Desktop Chrome/Pixel 7 projects, using the available Chromium executable and
retry 0. No separate aggregate script exists.

Assertions require searching/64px in both CHECKING protocol fixtures and the
ANALYZING room fixture, real animated canvas pixels, static reduced-motion pixels,
offscreen pause, absent edit/cancel controls, recovery/retry, ownership/draft
boundaries, and no automatic requests on re-entry. New header checks cover normal
1440/390/320px layouts, retained settings, touch targets, a long unbroken title,
manual clipboard fallback and no horizontal overflow. Mobile tests require the
24px visual offset, visible CTA at 390×844 and 320×480, and natural scroll at
390×360. Existing conditional-v1/API/auth contracts are unchanged.

The motion-only verification initially running when the latest header/mobile
feedback arrived was explicitly stopped and superseded by the combined final
checks. Focused combined browser verification passed 117 cases, existing skip 1.
The final full-suite results are recorded separately, without summing those runs.

Actual UI media includes mobile home PNGs (390×844, 320×480), desktop/mobile
compact-header PNGs, and a representative 1280×800 H.264/yuv420p recording. The
video is a real screencast, not generated animation. Full decode and changing
hashes of the Orb region are checked; three runtime contexts are separately
verified with the same settings. Captured preview and production assets match.

Existing review2-home-mobile-initial.png is 390×844; review2-home-mobile-short.png
is 320×480. Both are scale-1 screenshots including the local synthetic banner.
Thus the latter is narrower as well as shorter, which also changes wrapping.
The production UI has no preview banner.

Known limitations: jsdom Canvas2D warnings, Vite's >500kB chunk warning, no native
backend/provider integration, no real OAuth/model/map calls, no Safari/Firefox or
Windows execution, and no physical-device battery measurement. Prior upload
allowlist failures are not bypassed; only confirmed Library writes are reported.
