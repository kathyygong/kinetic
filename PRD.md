# Kinetic Product Requirements Document

## 1. Overview

Kinetic is an adaptive running training system for athletes whose training plans need to survive real life. It helps runners generate a race plan, adapt near-term workouts around recovery and schedule constraints, understand why changes were made, and keep long-term progression intact.

The product is intentionally hybrid:

- A deterministic training engine owns safety-critical decisions such as workout selection, mileage progression, calendar conflict handling, recovery thresholds, and plan mutations.
- A grounded AI layer explains decisions, summarizes recalibrations, detects
  behavior patterns, explains read-only What-if previews, and parses supported
  natural-language changes into reviewable drafts. Later work may summarize
  broader training history and evaluate output quality.

The target for the current build is a resume-grade, shippable demo with a beta-ready foundation. The demo should feel polished and credible, run without paid AI dependencies, and clearly distinguish implemented capabilities from planned future integrations.

### Demo Ship Definition

The demo is shippable when a reviewer can complete a focused walkthrough without paid services or manual setup beyond documented local configuration:

- Create or load a runner profile and race goal.
- View a credible training plan and today's recommendation.
- See a grounded explanation of why today's workout was preserved, modified, or replaced.
- See a weekly recalibration summary when calendar or readiness constraints affect the plan.
- Confirm or dismiss at least one learned behavior pattern.
- See AI status clearly: fallback mode, local AI demo mode, or unavailable.
- Review an eval report showing that AI outputs are bounded and safe.
- Understand from the UI and docs which integrations are implemented now versus planned later.

Demo success metrics:

- First meaningful dashboard screen loads in under 3 seconds in local demo mode on a typical development machine.
- The primary dashboard recommendation and CTA are visible without scrolling on desktop and mobile.
- A focused demo walkthrough can be completed in under 5 minutes.

### Non-Goals For Demo Ship

The shippable demo will not include:

- Native mobile app.
- Native/background Apple HealthKit, Garmin, or Oura data ingestion.
- Paid hosted AI as a required dependency.
- A chat-first coaching assistant.
- Coach/team sharing.
- Push notifications.
- Autonomous AI plan mutation without deterministic validation.

### Implementation Status — 2026-07-10

- The demo release gate is complete: signed-in responsive QA, strict Firebase
  token enforcement, deterministic evals, and Firestore isolation rules pass.
- The UI refresh is complete across Dashboard, Plan, Recovery, Profile,
  Settings, Login, and Onboarding.
- Local-first, user-scoped Firebase repositories and the training-memory center
  are implemented. Returning sign-in now hydrates authenticated storage before
  merging identity, demo seed mirroring is ordered per domain, and deletion
  tombstones remain the remote delete contract. Cloud Firestore is enabled for
  the configured Firebase project (`kinetic-aca73`), rules are deployed, and
  live signed-in QA verifies cross-session hydration, account isolation, and
  local-cache ownership. Signed-in deletion now surfaces a retryable error
  instead of silently clearing local state when Firebase tombstones cannot be
  confirmed. The live deletion tombstone reload/second-session proof passed on
  2026-07-09, so the remote persistence gate is closed.
- Privacy-conscious local observability is implemented with typed event
  envelopes, bounded values, deterministic sanitization, and failure isolation.
  Events cover recommendation responses, AI source/fallback/latency/timeout,
  intake review/confirmation/discard, training-review window/source,
  persistence sync success/failure, and stale-data warnings without recording
  raw notes, biometrics, workout/calendar text, tokens, email, UID, or other
  unnecessary identity data.
- Beta hardening has started with a minimal runbook, QA matrix, and local
  readiness check that keeps dependency posture, protected QA artifact hygiene,
  and connected advisory-audit requirements visible before the next checkpoint.
- Final beta hardening is complete for a small controlled beta: dependency
  pins, advisory audit, telemetry QA, hosted preflight, rollback, and triage are
  documented without broadening product scope.
