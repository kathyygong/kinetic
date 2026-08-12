# Kinetic Mobile App Plan

## Strategy

Kinetic should become a user-ready native iOS product without duplicating the
web implementation or weakening the deterministic training authority. The
completed initial mobile proof retired the highest-risk HealthKit, Firebase, Today,
intake, check-in, and behavior-learning assumptions. The remaining mobile
roadmap now closes the complete runner journey from account creation through
plan ownership, daily use, progress review, and data control.

The web app remains the architecture proof, demo, admin, QA/eval, advanced
What-if, and beta-operations surface. A normal runner must not need the web to
create an account, onboard, generate and safely edit a plan, connect Apple
Health and Calendar, follow Today, check in, review recent progress, or manage
their data.

Platform priority:

- Native iOS is Kinetic's primary user-facing product.
- Core runner functionality is designed mobile-first and is not considered
  product-complete when it exists only on web.
- Deterministic planning, validation, persistence, auth, schemas, and evals
  remain shared platform capabilities rather than being duplicated in Swift.
- Web may provide deeper or earlier operator/analysis surfaces, but it is a
  secondary runner surface and the primary admin/demo/QA/eval surface.

## Product Boundary

Mobile-first:

- Account creation, recovery, sign-in, session restoration, and sign-out.
- Native onboarding for goal, race date, experience, mileage, personal
  records, training-day preferences, availability, permission education, plan
  preview, and confirmation.
- Permanent Today, Plan, Progress, and Settings navigation.
- HealthKit readiness sync from bounded daily summaries.
- Native Today surface with workout, readiness, freshness, confidence, and one
  clear action.
- Apple Calendar free/busy ingestion using on-device EventKit summarization.
  Event titles, descriptions, attendees, and locations must not leave the
  device.
- Full native plan lifecycle: generation, preview, save, week/workout review,
  bounded move/shorten/replace/skip actions, future-week regeneration,
  pause/resume, and change explanation. Deterministic validation remains the
  only mutation authority.
- Bounded natural-language intake for schedule, availability, goal, and
  preference updates, with review-only drafts and deterministic validation
  before anything can apply. Recovery, pain, missed-workout, and reflection
  language should route to guided bounded check-in flows instead of ending in
  warnings.
- Recovery and post-workout check-in loop.
- Recent workout/check-in history, recovery trend, concise weekly summary, and
  learned-preference review.
- Account, sync, permission, privacy, export, delete/disconnect, support, and
  notification controls.

Remain web:

- What-if exploration.
- Deep monthly analytics and advanced planning experiments.
- Demo tools, admin proof, eval reports, and beta operations.
- Admin/QA/eval dashboards for mobile-originated events. The safety checks are
  shared P0 infrastructure; only the reviewer-facing screen stays web. The
  local audit route is `/qa/mobile`.

Deferred:

- Full two-way Calendar synchronization; v1 may offer explicit one-way workout
  export only after read-side availability is stable.
- Garmin, Oura, hosted AI, coach sharing, social/team features, and broad
  notification workflows.
- Apple Watch, widgets, Live Activities, Android, and payments/subscriptions
  unless a beta business decision requires them.
- Open-ended AI chat, arbitrary workout authoring, and autonomous AI plan
  mutation.
- Raw HealthKit sample upload.

## User-Ready Native Completion

Mobile is complete only when an external runner can:

1. install the app, create or recover an account, and finish onboarding;
2. understand and independently grant or deny HealthKit, Calendar, and
   notification permissions;
3. generate, preview, save, browse, and safely edit a training plan without
   visiting the web;
4. receive a calendar-aware Today recommendation with honest freshness and
   fallback behavior;
5. complete the recovery/workout check-in loop and review recent progress;
6. change goals, preferences, availability, permissions, and notification
   settings;
7. export or delete training data and delete the account;
8. recover safely from offline, stale, revoked-permission, partial-sync,
   schema-migration, and retry states.

Completion also requires the production backend/environment, accessibility
matrix, device/OS matrix, privacy disclosures, monitoring, feature flags,
rollback, TestFlight distribution, and support path needed for an external
beta. Passing on a developer device alone is not mobile completion.

## Windows And Mac Delivery Model

Mobile delivery uses two coordinated implementation lanes:

- Windows/shared lane: contracts, backend APIs, deterministic planning and
  validation, Firebase domains/rules, canonical fixtures, TypeScript/browser
  models, privacy-safe observability, QA/admin readback, and hosted integration.
- Mac/native lane: Swift models/adapters, SwiftUI product flows, Apple
  frameworks, entitlements/signing, simulator/device behavior, accessibility,
  and physical-device proof.

