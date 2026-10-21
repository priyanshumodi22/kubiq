# SonarQube remediation status

Baseline: `Scan 2026-10-21 115552`, analysis task
`ac87f101-0834-43a1-a03f-5de3cbcd5008`, source revision `032fc03`.
The ledger accounts for all 841 findings; source changes are NOT verified Sonar
closures until an actual follow-up scan supplies that evidence.

## Current checkpoint

- ESLint 9 flat config now loads in both applications. Lint reveals pre-existing
  unused variables, empty handlers, typing warnings and other remaining debt.
  Lint is intentionally not weakened to manufacture a passing release.
- Jest/Vitest LCOV generation works. Initial observations before further tests:
  backend lines 18.43%, frontend lines 2.95%. These local percentages are NOT a
  substitute for the Sonar combined metric; coverage-baseline.json stays null
  until a real Sonar coverage import is reviewed.
- Mechanical fixes: node: imports, numeric methods, readonly members and props.
- Correctness fixes: unconditional audit hooks with permission-gated requests,
  Promise-aware SSE callbacks, line-based SSE parsing, ICMP normalization,
  redundant combobox branch, bounded JSON-fence/punctuation handling, linear
  documentation text extraction, and scoped database adapter switch branches.
- New audit records use crypto UUID suffixes without rewriting existing IDs.
  Ephemeral AI-cache hashes use SHA-256; persisted service ID hashing is unchanged.
- Tests cover permission transitions, multiline SSE, ICMP inputs, large strings,
  cache identity, audit IDs, missing scanner evidence and stale release commits.

## Release safety

Normal main pushes verify only. Production image publication is manual and
requires a successful same-SHA Sonar workflow containing the strict release-proof
artifact, with main still at that SHA. Release/package workflows use the same
guard. NPM publishes the checked-in package version: bump it in a normal commit
before scanning; the publish job no longer changes source after approval.

Before a scan, start the existing on-demand VM. No always-on scanner, token bypass
or new VM-start permission is introduced. The strict proof requires zero open
issues, zero unreviewed hotspots, an OK gate, a reviewed non-null overall coverage
baseline, at least 80% new-code coverage and no excessive reported new duplication.
Expected intermediate failures do not authorize publication.

## Still required before release

1. Finish the pending ledger items, including accessibility, complexity/nesting,
   ignored exceptions, remaining typing/lint debt and justified hotspot reviews.
2. Configure the fixed Sonar new-code baseline and a narrowly scoped Tailwind v4
   directive allowance. Do not disable the unknown-at-rule rule globally.
3. Run checkpoint scans, import coverage, record the actual baseline and reconcile
   all issue IDs. The local CLI is currently unauthenticated; no fresh scan,
   server-side hotspot review or false-positive disposition has been performed.
4. Extend and verify the VM Sheets exporter with revision, gate, coverage and
   hotspot-review metadata, preserving previous tabs and exporting failed gates.
5. Verify the CI release guard against real GitHub/Sonar API responses, test SDK
   ingestion fixtures, then perform the final same-revision scan and Flux rollout.

Useful checks:

```
node scripts/verify-sonar-ledger.cjs
node --test .github/scripts/verify-sonar-release.test.cjs
npm test --prefix backend -- --runInBand
npm test --prefix frontend -- --run
npm run test:coverage --prefix backend
npm run test:coverage --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
```

This checkpoint does not authorize deployment. The null coverage baseline and
unresolved findings must continue to block release. Consult the corresponding
GitHub run for pushed revision and scan evidence; local tests alone are not a
Sonar closure or production verification.