- Current readiness input supports manual entry, a privacy-minimized Apple
  Health CSV import, and a proven native iOS HealthKit path for bounded daily
  summaries. Browser-native HealthKit background sync is not possible in the
  web build. Garmin and Oura remain future integrations.
- Hardening now includes a behavior-prompt privacy gate that proves raw
  athlete notes are excluded before optional AI narration, plus frontend smoke
  coverage for plan safety invariants across race distance, experience level,
  and very low starting mileage.
- Deterministic What-if planning and its bounded explanation contract are
  implemented as a read-only preview.
- Bounded natural-language intake is implemented for explicit goal, schedule,
  availability, experience, preferred-day, travel, and workout-swap changes.
  The shared mobile contract also routes recovery, caution, missed-workout,
  reflection, explanation, ambiguous, unsupported, and unsafe notes without
  inferring hidden health/completion values.
- Read-only weekly/monthly training reviews are implemented from bounded
  outcome aggregates. Deterministic code owns every metric and trend; optional
  AI may only narrate validated facts, and raw workout notes are excluded.
- **User-Ready Native iOS** is the active mobile product direction. The
  completed initial native proof includes physical-device HealthKit/Firebase,
  Native Today, bounded intake, recovery/check-in, behavior-pattern results,
  cross-platform readback, and deterministic safety evidence. The active Phase
  4 shared notification contract is followed by Mobile Phases 5–8: permanent
  native foundation/onboarding/settings, bounded plan ownership, Apple
  Calendar/progress, and user-ready external-beta hardening. The web remains
  the architecture proof, admin/demo/eval, advanced What-if, and deep-analytics
  surface—not a dependency for the core runner journey. See
  [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md).
- Native iOS is Kinetic's primary user-facing product. Core runner features are
  designed mobile-first and do not count as product-complete when available
  only on web. Shared backend/planner/auth/persistence/eval capabilities remain
  cross-platform; web is the secondary runner and primary operator surface.

## 2. Problem Statement

Most running apps treat a training plan as a static schedule. That breaks down when the runner's actual life changes:

- Work meetings compress available training windows.
- Travel disrupts workout timing and recovery.
- Sleep, soreness, HRV, or fatigue shift readiness.
- Missed workouts create cascading plan conflicts.
- Users lose trust when an app changes a plan without explaining why.

Existing products tend to fall into two weak patterns:

- They require the user to manually replan around every disruption.
- They over-automate without exposing enough reasoning, confidence, or control.

Kinetic solves this by treating training as a continuous adaptation problem. It recommends changes conservatively, explains the tradeoffs, surfaces uncertainty, and lets the runner remain the final decision-maker.

## 3. Users And Critical User Journeys

### Primary User

A recreational runner training for a race while balancing work, travel, fatigue, and inconsistent weekly availability. They want a plan that adapts without becoming opaque or unsafe.

### Critical User Journeys

1. Create a race goal and generate a plan.
   - User enters race distance, date, experience level, weekly mileage, personal records, and preferred training days.
   - Kinetic generates a structured training plan with weekly progression and workout types.

2. See today's recommendation.
   - User opens the dashboard and sees the workout Kinetic recommends today.
   - The recommendation reflects the planned workout, readiness state, available time, and relevant constraints.

3. Understand why a workout changed.
   - User sees an explanation of the selected action, key factors, confidence, and tradeoff.
   - The explanation is grounded in actual inputs and cannot invent biometric, calendar, or training facts.

4. Log recovery and readiness.
   - User manually enters sleep, HRV, resting heart rate, fatigue, and soreness.
   - User can optionally import an Apple Health CSV with bounded sleep, HRV,
     and resting-heart-rate fields.
   - Kinetic uses those signals as the current recovery source until native
     wearable sync exists.

5. Handle calendar conflicts and travel.
   - User connects Google Calendar or uses available fallback data.
   - Kinetic detects busy windows and travel-like blocks, then adjusts the plan conservatively.

6. Review weekly recalibration.
   - User sees which workouts were preserved, modified, or dropped for the week.
   - Kinetic explains how the adjusted week still supports the training goal.