Batching is encouraged inside a coherent dependency set, but the roadmap must
not implement every remaining Windows phase before exercising the native app.
SwiftUI navigation, onboarding, EventKit, permissions, background behavior,
and device UX can invalidate shared assumptions if native validation is
deferred too long.

Recommended cadence:

1. Complete the Windows/shared contracts and harnesses for a coherent native
   batch, normally one phase and at most two tightly coupled phases.
2. Commit and push one authoritative branch with a copy-ready Mac handoff.
3. Stay on Mac long enough to implement and close those native phases
   sequentially, using simulator and physical-device checkpoints without
   returning to Windows between every small task.
4. Return to Windows for final shared integration, hosted CI, documentation,
   and the next dependency batch.

For the current roadmap:

- Windows Batch A defined Phase 5 onboarding/settings/auth contracts and the
  Phase 6 lifecycle validator on 2026-07-30. Mac checkpoints `bfbaaef`,
  `f52dc39`, and `1435369` implemented most native surfaces but also copied the
  plan generator into Swift and left authenticated physical closeout open.
- Windows Batch B on `codex/mobile-phase5-6-closeout` has implemented
  authenticated `mobile-plan-generation.v1`, migrated production web
  generation to it, chained its output through the independent lifecycle
  validator, hardened action-specific deltas/full-plan invariants, added shared
  week-phase metadata and adversarial regressions, and defined hosted macOS CI
  plus branch/workflow routing. Hosted macOS Swift/simulator proof is green in
  run 31412874959. JS-YAML is patched to 4.3.1, Nano ID to compatible 3.3.17,
  and hosted Windows run 31412865931 passes the complete shared integration
  stack with a zero-vulnerability audit. Windows Batch B is complete at
  `d5bbfdc`; Mac Batch B is now authorized to start from that commit.
- Mac Batch B then removes Swift generation and native phase/taper heuristics,
  completes personal-record/availability onboarding plus plan preview/summary,
  profile/settings editing, full training-data export, and account deletion,
  and completes authenticated simulator/physical-device and accessibility
  proof.
- The follow-up Windows/shared pass after Mac checkpoint `b6604af` now defines
  backward-compatible `mobile-plan-generation.v2` and
  `mobile-plan-lifecycle.v2`: version-bound metadata refreshed by shared
  lifecycle authority, privacy-safe recurring weekday/minute/easy-only
  availability, one transaction package for planning inputs plus plan, and
  retry-safe `mobile-account-cleanup.v1` with a server-only durable receipt.
  Local frontend/backend/audit/emulator gates are green; Mac must consume these
  contracts and finish native/live/device proof before final Windows integration.
- Mac implementation `b91269b` consumes and live-validates those contracts with
  a disposable authenticated owner. Initial generation, the five-domain
  commit/replay/conflict/relaunch matrix, preferred-day/skip lifecycle edits,
  non-mutating rejection, offline retry, audit privacy/cross-user denial,
  training-data tombstones, and retry-boundary relaunch pass. The 71-test Swift
  suite, signed simulator, accessibility XXXL/contrast/landscape small-screen
  layouts, clean runtime log, and signed generic-device build also pass.
  Physical install/hands-on VoiceOver and Admin-backed final identity cleanup
  remain explicit external evidence because hardware and credentials were
  unavailable.
- A final return to Windows is mandatory for documentation reconciliation,
  complete shared/emulator/dependency gates, and green hosted Windows and
  macOS integration runs. Only final Windows reconciliation with both hosted
  jobs green can close Phases 5–6.
- After Phase 5–6 closeout, run a moderated 3–5-runner product-evidence gate
  before committing to the full Phase 7 build. Mac owns signed native sessions;
  Windows/shared owns privacy-safe audit/readback. This is not external beta.
- Phase 7 should start with an early Mac EventKit spike before its Windows
  contract is frozen; Apple permission and calendar behavior are the dominant
  uncertainty.
- Phase 8 runs on both lanes continuously and closes only after hosted shared
  gates plus Mac simulator/device and external-user evidence pass.

To resume the next lane, say only `Continue Windows Phase 5-6 implementation.`
The phrase expands to the mandatory final Windows integration instructions in
`MOBILE_PHASE5_6_HANDOFF.md`. Do not begin Phase 7 EventKit behavior until that
integration is green, the carried external Mac checks are resolved, and the
pre-Phase-7 product-evidence gate has passed.

## Browser UX Prototype

The web app includes a browser-viewable prototype at `/mobile-companion`. It is
not a production training surface and does not touch user state. Use it to
review and regression-test the mobile-first Today hierarchy, HealthKit sync
states, calendar freshness/conflict states, bounded AI intake review,
deterministic validation language, check-in actions, and notification
candidate alongside the native SwiftUI implementation. The Today decision
model is covered by the default
frontend smoke suite, including profile, goal, saved plan, readiness,
health-sync freshness, calendar freshness, preferences, and workout-history
inputs. The prototype also exposes stable test hooks plus an optional
`npm run smoke:mobile-browser` gate for visual/e2e browser coverage.

