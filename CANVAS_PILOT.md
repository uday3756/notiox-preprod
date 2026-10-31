# Canvas release gate

Status: BLOCKED on a permitted student account and an approved connector/hosting decision. No Canvas token was supplied, no connector executed, and no production sync adapter or scheduled sync is enabled. CanvasSource and policy helpers are contracts, not a completed integration.

Verified registry result on October 23, 2026: npm view canvas-mcp-server@2.3.1 returned E404 (no matching release). Do not execute the handoff's npx command. A different published version or pinned source commit needs review and approval.

## Controlled comparison
1. In an isolated pilot directory, inspect npm metadata for canvas-mcp-server@2.3.1. Pin a published reviewed version and integrity; never silently run latest or install the server into the web bundle.
2. Supply the consenting student's domain/token using a local secret facility, never frontend variables, committed files or widget payloads. Use an expiring student token, not administrator credentials.
3. Discover actual MCP tools and schemas. Allow only health, own courses, own assignments/details and permitted submission reads. Deny submit, grade, messaging and admin actions.
4. Run the same read-only workload against MCP and direct API: all pages, overridden student dates, missing dates, changed deadlines, restricted/unknown submission status, rate limits, expired credentials, timeout, partial response, disconnect/reconnect.
5. Record completeness, stable IDs, call counts, median/p95 duration, setup/hosting cost and cross-account isolation. No LLM is needed for deterministic sync.
6. MCP must pass every correctness/security case and show an actual measured advantage. If it does not, propose direct API and get approval. Do not ship both adapters or an unmeasured fallback.

## Production integration after approval
- Implement one CanvasSource adapter on the server. Use opaque Link pagination URLs; validate destination host before forwarding credentials.
- Add encrypted per-owner connection storage, connection generation IDs, one sync lease per connection, normalized assignment identity and retained last-good snapshot. A global MCP token process is not multi-user authorization.
- Separate official dates/submission truth from personal dates, notes, steps and completion. No fuzzy automatic merge; user-confirmed merges preserve aliases and reward identities.
- Use canvas-policy.ts for 48h change labels, 24h stale/Sort later and opt-in reminder limits. These helpers alone do not implement sync or notification delivery.
- Disconnect stops future work but retains imported/local content marked Not syncing. Late responses from obsolete connection generations must not commit.
- Release the single-student pilot only after live permission, expiry, pagination and revocation tests; broader access requires supported institutional authorization and per-user isolation tests.

Sources: https://github.com/DMontgomery40/mcp-canvas-lms and https://developerdocs.instructure.com/services/canvas/basics/file.pagination .
