# Kinetic Architecture

Kinetic is a hybrid adaptive-training system: deterministic code owns every
safety-critical decision, while an optional bounded AI layer explains and
summarizes those decisions.

## Request flow

1. The Next.js frontend loads the runner's goal, plan, readiness, schedule
   availability, workout history, and confirmed preferences.
2. The FastAPI decision endpoint classifies readiness and scores only
   deterministic workout candidates.
3. Safety constraints select the final workout and return a decision trace.
4. The reasoning layer receives that immutable trace and produces typed prose.
5. Invalid, slow, unavailable, or contradictory AI output is discarded and
   replaced by deterministic fallback copy.
6. The user accepts, rejects, completes, or skips the recommendation; that
   response becomes advisory history for future preference detection.

Natural-language intake follows a separate review boundary:

1. `POST /ai/parse-intake` receives the note plus current goal/profile context.
2. Local AI uses a dedicated, startup-warmed `llama3.2:3b` model. Kinetic
   derives the allowed field set first, then Ollama's native JSON Schema
   requires the model to normalize every explicit value without introducing a
   new category.
3. The backend accepts the model result only when it exactly agrees with the
   deterministic authority, then attaches Kinetic-owned IDs, source-text
   evidence, warnings, and review copy. Malformed, slow, unavailable, or
   disagreeing output falls back to conservative deterministic parsing.
4. The frontend treats the response as untrusted and validates the complete
   draft again. Parsing cannot write storage.
5. Only **Confirm changes** reaches the existing deterministic plan generator
   and availability adjuster; sparse or ambiguous drafts cannot be confirmed.

Natural-language intake is not limited to plan-changing drafts. It is an
intent router with bounded destinations:

1. Explicit goal, schedule, availability, travel, and preference changes
   become review-only drafts.
2. Recovery or readiness language opens a perceived-recovery flow instead of
   inferring biometrics. The runner supplies bounded self-report fields such
   as fatigue, soreness, perceived recovery, and optional sleep correction.
3. Pain or injury language opens a conservative caution check-in. Kinetic does
   not diagnose or clear the runner to train; any training effect must come
   from deterministic safety rules over explicit bounded fields.
4. Post-workout reflection opens the check-in flow for completed/skipped,
   perceived effort, and bounded reason fields.
5. Explanation requests read from existing decision traces and cannot mutate
   state.

Every supported NLP path must end in a meaningful product flow: a reviewable
draft, guided check-in, read-only explanation, clarifying prompt, or safe
refusal/routing. NLP must never synthesize hidden readiness values such as
"recovery seems low" from free text.

The Phase 2.5 shared mobile boundary is concrete in
[MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md). The existing endpoint
accepts the strict `mobile-intake.v1` request alongside legacy web intake and
returns one tagged outcome with `mutation_performed=false`. Mobile context is
limited to the local day, bounded goal/profile fields, and optional
enum-bucketed decision facts. Unknown identity, raw readiness, biometric,
calendar text, workout text, and unrelated-history fields are rejected.
Drafts carry explicit review/confirmation/validation requirements; guided
routes carry no captured or inferred health/completion values. Workout swaps
reuse the confirmed web intake path and add deterministic existing-plan,
race-day, duplicate-day, weekly-load, and hard-workout-spacing checks.

Training reviews use a read-only aggregate boundary:

1. The Plan page maps logged outcomes into a bounded 7/30-day request. Workout
   names, notes, rejection reasons, and calendar context never enter this path.
2. `POST /ai/training-summary` calculates consistency, completed volume,
   effort, and recovery trends deterministically.
3. Optional local AI receives only those final metrics and may produce typed
   narrative copy. Invented numbers, medical claims, malformed output, and
   timeouts are rejected for deterministic fallback copy.
4. The response is display-only and has no state-mutation action.

## Trust boundary

