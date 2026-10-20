# Issue 110 independent frontend verification

Scope: **contract v1 operator-query unit only**, local cloned web repository, contract `../operator-query-contract.md`, baseline `9b183978d5987f8fa8a5f02d542b17181e4929b4`. This reviewer owns only the new acceptance tests and verification evidence. Product implementation is independently owned. No backend, provider, production data, real credentials, deployment, or shared runtime is used by these tests. This report does not declare overall issue 110 complete: the subsequently requested client-transport observation extension requires a separate exact contract, implementation, and independent RED/GREEN cycle.

## Acceptance design

- HTTP boundary: three GET routes; fixed page size 20; opaque server cursor; ambient cookie credentials; browser cache disabled; no operator identity headers; error bodies are never read; fixed messages; safe response fields only; malformed success fails closed.
- Page boundary: loading, empty, 400/401/403/404/503; no login-by-name, role picker, or grant input; current room settings, host submission independent of room creation; stored elapsed values; recorded admissions distinct from unknown HTTP counts; initial/retry/fallback distinct from logical executions; revisions and legacy records; known zero distinct from unknown; known-only cost subtotal; no arbitrary payload rendering.
- Lifecycle: 401/403 purge protected state and reject late successful detail responses; bounded cursor pagination ends when server cursor is null; no browser storage writes.
- Mocked browser: real `/operations` route, desktop and mobile; denied host cookie/forged URL hints; fixed error messages; drilldown; private extra fields omitted; unknown values preserved; access loss erases existing detail; only safe GET requests; empty persistent storage.

## Evidence

Compiled skeleton RED completed before implementation logic. `node node_modules/typescript/bin/tsc -b --pretty false` exited 0 (`02-red-typecheck.log`). Focused Vitest exited 1 with 22/22 failing tests: 12 page assertions observed the empty skeleton DOM and 10 API assertions observed unimplemented behavior (`03-skeleton-red.log`, duration 61.83 seconds). The initial compilation caught an unsupported Testing Library role-query `exact` option; it was removed before the valid RED run, with string-name matching retaining exact semantics (`01-red-typecheck.log`).

Frozen test SHA256 values (`04-frozen-test-sha256.txt`):

| File | SHA256 |
| --- | --- |
| `src/api/operations.acceptance.test.ts` | `25E1A43B375F4624345F2005983F7EE33556DD3DA19AA72ACC3B94E2C7292DA8` |
| `src/pages/OperationsPage.acceptance.test.tsx` | `E9778259F6C6159DAF2112E409A397392C99E227609FE4B1EE5680BBDEACB8D9` |
| `e2e/operations.acceptance.spec.ts` | `7109ED2F0BFC8BAA0B7ED7426CBADACCD887C18DB8ECC30DA2054D9025BA821C` |

Original 22 tests subsequently passed unchanged (exit 0, 17.20 seconds), with implementation typecheck exit 0. Logs `05` through `07` retain results and matching SHA256 values.

The parent then supplied the #109 contract: optional in-memory access-token supplier only, refreshed for each request; absence omits Bearer; no auth-store duplication, identity inference, storage, logging, URL token transmission, refresh, or guest fallback. It also approved an opaque `authRevision` prop for upstream account changes. Separate tests were added without changing the original 22:

- `src/api/operations.auth-boundary.test.ts`: compiled RED, 7 failed / 3 passed, exit 1 (`08`–`10`). Missing behavior was per-request Bearer, sanitized supplier failure, pre-cancellation, late switch/logout/cancellation rejection, and no guest fallback. SHA256 `10D8AB180809CC59E2E0D8BD205FF22205D92C6ACC9B7195E9233F933A5F0371`.
- `src/pages/OperationsPage.auth-lifecycle.test.tsx`: compiled RED, 2 failed / 1 passed, exit 1 (`11`–`13`). Missing behavior was erasing an already displayed snapshot and aborting pending work on a changed auth revision. API-object replacement already passed. SHA256 `11F606499D7B7A4F1A713E72F802B39F44F8648DC37F8E5D440A5A1424DB27CB`.

Combined 35-case GREEN completed unchanged, exit 0 (40.19 seconds), with typecheck exit 0 and matching hashes (`14`–`16`). The implementer additionally ran the full repository gates: 343 tests in 22 files passed, lint with zero warnings passed, typecheck passed, API snapshot check passed, and build passed (`full-checks.json`, `full-unit.log`).

Static review found no unresolved defect in the implemented boundary: safe response fields and bounded enums are validated and stripped, error bodies are not read, upstream failures are sanitized, the page has no persistent or protected query cache, each navigation clears displayed data, controller identity rejects late responses, token and cancellation checks run after both fetch and body parsing, and the API/revision owner check hides previous account snapshots before the next ready state. Actual #109 memory-store wiring remains an external integration dependency; the default client intentionally sends no Bearer and the server denies access.

