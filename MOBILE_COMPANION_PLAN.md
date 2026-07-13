# Kinetic Mobile Companion Plan

## Strategy

Kinetic should become mobile-first without immediately rebuilding the whole
product as a native app. The web app remains the architecture proof, admin,
demo, eval, and deeper planning surface. The next product phase is a thin iOS
companion that proves the mobile-only value loop: HealthKit readiness,
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
  before anything can apply.
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
native SwiftUI shell.

## Native Scaffold

The first iOS source scaffold lives in `ios/KineticCompanion`. It contains the
SwiftUI Today surface, schema-aligned Codable models, deterministic readiness
conflict rules, HealthKit summarization boundary, Firestore sync boundary, and
a Swift Package manifest for core tests. It still requires macOS/Xcode to
compile and attach Firebase/HealthKit capabilities.

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
mobile chat-first.

Build:

- A short "Tell Kinetic what changed" entry point from Today.
- The same `POST /ai/parse-intake` contract used by web, authenticated with the
  Firebase ID token and supplied only bounded profile/goal context.
- Review-only draft UI for explicit schedule, availability, goal, and
  preference changes.
- Confirm/apply flow that reruns deterministic validation before any plan
  mutation.
- Privacy-safe mobile telemetry for reviewed, discarded, confirmed, and failed
  intake outcomes.

Acceptance:

- Ambiguous, recovery/medical, or ungrounded notes cannot be confirmed.
- Anonymous mobile intake is rejected under strict auth.
- AI parse failures fall back or stop safely without mutating state.
- Existing web admin/QA surfaces can identify mobile-originated intake results.

## Phase 3: Recovery/Check-In Loop

Goal: close the daily habit loop.

Build:

- Manual readiness correction for days where HealthKit is missing or stale.
- Post-workout check-in: completed/skipped, effort, optional bounded notes
  policy.
- Sync to the existing recommendation/workout history shape where possible.
- Sync mobile outcomes in a way that web training review and behavior-memory
  surfaces can read without a duplicate mobile-only history model.
- Preserve behavior-learning boundaries: tentative patterns remain advisory,
  and only confirmed preferences can score as bounded nudges.

Acceptance:

- A runner can complete the entire morning/evening loop on iOS.
- Web training review and memory surfaces reflect mobile check-ins.
- No raw workout notes or raw HealthKit samples enter telemetry or AI prompts.

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

1. Docs-only phase selection: update PRD, build plan, architecture, runbook,
   QA matrix, README, and demo script to name Mobile Companion Proof as the
   selected next phase.
2. Schema design: define the iOS readiness summary contract, sync metadata,
   conflict rules, and Firestore rule changes in
   [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md).
3. HealthKit spike: build a minimal SwiftUI app with Firebase sign-in,
   HealthKit permission, local daily summarization, and Firestore write.
4. Web readback: prove the existing web dashboard consumes mobile readiness
   summaries and preserves freshness/confidence behavior.
5. Native Today: render the deterministic, calendar-aware recommendation from
   shared state and backend `/decision`.
6. Mobile intake: expose bounded NLP review and deterministic confirm/apply.
7. Check-in loop: sync completion/skipped/effort data into existing history
   contracts.
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