## Native Implementation

The iOS implementation lives in `ios/KineticCompanion`. It contains the
checked-in Xcode project, SwiftUI Health sync surface, schema-aligned Codable
models, deterministic readiness conflict rules, HealthKit summarization,
Firestore transactions, HealthKit entitlement, shared scheme, and Swift
package tests. A canonical JSON fixture is consumed by both TypeScript smoke
coverage and Swift package tests so the web and native contracts cannot drift
silently. The first physical-device proof and future Mac rerun checklist live
in [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md).

Phase 1 native proof status, 2026-07-16:

- Shared readiness, health-sync, and tombstone envelopes validate against the
  bounded mobile contract.
- TypeScript and Swift tests consume the same five conflict cases: first sync,
  manual precedence, CSV precedence, fresh HealthKit merge, and stale
  HealthKit rejection.
- The Windows TypeScript proof passes, including explicit rejection of a raw
  HealthKit sample field.
- The web Firebase hydration boundary validates mobile-originated `readiness`
  and `health_sync` envelopes before they can update local dashboard state.
- Firebase Auth/Firestore emulator coverage passes for owner reads/writes,
  cross-user denial, unknown-domain denial, and readiness/health-sync
  tombstones.
- Swift package tests pass on macOS, and the SwiftUI/Firebase/HealthKit target
  builds and runs on a physical iPhone.
- Read-only HealthKit permission, bounded local summarization, Firestore sync,
  same-user web readback, retry behavior, and authoritative web tombstones were
  proven end to end. The dated evidence is recorded in
  [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md).

The general web, backend, contract, and planning work can resume from the
original Windows environment. Return to macOS/Xcode only when a later task
changes native Swift code, Xcode capabilities/signing, HealthKit behavior, or
requires another physical-device proof.

Phase 2A shared contract status, 2026-07-16:

- The authenticated request derives the current plan slot, latest complete
  readiness, rolling HRV baseline, bounded workout history, confirmed
  preferences, and calendar availability/freshness without identity or raw
  notes.
- Missing calendar uses the planned workout duration as an explicit
  caller-authoritative fallback; a real zero-minute window survives unchanged,
  and missing calendar lowers backend confidence.
- Strict response validation keeps the deterministic decision authoritative
  and discards malformed optional AI reasoning.
- The privacy-minimized same-day cache is fresh for six hours, visibly stale
  after that, and unusable after 24 hours or a local-day change.
- Auth, offline, timeout, backend, malformed-response, and missing-context
  failures map to stable mobile states and privacy-safe observability fields.
- TypeScript and the native Swift implementation share the canonical fixture
  at `ios/KineticCompanion/Tests/Fixtures/mobile-today-contract.json`.
- The detailed contract and Mac handoff are documented in
  [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md).

Phase 2A native implementation status, 2026-07-17:

- Swift reconstructs the canonical request from owner-scoped Firebase domains,
  calls authenticated `POST /decision`, validates wrapped and legacy
  responses, and discards malformed optional AI copy.
- The privacy-minimized decision cache enforces the six-hour fresh,
  same-day stale, 24-hour maximum, and local-day expiry rules.
- SwiftUI Today renders live, fresh/stale cache, missing-readiness,
  signed-out, offline, timeout, backend, and invalid-response states.
- Native decision events write a capped privacy-safe owner-only audit log that
  `/qa/mobile` can read without exposing the Firebase UID or health values.
- Package tests, simulator build, signed-out simulator launch, signed
  physical-device build/install, strict authenticated live decision,
  zero-minute calendar conflict, fresh same-day cache fallback, and live
  `/qa/mobile` readback pass.
- An explicit confirmed `Reconnect Apple Health` action starts new readiness,
  health-sync, and privacy-safe audit epochs after account deletion. Routine
  sync still treats tombstones as authoritative and cannot resurrect deleted
  data.

Integration status, 2026-07-20:

- Phase 2A commits are fast-forwarded into `main` and pushed to `origin/main`.
- Windows frontend lint, TypeScript, deterministic smoke, production build,
  beta-readiness, backend compile/gates/smoke, and Firestore emulator rules
  pass against the integrated source.
- Phase 2.5 implementation and physical-device proof are complete and the
  final Windows frontend/backend/Firebase revalidation passed before
  fast-forward integration into `main`. Its contract and Mac evidence are
  documented in
  [MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md).

Phase 2.5 shared-contract status, 2026-07-20:

- Windows Part A is complete on `codex/mobile-intake-contract`.
- The existing authenticated `POST /ai/parse-intake` endpoint now accepts the
  strict `mobile-intake.v1` request while preserving legacy web intake.
