# Kinetic Mobile Phase 3 Check-In Handoff

Status: Part A Windows/shared contract completed and validated 2026-07-20.
Part B macOS/SwiftUI is the next task.

## Continuation Trigger

The complete copy-ready prompt is:

```text
Continue Kinetic Mobile Phase 3 Part B
```

When Codex receives that sentence in this repository, this handoff is the task
specification. Codex must execute every Part B preparation, implementation,
validation, documentation, commit, and push instruction below without asking
the user to restate them or stopping after planning. The short prompt does not
authorize a merge to `main` or any work outside the stop lines in this
document.

## Part A Outcome

Part A defines `mobile-checkin.v1`, a strict cross-platform fixture, pure
deterministic application, existing-domain persistence payloads, privacy-safe
`mobile_checkin_synced` telemetry, `/qa/mobile` readback, owner-only Firestore
coverage, and backend training-review compatibility. It adds no Swift code,
backend mutation route, or mobile-only persistence.

Read [MOBILE_CHECKIN_CONTRACT.md](./MOBILE_CHECKIN_CONTRACT.md) before
implementing native code.

## Part A Windows Evidence — 2026-07-20

Passed:

```text
npm ci: 439 packages installed, 0 vulnerabilities
npm run beta:audit: 0 failures, 0 warnings, no moderate/high/critical findings
npm run lint
npx tsc --noEmit
npm run smoke
npm run build
npm run beta:readiness: 0 failures; expected offline-audit warning only
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke
npx firebase-tools emulators:exec --only auth,firestore
  "cd frontend && npm run test:firestore-rules"
```

The frontend smoke includes both check-in routes, every fixed failure state,
canonical fixture parity, immutability, idempotency, HealthKit preservation,
plan/goal conflicts, telemetry privacy, and all prior regressions. Backend
gates consume workout outcomes from the same fixture, prove the existing
read-only training summary sees completion/skip/effort, exclude notes, and
reject anonymous strict-auth requests. The emulator proves owner access and
cross-user/guest denial for readiness, workouts, recommendations, and bounded
mobile audit readback. An initial emulator assertion used positional audit
indexes; it was corrected to select by event name, and the rerun passed.

## Part B — Mac/SwiftUI Work

### 1. Start from the pushed Part A branch

```bash
git fetch origin
git switch codex/mobile-checkin-contract
git pull --ff-only origin codex/mobile-checkin-contract
git status --short --branch
git log -1 --oneline
```

The working tree must be clean and the latest commit must include this handoff
and `mobile-checkin-contract.json`.

The repository includes trusted project approval configuration in
`.codex/config.toml` and scoped Phase 3 prompt rules in
`.codex/rules/mobile-phase3.rules`. Codex scans project rules at startup, so
after first pulling these files on Mac, trust the repository and start or
restart the Codex task. Matching Git, Swift/Xcode, Simulator, and device
commands will ask for user approval; the rules do not auto-approve them.

Do not create a repository `requirements.toml`. That filename is reserved for
administrator-managed system or workspace policy and cannot grant a project
broader execution authority. Any command outside the checked-in prompt rules
must use an ordinary one-off approval request.

### 2. Read the authorities

Read, in order:

1. `MOBILE_CHECKIN_CONTRACT.md`
2. `MOBILE_CHECKIN_HANDOFF.md`
3. `MOBILE_COMPANION_PLAN.md`
4. `MOBILE_INTAKE_CONTRACT.md`
5. `MOBILE_TODAY_CONTRACT.md`
6. `MOBILE_READINESS_SCHEMA.md`
7. `MOBILE_MAC_HANDOFF.md`
8. `ARCHITECTURE.md`
9. `QA_MATRIX.md`
10. `BETA_RUNBOOK.md`
11. `ios/KineticCompanion/README.md`
12. `ios/KineticCompanion/Tests/Fixtures/mobile-checkin-contract.json`

Treat `mobile-checkin.v1` and the fixture vocabulary as fixed. If a genuine
shared-contract defect is found, stop and repair Part A with matching fixture,
TypeScript, backend, QA, and documentation changes.

### 3. Run the native baseline before editing

Run the existing Swift package tests and simulator build before changing code.
This distinguishes a pre-existing Mac/Xcode issue from a Phase 3 regression.
Codex should run this baseline as part of the task; it is not a manual
prerequisite for the user.

### 4. Implement only Part B

- Add strict Swift Codable parity for both check-in kinds and every failure.
- Consume the canonical fixture in Swift tests.
- Connect Phase 2.5 perceived-recovery and reflection/missed-workout
  destinations to explicit bounded controls; never parse values from the note.
- Re-read fresh Today/goal/plan/readiness/workout/recommendation state on save.
- Run deterministic request and state validation before writing.
- Merge subjective recovery into the existing `readiness` envelope while
  preserving HealthKit biometrics and tombstone semantics.
- Commit workout and recommendation payloads atomically through the existing
  owner-scoped Firebase transaction boundary.
- Keep stable event IDs and idempotent retry behavior.
- Make signed-out, offline, timeout, invalid, state-conflict,
  permission-denied, partial-write, and retry states visible and non-mutating.
- Emit only the fixed privacy-safe `mobile_checkin_synced` fields and prove
  `/qa/mobile` readback.
- Prove web Recovery, training review, and behavior-memory read native results
  through existing domains.

Do not add raw notes, inferred recovery, pain severity, injury/medical fields,
new backend endpoints, new Firestore domains, notifications, Apple Calendar
ingestion, general chat, full native plan editing, onboarding, Garmin/Oura,
coach sharing, hosted-AI changes, or autonomous mutation.

### 5. Required Mac validation

Run and record:

- pre-edit and post-edit `swift test`;
- unsigned iOS Simulator build, install, and launch;
- signed generic-device build;
- fixture parity for every success and failure case;
- signed-out/auth-required, offline, timeout, permission, conflict, retry, and
  idempotency tests;
- physical-device perceived-recovery and completed/skipped workout flows;
- HealthKit values preserved after subjective recovery merge;
- atomic workout + recommendation write and retry proof;
- same-user web Recovery, training-review, behavior-memory, and `/qa/mobile`
  readback;
- Phase 1, Phase 2A, and Phase 2.5 native regression suite;
- deletion tombstone and reconnect regressions.

Update this handoff with dated commands and results, review the diff, commit,
and push the same branch. Do not merge to `main` from the Mac task.

## Copy-Ready Mac Continuation Prompt

```text
Continue Kinetic Mobile Phase 3 Part B
```

All operational detail intentionally lives above so the continuation prompt
cannot drift from the checked-in contract.
