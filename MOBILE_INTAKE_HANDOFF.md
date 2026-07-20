# Kinetic Mobile Phase 2.5 Intake Handoff

Status: Part A Windows/shared contract and Part B macOS/native implementation
completed on 2026-07-20. Automated, simulator, signed generic-device,
strict-auth backend, shared regression, dependency, and Firestore rules gates
pass. Physical-device install/interaction and native `/qa/mobile` readback are
the remaining evidence because the connected iPhone was unavailable.

Phase 1 HealthKit/Firebase sync and Phase 2A Native Today are complete,
device-validated, integrated into `main`, and pushed to `origin/main`. This
handoff scopes the next milestone: bounded mobile natural-language intake and
deterministic validation.

## Outcome

From Native Today, a signed-in runner can enter a short note about what
changed. Kinetic routes the note into a concrete bounded product flow. AI may
parse or classify the note, but it cannot mutate the plan, invent recovery or
medical values, or bypass deterministic validation.

Supported outcomes:

- Schedule, availability, travel, workout-swap, goal, and preferred-day notes
  produce a typed review-only draft.
- Recovery/readiness notes route to explicit perceived-recovery capture.
- Pain or injury language routes to a conservative caution flow.
- Missed-workout notes route to skipped/reschedule/rebalance choices.
- Post-workout reflection routes to completion and effort capture.
- Explanation questions route to a read-only deterministic explanation.
- Ambiguous input produces a clarification prompt.
- Unsupported or unsafe input stops with a bounded refusal or routing message.

## Work Order

### Part A — Windows/shared contract

Complete this part on Windows before changing native Swift code:

1. Inspect the existing web `POST /ai/parse-intake` request, response,
   validation, timeout, fallback, confirm/apply, and observability paths.
2. Define a versioned mobile intake routing contract that reuses the web
   endpoint where safe and introduces no parallel mutation authority.
3. Define strict typed outcomes for draft review, perceived recovery, caution,
   missed workout, reflection, explanation, clarification, and refusal.
4. Define bounded request context. Exclude raw HealthKit samples, tokens,
   identity, calendar/workout text not required by the parser, and unrelated
   history.
5. Define deterministic confirmation/apply behavior for mutable drafts.
   Routing or parsing alone must never write plan state.
6. Define stable auth, timeout, unavailable-AI, malformed-response, ambiguous,
   and unsupported failure behavior.
7. Define privacy-safe `mobile_intake_lifecycle` audit fields. Never store the
   raw note, generated prose, biometrics, email, UID, or token.
8. Add a canonical cross-platform fixture and deterministic frontend/backend
   tests for every route and failure class.
9. Extend `/qa/mobile` readback for the bounded intake lifecycle without
   exposing source text.
10. Update the roadmap, QA matrix, architecture, runbook, and this handoff with
    the completed shared-contract evidence.

### Part B — macOS/native implementation

Return to Mac only after Part A is committed and pushed:

1. Pull the stable shared-contract commit.
2. Add Swift Codable routing, draft, validation, and failure models that
   consume the canonical fixture.
3. Add the short “Tell Kinetic what changed” entry point from Native Today.
4. Render the bounded destination for each supported route.
5. Require explicit review and deterministic confirm/apply for mutable drafts.
6. Add authenticated requests, timeout/fallback handling, and privacy-safe
   native audit transport.
7. Run Swift tests, simulator tests, signed-device build/install/launch,
   strict-auth rejection/acceptance, malformed/timeout behavior, route
   coverage, deterministic mutation proof, and `/qa/mobile` readback.
8. Record dated evidence here before merging back to `main`.

## Stop Lines

- Do not start SwiftUI implementation before the shared contract and fixture
  pass on Windows.
- Do not build a general chat interface.
- Do not add autonomous AI plan mutation.
- Do not infer readiness, pain severity, diagnosis, injury, biometrics, or
  completion from free text.
- Do not persist raw notes or generated prose in mobile audit data.
- Do not broaden this phase into push notifications, Apple Calendar ingestion,
  full native plan editing, onboarding replacement, Garmin/Oura, coach
  sharing, or hosted-AI changes.
- Do not implement the full Phase 3 check-in persistence loop here. Phase 2.5
  must define and safely route to its bounded destinations; deeper check-in
  behavior follows after the routing contract is stable.

## Acceptance Gates

- Every supported note reaches one concrete bounded outcome.
- Mutable drafts are review-only until explicit confirmation and deterministic
  validation both pass.