- Every supported note maps to a tagged bounded destination; schedule,
  availability, travel, workout-swap, goal, and preferred-day changes are
  review-only drafts.
- Recovery, pain/injury, missed-workout, reflection, explanation,
  clarification, unsupported, and unsafe notes cannot create hidden health,
  completion, medical, or mutation state.
- The canonical cross-platform fixture and deterministic frontend/backend
  suites cover every route plus auth, timeout, unavailable-AI, malformed,
  ambiguous, and unsupported behavior.
- Privacy-safe lifecycle fields are readable through `/qa/mobile` and the
  existing owner-only `mobile_audit` envelope.
- Part B native implementation, repeatable Mac proof, physical-device
  interaction, and native audit readback completed the same day. The contract is
  documented in [MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md).

Phase 2.5 native status, 2026-07-20:

- Swift consumes the fixed canonical fixture for every route and draft kind,
  rejects unknown/extra/privacy-forbidden response data, builds bounded
  requests, and maps authenticated finite-deadline failures.
- Native Today renders every bounded destination. Mutable drafts remain
  review-only until explicit confirmation reruns grounding and deterministic
  plan validation inside the existing owner-scoped domain transaction.
- Package, simulator, signed generic-device, strict-auth backend,
  frontend/backend, advisory, and Firestore rules gates pass.
- Physical iPhone install/interaction, deterministic confirmation/rejection,
  and native `/qa/mobile` readback pass on iPhone 17 / iOS 26.5.2.

## Phase 1: HealthKit/Firebase Sync Spike

Goal: prove native HealthKit access and bounded Firebase sync without changing
the deterministic training engine.

Build:

- Minimal SwiftUI shell.
- Firebase Auth using the same Firebase project and UID model as web.
- HealthKit permission request for the smallest justified read set:
  sleep analysis, HRV, and resting heart rate.
- Local daily summarizer that emits one bounded readiness summary per local
  date.
- Firestore write under the authenticated user's Kinetic namespace.
- Web readback proof: the existing dashboard can consume the synced readiness
  as a normal readiness input.

Do not build:

- Native plan editing.
- Push notifications.
- Raw sample cloud sync.
- AI plan mutation or chat-first coaching.
- New calendar account management.

Acceptance:

- Denied, partial, and granted HealthKit permissions are all handled.
- Firestore receives bounded daily summaries only.
- Web dashboard freshness/confidence changes after mobile sync.
- Existing Firestore owner-only isolation still passes.
- Deleting training data removes synced mobile summaries through the same
  deletion semantics.

## Phase 2: Native Today Surface

Goal: prove the core mobile user value.

Build:

- Native Today screen as the first authenticated surface.
- Reads profile, goal, saved plan, readiness, workout history, preferences, and
  freshness metadata from Firebase/local cache as needed.
- Calls the existing deterministic `/decision` endpoint with Firebase ID token
  when online.
- Includes calendar availability/freshness in the same decision request shape
  used by web. Missing calendar data lowers confidence; it does not license
  invented availability.
- Renders workout, selected action, recovery score, confidence, freshness, and
  deterministic/fallback explanation copy.
- Shows safe offline/stale states when the decision endpoint or Firestore is
  unavailable.
- Sends mobile-originated decisions, freshness warnings, and apply outcomes
  through the existing privacy-conscious observability contract so web admin
  QA can inspect them.

Acceptance:

- Today loads quickly with cached data.
- The selected action matches the deterministic backend result.
- Stale readiness lowers confidence rather than inventing certainty.
- Calendar conflicts adapt recommendations through deterministic validation.
- AI copy is clearly downstream of the deterministic decision.

## Phase 2.5: Mobile NLP Intake And Validation

Goal: retain the web product's bounded AI usefulness on mobile without making
mobile chat-first. NLP must choose a safe product flow, not merely warn the
runner to visit another screen.

Build:

- A short "Tell Kinetic what changed" entry point from Today.
- The same `POST /ai/parse-intake` contract used by web, authenticated with the
  Firebase ID token and supplied only bounded profile/goal context.
- Review-only draft UI for explicit schedule, availability, goal, and
  preference changes.
- Intent routing for every supported note:
  - schedule availability, travel, workout swaps, goal updates, and preferred
    days -> reviewable drafts;
  - recovery/readiness notes -> perceived-recovery check-in;
  - pain or injury language -> conservative caution check-in;
  - missed workout notes -> skipped/reschedule/rebalance flow;
  - post-workout reflection -> effort and completion check-in;
  - explanation questions -> read-only answer from deterministic traces;
  - ambiguous notes -> clarifying prompt.
- Confirm/apply flow that reruns deterministic validation before any plan
  mutation.