AI may explain decisions, summarize recalibrations and bounded training
aggregates, detect tentative behavior patterns, parse supported notes into
reviewable drafts, and evaluate output quality. It cannot mutate a workout,
plan, mileage cap, recovery threshold, or persisted training state.

Confirmed preferences are bounded scoring inputs. Tentative patterns never
affect decisions, and no preference can override a safety constraint.

Behavior detection also has a result contract. Kinetic should not surface
decorative patterns that cannot lead to a clear bounded action. Supported
pattern families are mapped to deterministic responses:

- heavy-calendar misses -> ask to favor shorter/easier candidates on heavy
  days;
- specific-day skips -> ask to update preferred training days or avoid a day
  when generating future plans;
- long-run day preference -> ask to move long runs to the confirmed day when
  deterministic spacing allows;
- rest overrides -> ask whether to offer a recovery-run style modify option
  before full rest, skipped when state is at risk;
- too-hard or too-easy adjustment feedback -> small confirmed scoring nudges;
- stale-data or missed-check-in patterns -> UX/check-in prompts, not training
  mutations;
- recurring pain/discomfort -> deterministic caution routing only, no AI
  diagnosis.

Confirmed schedule-style patterns may influence plan generation only as soft
preferred-day inputs, after user review. The deterministic plan generator and
validator still own mileage, phase structure, workout spacing, taper, and
load safety.

Mobile Phase 3.5 formalizes this boundary as
`behavior-pattern-result.v1`. `POST /behavior-insights` remains authenticated
and read-only. The backend intersects any optional-model family selection with
deterministically supported detections and authors every action, change
statement, and never-change boundary deterministically. Scoring results can
only build confirmed bounded preferences. Schedule results construct a
grounded typed intake draft and reuse `validateIntakeDraft`,
`buildConfirmedIntakeState`, and `persistConfirmedIntake`; validation and
review do not write. Stale-data/check-in and pain/discomfort results declare
`mutation: none`.

The cross-platform fixture lives at
`ios/KineticCompanion/Tests/Fixtures/mobile-pattern-result-contract.json`.
Privacy-safe result lifecycle telemetry reuses the owner-scoped
`mobile_audit` document and `/qa/mobile`; it contains route enums only, never
pattern prose, notes, identity, tokens, readiness/biometric values, pain
severity, injury, or medical fields.