7. Confirm or reject learned behavior patterns.
   - Kinetic surfaces advisory patterns from recommendation history.
   - User can confirm, dismiss, or remove learned preferences.
   - Confirmed preferences may softly influence future scoring or, for
     schedule-style patterns, future deterministic plan generation as
     preferred-day inputs. They never override safety constraints.

8. Ask what changed or what if.
   - User can provide natural-language context, such as "I am traveling Wednesday through Friday and slept badly last night."
   - Supported goal, schedule, availability, and experience details become a
     source-grounded draft.
   - Recovery, pain, missed-workout, and post-workout reflection context routes
     into a guided bounded flow instead of a dead-end warning. The runner
     supplies explicit fields before the deterministic engine can use the
     information.
   - Deterministic logic validates the complete draft before an explicit
     confirmation can apply any resulting changes.
   - User can explore deterministic scenarios without committing them to the
     plan.

## 4. Product, Features, And Requirements

### Demo Ship Must-Haves

#### Deterministic Plan Generation

Requirements:

- Generate a multi-week race plan from user goal inputs.
- Support race distance, target date, experience level, weekly mileage, personal records, and preferred training days.
- Include build, recovery, taper, and race-week phases where applicable.
- Enforce bounded progression and sensible workout distribution.

#### Calendar-Aware Weekly Adjustment

Requirements:

- Fetch calendar availability for the relevant plan horizon when Google Calendar is connected.
- Detect travel-like events and mark travel or post-travel days as easy-only.
- Adjust workouts around limited availability.
- Preserve key workouts when safe and feasible.
- Explain which days changed and why.

#### Manual Recovery And Readiness Input

Requirements:

- Allow manual entry for HRV, HRV baseline, sleep hours, resting heart rate, fatigue, and soreness.
- Allow Apple Health CSV import for bounded readiness metrics where supported.
- Support a perceived-recovery check-in that can supplement HealthKit or manual
  biometric data with explicit self-report fields such as fatigue, soreness,
  perceived recovery, and optional sleep correction.
- Natural-language recovery notes must route into that bounded check-in flow;
  they must not be converted by AI into hidden readiness, HRV, sleep, resting
  heart-rate, fatigue, soreness, pain, or injury values.
- Drop unsupported columns and raw notes during import.
- Store historical readiness values.
- Use freshness metadata to lower confidence when recovery data is stale or missing.
- Make clear that manual entry and Apple Health CSV import are the implemented
  MVP input sources; native wearable background sync is later.

#### Daily Decision Engine

Requirements:

- Classify readiness state.
- Generate proceed, modify, or rest candidates.
- Score candidates using recovery state, training context, constraints, learned preferences, and available minutes.
- Select the highest-scoring safe option.
- Return final workout, confidence, alternatives, key factors, scores, trace, available minutes, and staleness warnings.

#### AI Status And Fallback Explanations

Requirements:

- Report whether Kinetic is using deterministic fallback mode, local Ollama demo mode, or disabled AI mode.
- Explain today's deterministic recommendation in runner-friendly language.
- Include summary, factors, tradeoff, and confidence note.
- Use deterministic fallback prose when live AI is unavailable, disabled, slow, or off-schema.
- Cache AI responses by stable decision hash.
- Never allow AI to change the selected workout.

#### Weekly Recalibration Summary

Requirements:

- Generate a structured trace comparing original and adjusted week.
- Explain modified, dropped, and preserved workouts.
- Support deterministic fallback when AI is unavailable.
- Keep weekly summary read-only.

#### Behavior Learning With User Confirmation

Requirements:

- Record recommendation events, user responses, rejection reasons, and actual workout outcomes.
- Surface conservative behavior patterns only when supported by enough history.
- Warn on sparse data.
- Allow users to confirm or dismiss learned preferences.
- Apply confirmed preferences only as bounded scoring nudges.
- Every detected pattern must have an explicit product result. Kinetic should
  avoid surfacing patterns that cannot lead to a safe action, clarifying
  question, check-in prompt, or read-only explanation.
