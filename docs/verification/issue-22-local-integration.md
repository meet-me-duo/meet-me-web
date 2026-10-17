# Issue 22: isolated real browser/API integration

This suite extends [web issue 22](https://github.com/meet-me-duo/meet-me-web/issues/22). It tests the existing anonymous HOST contract against the actual backend, rather than treating the existing mocked browser tests as backend integration evidence.

The server is archived from `91eb2505ddf6b4db549a5bc2b8b07f11e514d0b0` into a temporary directory and built there. The server checkout, its unpushed work, product code, migrations, telemetry and shared Worklog are not edited. Web product files, API snapshots, dependency declarations and existing test/config files are also unchanged.

## Contract and acceptance

- PRD Rule 4 / FR-010A/B: HOST creation does not count as a submission. Manual close requires early-close confirmation while the target is unmet. Zero or one saved participant terminates with `INSUFFICIENT_PARTICIPANTS`; two participants create a batch containing their latest saved versions, without requiring HOST input.
- FR-007A/008A and ADR-036: the actual browser stores and reuses a `Secure HttpOnly; SameSite=Lax; Path=/api` cookie. Creation and later input remain separate; reload retains the same HOST, and trim-equivalent retries retain revision, creation time and latest-version identity.
- FR-009 and ADR-036: another browser and a same-name MEMBER cannot acquire HOST authority or read the HOST's normal input. An unapproved Origin is rejected by actual credentialed CORS preflight without changing the database.
- Sharing checks the real clipboard URL on success, or the required manual-copy fallback and its exact URL on failure.

The independent test author derives assertions from the PRD, ADR and public controller/OpenAPI contracts. PostgreSQL queries inspect only aggregate metadata, booleans and an internal version-set fingerprint. No API route is fulfilled by a mock. A missing feature is not manufactured in the backend to produce a RED result; setup errors are not functional RED evidence.

## Local prerequisites and execution

Use Node 24 (for `node:sqlite`), Corepack, the frozen pnpm lockfile, Docker with Compose, a local JDK 17, OpenSSL and Chromium **151.0.7922.173**. Install dependencies using the repository's existing instructions. Supply a local JDK through `JAVA_HOME`; the runner does not install system packages or change system trust settings.

```sh
JAVA_HOME=/path/to/jdk17 \
HOST_INTEGRATION_BROWSER_EXECUTABLE=/path/to/chromium \
node scripts/run-host-integration.mjs
```

The backend checkout defaults to the sibling `meet-me-server`. `HOST_INTEGRATION_SERVER_REPO` can name another checkout containing the exact fixed commit. Standard cache variables (`GRADLE_USER_HOME`, `COREPACK_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `PLAYWRIGHT_BROWSERS_PATH`) may point to writable local caches. The runner does not repurpose `HOME`. Normal Gradle dependency downloads can require the execution environment's existing proxy/trust configuration. No operational credentials are required.

The runner builds a separate frontend bundle with a local API URL; it does not replace the regular `dist` bundle. It provisions disposable PostgreSQL and Java containers from pinned image digests on an internal Docker network. Only the host-local HTTPS proxy connects to the container API address. There are no published backend/database ports. Runtime provider keys are explicitly empty; worker/relay, rate limits and retention are disabled for this isolated run. The runtime containers have no external route, and their database attempt count must remain zero. This is not a rate-limit, worker or provider-quality test.

HTTPS uses an ephemeral one-day CA and a localhost leaf certificate. A fresh browser profile without the CA must reject the leaf with `ERR_CERT_AUTHORITY_INVALID`. Each test then initializes its own Chromium profile's Custom certificate store, closes Chromium completely, and provisions only the public CA's DER, SHA-256 and trusted-CA metadata in that profile's `Default/ServerCertificate` database. It checks the exact supported browser version, existing columns and schema version 1 first; unsupported versions fail closed. The insert is transactional. Reopened Chromium must recognize the CA in its native certificate manager before any application page is visited, and actual HTTPS requests must succeed with certificate validation enabled (`ignoreHTTPSErrors: false`). No certificate-error flags, security warning clicks or system/shared NSS trust changes are used. Profiles and private CA/leaf keys are removed during cleanup.

The native Import button uses an OS file dialog, which does not emit Playwright's DOM `filechooser` event in this headless environment. Profile-local provisioning therefore follows Chromium's version-matched [database schema and trust mapping](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.173/components/server_certificate_database/server_certificate_database.cc), [metadata protobuf](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.173/components/server_certificate_database/server_certificate_database.proto) and [profile service factory](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.173/chrome/browser/net/server_certificate_database_service_factory.cc). This explicit dependency on Chromium's internal storage format requires review before supporting another version. It does not affect product/browser trust outside the temporary profiles.

Traces, videos, automatic screenshots and storage-state exports are disabled. Chromium bypasses the proxy only for loopback hosts; other browser transport is sent to a local deny-only HTTP/CONNECT proxy that never forwards requests. Page requests are observed and non-local origins fail the fixture. No Playwright routing is enabled: its intercepted preflight optimization would synthesize an OPTIONS response and invalidate a real CORS test. CDP `Network` events observe the actual server preflight response without modifying it. A sanitized `evidence.json` and local raw test/build results are written under the run's temporary directory; the script prints that path. The runner tears down its own Compose project and temporary database.

## Timestamp boundary and earlier verification attempts

The first complete connected run reached the application and database but failed 8 assertions comparing freshly written response timestamps directly with replay timestamps. The test author and independent reviewer rechecked the public `date-time` fields, the stored-instant invariants and PostgreSQL's [one-microsecond timestamp resolution](https://www.postgresql.org/docs/18/datatype-datetime.html). Exact fractional-digit serialization of a first-write response is not part of that public contract.

The final suite records both timestamps and their nanosecond difference. It requires an exact comparison in the actual PostgreSQL `TIMESTAMPTZ` type, then separately compares persisted GET-before, replay and GET-after strings exactly, together with immutable version and batch fingerprints. No broad time tolerance or skipped assertion replaces the storage invariants. Any mismatch in the PostgreSQL projection remains a failure. The first-response versus stored serialization difference is characterized, not fixed in the product.

Earlier setup attempts also exposed an unreachable published port on an internal Docker network, the native certificate dialog's headless limitation, Playwright's preflight synthesis when routing is enabled, and selection of a restored certificate-manager tab instead of the MEMBER's actual page. These harness issues were corrected in new files. Their failures and interrupted runs are not functional RED evidence or successful integration results. The final input fingerprints and completed report determine the accepted result; earlier partial results are not combined with it.

## Verification boundaries

- The two projects use desktop and narrow mobile viewports in Chromium, not a physical mobile browser.
- Different localhost HTTPS ports exercise real cross-origin CORS. They share a cookie hostname, so production app/API subdomain host isolation is not proved.
- Worker execution is intentionally disabled. Queued batch/Outbox state is verified; AI interpretation, provider latency/usage/cost, recommendations, confirmation and reanalysis are not exercised.
- Social login and the login-linked completion item remain dependent on server issue 109. This suite cannot close issue 22 as a whole.
- The pre-existing deadline-before-scheduler acceptance gap and lost creation-response replay/idempotency are unchanged.
- No production traffic, AWS settings, CloudFront invalidation status or deployment is verified.

## Verified result — 2026-10-17 UTC

- Real connected suite: **8 passed**, no skipped/failed/flaky cases, 50.6 seconds. Desktop 1440×900 and narrow viewport 390×844 each ran all four scenarios.
- Existing regression: **308 unit tests passed** across 18 files; **383 mocked browser tests passed**, with the pre-existing 1 skipped case and no failures/flaky cases. A temporary ignored configuration selected the installed Chromium and disabled retries; existing tests/configs were not edited, and the temporary configuration was removed.
- API snapshot/type generation check, full lint, standard typecheck/build, new integration strict standalone TypeScript and runner syntax checks passed. Backend fixed-source `bootJar` build passed; no backend product/test changes were made and no new backend full-suite execution is claimed.
- Actual CORS preflight denial, normal credentialed CORS, trusted HTTPS and untrusted-CA rejection all passed without API routing or certificate-error bypasses.
- Eight timestamp samples differed by −474 to +482 nanoseconds: first responses had 9 fractional digits and stored responses had 6. Every PostgreSQL exact projection comparison passed. Exact persisted-before/retry/after timestamp and version/batch invariants also passed. The wire precision difference remains an observed existing boundary.
- Admitted attempt rows: **0**. Actual provider calls were prevented by empty runtime provider keys, disabled workers and the internal-only container network; the attempt-row count is not represented as a physical-call counter.
- All five execution-input SHA-256 values were unchanged across the accepted run and match the delivered files. Existing tracked files in both repositories are unchanged. Temporary containers, Compose network, browser profiles and private CA/leaf keys were removed and checked afterward.

The accepted run is `/tmp/meetme-host-integration-FtlXAG/`; raw build/test evidence remains local there and in `/workspace/scratch/host-integration/`. The compact portable results and source fingerprints are in `issue-22-local-integration.json`. Existing Worklog remains owned by the parent task. No commit, push, PR, merge, deployment, production access or operational credential import occurred.