- Anonymous calls fail under strict auth.
- Ambiguous, malformed, unsafe, or ungrounded input cannot mutate state.
- AI timeout or unavailability falls back or stops safely.
- Recovery and pain language never becomes a hidden biometric or medical
  value.
- Web and native use the same canonical fixture and outcome vocabulary.
- Owner-only Firestore rules continue to pass after any audit schema change.
- `/qa/mobile` shows only privacy-safe route/lifecycle outcomes.
- Existing frontend, backend, Firebase, and mobile Today gates remain green.

## Part A Completion Evidence

Completed on `codex/mobile-intake-contract` on 2026-07-20:

- Added the strict `mobile-intake.v1` request/response contract to the existing
  authenticated `POST /ai/parse-intake` endpoint. Legacy `intake.v1` web
  requests remain compatible.
- Added tagged review-draft, perceived-recovery, caution, missed-workout,
  reflection, deterministic-explanation, clarification, and refusal outcomes.
- Added schedule, availability, travel, workout-swap, goal, and preferred-day
  draft kinds. All responses report `mutation_performed=false`.
- Reused the current web confirm/apply authority. Explicit workout swaps now
  pass deterministic existing-plan, race-day, duplicate-day, weekly-load, and
  hard-workout-spacing checks before the existing persistence path can run.
- Added bounded goal/profile/decision context; unknown identity, raw
  readiness, biometric, and unrelated fields receive `422`.
- Added stable client/auth/backend/parser failure codes and deterministic safe
  behavior for timeout, unavailable AI, malformed/ungrounded AI, ambiguity,
  unsupported input, and unsafe input.
- Added privacy-safe intake route, failure, parser, mutation, validation, and
  latency fields to `mobile_intake_lifecycle`; `/qa/mobile` and the owner-only
  `mobile_audit` reader expose only those bounded fields.
- Added the canonical fixture at
  `ios/KineticCompanion/Tests/Fixtures/mobile-intake-contract.json` and shared
  frontend/backend gates for every route and failure class.

The detailed authority, schemas, failure table, telemetry fields, and current
Part B limitations are in
[MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md).

## Required Windows Validation

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run smoke
npm run build
npm run beta:readiness

cd ..\backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke

cd ..
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

`npm run beta:readiness` may report the expected warning that the connected
advisory audit was skipped. Run `npm run beta:audit` when network access is
available or dependencies change.

All commands above passed on 2026-07-20. Frontend lint, TypeScript, smoke,
production build, and beta-readiness passed; backend compile, gates, and smoke
passed; Auth + Firestore emulator rules passed. Beta-readiness reported only
the documented connected advisory-audit skip warning. Firestore emulator
`PERMISSION_DENIED` log lines were the expected cross-user/guest assertions,
and the rule suite exited successfully.

Before Part B native edits, the connected audit found newly published
advisories. The dependency-hardening checkpoint updated Next.js and
`eslint-config-next` from `16.2.5` to `16.2.10`, refreshed vulnerable Firebase
and tooling transitives without a forced or major upgrade, and added a
Next-only PostCSS `8.5.14` override because the latest stable Next release
still pins `8.4.31`. `npm ci`, `beta:audit`, lint, TypeScript, smoke, build,
beta-readiness, and the Auth/Firestore emulator suite pass on the hardened
tree with no reported npm vulnerabilities.

## Mac Continuation Instructions

Part B used the following procedure. Keep it as the rerun checklist for the
remaining physical-device evidence or future native regressions.

### 1. Check out the shared-contract branch

From the repository root on Mac:

```bash
git fetch origin
git switch codex/mobile-intake-contract
git pull --ff-only origin codex/mobile-intake-contract
git status --short --branch
git log -1 --oneline
```

The branch must contain Part A commit `25cb769` or a later descendant, track
`origin/codex/mobile-intake-contract`, and have a clean working tree. Do not
start from `main` until Part A has been integrated there.

### 2. Read the native and shared authorities

Read these files before editing Swift:

1. `MOBILE_INTAKE_CONTRACT.md`
2. `MOBILE_INTAKE_HANDOFF.md`
3. `MOBILE_COMPANION_PLAN.md`
4. `MOBILE_TODAY_CONTRACT.md`
5. `MOBILE_READINESS_SCHEMA.md`
6. `MOBILE_MAC_HANDOFF.md`
7. `ARCHITECTURE.md`
8. `QA_MATRIX.md`
9. `BETA_RUNBOOK.md`
10. `ios/KineticCompanion/README.md`
11. `ios/KineticCompanion/Tests/Fixtures/mobile-intake-contract.json`

