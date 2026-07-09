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
- Real Apple Health, Garmin, or Oura data ingestion.
- Paid hosted AI as a required dependency.
- A chat-first coaching assistant.
- Coach/team sharing.
- Push notifications.
- Autonomous AI plan mutation without deterministic validation.

### Implementation Status — 2026-07-08

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
- Deterministic What-if planning and its bounded explanation contract are
  implemented as a read-only preview.
- Bounded natural-language intake is implemented for explicit goal, schedule,
  availability, and experience changes.
- Read-only weekly/monthly training reviews are implemented from bounded
  outcome aggregates. Deterministic code owns every metric and trend; optional
  AI may only narrate validated facts, and raw workout notes are excluded.

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
   - Kinetic uses those signals as the current recovery source until real wearable integrations exist.

5. Handle calendar conflicts and travel.
   - User connects Google Calendar or uses available fallback data.
   - Kinetic detects busy windows and travel-like blocks, then adjusts the plan conservatively.

6. Review weekly recalibration.
   - User sees which workouts were preserved, modified, or dropped for the week.
   - Kinetic explains how the adjusted week still supports the training goal.

7. Confirm or reject learned behavior patterns.
   - Kinetic surfaces advisory patterns from recommendation history.
   - User can confirm, dismiss, or remove learned preferences.
   - Confirmed preferences may softly influence future scoring, but never override safety constraints.

8. Ask what changed or what if.
   - User can provide natural-language context, such as "I am traveling Wednesday through Friday and slept badly last night."
   - Supported goal, schedule, availability, and experience details become a
     source-grounded draft; recovery or medical context is routed to the
     Recovery flow rather than inferred.
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
- Store historical readiness values.
- Use freshness metadata to lower confidence when recovery data is stale or missing.
- Make clear that manual readiness is the implemented MVP input source.

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
  availability, and preference changes. Recovery/medical notes remain
  explicitly routed to the Recovery flow rather than inferred or applied.
- What-if planning for uncommitted scenario exploration. Implemented for day,
  duration, and easy-only previews; applying a preview remains an explicit,
  deterministically validated user action.
- Weekly and monthly training diary summaries. Implemented as read-only,
  deterministic reviews with optional grounded local-AI narration.
- AI-assisted eval/judge reports for explanation quality.

#### Native Mobile App

- Mobile-first training, notifications, and wearable integration.
- Native background sync for health and calendar data.

#### Real Apple Health, Garmin, And Oura Integrations

- Replace manual recovery input with automatic biometric retrieval.
- Support source freshness, source confidence, and conflict resolution across providers.

#### Hosted AI Provider Option

- Add an optional hosted provider for lower latency and better reliability.
- Preserve local Ollama and deterministic fallback modes.
- Support BYO API key only if the product needs it.

#### Team Or Coach Sharing

- Allow runners to share plan status, readiness, and weekly summaries with a coach or accountability partner.

#### Push Notifications

- Notify users about recalibrations, stale data, recovery risk, and upcoming workouts.

#### Advanced Periodization

- Support more sophisticated training blocks, injury return-to-run plans, cross-training, and goal reforecasting.

### AI Boundary Requirements

Across the roadmap, AI may:

- Explain decisions.
- Summarize weekly or monthly training.
- Parse natural-language notes into structured candidate constraints.
- Suggest what-if scenarios.
- Detect behavior patterns.
- Evaluate output quality and safety in offline evals.

AI may not:

- Directly mutate workouts, plans, mileage caps, safety thresholds, or persisted training state.
- Override deterministic safety rules.
- Invent biometrics, injuries, diagnoses, calendar events, or training history.
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
- Add demo walkthrough script.
- Add architecture diagrams or concise system explanation.

### Phase 7: Optional Beta Expansion

- Scale persistence and auth hardening beyond the demo foundation.
- Expand monitoring beyond the baseline product instrumentation.
- Mature export/reset controls for beta users.
- Decide whether to support BYO AI key or hosted provider later.

## 6. Technical Constraints

- No paid AI dependency is required for the shippable demo.
- Local Ollama is the only live AI demo mode in the no-cost path.
- Deployed demo must work in AI fallback mode.
- Firebase free-tier persistence is acceptable for the beta-ready foundation.
- Backend remains FastAPI.
- Frontend remains Next.js.
- Build must not depend on external font fetches.
- AI responses must be typed, schema-validated, cached where possible, and timeout-protected.
- The main workout recommendation flow must remain usable when AI is disabled or unavailable.
- Protected backend endpoints must support Firebase auth in strict production-like mode.
- Google Calendar integration must degrade gracefully when credentials, tokens, or user OAuth are unavailable.
- Firebase persistence must include user-scoped security rules before it is treated as beta-ready.
- Product analytics must avoid raw health notes, full calendar text, and unnecessary personally identifiable information.
- Beta checkpoints must run the local readiness check and, from a connected
  shell, the npm advisory audit before broader beta exposure.

## 7. Open Questions And Considerations

- Is Firebase sufficient long-term, or should Kinetic eventually move to a dedicated relational database?
- Should the product support BYO API key mode later, or keep AI runtime choices operator-controlled?
- How much natural-language intake should be exposed in the demo without making the app feel chat-first?
- Which Apple-inspired UI elements should be implemented first: product-stage dashboard, scroll-linked plan highlights, floating metric capsules, or Liquid Glass-style surfaces?
- How should resume and demo materials describe AI capability without overstating autonomy?
- How much user behavior history is enough before Kinetic should surface a learned pattern?
- What is the right default when user preference conflicts with safety or recovery signals?
- Should future wearable integrations be prioritized by signal quality, ease of implementation, or demo value?