- Privacy-safe mobile telemetry for reviewed, discarded, confirmed, and failed
  intake outcomes.

Acceptance:

- Ambiguous, recovery/medical, or ungrounded notes cannot be confirmed.
- Recovery and pain notes do not become hidden biometric, readiness, or injury
  values. They must be captured through explicit user-authored fields before
  the deterministic engine can use them.
- Each supported NLP category opens a concrete flow: reviewable draft, guided
  check-in, read-only explanation, clarifying prompt, or safe refusal/routing.
- Anonymous mobile intake is rejected under strict auth.
- AI parse failures fall back or stop safely without mutating state.
- Existing web admin/QA surfaces can identify mobile-originated intake results.

## Phase 3: Recovery/Check-In Loop

Goal: close the daily habit loop.

Status: Part A Windows/shared `mobile-checkin.v1` contract and Part B native
SwiftUI implementation completed 2026-07-20. Canonical fixture parity,
deterministic application, existing-domain atomic persistence, bounded UI,
failure visibility, privacy-safe audit, simulator launch, signed generic-device
build, and shared frontend regressions pass. Physical-device recovery and
completed/skipped workout interaction plus live same-user Recovery,
training-review, memory, and audit readback passed 2026-07-21; see
[MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md).

Build:

- Manual perceived-recovery capture for days where HealthKit is missing,
  stale, incomplete, or contradicted by how the runner feels. Fields are
  bounded and explicit: perceived recovery, fatigue, soreness, and optional
  sleep correction. Pain/discomfort remains a caution route, not a persisted
  recovery field.
- Post-workout check-in: completed/skipped, bounded effort, bounded reflection
  choice or skip reason, and no free-text note.
- Sync to the existing recommendation/workout history shape where possible.
- Sync mobile outcomes in a way that web training review and behavior-memory
  surfaces can read without a duplicate mobile-only history model.
- Preserve behavior-learning boundaries: tentative patterns remain advisory,
  and only confirmed preferences can score as bounded nudges. Confirmed
  schedule-style patterns may also propose preferred-day inputs for
  deterministic plan generation.

Acceptance:

- A runner can complete the entire morning/evening loop on iOS.
- A recovery NLP note opens perceived-recovery capture and the resulting
  explicit fields coexist with HealthKit summaries.
- Web training review and memory surfaces reflect mobile check-ins.
- No raw workout notes or raw HealthKit samples enter telemetry or AI prompts.

## Behavior Pattern Result Contract

Pattern detection must produce a safe product result. Kinetic should not show
patterns simply because they are interesting.

Status: Mobile Phase 3.5 `behavior-pattern-result.v1` is functionally complete.
Part A completed 2026-07-23 and native Part B passed Mac compile,
simulator/device, cross-platform readback, and final Windows evidence on
2026-07-24. Authenticated pattern-card VoiceOver, landscape, and small-screen
remain explicitly unverified; product deferred them on 2026-07-29 to the next
native-iOS-UI phase and before external beta.
See [MOBILE_PATTERN_RESULT_CONTRACT.md](./MOBILE_PATTERN_RESULT_CONTRACT.md)
and [MOBILE_PATTERN_RESULT_HANDOFF.md](./MOBILE_PATTERN_RESULT_HANDOFF.md).

| Pattern family | Example | Allowed response |
| --- | --- | --- |
| Heavy-calendar misses | Workouts are skipped on meeting-heavy days | Ask to favor shorter/easier candidates on heavy days |
| Specific-day skips | Tuesday workouts are commonly missed | Ask to avoid or replace that day in future deterministic plans |
| Long-run day preference | Long runs are completed more often on Saturday | Ask to prefer that long-run day when spacing allows |
| Rest override | Runner often trains after full-rest recommendations | Offer a recovery alternative before full rest, skipped when at risk |
| Adjustment too hard/easy | Modified sessions are rejected for difficulty mismatch | Apply small confirmed scoring nudges only |
| Stale data/check-in gaps | Decisions often happen without fresh readiness | Prompt sync or check-in habit; no training mutation |
| Pain/discomfort recurrence | Repeated pain flags appear in check-ins | Deterministic caution routing only; no AI diagnosis |

Each pattern card should state what Kinetic noticed, why it matters, what will
change if confirmed, and what will never change because of that preference.
Confirmed schedule patterns can influence plan generation only through
preferred-day inputs followed by deterministic validation.

## Phase 4: Notifications, Only If Justified

Goal: add prompts only after the Today/check-in loop proves retention value.

Candidate notifications:

- Morning Today card is ready.
- Readiness data is stale.
- Evening check-in reminder.

Rules:

- Quiet by default.
- User configurable.
- No medical claims, injury-risk language, or pressure framing.
- Notification content must not expose sensitive health details on the lock
  screen.

