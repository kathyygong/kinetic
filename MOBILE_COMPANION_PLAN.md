# Kinetic Mobile Companion Plan

## Strategy

Kinetic should become mobile-first without immediately rebuilding the whole
product as a native app. The web app remains the architecture proof, admin,
demo, eval, and deeper planning surface. The selected mobile direction is a
thin iOS companion that proves the mobile-only value loop: HealthKit readiness,
calendar-aware deterministic recommendations, bounded natural-language intake,
Firebase sync, and a lightweight recovery/check-in habit.

This phase is intentionally smaller than a full mobile app. It should retire
the highest-risk assumptions before broader beta: whether Kinetic can read
health-adjacent data in a privacy-minimized way, keep the deterministic safety
core authoritative, and make the runner feel helped by opening the app once or
twice per day.

## Product Boundary

Mobile-first:

- HealthKit readiness sync from bounded daily summaries.
- Native Today surface with workout, readiness, freshness, confidence, and one
  clear action.
- Calendar-aware daily recommendations using the existing availability and
  freshness model. The iOS app does not need to own full calendar management,
  but beta decisions must respect schedule constraints.
- Bounded natural-language intake for schedule, availability, goal, and
  preference updates, with review-only drafts and deterministic validation
  before anything can apply. Recovery, pain, missed-workout, and reflection
  language should route to guided bounded check-in flows instead of ending in
  warnings.
- Recovery and post-workout check-in loop.
- Minimal account, sync, privacy, and delete/disconnect controls.

Remain web:

- Plan generation and deeper plan review.
- What-if exploration.
- Weekly/monthly training reviews.
- Demo tools, admin proof, eval reports, and beta operations.
- Admin/QA/eval dashboards for mobile-originated events. The safety checks are
  shared P0 infrastructure; only the reviewer-facing screen stays web. The
  local audit route is `/qa/mobile`.

Deferred:

- Full native onboarding and plan editing.
- Full native calendar account management or Apple Calendar ingestion beyond
  the existing calendar-aware decision inputs.
- Garmin, Oura, hosted AI, coach sharing, and broad notification workflows.
- Raw HealthKit sample upload.
- Autonomous AI plan mutation.

## Minimum Lovable Mobile MVP

A signed-in runner opens Kinetic on iPhone and sees:

- Today's workout.
- Recovery/readiness state from a local HealthKit daily summary.
- Sync freshness and confidence: for example, "Health data synced today" or
  "Readiness is stale."
- Calendar context and freshness: for example, "Calendar clear until 11:30 AM"
  or "Calendar conflict leaves 30 minutes."
- A clear action: accept today's recommendation, mark complete, or skip.
- A short explanation grounded in readiness, calendar constraints, plan phase,
  training history, and confirmed preferences.
- A natural-language update path for explicit changes such as "I only have 30
  minutes today"; AI can parse a review-only draft, but deterministic
  validation owns apply.
- A natural-language readiness path for notes such as "I slept badly" or "my
  legs feel heavy"; Kinetic opens perceived-recovery capture rather than
  inferring hidden readiness values.
- A privacy screen that explains what Kinetic reads and what it syncs.
- A useful fallback when HealthKit permission is denied, partial, stale, or
  unavailable.

Lovable means the runner gets a confident morning answer without manual data
entry and without Kinetic feeling invasive.

## Browser UX Prototype

The web app includes a browser-viewable prototype at `/mobile-companion`. It is
not a production training surface and does not touch user state. Use it to
review the mobile-first Today hierarchy, HealthKit sync states, calendar
freshness/conflict states, bounded AI intake review, deterministic validation
language, check-in actions, and notification candidate before building the
native SwiftUI shell. The Today decision model is covered by the default
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
build, and shared frontend regressions pass. Physical-device interaction and
live same-user web/audit readback remain before integration; see
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

Current checkpoint: steps 1 through 6 are implemented, device-validated,
integrated into `main`, and pushed. Phase 2.5 Parts A and B are repeatable and
their Windows, Mac, and physical-device gates pass.
The Phase 1 Mac proof is recorded in
[MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md), and the stable Today contract
is in [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md). Do not begin
step 7 or expand the Phase 2.5 boundary without a separate product decision.

1. Docs-only phase selection: update PRD, build plan, architecture, runbook,
   QA matrix, README, and demo script to name Mobile Companion Proof as the
   selected next phase.
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
   implemented; physical-device interaction and live web/audit readback remain
   before integration.
8. QA and beta proof: add iOS manual QA, privacy checklist, schema tests,
   updated demo script, `/qa/mobile` audit coverage, and beta acceptance notes.

## Commit Plan

- `docs: select mobile companion proof phase`
- `docs: define mobile readiness sync schema`
- `feat(ios): add HealthKit Firebase sync spike`
- `test: add mobile readiness schema and Firestore coverage`
- `feat(ios): add native Today surface`
- `feat(ios): add bounded intake review`
- `feat(ios): add recovery check-in loop`
- `docs: update mobile beta QA and demo proof`