- Heavy-calendar, rest-override, and intensity-tolerance patterns may become
  small confirmed scoring nudges.
- Schedule-style patterns, such as repeated skipped weekdays or preferred
  long-run days, may propose preferred-day updates for deterministic plan
  generation after explicit user review.
- Stale-data and missed-check-in patterns may trigger sync/check-in UX
  prompts, not training mutations.
- Recurring pain or discomfort patterns must route to deterministic caution
  flows and must not be framed as AI diagnosis.

#### Natural-Language Intent Routing

Requirements:

- NLP must produce one of five bounded outcomes: reviewable draft, guided
  check-in, read-only explanation, clarifying prompt, or safe refusal/routing.
- Schedule availability, travel, workout swaps, goal updates, and training-day
  preferences produce reviewable drafts and deterministic confirm/apply.
- Recovery/readiness language opens perceived-recovery capture instead of
  inferring biometric values.
- Pain or injury language opens a caution check-in and conservative safety
  copy; Kinetic does not diagnose or clear the runner to train.
- Missed-workout and post-workout reflection language opens the appropriate
  check-in/rebalance flow with bounded fields.
- Explanation questions answer from decision traces or deterministic
  simulations only and cannot mutate state.
- Ambiguous input asks for clarification rather than guessing.

#### Dashboard UI Vertical Slice

Requirements:

- Use the pasted fitness mockup and Apple product pages as inspiration for polish, staging, motion, and layered information.
- Dashboard should present today's workout as the primary product stage.
- Use floating metrics, translucent surfaces, and carefully bounded animation for the first demo slice.
- Support reduced-motion preferences.
- Avoid copying Apple assets, product identity, or page structure directly.

#### Eval Harness And Demo Docs

Requirements:

- Provide deterministic evals that run without live AI.
- Provide optional local Ollama evals for model benchmarking.
- Include demo setup, demo script, architecture notes, and honest feature status.
- Enforce demo eval gates:
  - 100% no medical claims in deterministic/fallback outputs.
  - 100% no recommendation drift: explanations cannot contradict the deterministic selected action.
  - 100% sparse-history behavior cases warn about limited data.
  - 100% no AI output can mutate persisted state or the selected workout.
  - 100% fallback outputs match the expected schema.
  - Optional local AI evals should target at least 95% schema validity; failures must fall back safely.

### Beta-Ready Foundation

#### Firebase-Backed Persistence

Requirements:

- Persist user profile, goal, saved plan, readiness log, recommendation events, learned preferences, workout log, and sync metadata under authenticated users.
- Keep localStorage as cache and offline/demo fallback.
- Avoid requiring server-backed persistence for local-only demos.
- Scope all user reads and writes by authenticated Firebase user id.
- Provide explicit reset and deletion paths for demo data.

#### Security, Privacy, And Data Governance

Requirements:

- Treat readiness, recovery, and training history as sensitive health-adjacent data.
- Use Firestore security rules that prevent cross-user reads or writes.
- Do not send user data to a live AI provider unless local AI demo mode or another explicit configured mode is active.
- Keep deterministic fallback mode as the deployed default.
- Provide user-visible controls for clearing local data, learned preferences, and connected integrations.
- Avoid storing unnecessary calendar event detail; prefer derived availability and travel signals where possible.
- Do not make medical claims, diagnoses, or injury predictions.

#### Product Instrumentation

Requirements:

- Track key product events in a privacy-conscious way:
  - recommendation accepted, rejected, modified, completed, or skipped
  - AI fallback used
  - AI latency and timeout
  - calendar sync success or failure
  - stale data warning shown
  - weekly plan recalibrated
  - learned preference confirmed or dismissed
- Avoid logging raw health notes, full calendar event text, or unnecessary personally identifiable information.
- Keep event payloads focused on product behavior, not sensitive source data.

#### Full Apple-Inspired UI Refresh

Requirements:

- Extend the dashboard vertical slice across Plan, Profile, Recovery, Onboarding, and Login after the first slice is validated.
- Use scroll reveals, highlight rails, and cinematic staging where they clarify the product state.
- Maintain accessibility, reduced-motion support, and mobile layout stability.