Selected first slice, 2026-07-29:

- Build only an opt-in local evening check-in reminder.
- Keep morning Today-ready and stale-readiness notifications deferred until
  usage evidence justifies them.
- Keep delivery on-device; do not add remote push, device tokens, a backend
  scheduler, or a new persistence domain.
- Use fixed generic lock-screen copy.
- Begin Phase 5 native work by running the deferred Phase 3.5 pattern-card
  VoiceOver, landscape, and small-screen checks.
- Do not build the notification preference as a temporary standalone surface.
  Fold native scheduling and permission UI into the permanent onboarding and
  Settings architecture in Phase 5.

Windows/shared Part A is defined in
[MOBILE_NOTIFICATION_CONTRACT.md](./MOBILE_NOTIFICATION_CONTRACT.md).

## Phase 5: Native Foundation, Onboarding, And Settings

Goal: replace the proof-oriented single-screen shell with the permanent native
product foundation.

Build:

- Account creation, email verification when configured, password recovery,
  sign-in, session restoration, sign-out, and actionable auth failures.
- Migrate proof-era `KineticCompanion` product/target/scheme/bundle identifiers
  to the final Kinetic app identity before external distribution. Preserve
  signing, Firebase app configuration, entitlements, and test references
  deliberately during the migration.
- A stable Today, Plan, Progress, and Settings navigation model.
- Native onboarding for goal, race date, experience, mileage, personal
  records, preferred training/long-run days, availability, and plan preview.
- Progressive HealthKit, Calendar, and notification education; request each
  system permission only at the moment the user enables its value.
- Profile, privacy, permission, sync, notification, export, training-data
  deletion, account deletion, support, and app-version settings.
- The Phase 4 local evening-check-in reminder inside the permanent Settings
  model, still off by default and local-only.

Acceptance:

- A new runner can create an account and reach a confirmed onboarding summary
  without the web.
- Personal records and bounded availability are captured or explicitly skipped,
  and the runner reviews a shared-authority plan preview before onboarding is
  marked complete.
- Profile/Settings can update the bounded planning inputs collected during
  onboarding, and training-data export includes the documented owner-scoped
  runner domains rather than only a foundation receipt.
- Denied or deferred permissions do not block unrelated onboarding steps.
- Returning users restore the correct owner-scoped session and route.
- The deferred Phase 3.5 VoiceOver, Dynamic Type, landscape, and small-screen
  checks pass on the permanent navigation/onboarding/settings foundation.

## Phase 6: Native Plan Lifecycle

Goal: remove the web dependency from normal plan ownership while retaining one
deterministic planning authority.

Entry gate: the authenticated shared generator must be callable. The lifecycle
endpoint validates candidates but does not generate them. Swift must not
calculate training weeks, mileage, pace, taper, workout dates, or regenerated
future schedules. That prohibition includes display-only build/recovery/taper/
race phase inference; phase metadata comes from the shared generation contract.

Build:

- Generate, preview, confirm, save, and browse the full plan.
- Show week and workout detail with phase, duration/distance, pace, and reason.
- Support bounded move, shorten, replace, skip, availability, and
  preferred-day actions plus pause/resume.
- Regenerate future weeks after goal or durable-preference changes without
  rewriting completed history.
- Show proposed impact before confirmation and preserve a recoverable prior
  plan/version where practical.
- Complete preferred-day behavior-pattern confirmation natively through the
  same shared validator instead of routing normal users to the web.

Acceptance:

- Every native mutation is grounded in the current owner-scoped goal/plan,
  deterministically validated, idempotent, auditable, and conflict-aware.
- Mileage, spacing, taper, race-day, availability, and completed-history
  invariants cannot be bypassed by UI or AI.
- Availability, preferred-day, replace, shorten, and regeneration actions may
  change only their explicitly allowed fields, and adversarial unrelated-field
  or oversized-load proposals are rejected before `commit_ready`.
- A runner can create and maintain a usable plan without the web.

## Pre-Phase 7 Product Evidence Gate

Goal: validate the core native loop before investing in Calendar/Progress.

- Install the signed Phase 5–6 closeout build for 3–5 target runners and run a
  moderated onboarding-to-check-in session.
- Record onboarding completion, plan-preview confirmation, independent Today
  and check-in completion, and every web/developer handoff.
- Use only the existing privacy-safe audit/readback vocabulary; do not add raw
  health, workout, identity, or note telemetry.
- Fix only blockers or clear trust/usability failures. Do not broaden the
  roadmap from this small evidence gate.

Phase 7 may proceed when the core journey works without developer help and no
safety/privacy issue requires a Phase 5–6 correction.

## Phase 7: Apple Calendar And Progress

