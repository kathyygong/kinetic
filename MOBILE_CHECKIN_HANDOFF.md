# Kinetic Mobile Phase 3 Check-In Handoff

Status: Part A Windows/shared contract and Part B macOS/SwiftUI implementation
completed 2026-07-20. Automated native/shared gates pass. Physical-device
recovery and completed/skipped workout interaction, strict authenticated
backend calls, and live same-user Recovery, training-review, memory, and
`/qa/mobile` readback passed 2026-07-21. The completed Phase 3 branch was
fast-forwarded into `main` on 2026-07-23 after the patched dependency and
hosted Windows integration gates passed.

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

## Part B Mac Evidence — 2026-07-20

Implementation completed on `codex/mobile-checkin-contract` without changing
`mobile-checkin.v1` or its canonical fixture:

- Added strict Swift Codable requests for both check-in kinds, exact-key and
  privacy rejection, bounded validation, all fixed failure states, and pure
  deterministic application.
- Added canonical fixture tests for all three successes and seven failures,
  HealthKit-preserving recovery merge, stable event IDs, idempotent retries,
  atomic write-domain output, web-compatible goal/workout/recommendation
  shapes, and privacy-safe audit properties.
- Added explicit recovery and completed/skipped workout controls with a visible
  review step. Phase 2.5 recovery, reflection, and missed-workout routes open
  those controls without transferring values from the note.
- Added one owner-scoped Firestore transaction that re-reads all current state,
  rejects conflicts/tombstones, writes readiness alone or workouts plus
  recommendations together, and never creates a new domain.
- Added fixed `mobile_checkin_synced` native audit fields only. Failure paths
  always report `write_scope=none` and `update_succeeded=false`.

Passed:

```text
pre-edit swift test: 41 passed
pre-edit unsigned generic iOS Simulator build: passed
post-edit swift test: 47 passed
post-edit unsigned generic iOS Simulator build: passed
iPhone 17 / iOS 26.3 simulator boot, install, signed-out launch: passed
signed generic iOS device build: passed
frontend npm run lint: passed
frontend npx tsc --noEmit: passed
frontend npm run smoke: passed, including mobile-checkin contract
frontend npm run build: passed, all 16 routes
backend compileall: passed
```

## Physical-Device And Live Evidence — 2026-07-21

The paired iPhone 17 running iOS 26.5.2 completed the signed build, install,
launch, Firebase session, and strict authenticated `POST /decision` flow. The
backend returned HTTP 200 from the phone through the explicit local-network QA
URL.

Physical recovery proof passed:

- The runner explicitly saved perceived recovery 2/5, fatigue 4/5, soreness
  3/5, and no sleep correction.
- Native confirmed the recovery save and stated that existing HealthKit values
  were preserved.
- Same-user web Recovery read back sleep 7h51m, HRV 68.71, resting heart rate
  53, fatigue 4/5, and soreness 3/5.
- `/qa/mobile` read the success audit with `write_scope=readiness`,
  `status=checked_in`, validation passed, and no effort or reflection fields.

Physical workout proof passed for both outcomes:

- A completed check-in with effort 7/10, `harder_than_expected`, and accepted
  adjustment committed `workouts` and `recommendations` together. Same-user
  `/qa/mobile` reported success, `status=completed`, validation passed,
  effort/reflection present, and 797 ms latency.
- A skipped check-in with `schedule_conflict` and accepted adjustment replaced
  the same stable slot without duplication. `/qa/mobile` reported success,
  `status=skipped`, validation passed, no effort/reflection fields, and 871 ms
  latency.
- The same slot was finally restored to completed with effort 7/10 and
  `harder_than_expected`; the latest audit again passed both-domain commit at
  794 ms. This also proved repeated replacement remained idempotent.
- Web Dashboard read the updated workout status, Plan reported one saved
  workout and a grounded 1-of-1 training review, and Profile training memory
  read two history records while correctly withholding a tentative pattern
  until more history exists.
- An initial routine check-in against deleted workout history was rejected with
  `write_scope=none`; the tombstone was not recreated. Fresh history was then
  created through the supported web workout UI for the successful proof.

Live QA exposed one real cross-client compatibility defect: web-authored goal
signatures could serialize the same personal-record map in a different JSON
key order, while native compared the raw string. Native now validates the
stored signature as an exact semantic goal object and preserves the existing
web representation. Changed distance, date, experience, PR values, mileage,
unknown keys, and malformed values still fail closed. Reordered-equivalent,
changed-PR, and changed-mileage Swift regressions pass in the 47-test suite.

The previously environment-limited gates were rerun successfully:

```text
swift test: 47 passed
signed physical-device build/install/launch: passed
backend compileall, evals._gates, evals._smoke: passed in a temporary Python 3.12 venv
strict authenticated physical-device POST /decision: HTTP 200
Firebase Auth/Firestore emulator owner-only and tombstone suite: passed with temporary JDK 21
frontend lint, TypeScript, smoke, production build: passed
frontend beta:readiness: 0 failures; expected skipped-audit warning only
```

## Dependency remediation — 2026-07-22 through 2026-07-23

The connected `npm run beta:audit` rerun originally found three newly
published high advisories affecting `brace-expansion`, `sharp`, and the direct
`next` dependency. On 2026-07-22 the vulnerable transitive ranges were
constrained to `brace-expansion` `1.1.16` and `sharp` `0.35.0`; unaffected
modern `brace-expansion` consumers remain on their existing major. That
reduced the connected audit from three high findings to one.

On 2026-07-23 the Mac environment resolved patched Next.js `16.2.11` and the
matching `eslint-config-next` `16.2.11` from the official registry. Both were
upgraded together while the scoped PostCSS `8.5.14` override was retained.
GitHub-hosted Windows validation then closed the dependency and integration
blocker in
[Windows integration run 30012524615](https://github.com/kathyygong/kinetic/actions/runs/30012524615):

- Windows `npm ci`: 442 packages, 0 vulnerabilities;
- connected `npm run beta:audit`: 0 failures, 0 warnings, 14 checks;
- Windows lint, TypeScript, deterministic smoke, and the production build
  passed on Next.js `16.2.11`; all 16 application routes built successfully;
- beta readiness passed with 0 failures and the single expected offline-audit
  warning;
- Python 3.12 backend compile, deterministic gates, and smoke passed;
- the Java 21 Auth/Firestore owner-only and tombstone emulator suite passed.

The managed local Windows package proxy still returns `E404` for the
`next@16.2.11` tarball. That workstation-specific restore limitation is not a
product or lockfile failure; the checked-in hosted Windows gate uses the
official registry and must remain green for `main`.

The completed feature branch was fast-forwarded into `main` on 2026-07-23; no
dependency advisory remains an integration blocker.
