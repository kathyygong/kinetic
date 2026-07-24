# Mobile Phase 3.5 Behavior Pattern Result Handoff

Date: 2026-07-24

## Milestone

Mobile Phase 3.5 closes the Behavior Pattern Result Contract required before a
controlled mobile beta.

- Part A: Windows/shared contract, backend/frontend authority, fixture,
  telemetry, QA readback, and deterministic validation.
- Part B: native SwiftUI consumption implemented and exercised on Mac,
  simulator, and a signed physical iPhone. The authenticated route/readback
  matrix passed; the remaining closure gates are the full authenticated
  pattern-card accessibility pass and final shared Windows/hosted integration.

Part B must not change the `behavior-pattern-result.v1` vocabulary or create a
native-only mutation path.

## Part A implementation

Part A uses the existing authenticated, read-only `POST /behavior-insights`
endpoint. It adds:

- strict versioned backend and frontend response validation;
- deterministic result routing for all seven supported pattern families;
- deterministic model-output intersection and fallback behavior;
- explicit scoring-preference review;
- preferred-day review through the existing intake confirmation and plan
  regeneration authority;
- prompt-only stale-data/check-in routing;
- caution-only pain/discomfort routing;
- canonical cross-platform fixture coverage;
- strict-auth, timeout, unavailable-AI, malformed, invalid, and unsupported-AI
  gates;
- privacy-safe `mobile_pattern_result_lifecycle` telemetry;
- `/qa/mobile` and owner-only `mobile_audit` readback coverage.

No Swift or SwiftUI implementation was included in Part A.

## Part A evidence

Implementation commits:

- `485b727` — shared contract, routes, UI review, telemetry, fixtures, tests,
  and documentation;
- `d2661a3` — hosted TypeScript narrowing correction.