Goal: make schedule awareness real and make continued use rewarding without
expanding into invasive analytics.

Build:

- EventKit permission, calendar selection, bounded on-device free/busy
  summarization, refresh/freshness, revocation, and partial-access handling.
- Send only availability windows/load/freshness to shared decision and planning
  contracts; never upload event titles, descriptions, attendees, or locations.
- Calendar-aware plan generation and explicit conflict review.
- Optional one-way workout export only after read-side behavior passes; no
  silent writes and no full two-way synchronization in user-ready v1.
- Native recent workout/check-in history, recovery trend, concise weekly
  summary, and learned-preference review.

Acceptance:

- Calendar denial, no calendars, revoked access, stale data, travel/time-zone
  changes, all-day events, overlapping events, and a real zero-minute window
  degrade honestly and deterministically.
- Progress reflects shared owner-scoped history and does not create a
  mobile-only truth.

## Phase 8: User-Ready Hardening And External Beta

Goal: complete the install-to-deletion journey at production quality.

Build and prove:

- Offline, retry, partial-sync, account-switch, conflict, migration, upgrade,
  background-refresh, and deletion-tombstone behavior.
- VoiceOver, Dynamic Type, contrast, reduced motion, keyboard where relevant,
  landscape, and supported small/large-device behavior across critical flows.
- Production API/Firebase configuration, HTTPS, rate limiting, secrets,
  privacy-safe crash/operational monitoring, feature flags, and rollback.
- Resolve the plan-commit threat model: either use an authenticated server-side
  validated transaction or explicitly accept/document trusted-client-only
  invariant enforcement. Owner-only Firestore rules alone do not validate plan
  mileage, taper, spacing, or action deltas.
- Privacy manifest/disclosures, permission copy, terms/privacy/support links,
  versioning, signing, TestFlight packaging, and release checklist.
- A small external beta with owned feedback triage and explicit promotion/
  rollback criteria.

Acceptance:

- A fresh external user can complete the entire User-Ready Native Completion
  journey without developer help or the web.
- Critical safety, privacy, auth, deletion, and deterministic contract gates
  pass on Windows/shared CI, macOS/Swift CI, simulator, and physical devices.
- Known limitations are explicit, non-blocking, and accepted before beta
  promotion. Mobile is not declared complete before these gates pass.

## Technical Architecture

Firebase Auth:

- Use the Firebase iOS SDK.
- Preserve UID as the cross-platform owner boundary.
- Protected backend calls use the Firebase ID token.

HealthKit permissions:

- Request read-only access only for justified readiness sources.
- Treat each permission independently; partial grants are valid.
- Show user-facing copy that distinguishes local reading from cloud sync.

Background delivery:

- Use HealthKit observer queries and anchored queries for freshness.
- Design as best-effort. iOS background delivery can be delayed, disabled, or
  unavailable.
- Foreground app open must re-check and repair stale sync.

Local summarization:

- Convert raw HealthKit samples into daily summaries on device.
- Prefer bounded fields already understood by Kinetic:
  sleep hours, HRV, resting heart rate, fatigue level, soreness level, source,
  updated timestamp, coverage, and confidence.
- Do not persist raw HealthKit samples to Firestore.

Firestore schema:

- Keep existing web domains stable.
- Write bounded daily summaries into the existing `readiness` domain so the
  current web dashboard can hydrate and use mobile readiness without a new
  read path.
- Write permission, freshness, coverage, and conflict metadata into the narrow
  `health_sync` domain.
- Reuse existing calendar-freshness, recommendation, preference, and workout
  history domains for mobile-originated actions rather than creating duplicate
  mobile-only state.
- Every mobile write should keep `schemaVersion`, `payload`, `deleted`, and
  `clientUpdatedAt` semantics compatible with existing repository envelopes.
- The detailed contract lives in
  [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md).

Sync freshness and confidence:

- Track `last_synced_at`, source, coverage, and stale thresholds.
- Missing HealthKit data is a confidence issue, not a license to infer.
- Manual readiness can override or supplement HealthKit for the same local day,
  but conflict rules must be deterministic and visible.
- Subjective recovery self-report is a legitimate readiness signal, but it is
  user-authored data. AI may route to its capture flow; AI may not fabricate it
  from text.

Privacy boundaries:

- No raw HealthKit samples in Firestore.
- No raw biometrics in product telemetry.
- No raw notes in AI prompts.
- Delete/disconnect controls must clear mobile summaries and stop future
  background sync attempts.

Failure modes:

- Signed out.
- HealthKit denied.
- Partial HealthKit permission.
- Background delivery stale.
- Firestore offline or write failure.
- Backend decision unavailable.
- Calendar unavailable, stale, or denied.
- AI intake timeout, malformed output, or unsupported note.
- Same-day conflict between manual web entry and mobile HealthKit summary.
- Delete tombstone pending or failed.