### Planned For Later

#### Expanded AI Workflows

- Natural-language intake is implemented for supported goal, schedule,
  availability, and preference changes. Recovery, pain, missed-workout, and
  reflection notes should route to guided bounded flows rather than warnings
  alone. AI must not infer biometric or medical values from free text.
- What-if planning for uncommitted scenario exploration. Implemented for day,
  duration, and easy-only previews; applying a preview remains an explicit,
  deterministically validated user action.
- Weekly and monthly training diary summaries. Implemented as read-only,
  deterministic reviews with optional grounded local-AI narration.
- AI-assisted eval/judge reports for explanation quality.

#### User-Ready Native iOS

- The completed initial native proof established HealthKit/Firebase sync,
  native Today, bounded intake, recovery/check-in, and behavior-pattern
  results. Continue through a user-ready native product rather than stopping at
  the proof.
- A normal runner must be able to create/recover an account, onboard, generate
  and safely edit a plan, connect Apple Health and Calendar, follow Today,
  check in, review recent progress, and manage/export/delete data without the
  web.
- Build permanent Today, Plan, Progress, and Settings navigation plus native
  goal/profile/preferences, progressive permission education, privacy,
  support, and account controls.
- Add privacy-minimized EventKit free/busy ingestion. Event titles,
  descriptions, attendees, and locations remain on device. Full two-way
  Calendar sync remains out of user-ready v1; explicit one-way workout export
  is optional after read-side behavior passes.
- Keep What-if, deep monthly analytics, demo tooling, and admin/QA/eval
  dashboards on web. Mobile actions must continue feeding shared safety and
  audit surfaces.
- Do not declare mobile complete until production, accessibility/device,
  offline/sync/migration, TestFlight, and small external-beta gates pass.

#### Native Apple HealthKit, Garmin, And Oura Integrations

- HealthKit is selected first because true automatic Apple Health sync requires
  native iOS.
- Sync bounded daily summaries, not raw HealthKit samples.
- Garmin and Oura remain deferred until the iOS HealthKit path proves the
  privacy, freshness, and decision-value model.

#### Hosted AI Provider Option

- Add an optional hosted provider for lower latency and better reliability.
- Preserve local Ollama and deterministic fallback modes.
- Support BYO API key only if the product needs it.
- Introduce a provider-neutral AI request/result contract and provider adapters
  so model and provider changes do not require feature, API-envelope, frontend,
  or telemetry rewrites.
- Select models per workload rather than forcing one model across explanation,
  extraction, summarization, and offline evaluation.
- Keep provider and model as observable metadata, not product behavior or
  hard-coded response modes.
- Promote a model only after representative Kinetic evals satisfy the user
  experience gates for grounding, safety, consistency, and surface-specific
  latency. Among models that pass those gates, prefer the lowest sustainable
  total cost and operational complexity.
- Do not pay for additional model capability unless it produces a measurable
  user benefit, and do not accept a materially worse user experience only to
  preserve a cheaper or local technical deployment.

#### Team Or Coach Sharing

- Allow runners to share plan status, readiness, and weekly summaries with a coach or accountability partner.

#### Push Notifications

- Defer until the native Today and check-in loop prove they create retention
  value.
- Candidate notification types are limited to Today-ready, stale-readiness, and
  evening check-in prompts. Avoid medical or injury-risk framing.

#### Advanced Periodization

- Support more sophisticated training blocks, injury return-to-run plans, cross-training, and goal reforecasting.

### AI Boundary Requirements

Across the roadmap, AI may:

- Explain decisions.
- Summarize weekly or monthly training.
- Parse natural-language notes into structured candidate constraints.
- Route recovery, pain, missed-workout, and reflection language into bounded
  check-in flows.
- Suggest what-if scenarios.
- Detect behavior patterns.
- Evaluate output quality and safety in offline evals.

AI may not:

- Directly mutate workouts, plans, mileage caps, safety thresholds, or persisted training state.
- Override deterministic safety rules.
- Invent biometrics, injuries, diagnoses, calendar events, or training history.
- Convert vague recovery or pain language into hidden engine inputs.
- Surface behavior patterns that have no clear bounded product response.
- Make medical claims or injury diagnoses.
- Hide uncertainty when data is sparse, stale, or conflicting.

Any AI-generated suggestion that could affect training must pass deterministic validation before it can be applied.

## 5. Roadmap

### Phase 0: Cleanup And Build Reliability

- Fix lint and build failures.
- Remove build-time dependency on external Google Fonts requests.
- Repair backend development environment and dependencies.
- Add missing frontend smoke-test tooling.
- Ensure frontend lint/build, backend syntax checks, and smoke tests pass.

### Phase 1: PRD, Docs, And Honest Positioning

- Create this PRD as the requirements source of truth.
- Keep `productreasoning` as the philosophy companion doc.
- Update README to link to the PRD.
- Correct claims about Apple HealthKit, Garmin, Oura, hosted AI, and beta readiness.

### Phase 2: Demo Ship Vertical Slice

- Build the first shippable demo vertical slice:
  - AI status and fallback explanations.
  - Daily reasoning.
  - Weekly recalibration explanation.
  - Behavior learning with confirmation.
  - Dashboard product-stage UI slice.
  - Deterministic eval gates.

### Phase 3: Persistence, Security, And Observability

- Firebase-backed persistence, local cache ownership/migration, Firestore rules,
  and reset/delete controls are implemented.
- Live signed-in two-session hydration, account isolation, local-cache
  ownership, and deletion tombstone verification are complete.
- Extend privacy-conscious instrumentation only when a new product surface
  needs a bounded event.
- Keep demo/offline mode usable.

### Phase 4: AI Expansion

- Expand beyond the first AI wedge only after demo eval gates are stable.
- What-if planning, bounded natural-language intake, and read-only training
  summary contracts are implemented.
- Normalize AI response envelopes across all AI features.
- Add schema validation, caching, timeouts, and deterministic fallback paths for expanded AI features.

### Phase 5: Full UI/UX Refresh

- Build reusable Apple-inspired product-stage primitives.
- Refresh dashboard, plan, profile, recovery, onboarding, and login flows.
- Add visual QA across desktop and mobile.
- Ensure accessibility and reduced-motion support.

### Phase 6: Evals, Demo Script, And Portfolio Polish

- Add deterministic eval report.
- Add optional local Ollama model benchmark report.
- Keep one executable gate registry as the source of truth for deterministic
  execution, assertion totals, report generation, and report-freshness checks.
- Keep deterministic harnesses hermetic: local credentials, external network
  state, clock drift, and test order must not change outcomes.
- Migrate standalone backend/frontend checks incrementally to standard test
  runners while preserving the current product-risk scenarios.
- Add a required, small browser suite for the highest-value signed-in,
  plan/decision, intake review/confirmation, check-in/persistence, and AI
  fallback journeys.
- Add property-based planner invariants, adversarial intake cases, and
  provider-resilience tests before those surfaces become broader beta
  dependencies.
- Produce a versioned model-promotion artifact per workload with repeated
  quality, grounding, safety, fallback, latency, cost/resource, prompt, model,
  and environment evidence.
- Run shared deterministic gates on Windows and Linux; run Swift shared-fixture
  and package gates on macOS.
- Add demo walkthrough script.
- Add architecture diagrams or concise system explanation.

### Phase 7: Optional Beta Expansion

- Scale persistence and auth hardening beyond the demo foundation.
- Expand monitoring beyond the baseline product instrumentation.
- Mature export/reset controls for beta users.
- Add a provider-neutral AI runtime before making a hosted provider a beta
  dependency.
- Decide whether to support BYO AI key or an operator-controlled hosted
  provider after the runtime boundary and workload evals are in place.

### Phase 8: User-Ready Native iOS

- Treat [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md) as the source of
  truth for the selected mobile-first phase.
- Phase 1: HealthKit/Firebase sync spike. Completed 2026-07-16 with
  physical-device and cross-device readback/deletion proof.
