# #110 / #109 web integration independent verification

This follow-up is scoped to the actual #109 web source at
`95f09c0a98c6538b0f19ed381fdf11a2f5b844d9` plus standalone #110
`bdfd22d238682764ecd56de5fa4755402d08e460`. It does not establish actual provider
production login or operator activation.

## Independent test design

`src/OperationsRoute.account-integration.test.tsx` exercises the real App route,
AccountBoundary, session memory module, useAccountSession hook, operations API,
and OperationsPage. Its only substitutes are HTTP and Date.now. It imports the
existing #109 AuthSession type rather than defining a parallel account model.

The six cases require:

- The initial memory token and a refreshed token for the same account appear in
  their respective requests. No token is copied to storage or URL, and the
  same-account refresh does not invent an account revision.
- An account whose token has reached its exact expiry receives authentication
  required UI before the next operations HTTP request. The still-present account
  is not treated as a guest.
- Unexpected token supplier failure yields sanitized unavailable UI and no
  operations request.
- An absent account sends no Authorization or forged identity header. A server
  401 yields fixed UI without reading a private error payload.
- Both actual account change and actual logout advance the real privacy revision,
  abort pending work, reload with the correct identity, and discard late private
  responses.

These tests were authored before the account operations route wrapper. Execution
and RED/GREEN results are to be recorded by the root agent, which owns process
sequencing. The independent author did not execute package scripts, browser,
server, formatter, or Docker commands.

The two existing operations browser suites now explicitly answer the additional
#109 AccountBoundary `POST /api/auth/refresh` with 401 and no-store, asserting
that request has no Authorization. This request is excluded only from the
operations request list. Existing operations-only GET, header, pagination,
sanitization, unknown-versus-zero, and empty-storage assertions remain intact.

## Native browser proposal

The existing #109 native runner already proves real browser-to-Spring-to-local
HTTP OIDC/JWKS-to-PostgreSQL/Redis composition with external requests blocked and
zero API route mocks. A separate #110 fixture should seed a deterministic local
account/identity and configure only that synthetic UUID in the test allowlist.
Google and Kakao identities sharing a subject remain distinct accounts.

Required native #110 checks: anonymous 401; logged-in ordinary account 403;
synthetic allowlisted account drilldown 200; bearer attached by the production
memory supplier; no credential in URL or browser storage; unknown transport and
usage coverage displayed faithfully; logout discards the summary. The actual
HTTP server suite should separately cover invalid and expired JWT 401,
verification infrastructure 503, exactly one durable safe audit per access, and
zero query work after refusal. Browser mocks are not evidence of actual HTTP
authorization.

Nginx callback privacy requires an isolated real Nginx request with unique
code/state sentinels, including an upstream failure. Neither access nor error
logs may contain those sentinels. Configuration inspection alone cannot prove
this runtime property. No production Nginx change is authorized by this test.

## Integration source review

The root agent reported the unchanged six-case suite first ran RED with four
assertion failures and two passes. The independent test file SHA-256 is
`F8430CDFAE7E6C8C595E882E6338DB86868CDBB358160862566CDC496A4125AF`.
The reviewer rechecked this fingerprint after the implementation appeared.

Source review of `AccountOperationsPage.tsx` and `operations.ts` confirms the
route uses the existing memory store and privacy revision, an API object stable
across renders, and a live token supplier. Only the established #109 exact
`AUTH_ACCESS_EXPIRED` failure becomes 401; unexpected supplier failure remains
sanitized 503. The operations client preserves a deliberately typed
OperationsError and still checks context before returning a response. No new
account type, credential store, refresh loop, or guest retry was introduced.
No P1/P2 source finding was identified in this narrow binding review. Final
GREEN, broader gates, native browser evidence, and server authorization remain
separate verification requirements.

`scripts/verify-operations-native.mjs` implements the proposed eight native
checks without an API response mock. It defaults to Playwright's bundled
Chromium and accepts an optional CHROMIUM_PATH. It writes relative evidence and
a post-logout screenshot; failure evidence includes only a stage and completed
checks, not exception text or credentials. The independent author has not run
the script. It requires the dedicated local fixture's seeded room and invocation.

## Independent raw gate evidence review

The reviewer parsed the root workspace's actual `verification/` JSON artifacts,
without executing a test or reusing a prior standalone run:

- `web-109-110-final-unit.log`: 36 files, 415 tests passed, zero failed or
  pending, success true. All six account integration route cases passed.
- `web-109-110-final.json`: typecheck, lint with max-warnings zero, unit, and
  production build each exited zero. Source fingerprints before and after the
  complete gate match.
- `web-109-110-browser-browser.log`: 396 cases, 395 expected passes, one skip,
  zero unexpected, zero flaky, zero top-level errors. Every executed case had
  one result with retry zero. The sole skip is the desktop instance of
  `landing.spec.ts` / `mobile layout keeps primary action inside viewport`.
  All 12 operations acceptance/transport cases passed on their first result,
  covering both desktop and mobile projects.