The 2026-07-24 native checkpoint passed all 52 Swift tests, clean simulator
and signed-device builds, and physical scoring, preferred-day, prompt, and
caution routing. Explicit native scoring confirmation is transactionally
idempotent and may start a new empty preference epoch from a valid deletion
tombstone because it is a direct user action; it never restores deleted
history, and malformed tombstones fail closed. Preferred-day routing remained
`review_only`/`not_requested` and the same-user web profile retained its
existing selected days. The final architecture gate is limited to
authenticated pattern-card accessibility. Shared Windows/hosted integration
and the owner-only emulator suite passed in run
[30105302955](https://github.com/kathyygong/kinetic/actions/runs/30105302955).

## Runtime modes

- `fallback`: deterministic explanation templates; deployed demo default.
- `local_ollama`: optional no-cost local model with schema validation,
  grounding checks, timeouts, caching, and fallback.
- `disabled`: deterministic decision flow without AI reasoning calls.

## Model selection and portability

Kinetic selects models per workload. The goal is not to maximize a generic
benchmark score or use one model everywhere; it is to deliver the best user
outcome inside the safety, latency, privacy, cost, and operational constraints
of each surface.

Current choices:

| Workload | Configuration | User benefit | Technical tradeoff |
| --- | --- | --- | --- |
| Safety-critical workout selection and persisted changes | Deterministic code | Predictable, explainable decisions that remain available offline and cannot drift with a model response | Less flexible prose and language understanding; feature logic must be maintained explicitly |
| Daily/weekly explanation and behavior analysis | Ollama with `qwen3:8b` | More natural explanation and pattern-selection capability than templates while keeping data local and avoiding per-call fees | CPU inference is too slow for synchronous product flows; these paths must be asynchronous, cached, or fallback-safe |
| Natural-language intake | Startup-warmed Ollama with `llama3.2:3b` | Meets the bounded extraction need with stable structured output and a measured sub-24-second interaction budget | Lower general reasoning headroom than larger models; Kinetic compensates with a constrained schema, deterministic field agreement, review, and explicit confirmation |
| Training-summary narration | Ollama with `llama3.2:3b` | Reuses the warm low-latency model for concise grounded prose | The model may add little value over deterministic copy in sparse cases, so invalid or ungrounded narration is discarded |
| Offline/demo failure path | Deterministic fallback | Immediate, private, reliable behavior with no paid or network dependency | Copy is less varied and conversational |

`llama3.2:3b` has workload-specific promotion evidence: the optional intake
gate completed two identical passes over eight exact-value cases with no
fallback and a recorded p95/max of 16.67 seconds on the development machine.
Its small size is therefore a user-latency decision as much as a technical
resource decision.

`qwen3:8b` is a pragmatic local-demo configuration, not a production winner.
It offers additional language capability without hosted cost, but observed CPU
latency ranges from minutes for normal reasoning to longer behavior prompts.
The repository contains a comparative harness for `qwen3:8b`,
`gpt-oss:20b`, and `llama3.1:8b`, but it does not preserve a completed
comparative report proving `qwen3:8b` is the best candidate. It should remain
optional and fallback-safe until a representative workload report justifies a
promotion or replacement.

Model promotion follows a user-first Pareto rule:

1. Safety, grounding, schema validity, non-mutation, and honest uncertainty are
   hard gates.
2. Each surface sets a user-facing latency and continuity gate. Synchronous
   intake must finish inside its interaction budget; slower narration must not
   block the primary training flow.
3. Only configurations that pass those gates are compared on technical
   dimensions: total cost, throughput, privacy/data residency, hardware and
   memory footprint, cold start, operational complexity, and portability.
4. Kinetic chooses the least costly and simplest configuration on that passing
   quality/latency frontier. More capable or more expensive models are promoted
   only when evals show a material user benefit.

The current client is model-flexible within Ollama but not yet
provider-neutral. General and workload-specific model tags are configured
separately, and feature modules share one `call_llm` entry point. However, the
implementation, runtime names, provenance enums, frontend contracts, and
telemetry still encode Ollama behavior.

The planned boundary introduces:

- a provider-neutral request and result contract;
- provider adapters for structured output, streaming, reasoning controls,
  token budgets, and model residency;
- a configuration-driven workload-to-provider/model policy;
- generic live-model status with separate provider and model provenance; and
- contract and workload evals that allow a provider change without changing
  feature or user-facing response contracts.

Ollama remains the local/no-cost adapter, deterministic fallback remains
mandatory, and a hosted adapter is added only when its measured latency,
quality, or reliability benefit justifies recurring cost and privacy/operations
tradeoffs.

## Storage direction

The current implementation is local-first: synchronous localStorage reads keep
the training flow available, while authenticated Firebase repositories mirror
profile/goal, plan/readiness/workout history, recommendation history,
preferences, completion, and calendar-freshness domains in the background.
Migration is idempotent, deletion uses tombstones, and the cache records its
owning Firebase UID so one account cannot hydrate another account's data.
Returning sign-in hydrates the authenticated cache before merging Firebase
identity into the local profile, preventing a fresh auth shell from overwriting
an existing remote profile. Remote mirrors are ordered and coalesced per
storage domain so seed/reset bursts cannot race late tombstones over newer
payloads. Signed-in deletion requires confirmed Firebase tombstones before
local deletion is finalized; if tombstones cannot be confirmed, Profile shows a
retryable error instead of pretending remote data was deleted. The destructive
delete action uses an in-page confirmation panel, avoiding native dialog hangs
and keeping browser QA repeatable.

Firestore owner-only rules and Auth + Firestore emulator isolation tests pass.
Cloud Firestore is enabled for `kinetic-aca73`, owner-only rules are deployed,
and live signed-in QA verifies cross-session hydration, account isolation, and
local-cache ownership. The 2026-07-09 live gate also verifies deletion
tombstones remain deleted after reload and after signing into the same account
from the second local origin, closing the remote persistence gate.

The selected mobile direction preserves this boundary. Phase 1 now proves that
the iOS app uses the same Firebase project, UID ownership model, and
user-scoped Kinetic namespace. Its bounded `readiness` and `health_sync`
documents passed native write, same-user web readback, owner-only rule, retry,
and deletion-tombstone checks. Any additional mobile-specific state must remain
narrow, owner-only, and covered by Firestore rule tests before beta use.

Mobile beta also preserves the existing decision and intake boundaries. The
iOS app should call the same authenticated deterministic decision endpoint with
readiness, calendar availability/freshness, plan, profile, history, and
confirmed preference inputs. Calendar data remains derived availability and
freshness metadata, not raw event text. Mobile natural-language updates should
use the same bounded intent-routing contract as web; AI can parse explicit
intent and choose the correct flow, but only deterministic validation can apply
plan changes. Recovery language should open perceived-recovery capture that
coexists with HealthKit summaries instead of overriding them invisibly.
Mobile-originated decisions, intake drafts, validation outcomes, and check-ins
must emit privacy-safe observability that the existing web admin/QA/eval
surfaces can inspect.

The Phase 2A boundary is now concrete in
[MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md). Native Today builds a
privacy-minimized `mobile-today.v1` request, marks its bounded calendar value
caller-authoritative, and validates the existing `/decision` envelope before
creating a reduced same-day snapshot. Missing calendar uses planned workout
duration rather than invented availability and lowers confidence. The cache is
fresh for six hours, cannot cross a local-day boundary, and degrades through
typed auth/offline/timeout/backend/invalid-response states. The dashboard uses
the same response validator, and TypeScript/Swift share one canonical fixture.
The native implementation reads the existing owner-scoped Firebase domains,
calls `/decision` with the Firebase ID token, and writes capped privacy-safe
decision events to an owner-only audit envelope that `/qa/mobile` can inspect.
Local signed-device QA may opt into project-scoped public-key verification
with `FIREBASE_PROJECT_ID`; it still validates Firebase signature, audience,
issuer, expiry, and subject and provides no Admin capability. Credential-backed
Firebase Admin verification remains the default when credentials are present.
The shared and native Phase 2A implementation was integrated into `main` on
2026-07-20. Phase 2.5 bounded intake is now an implemented architecture slice:
reuse the authenticated web intake boundary, route every supported intent to a
bounded product flow, and keep deterministic confirmation authoritative. Its
Windows-first contract is scoped in
[MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md).

The Phase 2.5 native implementation consumes the same fixed fixture with
strict exact-key Codable validation, builds only bounded context, and calls
the existing authenticated intake endpoint with a finite deadline. The note
exists only in the editor/request and volatile confirmation state. Routing
never writes. Explicit confirmation re-reads and updates the existing
owner-scoped goal/profile/plan envelopes in one transaction after rerunning
grounding and deterministic plan checks. There is no mobile-only domain or
mutation endpoint. Guided recovery, missed-workout, and reflection destinations
now open the explicit Phase 3 check-in UI. Caution remains non-persisting and
no note value crosses into check-in state.

Phase 3 Part A makes that persistence boundary concrete through
`mobile-checkin.v1`. Perceived recovery is an explicit user-authored merge into
the existing `readiness` envelope, preserving HealthKit biometrics unless the
runner explicitly corrects bounded sleep. Completed/skipped workout outcomes
replace the matching slot in `workouts` and the stable same-day event in
`recommendations`; native Part B commits those payloads atomically after
re-reading current owner-scoped state. The pure shared/Swift validators perform
no I/O, and no backend mutation endpoint or mobile-only history domain was
added. See
[MOBILE_CHECKIN_CONTRACT.md](./MOBILE_CHECKIN_CONTRACT.md) and
[MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md).

## Readiness integration boundary

The web beta supports two readiness inputs: manual Recovery entry and Apple
Health CSV import from Profile. The importer accepts only bounded readiness
metrics, writes through the same local-first readiness store, and drops
unsupported columns such as raw notes. Browser-native HealthKit background
sync, Garmin, and Oura ingestion are intentionally not implemented in this
web build.

The native iOS app now locally summarizes HealthKit sleep, HRV, and
resting heart rate into bounded daily readiness records before Firebase sync.
HealthKit raw samples stay on device. Freshness and confidence metadata travel
with the summary so stale or partial data lowers certainty without changing the
deterministic safety rules. Subjective recovery is captured only through the
explicit user-authored Phase 3 check-in and is never inferred from HealthKit or
AI output.

The concrete mobile readiness contract is documented in
[MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md). Mobile writes
bounded daily metrics into the existing `readiness` domain for web readback and
sync/permission metadata into the `health_sync` domain for operations and QA.
Deletion tombstones remain authoritative for routine native sync. A user must
explicitly confirm `Reconnect Apple Health` to start new readiness,
health-sync, and privacy-safe audit epochs; this does not restore previously
deleted data.

## Observability direction

Product observability is local/demo-safe by default. `frontend/lib/instrumentation.ts`
stores a capped v2 event log with typed envelopes, event-specific whitelists,
bounded numeric fields, bucketed enum values, and sensitive-key rejection.
Telemetry failures are caught and isolated so training, persistence, auth, and
AI fallback cannot be blocked by instrumentation.

Tracked surfaces include recommendation responses/completions, AI status and
reasoning source/fallback/latency/timeout, intake reviewed/confirmed/discarded,
training-review window/source, persistence hydrate/mirror/delete outcomes, and
stale-data warnings. The log intentionally excludes raw notes, biometrics,
workout/calendar text, tokens, email, UID, and unnecessary identity data.

For `mobile_intake_lifecycle`, the shared event vocabulary is limited to
action, outcome, route, draft kind, failure state, parser source, mutation
state, deterministic-validation state, platform, and bounded latency.
`/qa/mobile` reads those fields from the capped owner-only `mobile_audit`
envelope. Raw intake text, grounding evidence, generated prose, identity,
tokens, readiness/biometric values, recovery values, pain severity, completion
values, and medical data are not accepted by this event family.

For `mobile_checkin_synced`, the vocabulary is limited to platform, check-in
kind, bounded status/outcome/failure, write scope, deterministic validation,
effort/reflection presence booleans, update success, and bounded latency.
Captured recovery, effort, reflection, skip-reason, HealthKit, identity,
token, note, and medical values are excluded. `/qa/mobile` reads these bounded
fields from the existing owner-only audit envelope.

## Verification

- Frontend lint, production build, and deterministic smoke suites.
- Backend deterministic AI safety gates and generated
  [eval report](./EVAL_REPORT.md).
- Frontend smoke includes Apple Health CSV import privacy/bounding and
  plan-safety invariants across race distance, experience level, and low
  starting mileage.
- Backend gates include behavior-prompt privacy, proving raw athlete notes are
  excluded before optional AI narration.
- Signed-in responsive browser QA and strict Firebase token enforcement,
  including authenticated intake review/confirmation, anonymous rejection,
  and live grounded 30-day training-review narration. Sparse ungrounded
  narration is rejected for deterministic review copy.
- Firestore owner, cross-user, guest, and unknown-domain emulator checks.
- Optional local-model benchmarks that cannot block the fallback-safe demo.
- Beta handoff checks are captured in [BETA_RUNBOOK.md](./BETA_RUNBOOK.md) and
  [QA_MATRIX.md](./QA_MATRIX.md). `npm run beta:readiness` provides the local
  posture check for dependency metadata, protected QA artifact hygiene, and
  required documentation; `npm run beta:audit` is the connected advisory gate.
- Hosted beta operations keep strict backend auth, owner-only Firestore rules,
  UID-scoped storage, deletion tombstones, deterministic fallback, and bounded
  AI validation as non-negotiable rollback boundaries.
- Initial Mobile Phase 1 passed native QA for read-only HealthKit permission,
  bounded daily-summary sync, web readback, retry, and authoritative deletion
  tombstones. Phase 2A's authenticated calendar-aware Today contract now passes
  Windows frontend/backend plus Swift fixture, cache, response, observability,
  simulator-build, and signed physical-device gates, including strict live
  decision, zero-minute conflict, same-day cache fallback, and `/qa/mobile`
  readback. Phase 2.5 adds bounded mobile intake, and Phase 3 Parts A/B define
  and implement bounded check-in persistence. Stale background-delivery
  recovery remains later hardening. See
  [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md).
- Mobile Phase 2.5 Part A passed the full Windows frontend/backend/Firestore
  suite on 2026-07-20. The canonical fixture covers all eight tagged routes,
  six review-draft kinds, strict auth, timeout, unavailable/malformed AI,
  malformed response, ambiguity, unsupported/unsafe input, deterministic
  confirmation, audit privacy, and owner-only readback. Native Part B
  implementation, repeatable Mac gates, signed physical-device interaction,
  deterministic confirmation/rejection, and native audit readback pass.
- The completed Part A + Part B tree passed the full Windows dependency,
  frontend, backend, and owner-only Firestore rerun on 2026-07-20 before
  fast-forward integration into `main`.
- Mobile Phase 3.5 Part B passed the 2026-07-24 Mac/package/simulator/signed
  physical-route and same-user readback checkpoint on
  `codex/mobile-pattern-results`. Product accepted functional completion on
  2026-07-29 and deferred the explicitly unverified authenticated pattern-card
  VoiceOver/landscape/small-screen checks to Mobile Phase 5 and before external
  beta. Final shared Windows/hosted integration passed at `1b99cfe`.
- Mobile Phase 4 starts with a provider-free, local-only evening check-in
  reminder. `mobile-notification.v1` produces deterministic request-permission,
  schedule, cancel, or no-op decisions from bounded non-sensitive state.
  Native code remains the only OS-notification adapter; there is no push
  service, device-token storage, backend scheduler, or health detail in
  lock-screen copy.
- Mobile Phases 5–8 turn the proof shell into a user-ready app without creating
  a second product authority. Native Today, Plan, Progress, and Settings
  features consume the same owner-scoped Firebase domains and authenticated
  backend contracts as web. Account/onboarding UI may collect bounded inputs,
  but plan generation and mutation pass through shared authenticated services.
  `mobile-plan-generation.v1` is the implemented FastAPI generation authority;
  `mobile-plan-lifecycle.v1` independently validates preview/commit candidates
  and returns storage-neutral commit packages. Web and Swift clients must not
  carry production copies of mileage, pace, taper, workout-scheduling, or
  future-regeneration rules. This includes display-only phase/taper inference:
  build/recovery/taper/race metadata is produced by the shared generator and
  rendered by clients.
- Windows Batch A established `mobile-foundation.v1` and
  `mobile-plan-lifecycle.v1`. Firebase Auth remains the identity/session
  authority; owner-scoped Firestore stores foundation and versioned plan
  documents; authenticated backend validation returns storage-neutral commit
  packages. Native clients persist only `commit_ready` packages using version
  and operation-id preconditions while retaining completed history.
- Storage-neutral validation is currently a trusted-product-flow boundary, not
  a Firestore invariant boundary. Owner-only rules prevent cross-account access
  but allow the authenticated owner to write an allowlisted domain; they do not
  validate plan mileage, taper, spacing, or action deltas. Windows Batch B now
  closes normal UI/AI bypasses with action-specific deltas and full-plan
  validation before `commit_ready`.
  Before external beta, the shared/backend lane must either move commit into an
  authenticated server-side transaction or explicitly accept and document the
  narrower tampered-client threat model. Native follows that decision.
- Native iOS is the primary user-facing product surface. Shared backend,
  planner, auth, persistence, schema, observability, and eval modules are
  platform capabilities; web is the secondary runner surface and primary
  admin/demo/QA/eval surface. A web-only core runner flow is not
  product-complete.
- EventKit is a native boundary. Calendar events are read and summarized on
  device into bounded availability/load/freshness before shared requests are
  built; titles, descriptions, attendees, and locations do not cross that
  boundary. Optional one-way workout export must be explicit and idempotent;
  full two-way synchronization remains outside user-ready v1.
- The web remains the advanced What-if, deep analytics, admin, QA/eval, demo,
  and beta-operations surface. Core runner onboarding, plan ownership, Today,
  check-in, recent progress, settings, and data control cannot depend on a web
  handoff at mobile completion.
- Delivery uses coordinated Windows/shared and Mac/native lanes. Shared
  contracts and harnesses may be batched for one or two coupled phases, then
  the corresponding SwiftUI/Apple-framework slice is closed on Mac before
  later contracts freeze. Each Mac batch returns to Windows for final shared
  and hosted integration. EventKit requires an early Mac spike because its
  permission and calendar behavior cannot be proven from Windows fixtures.
- Mobile Phases 5–6 use an explicit three-stage closeout: Windows establishes
  shared generation, authoritative phase metadata, hardened lifecycle rules,
  hosted workflow definitions, and branch routing. Mac removes native
  generation/phase heuristics, completes onboarding/profile/export/deletion,
  and closes live/device/accessibility proof. Windows then performs final
  documentation, emulator, dependency, hosted Windows, and hosted macOS
  integration. Neither of the first two stages alone closes the phases.
- The 2026-08-12 Windows return resolves the three shared boundaries exposed by
  Mac checkpoint `b6604af`. V2 plan snapshots bind shared week metadata to the
  plan version and lifecycle refreshes it; recurring availability contains only
  weekday, 0-or-15–240 minutes, and easy-only; planning inputs and plan share one
  revision-checked owner transaction; and server-only cleanup receipts survive
  the complete owner-domain sweep and coordinate recent-auth identity deletion.
  V1 clients and workout-only plans remain readable until Mac migrates them.
- The subsequent Mac v2 adapter keeps the UI-facing workout model separate
  from authoritative metadata but persists them together as a v2 snapshot.
  Every native commit also transactionally writes the matching planning
  revision to profile and goal; restored week phases come only from stored
  shared metadata. Native account deletion is an authenticated coordinator of
  the server receipt, not an independent owner-domain deletion authority. A
  UID-scoped local pending marker lets relaunch resume that receipt after the
  server has removed the owner settings document.
- Authenticated Mac implementation checkpoint `b91269b` proves that boundary
  with a disposable owner: the five-domain transaction supports exact replay
  before stale-version checks, rejects a reused operation with a different
  fingerprint, restores version-bound metadata after relaunch, preserves
  non-mutating rejection/offline behavior, and denies cross-user audit reads.
  Required absent v2 preconditions are encoded as explicit JSON nulls, and
  fractional production timestamps can create the retryable account-deletion
  boundary. Signed simulator and generic-device builds pass; physical install,
  hands-on VoiceOver, and Admin-backed final identity cleanup remain explicit
  external evidence because the paired iPhone and Admin credential were not
  available.
- A small moderated product-evidence gate follows final Phase 5–6 integration
  and precedes the full Phase 7 build. Mac owns signed native sessions;
  Windows/shared owns privacy-safe audit/readback support. This gate validates
  onboarding, plan-preview confirmation, Today/check-in independence, and
  absence of web/developer handoffs without expanding feature scope.