## PM Acceptance Criteria

User value:

- The runner gets a useful morning recommendation without manual data entry.
- The recommendation reflects both readiness and schedule availability.
- The runner can tell Kinetic what changed in plain language and review the
  proposed update before applying it.
- The app makes stale or missing data understandable.
- The user can complete or skip today in one short loop.

Demo value:

- Show HealthKit permission, local summarization, Firebase sync, web readback,
  and native Today.
- Explain that deterministic safety still owns the recommendation.

Beta readiness:

- Owner-only rules pass after schema changes.
- Web and iOS do not overwrite each other incorrectly.
- Delete/disconnect behavior works across devices.
- Offline and stale states degrade cleanly.
- Mobile-originated recommendations, intake drafts, validation outcomes, and
  check-ins are visible to the existing web admin/QA/eval surfaces.

Privacy trust:

- Permission copy is specific.
- Synced fields are bounded and inspectable.
- Raw samples never leave device.
- Telemetry excludes raw biometrics and notes.

Safety proof:

- Existing deterministic eval gates remain green.
- AI cannot mutate plans.
- HealthKit summaries only feed deterministic inputs.
- Calendar-aware changes and NLP drafts cannot apply without deterministic
  validation.
- Freshness/confidence semantics are visible in the UI.

## Execution Sequence

Current checkpoint: companion-proof steps 1 through 8 and Phase 3.5 are
implemented and device-validated. The Phase 4 shared notification contract is
implemented on the active feature branch. Mobile completion now requires
Phases 5 through 8.
The Phase 1 Mac proof is recorded in
[MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md), and the stable Today contract
is in [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md).

1. Docs-only phase selection: update PRD, build plan, architecture, runbook,
   QA matrix, README, and demo script to name the initial native mobile proof
   as the selected next phase.
2. Schema design: define the iOS readiness summary contract, sync metadata,
   conflict rules, and Firestore rule changes in
   [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md).
3. HealthKit spike: build a minimal SwiftUI app with Firebase sign-in,
   HealthKit permission, local daily summarization, and Firestore write.
4. Web readback: prove the existing web dashboard consumes mobile readiness
   summaries and preserves freshness/confidence behavior. Completed on a
   physical iPhone and same-user web session on 2026-07-16.
5. Native Today: Windows request/response/cache/failure/observability contract
   completed 2026-07-16; deterministic calendar-aware SwiftUI rendering and
   signed-device proof completed 2026-07-17.
6. Mobile intake: expose bounded NLP review and deterministic confirm/apply.
   Shared Windows contract, canonical fixture, strict routes/failures,
   deterministic apply proof, telemetry, and `/qa/mobile` readback completed
   2026-07-20. Codable/SwiftUI implementation and signed physical-device proof
   also completed that day without changing the shared vocabulary or adding
   mutation authority.
7. Check-in loop: native bounded capture and existing-domain persistence are
   implemented; physical-device recovery/completed/skipped interaction and
   live Recovery, training-review, memory, and audit readback passed
   2026-07-21.
8. QA and beta proof: add iOS manual QA, privacy checklist, schema tests,
   updated demo script, `/qa/mobile` audit coverage, and beta acceptance notes.
9. Notification experiment: shared Windows contract first, followed by an
   opt-in local evening check-in reminder folded into permanent onboarding and
   Settings. Broader notification candidates require usage evidence.
10. Native foundation: account creation/recovery, navigation, onboarding,
    permission education, settings, privacy, support, and data controls.
11. Native plan lifecycle: generate, preview, save, browse, safely edit,
    regenerate, pause/resume, and confirm preferences without the web.
12. Product evidence gate: moderated signed-build onboarding-to-check-in
    sessions with 3–5 target runners; fix blockers without expanding scope.
13. Apple Calendar and Progress: EventKit free/busy ingestion, conflict-aware
    planning, optional explicit one-way export, and shared-history review.
14. User-ready hardening: complete the accessibility/device, offline/sync,
    migration, production-operations, privacy, TestFlight, and external-beta
    gates.

## Commit Plan

- `docs: select initial native mobile proof phase`
- `docs: define mobile readiness sync schema`
- `feat(ios): add HealthKit Firebase sync spike`
- `test: add mobile readiness schema and Firestore coverage`
- `feat(ios): add native Today surface`
- `feat(ios): add bounded intake review`
- `feat(ios): add recovery check-in loop`
- `docs: update mobile beta QA and demo proof`
- `feat(ios): add native onboarding and settings foundation`
- `feat(ios): add bounded native plan lifecycle`
- `feat(ios): add Apple Calendar availability and progress`
- `chore(ios): close user-ready external beta gates`