Browser checks used the fixed candidate build recorded in `issue-110-web-quality-candidate.json`:

- New operations scenarios: 8/8 passed, desktop and mobile, 13.2 seconds, one worker, zero retries, exit 0 (`17b-operations-browser.log`).
- Full repository browser regression: 391 passed, 1 pre-existing conditional desktop skip, 392 scheduled, 3.9 minutes, two workers, zero retries, exit 0 (`18-full-browser-regression.log`). The new 8 scenarios are included in this full count.
- The first sandboxed runner could not access loopback sockets. A read-only request to `127.0.0.1:4173` confirmed access denied; that runner was stopped with exit 1 before retrying. The same mocked local command then ran under approved escalation. `17-operations-browser.log` is environment-diagnostic evidence, not a product failure or successful browser run.

Deliberate faults used copied source and unchanged tests under the ignored `node_modules/.issue110-independent-*` directory. Dependencies were resolved from the existing parent directory and Vite caches remained local to the isolated directory. No real source was mutated. `issue-110-web-mutations.mjs` reproduces preparation; manifests and machine-readable results are `19` through `22`.

| Deliberate isolated defect | Detected failures |
| --- | ---: |
| Replace unknown numeric values with zero | 1 |
| Call a known-only cost subtotal the full cost | 2 |
| Preserve the previous summary through 401/403 | 4 |
| Dump unallowlisted response fields into the page | 1 |
| Bypass response field validation/stripping | 2 |

All 5 mutant files failed as intended; the unchanged control passed 22/22. The combined mutation run therefore exited 1 as expected: 10 failed and 70 passed across 80 cases, 51.51 seconds (`20-isolated-mutation-run.log`, `21-isolated-mutation-results.json`). Failure messages expose the intended defects, rather than import, compilation, or environment errors. Hash comparisons confirmed `src/api/operations.ts`, `src/pages/OperationsPage.tsx`, and its CSS unchanged during the run. All five real test-file hashes match the frozen values (`23-final-test-sha256.txt`, compared with `16`).

No unresolved defect remains in this query-unit review. Actual #109 session-store wiring and the later transport extension remain outside the completed unit. Source/build ownership was returned to the implementer after all runners ended. Test assertions are derived from the agreed contract and accessible UI labels agreed before implementation. All logs are in `docs/verification/issue-110-web-logs/`; concise machine-readable evidence is `22-independent-evidence.json`.

## V2 final independent evidence review

Reviewer: `/root/independent_review`, separated from the production implementer.
This review preserves the query-only history above and extends it to the local
client-transport observation contract. The reviewer read the final evidence,
raw reports and file hashes without rerunning checks or changing product code,
tests or build output.

`docs/verification/issue-110-web-final.json` agrees with the underlying local
reports: all 353 unit tests passed; typecheck, lint with zero warnings, build,
OpenAPI generation and generated-contract checks exited 0. The browser report
records 395 passed, one existing conditional skip, zero unexpected and zero
flaky cases, with retries disabled. All four new transport browser cases passed
on their first run: two scenarios on desktop and mobile, with mobile explicitly
using a 320px viewport. They cover partial observed/unknown admission counts,
known-only local calls, HTTP 503 as a completed local lifecycle with 123 ns
elapsed, known zero versus unknown, safe response projection and horizontal
overflow.

The compiled transport RED records six missing-behavior failures and four
passes. The subsequent focused GREEN records 45 passes and zero failures.
Seven isolated web faults produced 13 intended assertion failures; the unchanged
control passed 32/32. The raw mutation report SHA matches the sealed evidence,
and its failure details concern the intended validation, unknown/zero, stale
state, private-field, subtotal and transport-status behaviors rather than
compilation or environment setup. All copied mutation test fingerprints match
their current originals.

All 14 sealed final file hashes match current files. Browser source and dist
before/after maps are identical and match the current files. The actual local
server OpenAPI export SHA also matches the sealed evidence: all three operator
paths and ten referenced DTO schemas in the web snapshot match that export.
Direct comparison with the pre-change Git HEAD snapshot confirms preservation
of unrelated paths, schemas, other components and top-level metadata.

No unresolved issue was found in this final web evidence review. Browser API
routes use response doubles and named synthetic private-value markers; these
are not real provider responses or account credentials. The evidence correctly
states `actualBackendBrowserIntegration: false`, `actual109Integration: false`
and `productionOrPaidProviderAccess: false`. Actual account-109 memory-store
wiring and real backend/browser integration remain separate handoff work. This
review does not claim completion of the final server gate, operational
enablement, deployment or provider receipt/billing verification.
