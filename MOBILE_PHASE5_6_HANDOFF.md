# Mobile Phases 5–6 Cross-Platform Closeout

Windows Batch A completed on branch `codex/mobile-phase5-6-contracts`.
The hardened Windows baseline is `c9e375a`; hosted integration, including the
connected dependency audit and expanded owner/cross-user/anonymous Firebase
emulators, passed in
[run 30557508276](https://github.com/kathyygong/kinetic/actions/runs/30557508276).

The subsequent Windows robustness pass exercises every Phase 6 lifecycle
action, the strict-auth HTTP boundary, malformed/conflict/replay/invariant
failures, stricter Phase 5 migration/deletion consistency, and expanded
owner/cross-user/anonymous Firestore access. It also updates the development
tool graph to patched `brace-expansion`/`minimatch` releases and passes a
zero-advisory connected audit.

Mac implementation checkpoints `bfbaaef` and `f52dc39`, followed by automated
closeout commit `1435369`, added most Phase 5–6 native surfaces. Hosted Windows
integration for that combined tree passed in
[run 31008015360](https://github.com/kathyygong/kinetic/actions/runs/31008015360).
At that historical checkpoint the phases remained open because Swift copied
full plan-generation rules, authenticated live/device proof was incomplete,
and deletion stopped at an under-specified boundary. Windows `46fcbba`, Mac
v2 consumption `92bad76`, authenticated Mac implementation `b91269b`, and final
Windows integration `ead3f2a` now resolve and prove the implementation portions
of those findings. The explicitly unavailable physical-iPhone, hands-on
VoiceOver, and Admin-backed cleanup evidence remain open. The 2026-08-06 review
originally identified:

- broad lifecycle actions previously changed unrelated workout load fields;
  an adversarial `availability` proposal changing a 5-mile/45-minute workout
  to 29 miles/300 minutes returned `commit_ready` without a warning. Windows
  Batch B now rejects this and the related unrelated-field/multi-workout paths;
- Swift still derives training phase/taper labels locally, which is another
  copy of shared planning policy even after full native generation is removed;
- native onboarding does not yet capture personal records or availability,
  does not show the required plan preview/confirmed summary before completion,
  and the current export is a foundation receipt rather than training-data
  export.

## Authoritative execution sequence

Complete these stages in order. A green result in the first Windows stage is a
dependency handoff, not the final Windows integration.

1. **Windows Batch B — shared authority.** Work on
   `codex/mobile-phase5-6-closeout`. Add authenticated
   `mobile-plan-generation.v1` to FastAPI as the single runtime authority for
   initial and future generation. Keep `/mobile/plan-lifecycle`
   storage-neutral and independently validating, but close the action-delta
   and full-plan-invariant gaps before it can return `commit_ready`. Add
   authoritative week-phase/explanation metadata so clients never infer taper
   policy. Migrate the web runtime away from local TypeScript generation, add
   canonical/chained/auth/privacy/adversarial gates, add the closeout branch to
   hosted workflow triggers, align the local/remote branch target, run the
   Windows suite, update this file, commit, and push.
2. **Mac Batch B — native correction and closeout.** Fetch the Windows Batch B
   commit. Replace Swift generation with the authenticated shared-generation
   client; remove native taper/phase derivation and render shared metadata.
   Retain only bounded review proposals that still pass through the lifecycle
   validator. Complete the missing onboarding personal-record, availability,
   plan-preview, confirmed-summary, profile/settings, and training-data-export
   journey; finish retryable Firebase account deletion; and run the automated
   plus authenticated simulator/physical-device matrix below. Commit and push
   the Mac evidence to the same closeout branch.
3. **Final Windows integration — mandatory.** Fetch the Mac closeout commit,
   reconcile all documentation and fixtures, run the full frontend, backend,
   Firebase emulator, dependency-audit, hosted Windows workflow, and hosted
   macOS Swift/simulator workflow, and record the exact final commit and runs.
   Do not declare Phases 5–6 complete, merge, or begin the pre-Phase-7 product
   evidence gate until this final return-to-Windows stage is green.

## Platform ownership

- **Windows/shared:** generation and lifecycle contracts, FastAPI authority,
  web runtime, canonical fixtures, deterministic/security tests, Firebase
  rules/emulators, dependency audit, documentation reconciliation, hosted
  Windows CI, the hosted macOS workflow definition, branch/workflow routing,
  and final integration.
- **Mac/native:** Swift contract clients and view models, SwiftUI flows,
  Firebase client transactions, onboarding/profile/data-export UX,
  account-deletion interaction, Xcode project/scheme health, signing,
  simulator/physical-device behavior, accessibility, and live readback.
- **Never duplicate:** mileage, pace, taper, workout scheduling, or future
  regeneration rules in Swift, including display-only phase/taper heuristics.
  The lifecycle endpoint validates a candidate; it does not generate one.

## Windows Batch B exit evidence

- Strict `mobile-plan-generation.v1` request/response fixture and parsers.
- Authenticated FastAPI initial-generation and future-regeneration endpoint.
- Deterministic bounds, invariant, malformed, privacy, and anonymous-auth
  tests, including generator-output acceptance by `/mobile/plan-lifecycle`.
- Action-specific lifecycle deltas: `availability` and `preferred_day` may
  change only permitted scheduling fields/reason codes; `regenerate_future`
  may replace only eligible future workouts; replace/shorten actions remain
  bounded; every candidate reruns mileage, spacing, taper, race-day,
  availability, and completed-history validation.
- Negative regression proving the rejected 29-mile/300-minute availability
  mutation and equivalent unrelated-field or multi-workout bypass attempts.
- Shared week phase and bounded explanation metadata; neither web nor Swift
  derives build/recovery/taper/race policy independently.
- Production web generation calls the shared authority; the TypeScript planner
  is no longer a production runtime authority.
- A hosted macOS workflow runs Swift package tests and an unsigned simulator
  build for iOS-affecting pull requests. The Mac lane remains responsible for
  keeping its project, scheme, package resolution, and tests green.
- The closeout branch has an unambiguous upstream/push target and is included in
  the hosted workflow triggers.
- Clean install/audit, lint, TypeScript, complete smoke, production build,
  backend compile/evals, and owner/cross-user/anonymous emulator results.
- One recorded, pushed, green Windows handoff commit. Mac work must start from
  that commit.

### Windows Batch B handoff — green 2026-08-10

Implemented on `codex/mobile-phase5-6-closeout`:

- authenticated, storage-neutral `POST /mobile/plan-generation` with strict
  Pydantic inputs, an explicit deterministic planning date, initial/future
  modes, bounded pace/load/taper logic, immutable completed/race preservation,
  and authoritative week phase/explanation metadata;
- a canonical generation fixture plus strict web response parser/converter,
  all-race/all-experience bounds coverage, malformed/privacy/anonymous-auth
  gates, deterministic replay, regeneration-history checks, and
  generator-to-lifecycle chaining;
- production dashboard, onboarding preview, plan fallback/baseline, Settings
  preview, and confirmed intake generation now call the authenticated shared
  authority. The TypeScript generator remains only for smoke fixtures and
  explicit synthetic demo seeding;
- lifecycle actions now enforce single-target permitted fields/reason codes or
  bounded future replacement, then rerun workout coherence, absolute load,
  weekly growth/recovery, taper, spacing, race-day, and completed-history
  checks before `commit_ready`;
- adversarial rejection coverage for the 29-mile/300-minute availability case,
  preferred-day unrelated fields, multi-workout availability, oversized
  replace, and fabricated completed history;
- `.github/workflows/macos-ios-integration.yml`, closeout-branch workflow
  routing, and the generation smoke in hosted Windows integration.

Local gates passed before the clean-install attempt removed the prior local
dependency tree: frontend lint (three subsequently removed unused-constant
warnings, zero errors), TypeScript, full smoke, production build; backend
compile, 18-group/498-assertion evaluator report, round-trip smoke, generation
and lifecycle contract smokes; and Firebase Auth/Firestore owner,
cross-user, and anonymous rules.

The Batch B handoff is **green** at Windows handoff commit `d5bbfdc`, pushed to
`origin/codex/mobile-phase5-6-closeout`. Transitive `js-yaml` is locked at
`4.3.1` and Nano ID at compatible patched `3.3.17`, both with public npm
tarball URLs and SHA-512 integrity. No audit exception or incompatible major
override was added.

Hosted Windows run
[31412865931](https://github.com/kathyygong/kinetic/actions/runs/31412865931)
passes clean locked `npm ci`, the zero-vulnerability connected audit, lint,
TypeScript, the complete deterministic frontend smoke suite, production build,
beta readiness, backend compile, 18-group/498-assertion evaluator verification,
backend round-trip/generation/lifecycle smokes, and Firebase Auth/Firestore
owner, cross-user, and anonymous rules. Hosted macOS run
[31412874959](https://github.com/kathyygong/kinetic/actions/runs/31412874959)
passes the complete Swift package suite and unsigned Kinetic simulator build on
the same commit.

The local Microsoft npm mirror still lacks locked `next@16.3.0`, and direct
npmjs access from this Windows host still fails TLS. Those local connectivity
limits are superseded by the green hosted clean-install evidence above. Mac
Batch B is authorized to start from `d5bbfdc`; Phases 5–6 remain open until Mac
Batch B and final Windows integration both complete.

### Mac Batch B implementation checkpoint — updated 2026-08-12

The current `codex/mobile-phase5-6-closeout` worktree now contains the first
native correction slice:

- strict Swift request/response, exact-key, semantic, privacy, fixture, auth,
  malformed-response, and offline parity for `mobile-plan-generation.v1`;
- authenticated `POST /mobile/plan-generation` initial/future networking;
- initial onboarding and future regeneration paths use the shared candidate
  before independent lifecycle preview/commit validation;
- the copied Swift mileage/pace/taper/scheduling generator is removed;
- the SwiftUI plan screen no longer infers build/recovery/taper/race phases and
  renders only shared metadata when it is available;
- onboarding captures optional bounded personal records, saves an incomplete
  draft, shows the shared/lifecycle plan review, and marks onboarding complete
  only after explicit plan confirmation;
- Settings can prepare a separate owner-scoped `kinetic-training-export.v1`
  across the documented training domains while retaining the separately
  labeled foundation receipt;
- the recovered debug QA matrices cover lifecycle completion, transaction
  replay/conflict, offline behavior, deletion boundaries, owner/cross-user
  audit readback, and physical-device backend URL overrides.

Local automated evidence:

```text
Swift package suite: 67/67
Shared-generation/lifecycle focused suite: 8/8
Foundation focused suite: 4/4
Unsigned generic iOS Simulator build: passed
```

Three shared decisions require Windows/shared work before Mac Batch B can
finish safely:

1. Persist authoritative week phase/explanation metadata with a plan version
   and return refreshed metadata for lifecycle edits. Today the metadata is
   lost after relaunch, and Swift deliberately does not recreate it.
2. Define the required bounded-availability shape and persistence/generation
   semantics. The existing contract has preferred days and one-off lifecycle
   availability edits, but no distinct durable onboarding availability field.
3. Define idempotent account cleanup that retains a retryable deletion boundary
   through owner-domain removal and Firebase Auth deletion. The current
   boundary lives in `settings`/`onboarding`, which are themselves deletion
   targets; a client-only finalization would not be durably retryable.

Editable planning inputs/future regeneration confirmation, final account
deletion, metadata-after-relaunch proof, authenticated live readback, and the
physical/accessibility matrix remain open. Do not represent this checkpoint as
Mac Batch B completion or start Phase 7.

At Mac checkpoint `b6604af`, the next implementation lane was Windows/shared
blocker resolution rather than final integration. The checkpoint below records
that resolution; after its hosted handoff is green, Mac consumes it and
completes native proof before mandatory final Windows integration.

### Windows/shared blocker-resolution checkpoint — 2026-08-12

The Windows return after Mac checkpoint `b6604af` resolves the four shared
blockers without changing the v1 wire shapes already consumed by Swift:

- `mobile-plan-generation.v2` and `mobile-plan-lifecycle.v2` store authoritative
  metadata inside the plan snapshot, require `metadata.plan_version` to equal
  the snapshot version, cover every workout exactly once, and recompute shared
  build/recovery/taper/race plus bounded explanation metadata after every
  accepted lifecycle edit;
- legacy workout-only plan snapshots remain accepted as a current plan and gain
  v2 metadata on the next shared regeneration;
- recurring `weekly_availability` is zero to seven unique weekday records with
  no text: omitted means unconstrained, zero minutes means skip, positive
  availability is 15–240 minutes, an empty list clears constraints, and
  `easy_only` prevents shared authority from scheduling a hard workout there;
- lifecycle v2 returns `commit_planning_inputs` with the plan and adds profile,
  goal, and `planning_revision_matches` to the required owner transaction. The
  web transaction adapter reads every precondition before writing all five
  domains, history, and operation receipt;
- authenticated `mobile-account-cleanup.v1` uses a server-only receipt outside
  the owner sweep. Partial domain failures retain pending domains, matching
  operations replay, operation-ID/fingerprint conflicts fail, Auth deletion
  requires an empty domain list and a token authenticated within five minutes,
  and the completed receipt remains durable after identity deletion.

Canonical additions are
`ios/KineticCompanion/Tests/Fixtures/mobile-plan-shared-v2-contract.json`,
`frontend/scripts/smoke-mobile-plan-v2-contract.ts`, and
`backend/evals/mobile_phase5_6_shared_contract_smoke.py`. Local evidence:

```text
Frontend clean npm ci: passed
Frontend lint: passed
Frontend TypeScript: passed
Frontend complete smoke suite: passed
Frontend production build: passed
Connected beta audit: 0 failures, 0 warnings, no moderate/high/critical advisories
Backend compile: passed
Backend evaluator report: 18 groups / 498 assertions
Backend legacy generation/lifecycle/round-trip smokes: passed
Backend v2 metadata/availability/cleanup smoke: passed
Firebase Auth/Firestore owner/cross-user/anonymous plus server-only receipt matrix: passed
```

The implementation is pushed at `46fcbba`. Hosted Windows run
[31637946605](https://github.com/kathyygong/kinetic/actions/runs/31637946605)
passes clean install, connected zero-vulnerability audit, lint, TypeScript,
complete frontend smoke, production build, beta readiness, backend compile,
18-group/498-assertion evaluator verification, legacy plus v2 backend smokes,
and the owner/cross-user/anonymous/server-only-receipt Firebase matrix. Hosted
macOS run
[31637946552](https://github.com/kathyygong/kinetic/actions/runs/31637946552)
passes all 67 Swift package tests and the unsigned Kinetic simulator build on
the same SHA. The branch may now return to Mac to consume v2, finish editable
planning inputs and final deletion, and run authenticated physical/accessibility
proof. Do not start final Windows integration or Phase 7 yet.

### Mac v2 consumption checkpoint — 2026-08-12

Native implementation commit `92bad76` consumes the Windows return:

- strict Swift Codable, exact-key, semantic, privacy, malformed-response, auth,
  and fixture coverage for generation/lifecycle v2 and account cleanup;
- all production plan generation and validation use v2, while v1 decoding is
  retained only for backward-compatible stored-plan migration and fixtures;
- version-bound authoritative metadata is written inside the plan snapshot,
  refreshed from every accepted lifecycle response, and restored after
  relaunch without native phase/taper inference;
- the Firestore commit reads every precondition before atomically writing
  profile, goal, plan, history, and the operation receipt at one planning
  revision; legacy single-operation/history shapes remain readable;
- onboarding and Settings map recurring weekday availability to exactly zero
  or 15–240 minutes plus `easy_only`, never Calendar text. Settings can review
  and change experience, mileage, preferred days, personal records, and weekly
  availability through shared future regeneration and a separate confirmation;
- race distance and race day remain read-only after plan activation because
  the shared lifecycle contract deliberately locks the race workout;
- account deletion saves the local boundary, resumes the server-only cleanup
  receipt using a UID-scoped local pending marker that survives removal of the
  Firestore settings document, shows partial-domain retry state, requests
  password reauthentication when required, and calls `finalize_auth` before
  reporting completion.

Local automated evidence for the current Mac checkpoint:

```text
Swift package suite: 70/70
Shared plan v1/v2 and cleanup focused suite: 11/11
Unsigned generic iOS Simulator build: passed
git diff --check: passed
```

Implementation is no longer blocked on a shared Windows decision. The
authenticated Mac closeout checkpoint below supersedes this remaining-work
list.

### Authenticated Mac closeout checkpoint — 2026-08-12

Native implementation commit `b91269b` closes the remaining defects found by
the authenticated Mac pass:

- v2 lifecycle requests encode required absent preconditions as explicit JSON
  `null`, matching the strict Pydantic contract for initial generation;
- exact operation replay is checked before current-version and planning-
  revision gates, while a different fingerprint and a new stale operation
  continue to fail closed;
- production fractional ISO-8601 timestamps are accepted when account deletion
  creates its durable retry boundary;
- debug-only disposable-owner and deterministic lifecycle/deletion launch
  matrices make the live proof repeatable without adding production policy;
- grouped backgrounds, cards, text, and failure symbols adapt correctly in
  dark mode, and accessibility-size tabs use compact visible titles while
  retaining full VoiceOver labels.

Authenticated evidence used a disposable Firebase email/password owner, the
production owner-only Firestore project, and a local strict-auth FastAPI
backend that verified the Firebase bearer token with public keys. It passed:

```text
Initial v2 shared generation + lifecycle commit: version 1
Five-domain transaction: first commit, exact replay, different-fingerprint conflict, stale-version conflict, relaunch readback; version 6
Lifecycle interaction: preferred-day plus shared-authority-safe skip; version 10
Rejected unsafe lifecycle candidates: visible and non-mutating
Offline lifecycle preview with backend stopped: retained version 10 and surfaced retry state
Privacy-safe audit readback: foundation 9, plan 35; cross-user read denied
Training-data deletion: 9 tombstones; foundation retained; plan absent on readback
Account-deletion boundary: retryable with full pending-domain set; Firebase identity retained; relaunch readback passed
Swift package suite: 71/71
Shared v1/v2 lifecycle and cleanup focused suite: 12/12
Normal signed iPhone SE (3rd generation), iOS 26.3 simulator build/install/launch: passed
Signed generic iOS device build with Apple Development identity: passed
Dynamic Type accessibility XXXL + increased contrast + dark mode: passed
Small-screen standard/light and landscape Settings traversal: passed
Simulator error/fault log after final launch: clean
git diff --check: passed
```

The real Firebase plist remained ignored and is not part of either commit.
Two external checks could not be completed on this host: the paired iPhone 17
is reported `unavailable`, so physical install/launch and hands-on VoiceOver
order remain unverified; and the strict public-key backend deliberately has no
Firebase Admin credential, so the server-only cleanup receipt could not sweep
the disposable identity live. The account remains at the proven retryable
boundary rather than being reported deleted. Deterministic client/server tests
and the Windows Firebase matrix cover the cleanup contract, but these external
checks remain release evidence, not reasons to weaken the implementation.

Mac implementation was ready for mandatory final Windows integration. The
completed Windows pass below carries these external evidence items explicitly;
it does not mark Phases 5–6 complete merely because shared/hosted gates are
green. Do not start Phase 7.

### Final Windows integration — green 2026-08-17

Final integration consumed Mac implementation `b91269b` and documentation
checkpoint `1345d5f` without changing the native fixes. The connected audit
published a new high-severity Nano ID advisory after the Mac handoff, so the
combined tree pins the compatible patched `nanoid@3.3.18` release without an
audit exception or major-version override. The exact validated implementation
commit is `ead3f2a`.

Local Windows evidence on that tree:

```text
Locked npm ci: passed; 435 packages; 0 vulnerabilities
Connected beta audit: 0 failures, 0 warnings, 14 checks
ESLint: passed
TypeScript no-emit compile: passed
Complete deterministic frontend smoke suite: passed
Next.js 16.3.0 production build: passed; 18 static routes
Beta readiness: passed (connected audit recorded separately)
Backend Python 3.12 compileall: passed
Backend deterministic evaluator: 18 groups, 498 assertions
Backend round-trip, generation, lifecycle, and shared-v2 smokes: passed
Firebase Auth/Firestore owner, cross-user, anonymous, tombstone, and server-only cleanup-receipt matrix: passed
git diff --check: passed
```

Hosted Windows run
[32074940278](https://github.com/kathyygong/kinetic/actions/runs/32074940278)
passes the clean install, connected zero-vulnerability audit, frontend gates,
production build, backend gates, and complete Firebase emulator matrix. Hosted
macOS run
[32074955020](https://github.com/kathyygong/kinetic/actions/runs/32074955020)
passes all 71 Swift package tests and the unsigned Kinetic simulator build.
Both runs use exact SHA `ead3f2a0f6a4d8305818573ad99c9d30ed458489`.

Mandatory final Windows integration is complete. Phases 5–6 remain open only
for the explicitly external physical-iPhone install/launch, hands-on VoiceOver
order, and Firebase-Admin-backed live identity-cleanup proof. The paired iPhone
and Admin credential were unavailable, so none of those checks is represented
as passed. Do not merge, start the pre-Phase-7 product-evidence gate, or begin
Phase 7 until the required external evidence is collected.

### Product-owner closeout reprioritization — 2026-08-31

Base functionality now takes priority over pre-user release hardening. The
physical-iPhone install/launch and hands-on VoiceOver checks remain explicitly
unverified and move to Phase 8 user-ready hardening; this is a deferral, not a
pass. Firebase-Admin-backed live identity cleanup is the sole remaining Phase
5–6 closeout gate because complete, retry-safe account deletion is part of the
base privacy and data-control functionality.

After live cleanup proves an empty pending-domain receipt and deleted Firebase
identity, update the evidence and close Phases 5–6. Phase 7 then starts with
native progress/history before the EventKit Calendar slice. The moderated
3–5-runner product-evidence gate follows the Phase 7 base feature set and still
blocks external beta, but it no longer blocks Phase 7 implementation.

### Live Firebase Admin cleanup — passed 2026-08-31

The one-time cleanup run first performed a read-only target check. Exactly one
live `kinetic-phase56-*` disposable identity had the expected deletion boundary
and no server receipt; its client boundary listed 11 pending domains. The
existing `mobile-account-cleanup.v1` coordinator then created the durable
server-only receipt, swept all 18 authoritative owner domains, and finalized
Firebase Auth deletion.

Post-cleanup verification passed:

```text
Durable receipt status: completed
Durable receipt auth state: deleted
Pending domains: 0
Remaining authoritative owner domains: 0
Firebase Auth identity present: no
```

No cached credential value, user identity, or account content was printed or
committed. With this base data-control gate complete, Phases 5–6 are closed.
Physical-iPhone install/launch and hands-on VoiceOver remain unverified Phase 8
release-hardening work under the product-owner deferral above.

## Phase 5 native implementation checkpoint — 2026-08-03

Native Phase 5 implementation is committed at `bfbaaef` as an explicit
implementation checkpoint. By owner decision, the phase is not marked
complete: the remaining authenticated and physical-device gates below are
deferred into one combined Phase 5–6 proof pass before merge or Phase 7.

Implemented:

- migrated the app target, product, and shared scheme from proof-era
  `KineticCompanion` to `Kinetic`; retained the registered
  `com.kinetic.companion` bundle identifier, existing development team,
  Firebase plist contract, HealthKit entitlement, project path, source module,
  and package tests so signing and cross-platform fixture paths do not break;
- added strict Swift Codable/semantic parity for `mobile-foundation.v1` and
  deterministic parity for `mobile-notification.v1`;
- added paired owner-scoped `settings`/`onboarding` persistence with optimistic
  revision checks, legacy proof-state detection, copy-then-validate migration,
  and rejection of mismatched paired state;
- added Firebase account creation, verification-email request, password
  recovery, sign-in, returning-session restoration, actionable fixed auth
  failures, sign-out, and account-switch-safe in-memory clearing;
- replaced the single proof shell with permanent Today/Plan/Progress/Settings
  tabs and persisted route restoration; Plan and Progress are honest Phase 6/7
  placeholders rather than alternate authorities;
- added native onboarding summary inputs and progressive Health,
  notification, and deferred-Calendar education; Calendar remains deliberately
  deferred without EventKit behavior;
- added the opt-in local-only evening reminder with the shared fixed generic
  copy, explicit permission request, stable local-day identifier, and
  cancellation on opt-out/denial/account-deletion request;
- added privacy/support/foundation-export, training-data tombstone sweep, and
  retryable account-deletion-boundary controls; account deletion does not claim
  completion while owner-domain cleanup or Firebase reauthentication remains;
- added bounded `mobile_foundation_lifecycle` native audit encoding.

Automated/local evidence:

```text
Date: 2026-08-03
Branch source: codex/mobile-phase5-6-contracts at bfbaaef
macOS/Xcode: current Mac; Xcode 26.3 (17C529)
Focused Phase 3.5 entry tests: BehaviorPatternContractFixtureTests 4/4; MobileAuditModelsTests baseline 5/5
Baseline complete Swift suite: 52/52
Phase 5 focused Swift tests: 4/4
Phase 5 complete Swift suite: 57/57
Unsigned simulator build: clean Kinetic scheme build passed
Small-screen launch: iPhone SE (3rd generation), iOS 26.3.1 passed
Accessibility launch: accessibility XXXL + increased contrast rendered the signed-out foundation in a scrollable Form
Signed generic-device build: blocked; local Xcode account credentials/profile are unavailable even with -allowProvisioningUpdates
```

The continuation pass tightened the persistence boundary after automated
review found that synthesized Swift encoding omitted the contract-required
explicit `null` values for `requested_at` and `legacy_revision`. Custom
encoding now preserves both keys, the Firestore restore path rejects unknown
keys at every foundation nesting level, onboarding answers are bounded before
owner-scoped goal/profile writes, and the focused/full suites pass at 4/4 and
57/57. A concrete ad-hoc-signed iPhone SE simulator build installs and launches
cleanly at accessibility XXXL with increased contrast; its error/fault log is
clean after removing a premature Firebase configuration lookup.

Deferred gates required before declaring Phases 5–6 complete or starting Phase 7:

- complete onboarding fields and flow: optional personal records, bounded
  availability, shared-authority plan preview, confirmed summary, and editable
  Profile/Settings planning inputs;
- replace the foundation-only receipt with documented owner-scoped
  training-data export, or retain the receipt as a separately labeled artifact;
- authenticated pattern-card VoiceOver order/labels, landscape, and small-screen
  traversal on the carried Phase 3.5 surface;
- authenticated new-account, recovery, returning-session, sign-out, and
  account-switch interaction/readback;
- authenticated onboarding denied/deferred/notification opt-in, permanent-tab
  route restoration, deletion retry/tombstone, and `/qa/mobile` privacy
  readback;
- signed physical-device build/install/launch and the affected foundation
  VoiceOver, Dynamic Type, landscape, and small-screen matrix;
- restore a valid Xcode account/provisioning profile for
  `com.kinetic.companion` without changing bundle identity or entitlements.

## Phase 6 native implementation checkpoint — 2026-08-03

Implemented after the Phase 5 checkpoint:

- strict Swift request/response, exact-key, explicit-null, semantic, and
  privacy validation for `mobile-plan-lifecycle.v1`;
- a native deterministic proposal builder copied from the shared
  plan-generator rules. This historical checkpoint includes full
  volume/taper/pace/scheduling authority in Swift and is therefore explicitly
  nonconforming; Mac Batch B must replace its generation paths with the shared
  service;
- authenticated finite-deadline `POST /mobile/plan-lifecycle` networking;
- a real Plan tab for native generate, preview, explicit confirm, save/browse,
  move, shorten, replace, skip, availability, preferred-day, future
  regeneration, pause, and resume paths;
- replaced the Phase 3.5 preferred-day pattern Safari handoff with that same
  native validator/transaction review path and success audit;
- persistence of only `commit_ready` packages in one owner-scoped Firestore
  transaction across `plan`, `plan_history`, and `plan_operations`, with a
  deletion-boundary read, current-version equality, exact replay, and
  different-fingerprint idempotency conflict handling;
- fail-closed legacy-plan detection: proof-era data remains untouched until
  the runner approves a backend-validated native replacement, then the raw
  prior payload is retained in `plan_history` for recovery;
- bounded `mobile_plan_lifecycle` native audit output with no operation ID,
  fingerprint, workout content, date, goal, identity, or health fields.

Automated/local evidence:

```text
Phase 6 focused Swift tests: 7/7
Complete Swift suite: 65/65
Unsigned generic iOS Simulator build: passed
Concrete iPhone SE (3rd generation), iOS 26.3.1 build/install/launch: passed
Simulator error/fault log after launch: clean
```

The Swift gates cover canonical fixture parity, exact endpoint/auth behavior,
malformed/privacy/persistence rejection, every lifecycle action, the temporary
native generation implementation, stable SHA-256 fingerprints, stale-version
conflict, exact-operation replay, different-fingerprint conflict, missing auth,
and offline failure. The backend remains storage-neutral; SwiftUI never writes
a proposal directly. These tests do not make Swift generation authoritative;
the generation code must still be removed.

Historical open items at that checkpoint (superseded above):

- Windows Batch B shared generation, authoritative phase metadata, hardened
  action deltas/full-plan invariants, and adversarial lifecycle regressions;
- Mac Batch B removal of full native generation and display-only phase/taper
  inference;
- authenticated owner generate/preview/commit/browse and all-action live
  readback against the reachable backend and Firestore;
- owner-only transaction, same-operation retry, cross-user denial, deletion
  boundary, legacy replacement, and `/qa/mobile` privacy readback;
- rejected spacing/race/completed-history UI and offline retry interaction;
- the combined Phase 5–6 VoiceOver, Dynamic Type, contrast, landscape,
  small-screen, and signed physical-device matrix.

## Combined closeout pass — 2026-08-05 (historical)

The Mac closeout reran every automated gate then available and closed the
dependency and unsigned-runtime portions of the proof pass. It added useful
owner-isolation coverage, but it did not close deterministic authority because
full generation remained duplicated in Swift.

Passed in this pass:

```text
Swift package suite: 65/65
Frontend ESLint: passed
Frontend TypeScript compile: passed
Frontend complete smoke suite: passed
Frontend Next.js 16.3.0 production build with non-secret demo Firebase config: passed
Backend Python 3.12 compileall: passed
Backend deterministic round-trip smoke: passed
Backend mobile plan authority/strict-auth HTTP smoke: passed
Firebase Auth + Firestore emulator owner/cross-user/anonymous rules suite: passed
Connected npm audit: 0 vulnerabilities
iPhone SE (3rd generation), iOS 26.3 simulator clean build/install/launch: passed
Standard and Accessibility XXXL, dark mode, and increased-contrast signed-out layouts: rendered without an app crash or fault
```

The emulator suite proves authenticated owner access and cross-user/anonymous
denial for foundation, plan, plan-history, plan-operation, readiness, check-in,
health-sync, audit, and tombstone documents. The Swift/backend suites prove all
eleven plan actions plus stale-version, exact replay, different-fingerprint,
completed-history, race-day, spacing, malformed-response, missing-auth, and
offline failure behavior. These automated results do not substitute for the
still-required native authenticated interaction and atomic live-readback gate.

The connected advisory feed published newer findings after the Windows pass.
The closeout updates Next/eslint-config-next to 16.3.0, PostCSS to 8.5.23,
minimatch to 10.2.5, and brace-expansion to 5.0.9. A clean `npm ci`, complete
frontend regression pass, production build, emulator rules suite, and connected
zero-vulnerability audit all pass on the updated lockfile.

External blockers observed on 2026-08-05:

- the paired iPhone 17 is available, but `security find-identity` reports zero
  valid signing identities;
- `xcodebuild -allowProvisioningUpdates` fails with `No Accounts` and no
  development profile for `com.kinetic.companion`;
- macOS denies Simulator landscape automation because the invoking process has
  not been granted Accessibility control.

These blockers describe the 2026-08-05 host state. The authenticated Mac
checkpoint above supersedes them: signing, authenticated readback, rejected/
offline UI, landscape, and simulator accessibility now pass. Physical install
and hands-on VoiceOver remain unavailable because the paired device is offline.
Do not change the bundle identity or entitlements to work around that external
hardware state.

## Continuation prompts

Phases 5–6 are complete. The next implementation lane starts with:

> Continue Mobile Phase 7 progress implementation.

That prompt means: start with native recent workout/check-in history, recovery
trend, weekly summary, and learned-preference review. Follow with the bounded
EventKit Calendar slice. Do not treat deferred physical-device, VoiceOver, or
moderated-user evidence as passed; they remain Phase 8 gates.

The completed final Windows integration session was started with:

> Continue Windows Phase 5-6 implementation.

It produced green implementation commit `ead3f2a` and the exact hosted runs
recorded above. That Phase 5–6 implementation lane is now closed; the older
prompts retained below are historical traceability only.

The completed Windows/shared blocker-resolution session was previously started
with:

> Continue Windows Phase 5-6 implementation.

At that historical checkpoint the phrase meant: fetch
`codex/mobile-phase5-6-closeout`, fast-forward
only to its latest pushed commit, read this handoff plus
`MOBILE_FOUNDATION_PLAN_CONTRACT.md`, `MOBILE_APP_PLAN.md`, `BUILD_PLAN.md`,
`QA_MATRIX.md`, `ARCHITECTURE.md`, and `ios/KineticCompanion/README.md`, and
perform the Windows/shared blocker-resolution pass below. It does not mean the
older Batch B work at `d5bbfdc`, does not authorize Phase 7, and does not mean
the final Windows integration gate can run before Mac consumes the resulting
contracts.

Completed Windows/shared blocker-resolution prompt:

> Continue Kinetic Mobile Phases 5–6 Windows/shared implementation on
> `codex/mobile-phase5-6-closeout`. Preserve the green Mac checkpoint and its
> strict Swift boundary. Resolve the documented shared blockers in this order:
>
> 1. Extend the shared plan storage/lifecycle contract so authoritative
>    generation week phase and bounded explanation metadata are version-bound,
>    written atomically with the plan transaction, returned or recomputed by
>    shared authority after every lifecycle edit, and restored after relaunch.
>    Add migrations/backward compatibility for existing workout-only plans.
> 2. Define one privacy-safe bounded weekly availability model, using explicit
>    weekday values and existing bounded minute/easy-only concepts where
>    compatible. Specify skip/clear behavior and how initial generation,
>    future regeneration, profile edits, lifecycle validation, and persistence
>    consume it. Do not send raw Calendar events or free text.
> 3. Add an authenticated, owner-scoped, idempotent account-cleanup boundary
>    that can resume after partial Firestore cleanup and safely coordinate
>    Firebase Auth deletion/reauthentication without deleting its own only
>    retry receipt prematurely. Never report completion while domains remain.
> 4. Define the coordinated write/version behavior for changed planning inputs
>    plus their regenerated plan so Settings cannot leave profile and plan in
>    contradictory partial state.
>
> Update TypeScript and Pydantic schemas, FastAPI routes, canonical fixtures,
> persistence adapters, Firestore rules/indexes if required, web consumers,
> migrations, privacy-safe audits, and deterministic negative/replay/conflict
> tests. Keep generation and lifecycle validation as shared authority. Run the
> complete frontend/backend suites, dependency audit, generation/lifecycle
> smokes, Firebase Auth/Firestore emulator matrix, and hosted Windows workflow;
> run the hosted macOS contract/build workflow to catch Swift fixture drift.
> Record exact evidence in all Phase 5–6 docs, commit and push the result to the
> same closeout branch, and hand it back to Mac. Do not claim Phases 5–6
> complete and do not start the final Windows integration yet.

The completed Mac Batch B session was started with:

> Continue Mobile Phase 5–6 Mac implementation.

At that checkpoint the phrase meant: fetch and fast-forward
`codex/mobile-phase5-6-closeout`, read this handoff and every referenced
contract/roadmap document, start from the latest pushed descendant of the green
Windows/shared handoff descendant of Mac checkpoint `b6604af`, and execute the
remaining Mac Batch B prompt
below. The short phrase does not authorize Phase 7, shared-contract redesign,
or skipping any closeout evidence.

Completed Mac Batch B starting prompt:

> Continue Kinetic Mobile Phases 5–6 Mac Batch B on
> `codex/mobile-phase5-6-closeout`. Start from the latest green pushed
> Windows/shared handoff descendant of `b6604af` (`git fetch origin`, switch to
> the branch, and fast-forward only).
> Read `MOBILE_PHASE5_6_HANDOFF.md`, `MOBILE_FOUNDATION_PLAN_CONTRACT.md`,
> `MOBILE_APP_PLAN.md`, `BUILD_PLAN.md`, `QA_MATRIX.md`, `ARCHITECTURE.md`, and
> `ios/KineticCompanion/README.md` before editing. Treat the FastAPI
> v1/v2 generation and lifecycle endpoints, canonical fixtures, coordinated
> owner-only persistence package, server-only cleanup receipt, and bounded
> audit schemas as fixed Windows/shared authority. Do not recreate plan
> generation, phase, taper, or safety policy in Swift, and do not change shared
> backend/web contracts unless a concrete cross-platform defect makes that
> unavoidable; if one does, document it and return it to Windows rather than
> silently broadening native scope.
>
> Implement the remaining native closeout in this order: add strict v2 Codable
> parity; persist and restore version-bound shared metadata; map native weekly
> availability to the weekday/0-or-15–240/easy-only contract; commit changed
> planning inputs and regenerated plan through the coordinated v2 transaction;
> finish retryable owner-domain plus Firebase Auth account deletion through
> `mobile-account-cleanup.v1`;
> then complete lifecycle preview/commit/readback, conflict/replay/offline and
> rejected-invariant UI, privacy-safe `/qa/mobile` evidence, and owner versus
> cross-user checks. Preserve completed/race history, operation fingerprints,
> bundle identity, entitlements, and the existing foundation-receipt label.
>
> Run focused and complete Swift tests, the unsigned simulator build/launch,
> authenticated disposable-owner readback, VoiceOver/Dynamic Type/contrast/
> landscape/small-screen checks, and signed physical-device build/install/
> launch where credentials and hardware permit. Record genuine external
> signing/accessibility blockers without weakening the acceptance criteria.
> Update the handoff, build plan, QA matrix, architecture, and iOS README with
> exact evidence; commit and push Mac Batch B to the same branch; do not start
> Phase 7. Hand the pushed Mac closeout commit back to Windows for mandatory
> final integration.

The completed mandatory final Windows integration task was invoked with:

> Continue Windows Phase 5-6 implementation.

At that checkpoint the phrase meant: fetch and fast-forward
`codex/mobile-phase5-6-closeout` through Mac implementation commit `b91269b`
and its following documentation commit; read this handoff plus every referenced
contract/roadmap document; run the complete frontend/backend, connected
dependency-audit, Firebase emulator, hosted Windows, and hosted macOS gates on
the combined tree; reconcile the evidence without changing the native fixes;
and record exact final SHAs and run URLs. Carry the unavailable physical-iPhone,
hands-on VoiceOver, and Admin-backed live cleanup checks as explicit external
release evidence. Do not mark Phases 5–6 complete while those required items or
either hosted job remain open, and do not start Phase 7. It completed at
validated implementation commit `ead3f2a` with hosted Windows run `32074940278`
and hosted macOS run `32074955020`.

## Phase 5 checkpoint evidence

- Final product/target/scheme/bundle identity and migration result.
- Firebase Auth new-account, recovery, returning-session, sign-out, and
  account-switch results.
- `mobile-foundation.v1` Swift Codable fixture tests.
- Today/Plan/Progress/Settings route and restoration results.
- Onboarding captures goal, race date, experience, mileage, optional personal
  records, preferred training/long-run days, and bounded availability; it shows
  a shared-authority plan preview and confirmed summary before completion.
- Onboarding with each permission denied/deferred plus notification opt-in.
- Profile/Settings can review and change the same bounded planning inputs
  without requiring the web.
- Training-data export contains the documented owner-scoped runner domains;
  the foundation receipt is not represented as full training-data export.
- Training-data deletion and account-deletion retry/tombstone results.
- Deferred authenticated pattern-card and affected foundation VoiceOver,
  Dynamic Type, landscape, and small-screen evidence.
- Unsigned simulator build/launch and signed physical-device
  install/launch evidence.

## Phase 6 closeout evidence

- Swift Codable fixture parity for `mobile-plan-lifecycle.v1`.
- Generate/preview/commit and browse/readback on the authenticated owner.
- Move, shorten, replace, skip, availability, preferred-day confirmation,
  future regeneration, pause, and resume.
- Stale-version conflict, same-operation replay, different-fingerprint
  idempotency conflict, offline/retry, and rejected invariant UI.
- Completed-history, race-day, mileage/spacing/taper, availability, and
  preferred-day preservation checks.
- Adversarial lifecycle proposals cannot use availability, preferred-day,
  replace, or regeneration actions to change unrelated load/status fields.
- Shared phase/taper metadata renders identically on web and iOS; no Swift
  planning or display heuristic independently assigns plan phases.
- Owner-only `plan`, `plan_history`, and `plan_operations` transaction
  readback plus cross-user denial.
- Privacy-safe `/qa/mobile` readback for foundation and plan lifecycle events.
- Simulator and physical-device proof that normal plan ownership no longer
  requires the web.

## Phase boundary and deferred release evidence

Phases 5–6 are complete after green final Windows integration and the recorded
Firebase-Admin-backed live cleanup. Physical-iPhone and hands-on VoiceOver
evidence is deferred to Phase 8 and must remain labeled unverified. Start Phase
7 with native progress/history, then run the separate early Mac EventKit spike
rather than encoding unproven permission/free-busy behavior into shared
schemas.

After the Phase 7 base feature set exists, run a small moderated
product-evidence gate with 3–5 target runners before external beta. The Mac
lane owns signed build installation and moderated native sessions; the
Windows/shared lane owns privacy-safe audit/readback support. Capture onboarding
completion, plan-preview confirmation, independent Today/check-in use, and any
web/developer handoff. This gate does not block Phase 7 implementation, is not
an external beta, and must not expand scope.
