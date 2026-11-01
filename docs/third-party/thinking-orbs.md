# Thinking Orbs

- Official documentation: https://libraries.dev/orbs
- Source: https://github.com/Jakubantalik/Libraries.dev/tree/main/packages/thinking-orbs
- Registry: https://registry.npmjs.org/thinking-orbs/0.3.2
- Installed exact version: `thinking-orbs@0.3.2`, public root export `{ ThinkingOrb }`.
- License: MIT, copyright 2026 Jakub Antalik. The packaged license is preserved in
  [thinking-orbs.LICENSE.txt](../../public/licenses/thinking-orbs.LICENSE.txt).
- Runtime dependencies: none. Peer React `>=18.0.0` includes this project's React
  19.1.1 range (the current lockfile resolves 19.3.0). ESM exports and TypeScript
  declarations work with Vite 7/TS 5.9.
- The public page mentions `dark`; the published 0.3.2 declaration exposes
  `theme="auto" | "light" | "dark"` instead. Use supported `theme="light"` for
  the application's light surfaces, even under a dark OS preference.
- Public states: working, searching, solving, listening, connecting, weaving,
  composing, breathing, shaping. Supported `size`, `speed`, `paused` are declared
  by the installed package. No Pro preset, Studio export, paid login or external
  script was used. Installation used pnpm's npm registry with scripts disabled.

The existing PRE_SUBMIT_V1 QUEUED/CHECKING context uses `searching` (20px), V2
uses `composing` (20px), and the room's ANALYZING context uses `solving` (64px).
These are decorative context choices, not assertions about the provider being
called or its internal stage. No frontend-visible Jev/LLM dispatch stage exists
in the current contract. Do not manufacture progress or change protocols to
infer one. V2 is exercised only through synthetic browser fixtures here.

`AnalysisOrb` hides the canvas from assistive technology; adjacent Korean status
text remains a polite atomic live region. The published renderer uses 2D canvas
with a device pixel ratio cap of 2, stops RAF when offscreen or the tab is hidden,
cleans up on unmount, and responds to live reduced-motion changes with a static
representative frame. There is no pointer capture/gravity behavior enabled. The
small preset and speed 0.8 keep the visual subdued; speed changes animation time,
not frame rate. Real device energy usage remains unmeasured.

Source/registry/license were checked on 2026-11-01. The lockfile pins the registry
tarball integrity. Browser motion, reduced motion and offscreen pause are checked
against actual rendered canvas pixels; network/provider behavior is mocked.