Treat the JSON fixture and `mobile-intake.v1` vocabulary as fixed
cross-platform inputs. If a genuine contract defect is found, stop and repair
Part A with matching TypeScript, Python, fixture, test, and documentation
changes before continuing native work.

### 3. Implement only Part B

- Add strict Swift `Codable` request, parser, failure, outcome, and draft
  models for every fixture route and all six draft kinds.
- Add a fixture-parity Swift test before wiring UI or networking.
- Add the short **Tell Kinetic what changed** entry point from Native Today.
- Send the bounded request to the existing authenticated
  `POST /ai/parse-intake` endpoint using the Firebase ID token and a finite
  deadline.
- Reject unknown enum values, extra/unexpected structure, malformed JSON,
  non-contract responses, and privacy-forbidden fields.
- Render concrete native destinations for `review_draft`,
  `perceived_recovery`, `caution`, `missed_workout`, `reflection`,
  `explanation`, `clarification`, and `refusal`.
- Keep parsing and routing non-mutating. The parse endpoint must never become
  an apply endpoint.
- For mutable drafts, require visible review and an explicit confirmation.
  Rerun deterministic validation at confirmation time, then use the existing
  owner-scoped plan/profile/goal persistence boundaries. Do not create a
  mobile-only plan domain or autonomous AI mutation path.
- Match the shared deterministic workout-swap protections: existing plan
  required, race-day movement rejected, unique plan days preserved, weekly
  load unchanged, and hard-workout spacing not worsened.
- Emit capped `mobile_intake_lifecycle` audit properties using only the shared
  action, outcome, route, draft-kind, failure, parser-source, mutation-state,
  deterministic-validation, platform, and latency vocabulary.
- Keep raw notes, grounding text, generated prose, identity, tokens,
  HealthKit/readiness/biometric values, recovery values, pain severity,
  completion values, and medical data out of telemetry, cache, and Firestore.
- Preserve all Phase 1 and Phase 2A auth, HealthKit, Today, cache, calendar,
  audit, reconnect, and deletion-tombstone behavior.

### 4. Preserve the stop lines

Do not add general chat, Phase 3 check-in persistence, notifications, Apple
Calendar ingestion, full native plan editing, onboarding replacement,
Garmin/Oura, coach sharing, hosted-AI changes, or autonomous AI mutation.
Perceived-recovery, caution, missed-workout, and reflection remain bounded
destinations in this phase; deeper persistence follows only in Phase 3.

### 5. Run Mac validation

Start with the package and unsigned simulator gates:

```bash
cd ios/KineticCompanion
swift test

xcodebuild \
  -project KineticCompanion.xcodeproj \
  -scheme KineticCompanion \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Then complete and record:

1. Swift coverage for every canonical route, all draft kinds, bounded request
   construction, strict response rejection, and privacy rejection.
2. Signed-out simulator launch and visible auth-required behavior.
3. Authenticated success plus anonymous rejection against a strict local
   backend.
4. Timeout, offline/backend unavailable, unavailable AI, malformed AI,
   malformed response, ambiguous, unsupported, and unsafe behavior.
5. Proof that parsing/routing never mutates any local or Firebase domain.
6. Explicit-confirmation proof for mutable drafts and deterministic rejection
   of invalid/ungrounded drafts and unsafe workout swaps.
7. Native audit transport plus `/qa/mobile` readback with only bounded fields.
8. Regression proof for Native Today, a real zero-minute calendar window,
   same-day cache fallback, HealthKit sync, reconnect, and deletion tombstones.
9. Signed physical-device build, install, launch, authenticated intake, and
   one bounded route from each outcome family where practical.

Use the existing signing, local-backend, USB/LAN, Firebase configuration,
`devicectl`, and device-evidence instructions in
[MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md) and
[`ios/KineticCompanion/README.md`](./ios/KineticCompanion/README.md). Never
commit `GoogleService-Info.plist`, credentials, signing material, device logs,
screenshots containing identity, or disposable test-user details.

### 6. Record and deliver Part B

- Update this handoff, `MOBILE_INTAKE_CONTRACT.md`, `QA_MATRIX.md`,
  `BETA_RUNBOOK.md`, `ARCHITECTURE.md`, and the mobile roadmap with the exact
  date, Mac/Xcode/iOS/device versions, commands, results, and remaining
  limitations.
- Review the diff and confirm it contains only intended native Part B,
  shared-test, and documentation work.
- After native implementation, rerun `npm ci`, `npm run beta:audit`, lint,
  TypeScript, smoke, build, beta-readiness, and the Auth/Firestore emulator
  suite. Repeat signed-in browser hydration, strict-auth, and `/qa/mobile`
  readback alongside the native device matrix.
- Check whether the current stable Next release now bundles PostCSS `8.5.10`
  or newer. If it does, update Next and `eslint-config-next` together, remove
  the scoped override, and rerun all dependency/frontend/Firebase gates. If it
  does not, keep the verified override; do not accept npm audit's breaking
  downgrade or use `--force`.
- Commit and push `codex/mobile-intake-contract`.
- Do not merge to `main` unless explicitly requested.

### Simple continuation prompt

```text
Finish Kinetic Mobile Phase 2.5 Part B physical-device evidence on Mac. Follow
the remaining proof in MOBILE_INTAKE_HANDOFF.md from the clean tip of
origin/codex/mobile-intake-contract. Do not redo Part A or the completed native
implementation, change the shared mobile-intake.v1 vocabulary, or broaden the
documented scope.
```

## Starting State

- Shared-contract branch: `codex/mobile-intake-contract`
- Part A implementation commit: `25cb769`
- Integrated Phase 2A commit: `7139dcd`
- Part B implementation and repeatable Mac gates: completed 2026-07-20.
- Source-of-truth roadmap:
  [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md)
- Shared intake contract:
  [MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md)
- Completed Phase 1/2A native proof:
  [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md)
- Stable Today contract:
  [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md)

## Part B Mac Evidence

Implemented and validated on 2026-07-20:

- Mac: macOS 26.5.2 build 25F84, x86_64.
- Xcode 26.3 build 17C529; Swift 6.2.4 toolchain in Swift 5.9 package mode.
- Simulator: iPhone 17 / iOS 26.3.
- Connected device detected as iPhone 17, but CoreDevice reported it
  `unavailable`; its prior Phase 2A OS record is iOS 26.5.2.
- Node 25.9.0, npm 11.12.1, Python 3.12.13, and OpenJDK 21.0.11.

Implemented:

- Strict Codable request, parser, failure, outcome, draft, and fixture models
  for all eight routes and all six draft kinds.
- Exact-key response validation, privacy-key rejection, transient bounded
  request construction, authenticated finite-deadline networking, stable
  failure mapping, and no draft cache.
- Native Today entry point plus review draft, perceived recovery, caution,
  missed workout, reflection, explanation, clarification, and refusal
  destinations.
- Explicit confirmation through one owner-scoped Firestore transaction.
  Grounding, target-date, plan-presence, availability, race-day, unique-day,
  weekly-load, and hard-workout-spacing validation reruns at confirmation.
  Goal/experience changes invalidate the stale plan instead of partially
  editing it; check-in destinations remain non-persisting.
- Fixed privacy-safe `mobile_intake_lifecycle` audit properties through the
  existing capped native transport.

Passed commands and results:

```text
swift test: 32 passed
xcodebuild generic iOS Simulator, signing disabled: passed
xcodebuild signed generic iOS device: passed
iPhone 17 / iOS 26.3 simulator install and signed-out launch: passed
npm ci: passed, 0 vulnerabilities
npm run beta:audit: passed, 0 failures/warnings and no reported advisories
npm run lint: passed
npx tsc --noEmit: passed
npm run smoke: passed
npm run build: passed
Python 3.12 compileall, evals._gates, and evals._smoke: passed
Auth + Firestore emulator rules: passed with expected denial assertions
strict local backend: anonymous 401; disposable Firebase bearer token 200;
  review_draft; mutation_performed=false; disposable user deletion 200
```

The npm registry reported stable Next.js `16.2.10` still depends on PostCSS
`8.4.31`, so the verified Next-only `8.5.14` override remains.

Remaining physical proof:

- Reconnect the unavailable iPhone, then install and launch the already
  signing-clean build.
- Exercise authenticated native intake, one practical route from each outcome
  family, a valid confirmation, an invalid/unsafe swap rejection, and native
  audit transport.
- Read that device event through `/qa/mobile` and repeat Today zero-minute
  calendar, same-day cache, HealthKit sync, reconnect, and tombstone checks.

No Part A vocabulary or fixture changes were made, no native mutation endpoint
was added, and no Phase 3 check-in persistence or broader mobile scope was
introduced.