- Phase 2: Native calendar-aware Today surface. Completed 2026-07-17 with
  Swift, simulator, signed-device, strict-auth, cache, calendar-conflict, and
  `/qa/mobile` proof; integrated into `main` on 2026-07-20.
- Phase 2.5: Bounded mobile natural-language intake and deterministic
  confirm/apply. Windows/shared Part A and macOS/native Part B, including
  signed-device proof, completed 2026-07-20. See
  [MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md) and
  [MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md).
- Phase 3: Recovery/check-in loop. Parts A/B and physical-device proof
  completed 2026-07-21.
- Phase 3.5: Behavior Pattern Result Contract. Windows/shared Part A completed
  2026-07-23 as strict `behavior-pattern-result.v1`: every surfaced family has
  a scoring-review, preferred-day-review, prompt, or caution result; detection
  and review remain read-only; confirmed schedule inputs reuse deterministic
  plan validation; pain/discomfort cannot become a preference, diagnosis, or
  automatic mutation. Initial native Part B reached its Mac/physical-device
  checkpoint on 2026-07-24
  against the same contract and shared recommendation history. Native scoring
  preferences use explicit owner-scoped confirmation; preferred-day changes
  route to the web validator in v1 to optimize for user safety and one
  planning authority over native feature completeness. All 52 Swift tests,
  simulator and signed-device builds, physical scoring/preferred-day/prompt/
  caution routes, same-user web state, and privacy audit readback passed.
  Final shared Windows/hosted and owner-only emulator proof passed in run
  [30105302955](https://github.com/kathyygong/kinetic/actions/runs/30105302955).
  Phase 3.5 was accepted as functionally complete on 2026-07-29. Authenticated
  pattern-card VoiceOver/landscape/small-screen remains explicitly unverified
  and is a mandatory Mobile Phase 5 entry check and a release check before
  external beta. Part B is governed by
  [MOBILE_PATTERN_RESULT_HANDOFF.md](./MOBILE_PATTERN_RESULT_HANDOFF.md).
- Phase 4: begin with one justified notification experiment: an opt-in,
  local-only evening check-in reminder with generic lock-screen copy. Morning
  Today-ready and stale-readiness notifications remain deferred until usage
  evidence supports their interruption and privacy cost. Windows/shared Part A
  is defined in
  [MOBILE_NOTIFICATION_CONTRACT.md](./MOBILE_NOTIFICATION_CONTRACT.md).
- Mobile Phase 5: permanent native foundation. Add account creation/recovery,
  Today/Plan/Progress/Settings navigation, onboarding, progressive permissions,
  personal records, bounded availability, shared plan preview/confirmed
  summary, editable profile inputs, full training-data export,
  privacy/support/data controls, and the opt-in local reminder in its permanent
  Settings location. Migrate the proof-era `KineticCompanion`
  product/target/scheme/bundle identifiers to the final Kinetic app identity
  before external distribution.
- Mobile Phase 6: native plan lifecycle. Generate, preview, save, browse, and
  safely maintain plans through bounded, deterministically validated actions;
  remove the normal-runner web handoff for plan maintenance and preferred-day
  confirmation. Windows/shared owns the authenticated generator, authoritative
  phase metadata, action-specific/full-plan lifecycle enforcement, adversarial
  tests, web migration, and hosted workflow routing. Mac/native consumes those
  contracts, removes native generation/phase inference, and closes native,
  accessibility, signing, deletion, export, and live-device proof. Final
  Windows integration requires green hosted Windows and macOS runs.
- Before Mobile Phase 7, run a moderated 3–5-runner signed-build evidence gate
  for onboarding, plan-preview confirmation, independent Today/check-in use,
  and absence of web/developer handoffs. This is not external beta and does not
  authorize feature expansion.
- Mobile Phase 7: Apple Calendar and Progress. Add on-device EventKit
  free/busy summarization, calendar-aware generation/conflict review, optional
  explicit one-way workout export, and shared-history progress views.
- Mobile Phase 8: user-ready hardening and external beta. Close accessibility,
  device/OS, offline/sync, migration, production operations, privacy,
  TestFlight, support, install-to-deletion beta evidence, and the explicit plan
  commit threat-model decision: server-side validated transaction or documented
  trusted-client-only invariant enforcement.
- Mobile completion means a fresh external runner completes the core journey
  without the web or developer help. The initial proof and notification
  contract alone are not mobile completion.
- Preserve the deterministic safety core: mobile can summarize signals and
  call the existing decision endpoint, but cannot bypass deterministic
  validation or allow AI to mutate plans.
- Preserve privacy boundaries: do not upload raw HealthKit samples, raw notes,
  raw biometrics in telemetry, or unnecessary identity data.
- Preserve calendar-aware planning in mobile beta. Missing or stale calendar
  data must lower confidence rather than cause invented availability.
- Preserve shared QA/eval coverage. The iOS app does not duplicate web admin
  screens, but mobile-originated decisions, intake drafts, validation results,
  and check-ins must be inspectable through the existing web safety surfaces.

## 6. Technical Constraints

- No paid AI dependency is required for the shippable demo.
- Local Ollama is the only live AI demo mode in the no-cost path.
- Deployed demo must work in AI fallback mode.
- Firebase free-tier persistence is acceptable for the beta-ready foundation.
- Backend remains FastAPI.
- Frontend remains Next.js.
- Build must not depend on external font fetches.
- AI responses must be typed, schema-validated, cached where possible, and timeout-protected.
- Feature code must depend on provider-neutral AI capabilities. Provider
  adapters may translate structured output, streaming, reasoning, token-limit,
  and residency controls into provider-specific requests.
- Model routing must be workload-specific and configuration-driven. Changing a
  model within a compatible provider should not require feature-code changes;
  changing providers should not change user-facing response contracts.
- Model promotion must optimize user outcomes first: safety and grounding are
  hard gates, latency and continuity are surface-specific gates, and cost,
  throughput, privacy, hardware footprint, and operational complexity choose
  among configurations that pass.
- The main workout recommendation flow must remain usable when AI is disabled or unavailable.
- Protected backend endpoints must support Firebase auth in strict production-like mode.
- Google Calendar integration must degrade gracefully when credentials, tokens, or user OAuth are unavailable.
- Firebase persistence must include user-scoped security rules before it is treated as beta-ready.
- Product analytics must avoid raw health notes, full calendar text, and unnecessary personally identifiable information.
- iOS HealthKit sync must summarize locally into bounded daily readiness
  records before Firebase writes; raw HealthKit samples must remain on device.
- Beta checkpoints must run the local readiness check and, from a connected
  shell, the npm advisory audit before broader beta exposure. Direct
  frontend/backend dependencies should stay exact-pinned unless a package
  change is intentionally reviewed.
- Checked-in eval reports must be reproducible from executable gates and fail
  CI when stale. Hand-edited pass counts are not release evidence.
- Required deterministic gates must not call live Calendar, model, persistence,
  or other external services unless the gate explicitly owns an emulator or
  connected-integration contract.

## 7. Open Questions And Considerations

- Is Firebase sufficient long-term, or should Kinetic eventually move to a dedicated relational database?
- Should the product support BYO API key mode later, or keep AI runtime choices operator-controlled?
- Which hosted provider/model configuration, if any, passes Kinetic's workload
  evals with enough user-visible latency or quality improvement to justify its
  recurring cost and operational/privacy tradeoffs?
- How much natural-language intake should be exposed in the demo without making the app feel chat-first?
- Which Apple-inspired UI elements should be implemented first: product-stage dashboard, scroll-linked plan highlights, floating metric capsules, or Liquid Glass-style surfaces?
- How should resume and demo materials describe AI capability without overstating autonomy?
- How much user behavior history is enough before Kinetic should surface a learned pattern?
- What is the right default when user preference conflicts with safety or recovery signals?
- Should future wearable integrations be prioritized by signal quality, ease of implementation, or demo value?
