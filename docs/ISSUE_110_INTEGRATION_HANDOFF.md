# Issue110 account integration

This branch adds read-only `/operations` to actual109 web source
`95f09c0a98c6538b0f19ed381fdf11a2f5b844d9`. The verified server account base is
`c06b60a9833ae77e5fce9cfef5719ab2f37470ff`. No operator is registered or enabled
in a real environment. Backend operations remain disabled with an empty allowlist.

The route uses109's memory-only `getAccessToken(true)` and session revision.
Known expiration fails401 before fetch; unexpected supplier failure is fixed503.
Every request reads the current token. Logout/account changes abort outstanding
requests and discard protected data. Refresh remains owned by109; HttpOnly refresh
cookies are used normally. DOM, final URLs, local/session storage do not retain
access credentials. UUID, role and HOST hints never grant authority.

`verification/issue-110-account-integration-final.json` records the current local
evidence. Unit415, production browser395+existing skip1, native8 and integration
faults2 pass. Native uses actual isolated Spring/PostgreSQL18/Redis8/OIDC/JWKS,
RS256, refresh, HTTP401/403/200 and logout with API response mocks0/external0.
It is not production provider login, billing, exactly-once proof or real activation.
The first native fixture/harness failures are preserved and excluded from success.
Standalone PR26 and its older manifests remain historical evidence.

The running integrated server's3 operation paths and10 referenced components
match the generated web contract. Unknown usage/transport stays unknown; local
call results, admissions, logical invocations and known-only subtotals stay distinct.

Central integration must retain107's clarification UI and109's session/ownership
behavior while adding this operations route. Shared files are App, generated
OpenAPI/types, architecture and implementation log. The separately verified107+109
combination is server PR117 `c44225d814ce016dfe7d0deb1ec77632cb561448` and web PR28
`fb87358feecf6f979cd55bb10a218a0fe0e1eb3b`; it is not part of this branch's tested
combination. Real108 proof issuance remains107's separate integration dependency.
Do not infer operator access from HOST or proof possession.

V11=109, V12=108, V13=107, V14/V15=110. The current server catalog is strict and
sparse. Adding actual V12/V13 requires coordinated exact-catalog/history/checksum
and approval-fingerprint tests, not placeholder files or permissive discovery.
See the server `docs/ISSUE_110_HANDOFF.md` for details.

Feature commit/push/Draft PR and exact HEAD CI are authorized and recorded after
publication. Meet me merge, deployment, operational DB, secrets and real account
permission changes remain outside this task.