GitHub-hosted Windows integration run
[30021806663](https://github.com/kathyygong/kinetic/actions/runs/30021806663)
passed on 2026-07-23 at `d2661a3`:

- clean `npm ci`;
- connected dependency audit;
- frontend lint;
- TypeScript `--noEmit`;
- complete deterministic frontend smoke suite, including the canonical
  behavior-pattern fixture;
- production frontend build;
- beta readiness;
- Python 3.12 dependency install and compile;
- backend deterministic gates, including every pattern route, AI failure
  class, request non-mutation, prompt privacy, and strict-auth rejection;
- backend smoke;
- Java 21 Firebase Auth/Firestore owner-only emulator suite, including
  `mobile_pattern_result_lifecycle` readback from the existing
  `mobile_audit` domain.

Local Windows backend compile, deterministic gates, and backend smoke also
passed. Local `npm ci` remains blocked by the managed package proxy returning
`E404` for the pinned Next.js `16.2.11` tarball. The same lockfile installed
and passed the clean hosted Windows workflow, so no dependency downgrade,
lockfile change, or alternate registry workaround was made.

## Windows validation

Run from the repository root unless a command changes directory:

```powershell
git status --short --branch
git diff --check
cd backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals.generate_report --check
.\.venv\Scripts\python.exe -m evals._smoke
cd ..\frontend
npm ci
npm run lint
npx tsc --noEmit
npm run smoke
npm run build
npm run beta:readiness
cd ..
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

The managed Windows package proxy may still return `E404` for the pinned
Next.js `16.2.11` tarball. When that happens, do not downgrade or change the
lockfile. The checked-in GitHub-hosted Windows workflow is the authoritative
clean-install, audit, frontend, backend, and Firestore gate.

## Part B implementation status

The thin native v1 implementation was added on 2026-07-24 before the major
phase-completion test pass. It:

- reads the existing owner-scoped `recommendations` domain on demand, only
  when the behavior surface opens; no duplicate native behavior store or
  extra read on the core Today path was added;
- strips free-text rejection reasons and workout notes before constructing the
  bounded `POST /behavior-insights` request;
- uses an authenticated 30-second client deadline with explicit auth, offline,
  timeout, backend, malformed, and unknown failure states;
- strictly rejects unknown versions, keys, families, result kinds, mutations,
  enum values, duplicate IDs, support below two, more than 20 patterns, and
  family/result route drift;
- renders noticed, why, can-change, and never-change copy for every route;
- confirms scoring preferences transactionally in the existing owner-scoped
  `preferences` document with idempotent double-tap protection;
- sends preferred-day results to the existing web profile review in v1, so
  Swift does not become a second plan-generation authority;
- routes readiness/check-in prompts into existing native flows and renders
  discomfort recurrence as fixed non-diagnostic caution only;
- emits the existing privacy-safe `mobile_pattern_result_lifecycle` vocabulary
  through the existing capped `mobile_audit` document;
- includes a local configuration kill switch
  (`kinetic.behavior-patterns-enabled`) and configurable web profile URL
  (`kinetic.web-profile-url`).

Focused Swift fixture, strict-decoder, request-privacy, networking, failure,
audit, and explicit preference-tombstone recovery tests now pass on Mac. The
Mac run also fixed cancellation propagation and an explicit-confirmation
compatibility issue with a valid deleted preference envelope. This remains an
implementation checkpoint, not Phase 3.5 completion evidence, until the
remaining accessibility and final shared Windows/hosted gates pass.

## Mac and physical-device evidence — 2026-07-24

```text
Date: 2026-07-24
Branch and commit: codex/mobile-pattern-results; source transfer fea05c7; verified fixes b61c4b5
macOS: 26.5.2 (25F84)
Xcode: 26.3 (17C529)
Simulator device/iOS: iPhone 17 / iOS 26.3
Physical device/iOS: iPhone 17 / iOS 26.5.2
Focused Swift tests: BehaviorPatternContractFixtureTests 4/4; MobileAuditModelsTests 5/5
Complete Swift tests: 52/52
Unsigned simulator build/launch: clean generic simulator build passed; rebuilt app installed/launched
Signed generic-device build: passed with the existing team/profile; rebuilt app installed/launched
Physical route proof: scoring, preferred-day, readiness prompt, and caution routes passed
Same-user preference readback: native confirmed/applied/passed event; web showed “Using this preference”; live Today decision followed
Preferred-day no-native-write proof: reviewed/not_requested audit; web profile remained Mon/Wed/Fri/Sun with Tue/Thu/Sat unselected
/qa/mobile privacy readback: passed for reviewed, confirmed, prompted, caution, applied, review_only, and not_requested states using fixed enum fields only
Accessibility: maximum simulator Dynamic Type plus increased contrast rendered without clipping; physical controls were tappable
Kill switch: physical launch with the entry-point flag set to NO passed and was restored to YES; no state was deleted
Remaining limitations: authenticated pattern-card VoiceOver order, landscape, and small-screen pass; final shared Windows/hosted integration and owner-only emulator rerun
```

The strict local backend returned HTTP 200 for physical-device `/decision` and
`/behavior-insights`. The opt-in local demo seed was expanded to 10 bounded
events so the disposable same-user history safely produced a scoring result,
Sunday preferred-day result, stale-readiness prompt, and fixed discomfort
caution. The web surface observed 11 records after Today added its current
recommendation.

Two contract-compatible defects were found and fixed during the run:

- `URLError.cancelled` now propagates as `CancellationError`, so dismissing the
  sheet cannot render a synthetic unknown failure.
- An explicit scoring confirmation may start a new empty preference epoch from
  a valid deletion tombstone, without restoring deleted preference history.
  Malformed tombstones still fail closed.

## Mac source-transfer gate

The authoritative checkpoint is the pushed tip of
`origin/codex/mobile-pattern-results`. The Mac task must fetch that branch and
start from its exact tip; do not reconstruct Part B by copying individual
Swift files.

Before running Xcode on the Mac:

1. Fetch and switch to the remote feature branch:

```bash
git fetch origin
git switch codex/mobile-pattern-results
git merge --ff-only origin/codex/mobile-pattern-results
git status --short --branch
git rev-parse HEAD
git rev-parse origin/codex/mobile-pattern-results
```

2. Confirm the two commit hashes match and the working tree is clean. Do not
   rebase, merge another branch, or start from `main`.
3. The branch must contain the project-file, audit-model,
   recommendation-context, app-configuration, test, harness, and documentation
   changes together.
4. Confirm these Part B paths exist:

```text
ios/KineticCompanion/App/BehaviorPatternView.swift
ios/KineticCompanion/Core/BehaviorPatternModels.swift
ios/KineticCompanion/Sync/BehaviorPatternClient.swift
ios/KineticCompanion/Sync/FirestoreBehaviorPreferenceClient.swift
ios/KineticCompanion/Tests/BehaviorPatternContractFixtureTests.swift
```

The Xcode project must also reference the four production Swift files. Swift
Package Manager discovers the Core, Sync, and Tests files from their existing
target directories.

## Mac prerequisites and configuration

Use:

- a current Xcode installation with the iOS 17-or-newer simulator runtime;
- the existing Apple development team and bundle identifier;
- the untracked Kinetic `GoogleService-Info.plist`;
- a disposable Firebase user with same-user web access;
- a reachable strict-auth backend;
- a reachable web profile URL for preferred-day handoff;
- one physical iPhone for the signed interaction/readback proof.

Never commit Firebase configuration, credentials, signing material, test-user
details, or screenshots/logs containing identity or health data.

For a physical device, configure the existing launch arguments:

```text
-kinetic.api-base-url
http://<mac-reachable-address>:8000
-kinetic.web-profile-url
http://<mac-reachable-address>:3000/profile
```

Use the real controlled-beta web profile URL instead of the local URL when
testing a hosted build. The behavior entry point is enabled by default. Prove
the rollback control once with:

```text
-kinetic.behavior-patterns-enabled
NO
```

Then remove that override or set it to `YES` for the Part B route tests.

## Part B source manifest

Review these implementation boundaries before changing code on Mac:

- `BehaviorPatternModels.swift`: strict v1 request/response vocabulary,
  family/result invariants, bounded history, and privacy-safe request models;
- `BehaviorPatternClient.swift`: on-demand owner-scoped history read,
  authenticated endpoint call, 30-second deadline, and stable failures;
- `FirestoreBehaviorPreferenceClient.swift`: scoring-only, owner-scoped,
  transactional, idempotent preference confirmation;
- `BehaviorPatternView.swift`: result cards and scoring/web/check-in/caution
  routes;
- `TodayView.swift`: state machine, entry point, confirmation guard, and audit
  emission;
- `MobileAuditModels.swift`: existing web-compatible pattern lifecycle event;
- `MobileCheckinModels.swift`: preservation of bounded freshness/check-in
  context from shared recommendation history;
- `MobileTodayDecisionClient.swift`: behavior kill switch and web profile URL;
- `KineticCompanion.xcodeproj/project.pbxproj`: app-target membership;
- `BehaviorPatternContractFixtureTests.swift` and
  `MobileAuditModelsTests.swift`: focused contract/privacy coverage.

Do not move recommendation-history loading back into the core Today reader.
Part B intentionally performs that Firestore read only when the behavior
surface opens.

## Mac command sequence

From the repository root, capture the source state:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
```

Run focused Part B tests first:

```bash
cd ios/KineticCompanion
swift test --filter BehaviorPatternContractFixtureTests
swift test --filter MobileAuditModelsTests
```

Then run the complete package suite. The current source tree contains 52 Swift
test methods:

```bash
swift test
```

Compile the app target for an unsigned simulator:

```bash
xcodebuild \
  -project KineticCompanion.xcodeproj \
  -scheme KineticCompanion \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  clean build
```

Open the project in Xcode, launch on an iPhone simulator, and verify the
signed-out and sparse-history states before using a disposable signed-in user.
Then run the configured signed generic-device build:

```bash
xcodebuild \
  -project KineticCompanion.xcodeproj \
  -scheme KineticCompanion \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  build
```

If signing is centrally managed or provisioning updates are not permitted,
omit `-allowProvisioningUpdates` and use the already-configured team/profile.
Do not change bundle identity or entitlements merely to make the proof pass.

## Focused Mac test matrix

Automated fixture/contract proof must cover:

- all seven families and all four result kinds;
- exact `behavior-pattern-result.v1` version and exact-key rejection;
- unknown family/result/mutation/day/preference rejection;
- duplicate IDs, support below two, more than 20 patterns, malformed JSON, and
  family/result drift;
- request omission of rejection prose and workout notes;
- empty token, 401/403, 408/429/504, 5xx, offline, timeout, malformed response,
  cancellation, and retry;
- audit property names and allowed enum vocabulary only.

Simulator/device UI proof must cover:

- loading, empty/sparse, deterministic fallback, success, offline, timeout,
  invalid response, auth-required, and retry;
- noticed, why, can-change, and never-change copy;
- double-tap/idempotent scoring confirmation;
- one confirmed scoring preference visible in same-user web state and used
  only as a capped scoring nudge;
- preferred-day handoff opening the configured web profile, with native
  `profile` and `plan` documents unchanged;
- `sync_readiness` and `complete_checkin` opening the existing native flows;
- fixed discomfort caution with no diagnosis, severity, clearance, preference,
  or training mutation;
- behavior kill switch hiding the entry point without deleting state;
- VoiceOver order/labels, largest practical Dynamic Type, small-screen,
  landscape, progress, disabled, success, failure, and retry states.

Use canonical fixture tests for all seven families. On physical hardware,
exercise at least one scoring result, one preferred-day result, one prompt,
and the caution route; exercise the remaining families when the disposable
user's safely seeded shared history supports them.

## Firestore, web, and privacy readback

Using the same disposable UID:

1. Confirm opening/reviewing cards writes no preference, profile, or plan.
2. Confirm one scoring result. Verify only the existing `preferences` document
   changes and a repeated tap/retry does not create a duplicate.
3. Refresh native Today and the web surface. Verify the confirmed preference
   remains bounded by deterministic safety and candidate rules.
4. Open a preferred-day result. Verify the configured web profile opens and
   native code made no profile/plan write. Any later schedule confirmation
   must happen through the existing web intake/planner validator.
5. Inspect `/qa/mobile`. A native `mobile_pattern_result_lifecycle` event may
   contain only platform, action, outcome, pattern family, result kind,
   mutation state, deterministic-validation state, and bounded source.
6. Verify the audit contains no title, description, generated prose, identity,
   token, workout text/note, readiness/biometric/recovery value, pain severity,
   injury, diagnosis, or medical field.
7. Re-run owner/cross-user/guest denial and tombstone expectations. Do not add
   a Firestore domain or rule grant for Part B.

## Part B native scope and remaining proof

Part B must:

1. Land Part A and Part B from the same Phase 3.5 branch without splitting or
   rebasing away either half; the final merge target must be synchronized
   `main`.
2. Read this handoff, [MOBILE_PATTERN_RESULT_CONTRACT.md](./MOBILE_PATTERN_RESULT_CONTRACT.md),
   the canonical fixture, [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md),
   [ARCHITECTURE.md](./ARCHITECTURE.md), and [QA_MATRIX.md](./QA_MATRIX.md).
3. Keep the implemented Swift contract, endpoint, routing, scoring
   confirmation, web schedule handoff, caution, and audit boundaries fixed.
4. Run the focused Swift tests first, then the complete Swift suite.
5. Run simulator build/launch and exercise loading, empty, fallback, auth,
   offline, timeout, malformed, and retry states.
6. Run a signed generic-device build and focused physical-iPhone interaction
   for all seven routes.
7. Verify VoiceOver, Dynamic Type, small-screen, and landscape behavior for
   pattern cards and confirmation controls.
8. Verify one native scoring confirmation appears in same-user web
   preferences/Today scoring and remains capped by deterministic safety.
9. Verify preferred-day routing opens web review and creates no native plan or
   profile write.
10. Verify `/qa/mobile` accepts the native lifecycle event and contains no
    prose, identity, tokens, workout text, readiness/biometric values, pain
    severity, injury, or medical fields.
11. Return to Windows for the final shared integration workflow before
    merging.

Do not add notifications, new Firestore domains, autonomous mutation, raw
notes, health values, medical fields, or full native plan editing.

## Evidence to write back after the Mac run

Update this handoff, [QA_MATRIX.md](./QA_MATRIX.md),
[BUILD_PLAN.md](./BUILD_PLAN.md), [BETA_RUNBOOK.md](./BETA_RUNBOOK.md),
[PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and
[ios/KineticCompanion/README.md](./ios/KineticCompanion/README.md) with:

```text
Date:
Branch and commit:
macOS:
Xcode:
Simulator device/iOS:
Physical device/iOS:
Focused Swift tests:
Complete Swift tests (expected current total: 52):
Unsigned simulator build/launch:
Signed generic-device build:
Physical route proof:
Same-user preference readback:
Preferred-day no-native-write proof:
/qa/mobile privacy readback:
Accessibility:
Kill switch:
Remaining limitations:
```

After recording Mac evidence, review the diff, commit, and push the same
feature branch. Do not merge to `main` unless explicitly requested. The final
shared Windows/hosted integration rerun happens after Mac evidence is added.

## Copy-ready Mac continuation prompt

The following exact prompt is sufficient in a Mac task:

> Continue Phase 3.5 Part B implementation.

On receiving that prompt, start by reading this entire handoff, then fetch the
authoritative feature-branch tip, run the focused tests and Mac closure matrix,
record evidence, and make only contract-compatible fixes. Do not redo Part A,
change the shared vocabulary, broaden scope, or mark Phase 3.5 complete before
all required evidence passes.