- `web-109-110-browser.json`: browser process exited zero. All 72 source and six
  dist fingerprints are identical before and after the run. Browser input
  fingerprints also exactly match the final build's output fingerprints.

These browser suites use response fixtures and do not establish real server
authorization. They also explicitly account for the actual #109 boundary's
additional headerless POST refresh returning 401; their operations assertions
retain the previous scope and strength.

After the root agent completed and restored the temporary mutations, the
reviewer independently hashed all 72 current source files and six current dist
files against the browser run's manifest. Every fingerprint matches. Actual
native browser result is independently verified in the final section below.

## Additional account integration mutation review

`verification/web-109-110-integration-faults.json` records two new, narrowly
scoped mutations of the account operations wrapper. The reviewer also parsed
the corresponding actual `*-account-red.log` Vitest JSON reports:

- Removing the memory Bearer supplier: six tests executed, four assertion
  failures and two passes, zero pending. Failures include missing token A,
  missing token C after account switch, lost expiry refusal, and lost sanitized
  supplier-failure UI.
- Replacing the known-expiry status 401 with 503: six tests executed, one
  expected UI assertion failure and five passes, zero pending.

Both mutations were killed by behavioral assertions, rather than compilation
or setup failures. Both error logs are empty. The mutation manifest records
exact wrapper byte restoration and unchanged fingerprints for all 36 unit test
files; the independent live source/dist comparison above corroborates that
restoration against the full passing gate baseline.

These two mutations specifically establish sensitivity of the actual #109
memory-session integration. They are additional to the seven standalone #110
mutations previously documented in `issue-110-web-independent.md`; those older
seven were not rerun or relabeled as integration mutation results here.

## Native harness first-run correction

The initial actual native attempt is not a PASS. The root agent reported an
unhandled rejection of a separately created room-response wait promise before
the click failure reached the script's safe catch. The original
`verification/native-110-browser.log` must remain evidence of that failed
attempt, not be reused as a successful run.

The independent author corrected each wait/action pair to an immediately
awaited Promise.all, so either rejection is handled by the sanitized catch.
Room and invocation buttons are asserted visible before creating response
waits. The exact names `방 {room.id}` and `실행 {item.id}` match the existing
public UI source and were retained. This correction does not establish why the
room button was unavailable in that attempt. A fixed, non-sensitive action
identifier is now included in failure evidence to locate subsequent failures
without serializing Playwright exception text. Product code and frozen unit
tests were not changed by this harness correction; no run was executed by the
independent author.

## Actual #109 integration native evidence: final review

The reviewer read `docs/verification/issue-110-native.json`, the root workspace's
`verification/native-110-browser-2.log` and runner JSON, and the dedicated
`native-110-server-3` runner/log. The browser run exited zero and reports eight
checks, ten operations requests, zero API response mocks, and zero external
requests. The server run also exited zero; its log identifies PostgreSQL 18,
Redis 8, all 13 present migrations through V15, and the local HTTP server on
18910. The test entrypoint reuses the actual #109 OIDC/JWKS and synthetic RS256
fixture with a disposable local allowlisted account. The web is on 18911.

The eight passing checks establish actual anonymous 401 despite HOST hints,
actual ordinary Kakao-account 403, Google test-account 200 room/invocation
drilldown, faithful unknown usage/transport, the production memory supplier's
Bearer header, actual logout privacy revision and subsequent 401, read-only
no-store requests without invented identity, and no credentials in DOM, URL,
or browser storage. The reviewer inspected the post-logout screenshot: it
shows the fixed authentication-required message and no private summary.

The initial failed native attempt remains a separate history. The root also
corrected synthetic fixture UUIDs to satisfy the existing RFC UUID validator;
the product validator and frozen integration test expectations were retained.
Neither failed setup/harness attempt is counted as a successful run.

The reviewer additionally compared the actual running server's exported
`issue-110-account-integrated.openapi.json` with the current web snapshot:
SHA-256 `54ec5ef4111c04df4df4620c0bd72ed2ee97b02a209314da45d348fe4c429c66`
matches the capture manifest, and all three operations paths plus all ten
referenced components are structurally identical. The current API generate
and generated-schema check artifacts both exited zero. The existing final
production build and browser fingerprints remain the independent evidence
described above; native testing required no product source rewrite.

This final native evidence closes the previously pending local real-backend
and #109 memory-store integration item. It does not establish production
Google/Kakao capability, operational operator activation, provider receipt,
or billing exactly-once. The older standalone #110 evidence remains history
and is not substituted for this actual integration evidence. This web review
has no remaining P1/P2 finding in its scope. Integration commit, push, Draft
PR, and exact-HEAD remote CI are still pending, and merge/deploy remain outside
this session's authorization.
