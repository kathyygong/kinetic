# Kinetic Build Plan

## Goal

Turn Kinetic into a resume-grade shippable demo with a beta-ready foundation:

- Fast deterministic training decisions.
- A grounded AI layer for explanation, recalibration summaries, behavior
  learning, read-only What-if analysis, bounded natural-language intake,
  weekly/monthly training reviews, and evals.
- No paid AI dependency.
- A polished Apple-inspired UI/UX refresh.
- Honest documentation and repeatable verification.

This plan implements the direction in [PRD.md](./PRD.md). `productreasoning` remains the product philosophy companion.

## Product Principles

- Deterministic systems own safety-critical behavior.
- AI is used where ambiguity, language, longitudinal pattern recognition, or evaluation adds real product value.
- AI output must be grounded, typed, schema-validated, cached where useful, and safe to ignore.
- The primary workout flow must remain usable when AI is unavailable.
- The demo should be visually impressive, but every interaction should still serve a real runner workflow.

## Demo Ship Definition

The demo is shippable when a reviewer can complete this flow without paid services:

- Create or load a runner profile and race goal.
- View a credible plan and today's recommendation.
- See a grounded explanation for today's recommendation.
- See a weekly recalibration explanation when constraints affect the plan.
- Confirm or dismiss a learned behavior pattern.
- See whether AI is running in fallback, disabled, or local Ollama demo mode.
- Review an eval report that proves bounded AI behavior.
- Understand which integrations are implemented now and which are future work.

Demo success metrics:

- First meaningful dashboard screen loads in under 3 seconds in local demo mode on a typical development machine.
- The primary dashboard recommendation and CTA are visible without scrolling on desktop and mobile.
- A focused demo walkthrough can be completed in under 5 minutes.

## Non-Goals For Demo Ship

- Native mobile app.
- Native/background Apple HealthKit, Garmin, or Oura ingestion.
- Required paid hosted AI.
- Chat-first coaching assistant.
- Coach/team sharing.
- Push notifications.
- Autonomous AI plan mutation without deterministic validation.

## Phase 0: Cleanup And Build Reliability

### Objectives

Make the repo reliable enough to change quickly without guessing whether failures are old noise or new regressions.

### Work

- Fix current frontend lint failures or intentionally tune the ESLint rules where React 19 compiler-era rules conflict with established client hydration patterns.
- Remove build-time dependency on external Google Font fetches by switching to local/system fonts or checked-in font assets.
- Add missing smoke-test tooling, especially `tsx`, so `npm run smoke` works offline after dependencies are installed.
- Repair backend local execution:
  - Refresh or recreate the stale `.venv`.
  - Ensure `python -m evals._smoke` can run without import failures.
  - Keep `KINETIC_DEMO_MODE=true` paths available for offline checks.
- Add or update `.gitignore` entries for local runtime logs if needed.
- Verify:
  - `npm run lint`
  - `npm run build`
  - `npm run smoke`
  - backend syntax/test smoke

### Acceptance Criteria

- A clean checkout can install dependencies and run the documented checks.
- Frontend production build does not require network access for fonts.
- Backend smoke tests run with demo/fallback AI mode.

### Status - Updated 2026-06-26

Completed.

- Frontend lint/build/smoke reliability was restored.
- Build-time Google Font fetching was removed in favor of local/system font variables.
- Smoke tooling now includes local `tsx` and the weekly recalibration smoke.
- Backend local execution was repaired by refreshing `.venv`; backend compile/eval smoke passed in fallback/demo mode.
- Runtime log ignores were added for local backend logs.

Verified with:

- `npm run lint`
- `npm run build`
- `npm run smoke`
- `.\.venv\Scripts\python.exe -m compileall app evals`
- `.\.venv\Scripts\python.exe -m evals._gates`
- `.\.venv\Scripts\python.exe -m evals._smoke`

## Phase 1: Documentation And Product Positioning

### Objectives

Make the product story clear, honest, and interview-ready.

### Work

- Keep [PRD.md](./PRD.md) as the requirements source of truth.
- Keep `productreasoning` as the philosophy and AI systems rationale.
- Update README feature claims so implemented MVP, demo-mode, and future features are not blurred together.
- Add a concise architecture section:
  - Next.js frontend.
  - FastAPI backend.
  - Firebase auth and persistence.
  - Deterministic decision engine.
  - Optional local AI demo mode.
  - Deterministic fallback mode.
- Add a demo script:
  - Create or load a runner profile.
  - Show today's recommendation.
  - Show why it changed.
  - Trigger weekly recalibration.
  - Confirm a learned preference.
  - Show AI fallback/local AI status.

### Acceptance Criteria

- A reviewer can understand what is real, what is demo-mode, and what is planned later.
- README links to PRD and build plan.
- The AI claims do not overstate autonomy or production readiness.

### Status - Updated 2026-06-27

Completed for the shippable demo.

- README links to PRD, BUILD_PLAN, `productreasoning`, the architecture summary, demo walkthrough, and generated eval report.
- [ARCHITECTURE.md](./ARCHITECTURE.md) documents the deterministic authority boundary, optional AI runtime, local-first persistence, and verification model.
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) provides a focused five-minute walkthrough.
- README now separates completed demo capabilities from beta work and does not present future integrations as complete.

## Phase 2: Demo Ship Vertical Slice

### Objectives

Build the smallest impressive end-to-end product slice before broadening scope.

### Work

- Lock AI runtime modes:
  - `fallback`: deployed/default demo mode.
  - `local_ollama`: no-cost live AI demo mode.
  - `disabled`: deterministic/debug mode.
- Add `GET /ai/status` and a visible `AIStatusBadge`.
- Harden existing AI wedge:
  - daily reasoning
  - weekly recalibration
  - behavior learning with confirmation
  - deterministic fallback for every output
  - stable cache keys for repeated explanation requests
- Build the first UI vertical slice on Dashboard:
  - product-stage hero for today's workout
  - `LiquidSurface`
  - `FloatingMetric`
  - `AIStatusBadge`
  - reduced-motion support
- Add minimal demo reliability controls:
  - seed demo data
  - reset demo data
  - clear learned preferences
- Add deterministic eval gates for the first wedge:
  - 100% no medical claims in deterministic/fallback outputs.
  - 100% no recommendation drift.
  - 100% sparse-history cases warn.
  - 100% no AI output can mutate persisted state or the selected workout.
  - 100% fallback outputs match schema.
- Add lightweight product instrumentation:
  - recommendation accepted/rejected/completed/skipped
  - AI fallback used
  - AI latency/timeout
  - calendar sync success/failure
  - stale data warning shown
  - weekly plan recalibrated
  - learned preference confirmed/dismissed
  - no raw health notes, full calendar event text, or unnecessary personally identifiable information

### Status - Updated 2026-06-25

Completed so far.

- AI runtime modes are implemented as `fallback`, `local_ollama`, and `disabled`.
- `GET /ai/status` is implemented and surfaced on the Dashboard through `AIStatusBadge`.
- Daily reasoning, weekly recalibration, and behavior learning now have deterministic fallback paths, schema validation, timeout protection, and safety guards for no medical claims / no recommendation drift.
- Dashboard reasoning hydrates asynchronously and remains safe to ignore; AI output does not mutate workouts, plans, safety caps, or persisted state.
- Deterministic eval gates cover no medical claims, no recommendation drift, sparse-data warnings, schema validity, and fallback behavior.
- Dashboard demo reliability controls are implemented:
  - Seed demo data.
  - Reset demo data to a repeatable local baseline.
  - Clear learned preferences without deleting recommendation history.
- Demo seed/reset is covered by `frontend/scripts/smoke-demo-data.ts` and is now part of `npm run smoke`.
- Initial Dashboard product-stage visual slice is implemented:
  - `LiquidSurface` reusable stage surface.
  - `FloatingMetric` reusable metric capsule.
  - Dashboard hero now uses a stage-style surface with recovery dial, availability/action metrics, and the existing confidence disclosure.
- Lightweight local product instrumentation is implemented:
  - Local, capped, sanitized event log in `frontend/lib/instrumentation.ts`.
  - Recommendation accepted/rejected/completed/skipped events.
  - Post-workout check-in saved events without raw notes.
  - AI status, daily reasoning, weekly reasoning, and behavior-insight latency/outcome events.
  - AI fallback visibility through `/ai/status` telemetry and UI fallback telemetry on reasoning request failures.
  - Calendar sync success/failure events without raw calendar text.
  - Stale-data warning shown events without storing warning copy.
  - Weekly plan recalibration accepted/rejected/generated events.
  - Learned preference confirmed/dismissed events without pattern descriptions.
  - Demo seed/reset/clear-learning control events.
- Product instrumentation privacy behavior is covered by `frontend/scripts/smoke-instrumentation.ts` and is part of `npm run smoke`.

Completed: Dashboard desktop/mobile visual QA (2026-06-25).

- Live browser QA was run on the first viewport at desktop (1440x900) and mobile (375x812) against the running dev server.
- Three scoped issues were found and fixed in the Dashboard vertical slice without broad UI rewrites:
  - Text fit: the hero "Action" `FloatingMetric` truncated the word value ("Proceed" -> "Proc...") on mobile because the capsule value style was number-oriented (`text-2xl` + `truncate` + `tabular-nums`). Added an optional `valueClassName` prop to `FloatingMetric` and passed `text-xl leading-tight` for the word value so it renders in full. Default numeric behavior is unchanged.
  - Reduced motion: `MotionBackground` drifting gradient blobs and the Greeting `StrideWave` loop ignored `prefers-reduced-motion`. Both now use `useReducedMotion` and render static (no infinite drift/loop) under reduced motion while keeping full motion otherwise.
  - Density: a light density pass (`PageContainer` vertical padding, motion container gap, Greeting wave margin) moved the hero recommendation up ~56px so more of the stage panel sits in the first viewport.
- Verified live: Action value shows full "Proceed"; under emulated reduced motion the blob transform and wave opacity stay static across samples; with reduced motion off the blobs animate again (no regression).
- AI status visibility confirmed: `AIStatusBadge` shows "Local Ollama" with the model name in the Greeting header on desktop and remains visible on mobile.
- Checks after the change: `npm run lint` clean, `npm run build` succeeded, `npm run smoke` all suites passed. Backend was not touched.

Recovered: Dashboard Phase 2 integration regression (2026-06-25, follow-up QA pass).

- During the follow-up desktop/mobile QA pass, the working copy of `frontend/app/dashboard/page.tsx` was found to have regressed: it had lost the Phase 2 visual-slice + AI integration entirely. The on-disk file did not import or render `AIStatusBadge`, `FloatingMetric`, `LiquidSurface`, or `DemoControls`, did not call `fetchDailyReasoning` / `fetchAIStatus`, and the hero used the old `GlassCard` surface — even though `frontend/lib/api.ts` and the component/lib files still contained all the supporting code, and this work is documented above as complete.
- The integrated version was recovered intact from the Turbopack build source map (`.next/server/chunks/ssr/app_dashboard_page_tsx_*.map`, original TS `sourcesContent`), which was confirmed to be a clean superset of the regressed file (464 insertions / 34 deletions; the 34 deletions were only the pre-integration variants of lines the integrated version supersedes — no unique on-disk logic was lost). The regressed file was backed up before replacement.
- Post-recovery the dashboard once again renders the `Local Ollama qwen3:8b` AI status badge (top-right on desktop, model name correctly hidden under `sm:`), the Demo Tools row (Seed / Reset / Clear learning), and the `LiquidSurface` hero with `FloatingMetric` capsules and async daily-reasoning hydration.
- Verified live at desktop (1440x900) and mobile (375x812): no text overlap or clipping; greeting wraps cleanly to two lines on mobile; the AI badge, Demo Tools, This Week strip, hero recovery dial, confidence disclosure, freshness warning, and reasoning section all render.

Fixed: scoped `DayChip` text-fit watch item (2026-06-25).

- `shortWorkoutType` now returns "Reps" (was "Intervals", 9 chars) for interval workouts so the label always fits the narrow 7-up day grid at 375px, consistent with the other short labels (Long / Tempo / Race / Easy). `shortWorkoutType` is only used inside `DayChip`, so the change is fully scoped. Current week renders Tempo (no regression observed); the fix removes the latent overflow on weeks that contain interval sessions.
- Checks after recovery + fix: `npm run lint` clean, `npm run build` succeeded (all 14 routes), `npm run smoke` all 9 suites passed. Backend untouched; `/health`, `/ai/status` (Local Ollama, qwen3:8b), and `/decision` confirmed serving the dashboard.

Fixed: rest-day reasoning/decision consistency (2026-06-25).

- Root cause: the dashboard `/decision` request hard-coded `planned_workout` from the static demo scenario (`scenarios[0]`, "60 min interval run"), so on a scheduled rest day the engine reasoned about — and the AI explanation described — an interval session that wasn't on the plan, while the hero correctly showed "Rest day · no workout scheduled" (derived from the runner's real plan via `getTodaysWorkout`).
- Decision request now derives `planned_workout` from the runner's real plan slot for today (same `getTodaysWorkout` source the hero uses). The backend echoes this into `final_workout` and the bounded-AI/fallback reasoning, so the engine and its explanation track the actual scheduled session — a rest day stays a rest day. Biometrics, constraints, and recent-workout inputs are unchanged, so the recovery score and action selection are unaffected. Falls back to the scenario placeholder when no goal/plan is available yet.
- The frontend deterministic reasoning (`buildReasoningSummary` / `buildReasoningFactors`, shown while the local Ollama call runs and as the permanent fallback) is now rest-aware via a `restDay` signal threaded from the hero's own final-workout lookup. On a scheduled rest day the summary and all three factor cards (Recovery / Calendar load / Training progression) describe planned recovery instead of "quality work", so they no longer contradict the hero.
- Verified live: hero "Rest day · no workout scheduled" now matches the reasoning ("Today is a scheduled rest day — easy mobility or a walk at most…", "…a scheduled rest day banks that freshness…", "75 minutes free, but today's a rest day — spend it recovering…", "A scheduled recovery day — planned rest is part of how the block builds.").
- Checks: `npm run lint` clean, `npm run build` succeeded (all 16 routes), `npm run smoke` all suites passed. Only `frontend/app/dashboard/page.tsx` changed; backend code untouched (the fix relies on existing `/decision` echo behavior).

Remaining optional demo enhancements:

- Optional debug/export UI for the privacy-filtered local instrumentation log.
- Optional local Ollama benchmark report; it remains separate from the deterministic release gate.

### Acceptance Criteria

- A reviewer can see the product value in the dashboard first viewport.
- Primary training flow works with AI off.
- AI status is always visible when AI copy appears.
- The first eval gate report is generated and readable.
- Demo seed/reset makes the walkthrough repeatable.
- The vertical slice passes desktop and mobile visual QA.

## Phase 3: Persistence, Security, And Observability

### Objectives

Move from local-only state toward beta-ready authenticated persistence while treating training and readiness data as sensitive health-adjacent data.

### Work

- Define Firebase-backed collections/documents for:
  - user profile
  - goal
  - saved plan
  - readiness log
  - workout log
  - recommendation events
  - learned preferences
  - calendar and data freshness metadata
- Create a frontend storage abstraction that can read/write through Firebase when authenticated and fall back to localStorage when offline or in demo mode.
- Add migration behavior from existing localStorage values into server-backed state after sign-in.
- Add Firestore security rules:
  - users can only read/write their own documents
  - no unauthenticated access to user training data
  - least-privilege access by collection
- Add explicit user controls:
  - reset demo data
  - clear learned preferences
  - disconnect integrations
  - delete persisted user training data
- Keep product instrumentation privacy-conscious:
  - no raw health notes
  - no full calendar event text
  - no unnecessary personally identifiable information
- Keep user-specific data scoped by authenticated Firebase user id.

### Acceptance Criteria

- User data survives browser/device changes when signed in.
- Local demo mode still works without requiring backend persistence.
- Firestore rules are present before persistence is treated as beta-ready.
- No training recommendation depends on unavailable remote persistence.
- Sensitive/raw health-adjacent data is not written into analytics events.

### Status - Updated 2026-07-08

Implemented as domain slices; the Firestore security gate and strict backend
authentication gate pass. Privacy-conscious observability and the demonstrated
returning-sign-in persistence fixes are implemented. Cloud Firestore is enabled
for `kinetic-aca73`, rules are deployed, and live signed-in QA verifies
cross-session hydration, account isolation, local-cache ownership, and deletion
tombstones after reload and second-origin sign-in. The remote persistence gate
is closed as of 2026-07-09.

- Added the generic `StorageRepository<T>` contract with synchronous local reads/writes, asynchronous remote mirroring, Firebase hydration, idempotent migration markers, and deletion tombstones.
- Added Firebase-backed repositories for profile/goal, plan/readiness/workout log, recommendation history/preferences, today completion, and calendar-freshness metadata.
- Existing storage helpers remain local-first and mirror writes in the background; unavailable Firebase never blocks the recommendation flow.
- Remote records live under `users/{uid}/kinetic/{domain}`. The local cache records its authenticated owner and is cleared before a different UID hydrates, preventing cross-user migration.
- Added `firestore.rules` with authenticated owner-only access and default denial, plus `firebase.json`.
- Added persistence smoke coverage for migration, authenticated cache-owner switching, UID isolation, remote hydration, offline behavior, and deletion tombstones.
- Added a Firestore emulator test for owner access, cross-user denial, guest denial, and unknown-domain denial. After installing Microsoft OpenJDK 21, the full Auth + Firestore emulator suite passed on 2026-06-27.
- Added a Profile data-control action that clears local training state and the signed-in Firebase mirror. Existing demo reset, learning reset, and integration disconnect controls remain available.
- Returning sign-in now waits for authenticated storage hydration before
  merging Firebase identity into the local profile, preventing fresh sessions
  from overwriting a complete remote profile or incorrectly routing a returning
  runner to onboarding.
- Remote mirrors are ordered and coalesced per storage key so demo seed/reset
  bursts cannot race a late tombstone over a newer payload; true deletes still
  write tombstones.
- Signed-in deletion now requires confirmed Firebase tombstones before local
  deletion is finalized; failures surface a retryable Profile error instead of
  silently leaving remote data undeleted. Profile uses an in-page confirmation
  panel rather than a native browser dialog so the flow is accessible,
  stylable, and repeatable in browser QA.
- Added typed local product observability for recommendation responses, AI
  source/fallback/latency/timeout, intake review/confirmation/discard,
  training-review window/source, persistence hydrate/mirror/delete outcomes,
  and stale-data warnings. The sanitizer drops raw notes, biometrics,
  workout/calendar text, tokens, email, UID, and unnecessary identity data, and
  telemetry failures are isolated from product flows.
- Added focused returning-user smoke coverage to prove hydration precedes
  identity merge, timeout-without-cache fails closed, and same-user offline
  cache can still route safely.

Closed beta-ready persistence gate:

- Live signed-in browser QA proves deletion tombstones remain deleted after
  reload and after signing into the same account from the second local origin.
  Keep UID scoping, deletion semantics, owner-only rules, and local offline
  fallback intact during later beta hardening.

## Phase 4: AI Expansion

### Objectives

Expand beyond the first AI wedge only after the demo flow, fallback behavior, and eval gates are stable.

### Expanded AI Capabilities

Preserve the first wedge from Phase 2: daily reasoning, weekly recalibration, and behavior learning. Add new capabilities only after those are stable.

- Natural-language intake:
  - Parse notes such as "traveling Wed-Fri and slept badly" into structured candidate constraints.
  - Deterministic logic validates before use.
- What-if planning:
  - Simulate scenario variants deterministically.
  - Use AI to explain pros, cons, and tradeoffs.
- Training summaries:
  - Summarize weekly/monthly consistency, recovery trends, missed sessions, and learned preferences.

### Backend Work

- Normalize AI response envelopes:
  - `mode`
  - `source`
  - `schema_version`
  - `grounding`
  - `fallback_used`
  - `warnings`
- Add endpoints:
  - `POST /ai/parse-intake`
  - `POST /ai/what-if`
  - `POST /ai/training-summary`
- Enforce timeout and fallback behavior for every live AI call.

### Frontend Work

- Add a "Tell Kinetic what changed" input on Dashboard and/or Plan.
- Add a What-if panel on Plan.
- Add training review summary section.

### Acceptance Criteria

- Primary workout flow works with AI off.
- Every AI feature has a deterministic fallback.
- AI output cannot directly mutate a plan.
- AI can be demonstrated live at no cost with local Ollama.

### Status - Updated 2026-07-01

What-if, bounded natural-language intake, and read-only training-summary
vertical slices are complete.

- Added deterministic, pure What-if simulation on Plan. It previews day, duration, and easy-only changes without mutating the saved plan.
- Added `POST /ai/what-if` with a typed `what-if.v1` envelope, explicit deterministic grounding, timeout protection, and the existing bounded weekly reasoning fallback.
- Added malformed-output and timeout eval cases and frontend no-mutation smoke coverage.
- Persistence/memory, signed-in responsive QA, strict backend auth, and the deterministic demo gates are now complete.
- Added `POST /ai/parse-intake` with typed `intake.v1` request/response models,
  a bounded local-Ollama prompt, provider timeout handling, schema validation,
  exact source-text grounding, and conservative deterministic parsing when AI
  is disabled, unavailable, slow, malformed, off-schema, or ungrounded.
- Intake supports explicit race distance/date/weekly-mileage goals, preferred
  training days, day-level minute/easy-only availability, and experience
  preference changes. Sparse, ambiguous, recovery/medical, and unsupported
  requests produce warnings instead of invented state.
- Plan now reuses `GlassCard`, `RevealSection`, the existing plan generator,
  and the pure availability adjuster for a review-first intake panel. Parsing
  cannot write state. Confirmation revalidates every field and grounding
  locally, then applies an all-or-nothing deterministic update.
- Added focused backend gates for grounding, immutability, sparse input,
  malformed output, timeout, and ungrounded-output fallback, plus frontend
  smoke coverage for no mutation and deterministic confirmation.
- Signed-in production-build browser QA passed with strict backend auth:
  `/ai/parse-intake` returned 200 with the Firebase token and 401 anonymously;
  review left the saved plan unchanged, confirmation applied through the
  deterministic planner, ambiguous input disabled confirmation, and the intake
  card had no horizontal overflow with 44px controls at 375px and 320px.
- Intake now uses a dedicated `llama3.2:3b` model, Ollama-native structured
  output, a compact typed extraction schema, and deterministic field
  agreement. Kinetic constrains which fields are allowed, and Ollama must
  normalize every explicit value before the response can report a live model
  success.
- Backend startup warms the intake model and keeps it resident for the server
  session. A 24-second server deadline remains below the frontend's 30-second
  safety deadline.
- The optional live gate now runs two identical passes across eight cases:
  schedule plus availability, bundled goals, experience, simple availability,
  zero availability, easy-only constraints, sparse ambiguity, and unsupported
  recovery language. It requires exact values, request immutability, stable
  drafts, `source=ollama`, `fallback_used=false`, and sub-24-second latency.
  On 2026-06-30 all 16 executions passed with p95/max 16.67 seconds; the first
  post-startup HTTP request completed in 8.82 seconds.
- Dashboard decision requests now use the same rolling HRV baseline as
  Recovery. Focused smoke coverage locks the seeded state to 84/100 and
  recovered on both surfaces.
- Added authenticated `POST /ai/training-summary` with a typed
  `training-summary.v1` envelope. Deterministic code owns 7/30-day consistency,
  completed volume, effort, and recovery-trend calculations.
- The request builder sends only bounded workout outcomes and explicitly
  confirmed preference descriptions. Workout names, free-text notes, rejection
  reasons, and calendar context are excluded.
- Optional local Ollama narration uses the warmed `llama3.2:3b` model and a
  native JSON schema. Any invented number, medical claim, malformed output,
  timeout, or provider failure is discarded for deterministic review copy.
- Plan now reuses `GlassCard` for a read-only 7/30-day training review. It
  cannot write the saved plan or behavior history.
- Added deterministic backend cases for weekly/monthly windows, sparse
  history, immutability, privacy grounding, invented facts, and timeout
  fallback, plus frontend request-privacy/no-mutation smoke coverage.
- Signed-in browser QA on 2026-07-01 verified the live local-Ollama path
  end-to-end: 30-day review returned `Local AI · grounded`, changed only the
  displayed aggregate window, and produced no browser warnings or errors.
  The sparse 7-day case rejected ungrounded narration and safely displayed the
  deterministic review.
- The same browser pass verified that “I can only train Tuesday for 40 minutes
  this week” produced one source-grounded, deterministically validated draft.
  The draft was discarded without changing the saved plan.

## Phase 5: Full UI/UX Refresh

### Objectives

Scale the validated Dashboard visual system across the app, borrowing interaction principles from Apple-style product pages and the provided fitness mockup.

### Visual Direction

- Use a central "training stage" instead of stacked generic cards.
- Use layered translucent surfaces for context and metrics.
- Use floating metric capsules for recovery, calendar load, confidence, and plan changes.
- Use scroll-linked reveal sections for the Plan page.
- Use highlight rails for major plan and AI capabilities.
- Prefer real or generated running/training imagery where it helps the user inspect the product state.
- Avoid copying Apple assets, copy, or brand structure.

### Reusable UI Primitives

- `LiquidSurface`
- `FloatingMetric`
- `HighlightRail`
- `RevealSection`
- `MetricArc`
- `PhoneFrame`
- `AIStatusBadge`

Start with the Dashboard vertical slice in Phase 2. Do not rewrite every page until the primitives are proven across desktop, tablet, and mobile breakpoints.

### Page Work

- Dashboard:
  - Make today's workout the hero/stage.
  - Surface recovery, calendar, confidence, AI reasoning, and CTA state as layered overlays.
  - Keep accept/reject/complete flows obvious.
- Plan:
  - Add progression highlights for mileage, long run, taper, adaptations, and preserved workouts.
  - Add What-if panel.
  - Improve weekly recalibration explanation.
- Profile:
  - Turn "Kinetic is learning" into a memory/control center.
  - Show confirmed preferences and removable patterns.
  - Clarify integration statuses.
- Recovery:
  - Make manual readiness input feel intentional rather than placeholder.
  - Explain freshness and confidence impact.
- Onboarding/Login:
  - Improve first impression while keeping setup fast.

### Accessibility And Performance

- Respect `prefers-reduced-motion`.
- Avoid text overlap at mobile and desktop breakpoints.
- Keep tap targets large enough.
- Avoid one-note blue/purple palettes.
- Keep animations GPU-friendly and non-blocking.

### Acceptance Criteria

- Dashboard, Plan, Profile, Recovery, Onboarding, and Login pass desktop/mobile visual QA.
- No core interaction is hidden behind decorative motion.
- The demo feels polished within the first viewport.

### Status - Updated 2026-06-27

Implementation complete. Core visual system is proven and rolled out across all primary pages and checkpointed with the persistence/memory vertical slice.

Direction decisions:

- Palette is **blue** (system-wide). A bold lavender variant was prototyped to prove the floating-card effect, then fully reverted per user direction — color was not the point; the substantive design patterns were.
- The two core elements the user prioritized are **real athletic photography** and **Apple-style scroll-reveal**, applied across pages so nothing feels half-updated.

Primitives:

- Built/validated: `LiquidSurface`, `FloatingMetric`, `AIStatusBadge`, `RevealSection` (scroll-linked fade/lift/settle, `prefers-reduced-motion` aware; uses a module-scope `MOTION_TAGS` map to avoid the `react-hooks/static-components` lint error), `MetricArc` (semicircle gauge), `HighlightRail`, and `PhoneFrame`.
- New: `AthleticImage` — full-bleed `next/image` frame with a blue duotone wash (`bg-blue-600/12 mix-blend-multiply`), bottom-up legibility gradient, slow hover zoom (motion-reduce guarded), and an editorial overlay (gradient eyebrow dot + `h2` title + subtitle). Height is set by the caller via `className`.
- New: `KineticPreviewStack` — photo-backed onboarding product stage built from `AthleticImage` + three compact `PhoneFrame` previews; side screens collapse away on narrow mobile.
- `ProductStage` was removed from the backlog; the established primitives already cover that role without another overlapping abstraction.

Assets: 4 verified running photos in `frontend/public/images/athletic/` — `track-lanes.jpg` (blue dawn silhouette, primary hero), `runner-trail.jpg` (blue-sky road), `runner-track.jpg` (aerial track), `runner-sunset.jpg` (mountain trail). A shoe photo was removed (visible trademark + off-palette).

Page work landed:

- Dashboard: `MetricArc` recovery gauge as the stage centerpiece; editorial headlines + gradient eyebrow dots; canvas/blob/shadow palette on blue. Mount-stagger (not scroll-reveal) since it's above the fold.
- Dashboard follow-up: recommendation now leads the page as a wider photo-backed `LiquidSurface` stage using `AthleticImage` (`track-lanes.jpg`), with week context and demo tooling moved below the primary workout moment. Added a dashboard `HighlightRail` for action/recovery/window/week signals, tightened the greeting scale, removed tight/negative heading letter-spacing from the dashboard/image/rail path, and made the workout breakdown horizontally safe on narrow screens.
- Mobile app-shell follow-up: authenticated routes now use a fixed 64px left navigation rail below `sm`, replacing the duplicated mobile top header. The rail owns the Kinetic home mark at the top, icon + label destinations in the middle (`Today`, `Plan`, `Recovery`, `Settings`), and the signed-in profile avatar at the bottom. The content lane reserves the rail width plus matching 16px left/right outer gutters; desktop keeps the existing horizontal top navigation. `lucide-react` was added for familiar navigation icons. `KineticLogo` now generates a unique SVG gradient ID per instance so hidden desktop/mobile instances cannot collide.
- Narrow-screen resilience: the dashboard photo stage and headings were tightened for the reduced content lane, while `MetricArc` and `StrideWave` now scale to their containers instead of overflowing fixed pixel widths.
- Login: split hero — blue dawn-silhouette `AthleticImage` beside the form card (`lg` grid; image hidden on mobile to keep auth fast).
- Plan: `runner-sunset` banner header ("The Plan") + Apple-style `HighlightRail` block summary + every section wrapped in `RevealSection` + per-week list reveals.
- Recovery: `runner-trail` banner header + reveals on the metric cards (kept the existing centered `ProgressRing` score hero).
- Profile: `runner-track` cover banner inside the existing mount-stagger.
- Onboarding welcome: `runner-sunset` `KineticPreviewStack` under the stride wave, with layered phone-like product previews inspired by the pasted fitness mockup.
- Settings: `track-lanes` banner header.
- Onboarding step forms (`goal`/`integrations`/`preview`/`prs`) intentionally left clean to keep the flow focused.

Validation: `npm run lint`, `npm run build` (16 routes), `npm run smoke`, and the escape-corruption scan are green. Live browser QA confirmed the login split-hero and plan banner render correctly on the blue canvas; the later responsive sweep below covered the newest dashboard shell, mobile rail, onboarding stack, and plan rail.

Bug fixed during QA: `WeekCard` rendered its own `<li>`, so wrapping it in `RevealSection as="li"` produced nested `<li>` (hydration error). Fixed by making the `RevealSection` the list item and removing `WeekCard`'s inner `<li>`.

Completed: responsive visual QA and scoped usability follow-up (2026-06-27).

- Ran the requested route sweep at desktop (1440x900), tablet (1024x768), 375x812, and 320x568. Plan, Recovery, Profile, Settings, Login, and Onboarding rendered in the isolated browser; Dashboard correctly redirected the signed-out session to Login, so its authenticated stage still relies on the prior 2026-06-25 live pass plus the strict-auth follow-up noted below.
- Verified the mobile shell geometry at true CSS viewport sizes:
  - fixed rail is 64px wide and full viewport height
  - content starts at 80px and ends 16px before the viewport edge
  - app content width is 279px at 375 and 224px at 320
  - Plan / Recovery / Settings active states expose `aria-current="page"` live; Today uses the same mapped branch and was reviewed structurally because Dashboard requires authentication
  - rail destinations are 51x56px and the logo target is 51x64px
  - the bottom sign-in/profile slot remains anchored by the rail's `mt-auto` section
- Verified `documentElement.scrollWidth === innerWidth` on every requested route at 375px and 320px. No content text crossed the viewport bounds; the only intentionally off-canvas elements are the fixed, pointer-events-none ambient gradient blobs.
- Verified the photo-overlay headlines and subtitles remain legible and wrap cleanly on Recovery, Profile, and Settings down to 320px; desktop/tablet Login and Recovery also retain clear image/form hierarchy.
- Fixed onboarding's mobile CTA hierarchy by moving **Get started** ahead of `KineticPreviewStack`. The CTA is now visible in the first viewport at both narrow sizes (y=398 at 320px; y=403 at 375px).
- Added a mobile 44px minimum control height within `#app-content`, without changing the 56px rail rows or compact desktop treatment.
- Rebuilt Recovery's fatigue/soreness range styling so the visual track stays 6px while the interactive target is 44px high.
- Tightened the narrow Recovery sleep fields: labels carry the unit context, redundant inline suffixes hide below `sm`, and both inputs retain readable values with at least a 24px-wide by 44px-high target at 320px.
- The isolated QA browser intentionally did not import an authenticated Firebase profile. The live rail check therefore exercised the bottom **Sign in** fallback; the authenticated avatar uses the same anchored container and was verified structurally in `top-nav.tsx`, but an end-to-end signed-in avatar session remains part of the broader strict-auth browser check.
- Post-fix validation is green: `npm run lint`, `npm run build` (16 static pages), and `npm run smoke` (9 suites).

Phase 5 closeout:

- Completed authenticated in-app browser QA on 2026-06-27 at desktop (1440x900), tablet (1024x768), 375x812, and 320x568 across Dashboard, Plan, Recovery, Profile, Settings, Login, and Onboarding.
- Verified the real signed-in avatar at the bottom of the mobile rail, desktop avatar treatment, route active states, 64px rail, symmetric 16px content gutters, mobile 44px targets, and zero document-level horizontal overflow.
- Verified live dark-mode legibility for authenticated Profile photography/surfaces and the Login split hero.
- After the local-first boundary fix, the signed-in 320px Dashboard reached its meaningful heading in 1.57 seconds during the final production-bundle browser check, inside the demo's three-second target even while remote persistence was unavailable.
- Completed strict backend token verification on 2026-06-29 without changing the saved `.env`: anonymous protected requests returned `401`, while the real signed-in browser received `200` from `/decision`, `/decision/reasoning`, `/behavior-insights`, and `/integrations/calendar/health`.
- Network tracing also found that unchanged remote hydration remounted Profile and duplicated its protected requests. Hydration now remounts only when the local cache actually changes.
- Fixed five issues found only in the authenticated pass:
  - Remote persistence hydration could hold the entire app on a loading screen when Firestore was unreachable. The boundary now waits only for Firebase identity, renders the protected local cache immediately, hydrates remotely in the background with a two-second deadline, and prevents late results from overwriting newer local actions.
  - The Dashboard photo headline was pushed above its overflow-hidden frame at 320px; the narrow stage now has enough height for the full title and metrics.
  - The Profile memory header and connected-service controls squeezed outside their cards at 320px; both stack below the 360px breakpoint.
  - Desktop Profile styling indicated the active route visually but omitted `aria-current="page"`.
  - Onboarding Back links were only 29px wide; every step now provides a 44x44px target.
- The signed-in account had not completed its race goal, so Plan's authenticated empty state was covered in this pass; the populated Plan/What-if surface remains covered by the earlier seeded visual and smoke passes.
- `AthleticImage` now supports a configurable `h1`/`h2`; page banners use `h1`.
- Image priority was audited: visible page heroes remain priority while the below-fold onboarding preview no longer preloads.
- Plan now includes the What-if panel.
- Profile now includes the training-memory center with confirmed preferences, tentative patterns, confidence/support context, sparse-history messaging, confirm/dismiss/remove/clear controls, and repository persistence.
- Recovery freshness/confidence explanation depth remains optional polish.

## Phase 6: Evals And Verification

### Objectives

Make the AI/product architecture defensible with a concrete eval story.

### Deterministic Evals

Must run without Ollama:

- schema validity
- fallback behavior
- stale-data warnings
- no medical claims
- no recommendation drift
- no AI state mutation in first-wedge AI outputs
- sparse-history behavior
- learned-preference safety
- natural-language intake parsing guardrails
- what-if scenario validation

Hard gates:

- 100% no medical claims.
- 100% no recommendation drift.
- 100% sparse-history warnings.
- 100% fallback schema validity.
- 100% no AI state mutation in first-wedge outputs.
- 100% expanded AI mutation attempts rejected unless deterministic validation approves them.
- Primary recommendation endpoint remains fast and usable without live AI.

### Optional Local AI Evals

Run when Ollama is available:

- valid JSON rate
- grounding score
- safety pass rate
- latency
- fallback rate
- representative failure examples

Targets:

- At least 95% schema validity before using a local model in demos.
- 100% safe fallback on malformed JSON, timeout, unavailable model, or schema mismatch.
- Latency is reported, not hidden; local model slowness must not block the primary training flow.

### Frontend Smoke Coverage

- Plan generation.
- Calendar-aware adjustment.
- Weekly recalibration trace.
- Behavior storage.
- Today workout flow.
- AI status rendering.
- Fallback explanation rendering.

### Acceptance Criteria

- Eval output is easy to read and include in the demo/resume story.
- Optional local AI evals do not block baseline CI/dev checks.
- Failures distinguish product-risk issues from local-model availability.

### Status - Updated 2026-06-27

Baseline deterministic release proof completed and extended for intake.

- Added [EVAL_REPORT.md](./EVAL_REPORT.md), generated by `python -m evals.generate_report`.
- The current report is generated from the same canonical registry used by the
  CLI and covers runtime fallback, token claims, daily/weekly reasoning, Mobile
  Today, What-if, intake, mobile intake/check-in, behavior result contracts,
  privacy, training summaries, strict auth, malformed output, provider failure,
  no mutation, and timeout fallback.
- Added frontend smoke suites for persistence migration/deletion, memory lifecycle actions, and deterministic What-if behavior.
- Deterministic backend gates and frontend smoke coverage now also enforce
  bounded intake parsing, exact grounding, safe failure fallback, no
  parse-time mutation, and confirmation-time validation.
- Optional local Ollama measurements remain informational and do not block the baseline gate.

### Harness Hardening Roadmap - Started 2026-07-23

Objective: make test evidence reproducible, hermetic, diagnostic, and suitable
for product/model promotion without discarding the existing safety-focused
scenarios.

Implemented now:

- Added one `GATE_SPECS` registry as the source of truth for deterministic gate
  execution and report generation.
- The generated report now records actual gate groups and explicit assertion
  counts, including the current mobile Today, intake, check-in, and behavior
  result contracts.
- Added `python -m evals.generate_report --check`; CI runs the executable gates
  and fails when `EVAL_REPORT.md` is stale.
- Stubbed Calendar availability inside deterministic backend harness processes
  so developer credentials and network state cannot change results.
- Removed the full `_gates` invocation from `_smoke`; CI no longer executes the
  complete backend gate suite twice.

Next priority:

- Introduce `pytest` for backend cases and Vitest for frontend domain/contract
  cases, preserving stable IDs and existing fixtures. Use parameterized cases,
  scoped environment/provider fixtures, test filtering, JUnit output, and
  changed-risk coverage instead of a vanity coverage target.
- Install and require a small Playwright suite for the critical user journeys:
  returning-user hydration, plan/Today decision, intake review plus
  discard/confirm, check-in plus persistence/reload, and visible deterministic
  fallback.
- Unify live-model evaluation across daily, weekly, behavior, intake, What-if,
  and training-summary workloads. Evaluate provider/model/parameters/prompt as
  one configuration, repeat scored cases, and emit versioned JSON plus a
  human-readable promotion record with cold/warm p50/p95/max latency,
  fallback rate, quality/safety, cost or local resource use, model digest,
  hardware, and commit.
- Add property-based planner tests over race, experience, mileage, readiness,
  freshness, availability, travel, and confirmed preferences. Enforce mileage,
  spacing, race-day, availability, monotonic-confidence, and non-mutation
  invariants.
- Add an adversarial intake corpus covering prompt injection, contradictory and
  mixed intents, medical language, sensitive identifiers, typos, Unicode,
  unusual dates, and bounded maximum-length inputs.

Before hosted-provider or broader beta promotion:

- Add provider resilience tests for rate limits, 5xx responses, malformed or
  partial streams, disconnects, cancellation/deadlines, warmup failure,
  concurrent requests, cache contention, and schema-valid but ungrounded facts.
- Generate or validate shared schemas so Python, TypeScript, and Swift fixtures
  prove backward/forward contract compatibility rather than only matching
  hand-maintained examples.
- Add Linux deterministic CI and a macOS Swift package/shared-fixture job while
  retaining the Windows Auth + Firestore integration authority.
- Add a calibrated blinded human-review set for coaching clarity, trust, and
  usefulness. Any automated model judge remains secondary and must agree with
  the human reference set before influencing promotion.

Acceptance criteria:

- The deterministic report can always be reproduced by its documented command,
  and `--check` fails after any unreported gate change.
- Required deterministic suites make no uncontrolled external calls and pass
  with or without developer credentials.
- Each failure reports a stable gate/case ID and can be filtered locally.
- Critical browser journeys run in CI with owned dependencies and fixtures.
- Model promotion requires representative multi-run user and technical evidence,
  not a model-name change or a single successful sample.
- Generated/property/adversarial cases preserve all deterministic safety,
  privacy, grounding, and explicit-confirmation boundaries.

## Phase 7: Demo Packaging And Optional Beta Expansion

### Objectives

Package the product so it is easy to show, explain, and extend.

### Work

- Expand demo data seed/reset beyond the minimal Phase 2 controls if needed.
- Add a concise architecture diagram or architecture README section.
- Add deploy notes for:
  - local deterministic/fallback mode
  - local Ollama demo mode
  - Vercel frontend
  - Render backend
- Add export/reset controls for user data.
- Add beta monitoring/logging guidance beyond the lightweight product instrumentation added earlier.
- Decide later whether to add:
  - BYO AI key mode
  - hosted AI provider
  - user-ready native mobile beyond the initial proof
  - native calendar integration
  - Garmin and Oura integrations

### Acceptance Criteria

- A reviewer can run or watch the demo without special paid services.
- The architecture story is clear in under two minutes.
- The next beta steps are obvious and grounded.

### Status - Updated 2026-06-27

Demo packaging is complete.

- Added the architecture summary and five-minute walkthrough.
- README links directly to the proof artifacts and separates demo-complete from beta work.
- Added a user-facing training-data deletion control.
- Deployment/monitoring guidance can expand when a hosted beta target is
  selected. This checkpoint did not include hosted AI, native/background
  HealthKit sync, Garmin/Oura ingestion, native mobile, or autonomous AI
  mutation; native iOS was selected later for an initial proof and is now the
  primary product surface.
- Added [BETA_RUNBOOK.md](./BETA_RUNBOOK.md), [QA_MATRIX.md](./QA_MATRIX.md),
  and `npm run beta:readiness` as the first beta-hardening checkpoint. The
  connected `npm run beta:audit` advisory gate is documented separately and
  passes after the Windows-safe audit runner fix; the offline demo path still
  works without registry access.

### Planned Provider-Neutral AI Runtime Checkpoint

Objective: make model selection an evaluated product/configuration decision
instead of a cross-stack implementation change, without weakening the
deterministic safety core.

Work:

- Define a provider-neutral request contract for prompt/messages, structured
  output schema, workload timeout, output budget, temperature, and optional
  reasoning effort.
- Define a provider-neutral result contract carrying text or structured output,
  provider, model, latency, finish/failure reason, and fallback metadata.
- Move Ollama-specific streaming, `think`, `keep_alive`, native `format`, and
  option translation behind an Ollama adapter.
- Add a provider registry and configuration-driven workload policy for daily
  reasoning, weekly reasoning, behavior analysis, intake, and training
  summaries.
- Replace `local_ollama`/`ollama` assumptions in shared API, frontend, and
  telemetry contracts with generic live-model state plus separate
  provider/model metadata. Preserve compatibility during migration.
- Add a hosted adapter only after the neutral boundary is covered by contract
  tests. Preserve local Ollama, disabled, and deterministic fallback modes.
- Extend the eval harness to compare candidate configurations per workload,
  including model parameters and provider, rather than comparing model names
  alone.
- Record each promoted configuration in the architecture documentation with
  the measured user benefit and accepted technical tradeoff.

User-versus-technical decision rule:

- Hard user gates: no safety regression, exact grounding where required,
  schema/contract validity, deterministic non-mutation, and honest uncertainty.
- Surface gates: synchronous workflows meet their interaction deadline;
  asynchronous workflows remain responsive, cancellable/fallback-safe, and
  clearly disclose delayed or fallback output.
- Technical optimization after those gates pass: total cost, throughput,
  privacy/data residency, hardware footprint, cold start, operational
  complexity, and provider portability.
- Choose the lowest-cost and simplest configuration on the passing
  quality/latency frontier. Do not buy capability with no measured user benefit
  or save technical cost by crossing a user-experience gate.

Acceptance criteria:

- Existing AI feature modules do not contain provider-specific request logic.
- A compatible model can be changed per workload through configuration and
  eval promotion without changing feature code.
- A second provider can be added through one adapter plus configuration,
  contract tests, and eval evidence, without changing user-facing envelopes.
- Provider/model provenance remains visible in status and observability without
  becoming a product mode or mutation authority.
- All deterministic fallback, privacy, grounding, no-medical-claim, and
  no-mutation gates continue to pass.
- A model decision record reports quality, latency distribution, fallback rate,
  cost or local-resource use, and the user-facing reason for promotion.

## Execution Order

1. Close and checkpoint the current UI slice without adding QA artifacts.
2. Keep the shippable-demo proof green: readable eval report, architecture summary, and five-minute walkthrough.
3. Build persistence by domain behind the local-first repository boundary; require UID scoping, idempotent migration, offline fallback, rules, and emulator tests.
4. Deliver training memory on that repository boundary; tentative patterns never score and confirmed preferences remain bounded nudges.
5. Completed the bounded AI sequence: deterministic What-if, review-first
   natural-language intake, then read-only weekly/monthly training reviews.
6. Live two-session Firebase persistence and privacy-conscious observability
   are closed; dependency posture, final QA matrix, hosted preflight, and
   rollback guidance are complete.
7. Apple Health CSV readiness import is implemented as a web-beta bridge.
   The completed initial native proof now leads into the selected user-ready
   native product direction in
   [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md). Garmin/Oura, hosted
   AI, broad notifications, coach sharing, full two-way Calendar sync,
   open-ended chat, and autonomous plan mutation remain out of scope.
8. Continue mobile in this order: close the shared notification contract;
   build permanent native foundation/onboarding/settings; add bounded native
   plan ownership; add privacy-minimized Apple Calendar and progress; then
   close user-ready production and external-beta gates.

## Worktree Checkpoint - Updated 2026-06-29

Reviewed and checkpointed.

- `git status --short` and `git diff --check` were run before implementation.
- `.edge-qa*` profiles and temporary screenshots were left untouched and must remain excluded from any product commit.
- Product changes were reviewed as UI, persistence/memory, What-if/evals, and documentation slices.
- The reviewed UI, persistence/memory, What-if/eval, and documentation slices were selectively committed as `5d13c38`.
- Authenticated cache isolation, Firestore emulator coverage, signed-in release QA fixes, and the strict-auth release gate were checkpointed in the follow-up commits through `b2f6d59`.
- PRD, architecture, demo, README, and phase-status language were synchronized on 2026-06-29 to separate implemented demo capabilities from the remaining beta and AI work.
- No user artifact was deleted.

## Backend Local Start Checkpoint - Updated 2026-06-25

Completed.

- Reproduced the reported backend start issue and identified the common incorrect target:
  - `uvicorn app.main:app` fails because `backend/app/main.py` is a CLI scenario runner.
  - The FastAPI app lives at `backend/app/api.py`; local startup should use `uvicorn app.api:app`.
- Verified the backend can start on `http://127.0.0.1:8000` with:
  - `.\.venv\Scripts\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port 8000`
- Verified:
  - `GET /health` returns `{"status":"ok"}`.
  - `GET /ai/status` returns the configured AI runtime status.
  - `POST /decision` returns the current `{ decision, ai_reasoning, reasoning_available }` envelope when local auth is permissive.
- Root cause of the Dashboard "Couldn't load today's decision" banner was local auth config, not decision-engine failure:
  - `backend/.env` had `KINETIC_AUTH_REQUIRED=true`, so unauthenticated Dashboard requests to `/decision`, `/availability/week`, and `/travel` returned 401.
  - Local demo auth was restored to permissive mode with `KINETIC_AUTH_REQUIRED=false`, matching `.env.example`.
- The local Firebase service-account path in `backend/.env` currently points at `C:\Users\kgong\kinetic\secrets\firebase-admin.json`.
- Follow-up check confirmed that file is present locally, has the expected service-account keys, and Firebase Admin initializes from it successfully. The earlier editor "file not found" state appears to be stale editor state or an incorrect open reference, not a missing repo secret.
- Calendar endpoints now pass auth locally but still return 503 when Google Calendar OAuth credentials are absent. This is expected best-effort behavior and does not block `/decision`; the Dashboard swallows calendar refresh failures and keeps the saved/base plan path usable.

## Current Known Risks

- Signed-in frontend routing, persistence fallback, authenticated shell rendering, and strict backend token enforcement now pass live browser QA. Local demo mode can continue using permissive auth.
- Dashboard visual QA is complete across desktop, tablet, 375px, and 320px, including the authenticated mobile rail/avatar. `ThisWeekStrip` chips remain a watch item at narrow widths with unusually long workout labels.
- Local Ollama intake passes the optional eight-case, two-repeat live gate on
  this machine with `llama3.2:3b`; cold server startup is slower because it
  deliberately warms and pins the model before accepting requests.
- Direct frontend and backend dependencies are pinned to the currently
  verified versions. The 2026-07-20 hardening checkpoint passed
  `npm run beta:audit`, pinned Next.js and `eslint-config-next` at `16.2.10`,
  refreshed patched Firebase/tooling transitives, and added a Next-only
  PostCSS override. Newly published July 2026 advisories changed that
  result. On 2026-07-22 the vulnerable `brace-expansion` and `sharp` ranges
  were remediated. On 2026-07-23 Next.js and `eslint-config-next` were upgraded
  together to patched Active LTS `16.2.11`; the connected audit and complete
  GitHub-hosted Windows integration suite passed. On 2026-07-29 a new PostCSS
  advisory was remediated by moving the scoped override to patched `8.5.22`.
  The same registry update added GHSA-mh99-v99m-4gvg across the transitive
  ESLint/minimatch/brace-expansion dev-tool graph. GitHub lists
  `brace-expansion` `5.0.8` as patched, but no compatible patched path is
  published in the npm graph currently consumed by ESLint. The connected gate
  has a package-set/advisory-exact exception that expires 2026-08-15; any
  different advisory, runtime dependency, graph change, or expiry still fails.
  Remove it as soon as a compatible patched graph is published. The managed
  workstation proxy still lacks the new Next tarball, so the checked-in Windows
  workflow is the reproducible integration authority. Remove the PostCSS
  override only when the same gates pass against a patched Next manifest that
  no longer needs it.
- Telemetry QA now exercises every typed product event family, sensitive-key
  rejection, numeric/enum bounding, log capping, and write/remove failure
  isolation through `smoke-instrumentation.ts`.
- Hardening now also excludes raw workout notes from behavior-AI prompts and
  adds a deterministic backend privacy gate for that boundary. Frontend smoke
  coverage includes plan-safety invariants across race distance, experience
  level, and very low starting mileage.
- Apple Health CSV import is implemented from Profile as a privacy-minimized
  readiness input path. It accepts bounded sleep, HRV, resting-heart-rate,
  fatigue, and soreness fields, drops unsupported columns/notes, and writes
  through the existing readiness store. Native HealthKit sync and the
  calendar-aware Today surface are implemented and summarize locally before
  syncing bounded daily readiness records. The completed initial proof now
  leads into the user-ready native roadmap: onboarding/settings, bounded plan
  ownership, Apple Calendar/progress, and external-beta hardening. Garmin and
  Oura remain deferred.
- Final operational polish is complete: [BETA_RUNBOOK.md](./BETA_RUNBOOK.md),
  [QA_MATRIX.md](./QA_MATRIX.md), and [DEPLOY.md](./DEPLOY.md) document hosted
  preflight, strict-auth posture, rollback, triage, protected artifact handling,
  and the boundary that later integrations are a separate product phase.
- Other local-Ollama surfaces can still be slow; every user-facing AI path must remain async or fallback-safe.
- The LLM client centralizes calls and supports per-workload Ollama model
  overrides, but runtime modes, provider dispatch, response provenance, and
  frontend/telemetry contracts still encode Ollama directly. Switching Ollama
  models is configuration-driven; adding a hosted provider remains a
  cross-stack change until the provider-neutral runtime checkpoint is complete.
- Bounded natural-language intake and weekly/monthly training reviews are
  implemented, signed-in live browser QA passes, and the live Firebase
  persistence gate is closed. Prefer beta hardening over new AI workflows.
- Privacy-conscious observability is implemented locally with typed,
  sanitized, failure-isolated envelopes. Firestore isolation rules pass in the
  emulator; Cloud Firestore is enabled and rules are deployed for
  `kinetic-aca73`. Live QA verifies cross-session hydration, account isolation,
  local-cache ownership, and deletion tombstones after reload and second-origin
  sign-in. Signed-in delete failure now fails visibly instead of silently
  clearing local state.
- `.edge-qa*` profiles and temporary screenshots remain intentionally untracked and must not be included in product commits.

## User-Ready Native Mobile - Rebaselined 2026-07-29

The completed initial mobile proof established the native safety and data
foundation. The selected product direction now continues through a user-ready
iOS app, documented in
[MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md). Mobile is complete only
when an external runner can complete the core install-to-deletion journey
without the web or developer help.

Native iOS is Kinetic's primary user-facing product. Core runner functionality
is designed mobile-first and does not count as product-complete when it exists
only on web. Web remains the advanced What-if/deep-analysis surface and the
primary demo, admin, QA/eval, and beta-operations surface.

Build sequence:

1. HealthKit/Firebase sync spike: minimal SwiftUI shell, Firebase Auth,
   HealthKit read permissions, local daily readiness summarization, and
   bounded Firestore sync.
2. Native Today surface: show today's workout, recovery/readiness, calendar
   availability/freshness, selected action, confidence, and deterministic or
   bounded-AI explanation.
3. Bounded mobile intake: keep NLP for explicit schedule, availability, goal,
   and preference changes, but require review-only drafts and deterministic
   confirm/apply before plan mutation. Recovery, pain, missed-workout, and
   reflection notes must route into guided bounded flows rather than dead-end
   warnings.
4. Recovery/check-in loop: capture completion/skipped/effort and manual
   perceived-recovery corrections for stale, missing, partial, or contradicted
   HealthKit data. AI may route to this flow but must not infer hidden
   readiness values from text.
5. Notifications only if justified: Today-ready, stale-readiness, and
   check-in reminders only after the core loop proves value.
6. Native foundation: permanent navigation, account creation/recovery,
   onboarding, permission education, settings, privacy, support, and data
   controls.
7. Native plan lifecycle: generate, preview, save, browse, safely edit,
   regenerate, pause/resume, and confirm preferences without the web.
8. Apple Calendar and Progress: privacy-minimized EventKit free/busy
   ingestion, calendar-aware planning, optional explicit one-way export, and
   shared-history review.
9. User-ready hardening: accessibility/device, offline/sync, migrations,
   production operations, privacy disclosures, TestFlight, and external beta.

Acceptance gates:

- No raw HealthKit samples are uploaded.
- Owner-only Firestore rules and deletion tombstones remain authoritative.
- Web and iOS do not overwrite each other's user-scoped state incorrectly.
- Existing deterministic eval gates remain green.
- Calendar-aware adaptations and mobile NLP drafts cannot apply without
  deterministic validation.
- Mobile-originated decisions, intake drafts, validation outcomes, and
  check-ins are visible through the existing web QA/eval/admin review surfaces.
- Behavior learning has a result contract: every surfaced pattern must lead to
  a bounded action, clarification, check-in prompt, or read-only explanation.
  Confirmed schedule-style patterns may feed deterministic plan generation as
  preferred-day inputs; safety, mileage, taper, and workout validity remain
  deterministic.
- Mobile failures degrade through freshness/confidence rather than invented
  certainty.
- A normal runner can create an account, onboard, own a plan, use Today,
  check in, review progress, change settings, and export/delete data without
  the web.
- Mobile completion requires production-environment, accessibility, device,
  migration, operational, TestFlight, and external-beta evidence.

Delivery cadence:

- Batch Windows/shared contracts, backend authority, fixtures, Firebase rules,
  observability, and integration harnesses for one coherent native dependency
  set—normally one phase and at most two tightly coupled phases.
- Commit/push one authoritative handoff, then stay on Mac to implement and
  validate the corresponding native phases sequentially.
- Do not build all remaining Windows phases before native validation. SwiftUI,
  permissions, EventKit, background behavior, and device UX must feed back
  before later shared contracts freeze.
- Return to Windows after the Mac batch for final shared/hosted integration and
  the next dependency set. Phase 8 remains continuous across both lanes.

Status: Phase 1 completed on 2026-07-16. The checked-in Xcode project passed
Swift package tests, simulator build, signed physical-device build/install,
Firebase sign-in, read-only HealthKit summarization, Firestore sync, same-user
web readback, retry, and authoritative deletion-tombstone proof. Phase 2A also
completed on Windows on 2026-07-16: authenticated Native Today data, decision,
cache, failure, privacy, and observability contracts now pass shared frontend
and backend gates. The SwiftUI implementation and signed-device proof completed
on 2026-07-17 and were integrated into `main` on 2026-07-20. Phase 2.5 bounded
mobile intake Parts A and B completed and passed the required Windows, Mac,
and signed-device suites on 2026-07-20, then passed the final Windows
integration rerun and were fast-forwarded into `main`; see
[MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md) and
[MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md).
Mobile Phase 3 Part A and the native Part B implementation also completed on
2026-07-20. Swift fixture/simulator/signed-device, strict backend, owner-only
emulator, and shared frontend gates pass; connected-device recovery and
completed/skipped interaction plus live same-user web/audit readback passed
2026-07-21. The transitive dependency advisories were remediated on 2026-07-22;
patched Active LTS Next.js `16.2.11`, the clean connected audit, and the full
GitHub-hosted Windows integration rerun passed on 2026-07-23. No dependency
advisory remains an integration blocker; the managed workstation proxy's
remaining `E404` is recorded as an environment limitation. See
[MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md). The completed Phase 3
branch was fast-forwarded into `main` on 2026-07-23.

### Mobile Phase 2.5 Shared Intake Contract - Completed 2026-07-20

- Extended the existing authenticated `POST /ai/parse-intake` authority with
  the strict `mobile-intake.v1` request/response schema while preserving legacy
  `intake.v1` web callers.
- Added tagged review-draft, perceived-recovery, caution, missed-workout,
  reflection, deterministic-explanation, clarification, and refusal routes.
- Added schedule, availability, travel, workout-swap, goal, and preferred-day
  draft kinds. Routing/parsing always reports no mutation.
- Bounded mobile context to goal/profile/decision enums and rejected identity,
  raw readiness/biometrics, calendar/workout text, and unrelated history.
- Reused the current frontend confirm/apply authority and added deterministic
  workout-swap validation for existing plan, race day, duplicate day, weekly
  load, and hard-workout spacing.
- Added strict client response validation and stable auth, timeout, offline,
  backend, unavailable/malformed AI, malformed response, ambiguous,
  unsupported, and unsafe behavior.
- Added the cross-platform canonical fixture, full frontend/backend route and
  failure gates, privacy-safe `mobile_intake_lifecycle` fields, `/qa/mobile`
  readback, and owner-only Firestore audit coverage.
- Frontend lint, TypeScript, smoke, build, beta-readiness; backend compile,
  gates, smoke; and Auth + Firestore emulator rules passed on Windows.
- Did not add Swift/SwiftUI, Phase 3 persistence, notifications, calendar
  ingestion, hosted AI, general chat, or autonomous mutation.

### Mobile Phase 2.5 Native Intake - Completed 2026-07-20

- Added strict Swift Codable parity, bounded authenticated networking, Native
  Today intake, and all eight concrete outcome destinations.
- Added explicit owner-scoped confirmation with deterministic grounding,
  plan, availability, race-day, unique-day, load, and hard-spacing validation.
- Passed Swift package, unsigned simulator, signed generic-device, strict-auth,
  frontend/backend, and Firestore gates.
- Passed physical iPhone install and authenticated route interaction, a
  grounded availability mutation, an ungrounded Sunday-swap rejection, bounded
  `/qa/mobile` readback, and Today/cache/HealthKit/reconnect/tombstone
  regressions.
- Kept `mobile-intake.v1` and its canonical fixture unchanged; Phase 3
  persistence and broader native scope remain deferred.

### Mobile Phase 3 Shared Check-In Contract - Part A Completed 2026-07-20

- Added strict `mobile-checkin.v1` requests for explicit perceived recovery
  and completed/skipped workout outcomes, with a canonical cross-platform
  fixture and pure deterministic validation/application.
- Reused the existing `readiness`, `workouts`, and `recommendations` domains;
  added no backend mutation endpoint or mobile-only history.
- Preserved HealthKit biometrics during subjective recovery merge and defined
  atomic workout/recommendation application with stable idempotent event IDs.
- Added bounded failure taxonomy, privacy-safe `mobile_checkin_synced`
  telemetry, `/qa/mobile` readback, strict-auth backend compatibility, and
  owner-only Firestore coverage.
- Deferred SwiftUI/native persistence and device proof to Part B in
  [MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md). The continuation
  trigger is `Continue Kinetic Mobile Phase 3 Part B`; all details remain in
  the checked-in handoff.

### Mobile Phase 2A Shared Today Contract - Completed 2026-07-16

- Added `MOBILE_TODAY_CONTRACT.md` and a canonical fixture shared from
  `ios/KineticCompanion/Tests/Fixtures/mobile-today-contract.json`.
- Added a pure request builder around authenticated profile presence, goal,
  saved plan, latest complete readiness, HealthKit metadata, calendar
  freshness/availability, confirmed preferences, and completed workout slots.
- Added privacy minimization: no identity, raw samples, calendar text, notes,
  tokens, or free-text preference descriptions cross the Today contract.
- Added caller-authoritative calendar constraints so explicit zero-minute
  windows and planned-duration fallbacks cannot be replaced by a backend
  calendar/default. Missing calendar now lowers confidence and emits a warning.
- Added strict deterministic response validation, optional-AI discard,
  privacy-minimized snapshots, same-day cache aging, stable failure mapping,
  and live/cache/fallback resolution.
- Added authenticated API timeout/error classification and moved the web
  dashboard onto the same response validator.
- Extended mobile decision observability with decision source, failure state,
  cache state, and availability source.
- Added canonical smoke coverage and backend deterministic gates for missing
  context, calendar fallback, zero-minute availability, malformed actions,
  privacy rejection, cache expiry, and missing-calendar confidence.
- Frontend lint, TypeScript, full smoke, production build, backend compile,
  deterministic gates, and backend smoke pass on Windows.

### Mobile Phase 3.5 Part A Pattern Results - Completed 2026-07-23

- Added the strict shared `behavior-pattern-result.v1` envelope and canonical
  cross-platform fixture for all seven supported pattern families.
- Kept `POST /behavior-insights` authenticated and read-only. Optional model
  output can only select a deterministically supported family; displayed
  actions and safety boundaries are deterministic.
- Routed busy-day, rest-override, and difficulty-tolerance patterns to explicit
  capped scoring-preference review.
- Routed weekday-skip and long-run-day patterns to explicit preferred-day
  review that reuses the existing intake validator, planner, and persistence
  authority only after confirmation.
- Routed stale readiness/check-in gaps to prompt-only UX and recurring
  pain/discomfort flags to fixed caution guidance with `mutation: none`.
- Added strict response parsing, review-time no-mutation checks, deterministic
  confirmation coverage, strict auth, sparse data, timeout, unavailable AI,
  malformed/invalid/unsupported AI fallback gates, and prompt privacy checks.
- Added privacy-safe `mobile_pattern_result_lifecycle` telemetry and
  `/qa/mobile` plus owner-only `mobile_audit` readback without a new Firestore
  domain.
- Kept notifications, hosted AI, Garmin/Oura, coach sharing, full native plan
  editing, and autonomous mutation out of scope. Native Part B implementation
  and the active Mac validation/evidence checklist are defined in
  [MOBILE_PATTERN_RESULT_HANDOFF.md](./MOBILE_PATTERN_RESULT_HANDOFF.md).
- GitHub-hosted Windows integration run
  [30021806663](https://github.com/kathyygong/kinetic/actions/runs/30021806663)
  passed clean install/audit, lint, TypeScript, full frontend smoke, production
  build, beta readiness, Python compile/gates/smoke, and owner-only Firebase
  Auth/Firestore emulator coverage on 2026-07-23.

### Mobile Phase 3.5 Part B Native Pattern Results - Functionally Complete 2026-07-24

- Added strict Swift `behavior-pattern-result.v1` decoding against the shared
  canonical fixture, including exact-key, version, bounds, duplicate-ID,
  enum, family/result, and mutation-boundary rejection.
- Reused the existing owner-scoped `recommendations` history through an
  on-demand reader, avoiding a new Firestore read on every Today refresh.
  Native requests explicitly omit rejection prose and workout notes before
  the authenticated, finite-deadline behavior call.
- Added native loading, sparse-history, deterministic-fallback, auth, offline,
  timeout, backend, invalid-response, and retry states.
- Added native route cards with the same noticed/why/can-change/never-change
  explanation. Scoring confirmation writes only the existing owner-scoped
  preference domain and is transactionally idempotent.
- Kept preferred-day changes in the existing web review for v1 rather than
  duplicating deterministic plan validation in Swift. Check-in/readiness
  prompts reuse existing native flows; discomfort recurrence remains fixed
  caution with no diagnosis or mutation.
- Reused the existing privacy-safe mobile audit domain and added a local kill
  switch plus configurable web-review URL.
- Added focused Swift contract, privacy, networking, failure, tombstone
  recovery, and audit tests. Mac execution passed 4 behavior tests, 5 audit
  tests, and all 52 package tests.
- Passed a clean unsigned iPhone 17 / iOS 26.3 simulator build/launch, signed
  generic-device build, and rebuilt physical iPhone 17 / iOS 26.5.2
  install/launch.
- Passed strict physical scoring, preferred-day, readiness-prompt, and caution
  routes. Same-user web readback showed the native scoring preference in use,
  the preferred-day handoff left Mon/Wed/Fri/Sun unchanged, and `/qa/mobile`
  showed only fixed privacy-safe lifecycle fields.
- Fixed cancellation propagation and allowed an explicit confirmation to
  start a new empty preference epoch from a valid deletion tombstone without
  restoring deleted history. Expanded only the opt-in demo seed to make all
  four physical result kinds repeatable.
- Maximum simulator Dynamic Type plus increased contrast rendered without
  clipping.
- GitHub-hosted Windows integration run
  [30105302955](https://github.com/kathyygong/kinetic/actions/runs/30105302955)
  passed clean install/audit, frontend, backend, and owner-only Firebase
  emulator gates at `1b99cfe`.
- Product accepted Phase 3.5 as functionally complete on 2026-07-29. The
  authenticated pattern-card VoiceOver, landscape, and small-screen checks are
  explicitly unverified and deferred to the next phase that changes native iOS
  UI. They are mandatory at Phase 5 entry and before external beta.

### Mobile Phase 4 Part A Local Check-in Notification - Implemented 2026-07-29

- Selected only the opt-in local evening check-in reminder from the Phase 4
  candidates. The implemented check-in loop justifies testing this narrow
  retention hypothesis; there is not yet evidence for morning Today-ready or
  stale-readiness notifications.
- Added the strict shared `mobile-notification.v1` decision contract and
  canonical fixture for opt-in, permission, pending-check-in eligibility,
  completion/skip cancellation, elapsed target, and fail-closed privacy cases.
- Kept the reminder off by default and local-only. Part A adds no push service,
  device tokens, backend scheduler, new persistence domain, or native UI.
- Fixed generic lock-screen copy cannot expose workout, readiness, biometric,
  pain, or medical detail.
- Native notification delivery will be folded into the permanent Phase 5
  onboarding/Settings foundation instead of a temporary Phase 4 screen. Phase
  5 begins with the deferred Phase 3.5 pattern-card VoiceOver/landscape/
  small-screen checks. See
  [MOBILE_NOTIFICATION_CONTRACT.md](./MOBILE_NOTIFICATION_CONTRACT.md).

### Windows A For Mobile Phases 5–6 - Implemented 2026-07-30

- Define the shared account/onboarding/settings state, validation, persistence,
  deletion, migration, and privacy-safe observability boundaries required by
  the permanent native foundation.
- Define the authenticated plan lifecycle/validation API and canonical
  fixtures for preview, save, version/conflict handling, bounded edit,
  regeneration, pause/resume, preferred-day confirmation, idempotency, and
  completed-history preservation. Callable shared generation remained a
  follow-up dependency discovered during native implementation.
- Extend Firebase rules/emulator, frontend/domain smoke, backend deterministic
  gates, QA/admin readback, and cross-language handoff evidence without
  building temporary SwiftUI.
- Commit and push one authoritative handoff. Then stay on Mac to implement
  Mobile Phase 5 and Phase 6 sequentially, checkpointing Phase 5 before
  continuing but returning to Windows only for blocking shared fixes or the
  final integration pass.
- Do not freeze Phase 7 EventKit behavior in this batch. Run an early Mac
  EventKit permission/free-busy spike before its shared contract is finalized.
- Implemented strict `mobile-foundation.v1` and
  `mobile-plan-lifecycle.v1`, authenticated storage-neutral backend validation,
  owner-only settings/onboarding/plan-history/operation domains, canonical
  fixtures, frontend/backend/emulator gates, privacy-safe `/qa/mobile`
  readback, and [MOBILE_PHASE5_6_HANDOFF.md](./MOBILE_PHASE5_6_HANDOFF.md).
  Hosted Windows integration passed all frontend, backend, connected-audit,
  build, and owner-only emulator gates in
  [run 30557508276](https://github.com/kathyygong/kinetic/actions/runs/30557508276).
  Native implementation followed in the Mac checkpoints below.
- A 2026-07-30 robustness pass expanded the backend contract smoke across all
  eleven lifecycle actions plus strict-auth HTTP, malformed payload, stale
  version, idempotency, completed-history, race-day, spacing, goal-revision,
  duplicate-date, and no-op rejection paths. Foundation parsing now enforces
  onboarding, migration, deletion-state, timestamp, and full-domain-sweep
  consistency. Firestore emulation covers owner, cross-user read/write,
  unauthenticated, and unknown-domain behavior for every new Phase 5–6 domain.
- The same pass replaced vulnerable transitive `brace-expansion`/`minimatch`
  development-tool versions with tested patched overrides. Clean install,
  zero-advisory audit, lint, TypeScript, full smoke, production build, connected
  beta audit, backend gates, and expanded Firebase emulation pass locally.

### Mobile Phase 5 Native Foundation, Onboarding, And Settings - Mac Implementation Checkpoint 2026-08-03

- Replace the proof-oriented single-screen shell with permanent Today, Plan,
  Progress, and Settings navigation.
- Migrate legacy `KineticCompanion` project/target/scheme/bundle identifiers to
  the final Kinetic app identity before external distribution, preserving
  signing, Firebase configuration, entitlements, and tests.
- Add account creation/recovery, session restoration, native onboarding,
  progressive permission education, profile/preferences, privacy, support,
  export/delete, and account-deletion controls.
- Place the opt-in local evening reminder in its permanent Settings location.
- Exit only when a new and returning runner can reach the correct owner-scoped
  native state without the web and the affected accessibility/device checks
  pass.
- Implemented the strict Swift foundation/notification contracts, paired
  owner-scoped settings/onboarding restore and migration, Firebase auth flows,
  permanent tabs, onboarding/permission education, local evening reminder,
  bounded foundation audit, data controls, and deliberate `Kinetic`
  target/product/scheme migration while retaining the registered
  `com.kinetic.companion` bundle ID. All 57 Swift tests, a clean unsigned
  simulator build, and a concrete ad-hoc-signed iPhone SE/iOS 26.3.1 install/
  launch at accessibility XXXL with increased contrast pass. The implementation
  checkpoint is committed at `bfbaaef`; formal Phase 5 completion remains open for
  authenticated/physical accessibility, route/auth/deletion/readback, and
  signed-device proof. See [MOBILE_PHASE5_6_HANDOFF.md](./MOBILE_PHASE5_6_HANDOFF.md).

### Mobile Phase 6 Native Plan Lifecycle - Mac Implementation Checkpoint 2026-08-03

- Generate, preview, confirm, save, browse, and maintain the full plan natively.
- Support bounded move, shorten, replace, skip, availability, preferred-day,
  future-regeneration, pause, and resume actions.
- Preserve the shared deterministic planner/validator as the only mutation
  authority, retain completed history, and make changes explainable,
  idempotent, conflict-aware, and recoverable.
- Remove the normal-runner web handoff for preferred-day confirmation and plan
  maintenance.
- Implemented strict `mobile-plan-lifecycle.v1` Swift parity, deterministic
  native proposals from owner-scoped goal/profile inputs, authenticated
  backend validation, an explicit preview/confirm Plan tab for all eleven
  actions, and a single `plan`/`plan_history`/`plan_operations` Firestore
  transaction that persists only `commit_ready` packages and enforces
  version/idempotency/deletion gates.
- Preferred-day behavior-pattern review now opens this native validator path
  instead of routing normal plan maintenance to the web.
- Phase 6 focused tests pass 7/7 and the full Swift suite passes 65/65. Clean
  unsigned generic simulator build plus concrete iPhone SE/iOS 26.3.1
  build/install/launch and error/fault-log checks pass. Authenticated live
  owner/cross-user/readback, retry/rejection interaction, and the combined
  Phase 5–6 signed physical/accessibility matrix remain required before
  closeout or Phase 7. See
  [MOBILE_PHASE5_6_HANDOFF.md](./MOBILE_PHASE5_6_HANDOFF.md).

### Windows B For Mobile Phases 5–6 - Complete, Mac B Authorized 2026-08-10

The shared generator, web migration, lifecycle hardening, adversarial fixtures,
hosted macOS workflow, and branch routing below are complete at green Windows
handoff commit `d5bbfdc`. JS-YAML is patched to 4.3.1 and Nano ID to compatible
3.3.17 without an audit exception. Hosted Windows run 31412865931 passes clean
install, zero-vulnerability audit, lint, TypeScript, full smoke, production
build, backend compile/evals/smokes, and Firebase owner-isolation rules. Hosted
macOS run 31412874959 passes Swift tests and the unsigned simulator build on
the same commit. Mac Batch B may start from `d5bbfdc`; Phases 5–6 remain open
until the Mac closeout and mandatory final Windows integration complete.

- Work from `codex/mobile-phase5-6-closeout`, based on Mac automated-closeout
  commit `1435369`. Preserve the divergent documentation correction at
  `77c4164` and reconcile its authority/ordering intent manually rather than
  overwriting the Mac evidence.
- Add strict authenticated `mobile-plan-generation.v1` to FastAPI as the only
  production runtime authority for initial generation and future
  regeneration. Keep `/mobile/plan-lifecycle` storage-neutral and independently
  validating.
- Harden lifecycle validation before it may return `commit_ready`. Define
  permitted field deltas for every action and rerun full mileage, weekly-load,
  taper, hard-spacing, race-day, availability, and completed-history invariants
  on the complete candidate. Add a regression for the 2026-08-06 review case
  where an `availability` proposal incorrectly accepted a 29-mile/300-minute
  workout, plus unrelated-field and multi-workout bypass cases.
- Add authoritative build/recovery/taper/race phase and bounded explanation
  metadata to the shared generation boundary. Web and Swift must render that
  metadata and must not independently infer phase or taper policy.
- Migrate production web generation away from local TypeScript calculation.
  Add canonical fixtures plus deterministic, bounds, malformed, privacy,
  anonymous-auth, regeneration-history, and generator-to-lifecycle gates.
- Add a hosted macOS workflow for Swift package tests and an unsigned simulator
  build on iOS-affecting pull requests. Windows/shared owns the workflow
  definition; Mac/native owns keeping the Xcode project, scheme, package
  resolution, and tests compatible with it.
- Add `codex/mobile-phase5-6-closeout` to the required workflow routing and make
  its local/remote upstream and push target unambiguous before the handoff.
- Do not change native iOS in this Windows batch. Exit with a pushed shared
  handoff commit only after clean install/audit, lint, TypeScript, full smoke,
  production build, backend compile/evals, and Firebase emulator gates pass.
- This is a dependency handoff, not final integration and not Phase 5–6
  completion.

### Mac B For Mobile Phases 5–6 - Required After Windows B

Historical Mac Batch B resume command: `Continue Mobile Phase 5–6 Mac
implementation.` The complete
scope, starting-point, validation, evidence, and stop instructions are in
`MOBILE_PHASE5_6_HANDOFF.md`; the short command does not narrow those
requirements.

- Fetch the Windows Batch B commit and replace full Swift plan generation with
  an authenticated `mobile-plan-generation.v1` client. Retain bounded native
  edit proposals only when the independent lifecycle validator still approves
  preview and commit packages.
- Remove native build/recovery/taper/race inference, including display-only
  phase heuristics, and render the authoritative shared metadata.
- Complete Phase 5 onboarding and settings scope before closeout: optional
  personal records, bounded availability, shared-authority plan preview,
  confirmed onboarding summary, editable profile/planning inputs, and a real
  owner-scoped training-data export. Keep the existing foundation receipt only
  if it is labeled separately from training-data export.
- Finish retryable account deletion through owner-domain cleanup,
  reauthentication handling, and Firebase Auth identity deletion.
- Complete the disposable authenticated-owner plan/foundation readback,
  conflict/replay/offline/deletion/legacy checks, `/qa/mobile` privacy proof,
  VoiceOver/Dynamic Type/contrast/landscape/small-screen matrix, and signed
  physical-device build/install/launch.
- Commit and push the Mac closeout evidence to the same closeout branch. Do not
  start Phase 7.

Mac Batch B checkpoint updated 2026-08-12: strict authenticated Swift shared
generation, removal of the copied native generator and phase/taper heuristic,
optional personal-record onboarding, shared/lifecycle plan review before
completion, real owner-scoped training-data export, QA launch matrices, 67/67
Swift tests, and the unsigned simulator build pass in the current closeout
worktree. At that checkpoint, Mac completion was blocked on three
Windows/shared decisions: durable versioned metadata, bounded availability,
and retry-safe account cleanup. The Windows return below resolves those shared
decisions; editable planning inputs, final deletion, live authenticated/device/
accessibility evidence, and final Windows integration remain open.

Windows/shared blocker resolution implemented 2026-08-12 in the current
closeout worktree: backward-compatible v2 generation/lifecycle contracts bind
week metadata to the plan version, refresh it after every accepted edit, and
migrate workout-only plans on regeneration; recurring availability is a
privacy-safe unique weekday plus 0-or-15–240 minute/easy-only list; planning
inputs and plan are one revision-checked transaction package; and
`mobile-account-cleanup.v1` retains a server-only receipt through all owner
domain deletes, recent-auth checking, and Firebase Auth deletion. Local lint,
TypeScript, full smoke, production build, backend compile/evals/smokes,
zero-vulnerability connected audit, and Firebase owner/cross-user/anonymous/
server-receipt rules are green. The implementation is pushed at `46fcbba`;
hosted Windows run 31637946605 and hosted macOS run 31637946552 pass on that
exact SHA. This is still not final Windows integration; Mac must consume the
contracts and finish native proof.

Mac v2 consumption checkpoint `92bad76` on 2026-08-12: production Swift now uses strict
generation/lifecycle v2, persists/restores authoritative metadata, maps bounded
weekly availability in onboarding and Settings, atomically commits planning
inputs with the regenerated plan, and resumes cleanup plus recent-password Auth
finalization through `mobile-account-cleanup.v1`. V1 remains migration-only.
The expanded Swift suite passes 70/70, its focused shared-plan/cleanup suite
passes 11/11, and the unsigned generic simulator build passes. Remaining Mac
work is external authenticated interaction/readback, accessibility/layout, and
signed-device evidence; final Windows integration remains mandatory.

Authenticated Mac closeout implementation `b91269b` on 2026-08-12 fixes the
live-only explicit-null, exact-replay-order, and fractional deletion-timestamp
defects and makes dark/high-contrast accessibility layouts adaptive. A
disposable authenticated owner passed initial v2 generation, the five-domain
first/replay/idempotency/stale/relaunch matrix through version 6, preferred-day
and safe-skip lifecycle interaction through version 10, rejected non-mutating
candidates, offline retry, privacy-safe audit readback with cross-user denial,
nine-domain training-data tombstones, and retryable account-boundary relaunch.
The exact tree passes 71/71 Swift tests, 12/12 focused lifecycle/cleanup tests,
normal signed iPhone SE simulator build/install/launch, accessibility XXXL dark
mode with increased contrast, standard light small-screen and landscape checks,
a clean runtime error/fault log, and a signed generic-device build. The paired
iPhone is unavailable, so physical install/launch and hands-on VoiceOver remain
external; the public-key strict backend has no Firebase Admin credential, so
the disposable account remains at its proven retryable boundary rather than
being falsely reported deleted. The next branch lane is mandatory final
Windows integration, invoked with `Continue Windows Phase 5-6 implementation.`

### Final Windows Integration For Mobile Phases 5–6 - Mandatory

- Fetch the Mac closeout commit and reconcile contracts, fixtures,
  architecture, build plan, QA matrix, iOS README, and handoff evidence.
- Rerun the complete frontend/backend suite, connected dependency audit,
  owner/cross-user/anonymous Firebase emulators, GitHub-hosted Windows workflow,
  and hosted macOS Swift/simulator workflow against the combined tree.
- Record the exact final commit and both hosted runs. Only a green final Windows
  pass with green macOS evidence may mark Phases 5–6 complete or make the branch
  eligible for merge. A green Windows Batch B run or Mac-only pass is
  insufficient.

### Product Evidence Gate Before Mobile Phase 7 - Required

- After final Phase 5–6 integration, install the signed closeout build for 3–5
  target runners and run moderated onboarding-to-check-in sessions.
- Mac/native owns build installation and the native sessions. Windows/shared
  owns privacy-safe `/qa/mobile` audit/readback support.
- Record onboarding completion, plan-preview confirmation, independent Today
  and check-in use, and any web/developer handoff. Fix only blockers or clear
  safety/trust failures; do not expand the feature roadmap from this gate.
- Phase 7 may begin when the core journey works without developer help and no
  Phase 5–6 safety/privacy correction remains.

### Mobile Phase 7 Apple Calendar And Progress - Planned

- Add EventKit permission/calendar selection and on-device free/busy
  summarization. Only bounded availability/load/freshness may enter shared
  requests; event titles, descriptions, attendees, and locations remain local.
- Add calendar-aware generation/conflict review and consider explicit one-way
  workout export only after read-side behavior passes. Full two-way sync stays
  out of user-ready v1.
- Add native recent workout/check-in history, recovery trend, concise weekly
  summary, and learned-preference review from shared owner-scoped truth.

### Mobile Phase 8 User-Ready Hardening And External Beta - Planned

- Close offline/retry/partial-sync/account-switch/conflict/migration/upgrade/
  background-refresh/deletion behavior.
- Close the critical-flow VoiceOver, Dynamic Type, contrast, reduced-motion,
  landscape, and device/OS matrix.
- Configure and prove the production API/Firebase environment, privacy-safe
  monitoring, feature flags, rollback, privacy disclosures, support, signing,
  TestFlight, and small external-beta loop.
- Declare mobile complete only after a fresh external user completes the
  install-to-deletion journey without the web or developer intervention.

### Validation-Hardening Checkpoint - Updated 2026-07-13

- Reconciled smoke fixtures with the canonical `CurrentPRs` integer-seconds
  contract through an explicit human-readable minutes conversion helper.
- Added generated-pace sanity assertions so minute/second regressions fail the
  suite instead of printing implausible but technically ordered results.
- Converted calendar-adjuster and calendar-refresh diagnostics into assertions
  for no-op, swap, shorten, low-priority drop, protected-workout warning,
  travel downgrade, and travel-recovery removal paths.
- Extracted the mobile QA event selector and summary contract into shared code,
  then added a repeatable smoke proving sync, decision, intake, and check-in
  events flow from the privacy-safe local event log into the web QA model.
- Full frontend lint, production build, and smoke gates pass. The local preview
  remains available at `/mobile-companion`, with audit readback at `/qa/mobile`.
- Native HealthKit/Firebase execution and live cross-device
  deletion/readback passed on 2026-07-16. Connected calendar-aware Native
  Today and native event transport also pass. Stale background-delivery repair
  and on-device check-in persistence remain gates assigned to later phases in
  `MOBILE_APP_PLAN.md`.

### Mobile Contract Preflight - Updated 2026-07-13

- Added one canonical JSON fixture for readiness, health-sync metadata,
  deletion tombstones, and deterministic conflict outcomes. TypeScript smoke
  tests and Swift package tests consume the same file.
- Added strict mobile-boundary validation for physiological bounds, allowed
  sync enums, envelope semantics, and forbidden raw sample fields without
  changing the legacy local-storage migration path.
- Added web Firebase hydration validation so mobile-originated `readiness` and
  `health_sync` envelopes must match the bounded contract before they can
  update dashboard state.
- Added stable `/mobile-companion` browser test hooks plus an optional
  `smoke:mobile-browser` script for the readiness, calendar, intake, check-in,
  and notification state matrix. The command requires Playwright in the
  frontend environment.
- Extracted the mobile browser-prototype Today decision model into shared frontend code
  and added it to the default smoke suite so P0 readiness/calendar/intake
  behavior is covered without requiring browser binaries.
- Extended that model around the actual authenticated web domains the native
  app will inherit: profile, goal, saved plan, readiness, health-sync metadata,
  calendar freshness, learned preferences, and workout history. This keeps
  Windows-side work useful without pretending native HealthKit execution has
  happened.
- Added TypeScript parity for native conflict handling: manual and CSV entries
  win, fresher HealthKit summaries merge only present biometric fields, and
  stale HealthKit summaries are rejected.
- Extended the Firebase emulator gate to write realistic mobile envelopes,
  deny cross-user readiness and health-sync access, and verify explicit
  readiness/health-sync tombstones.
- Frontend lint, production build, full smoke, TypeScript compilation, and the
  Firebase emulator gate pass on Windows.
- Native fixture tests, Firebase package wiring, HealthKit capability and
  permission proof, on-device web readback, retry behavior, and tombstone
  handling passed on macOS/physical iPhone on 2026-07-16. Windows remains the
  source of truth for shared contracts, deterministic engine behavior,
  frontend/backend gates, Firebase rule coverage, and web QA. The Phase 2A Mac
  implementation and device proof completed on 2026-07-17. Phase 2.5 then
  completed its Windows contract and macOS/native device proof on 2026-07-20
  without changing the canonical fixture vocabulary.

### Mobile Phase 1 Native Proof - Completed 2026-07-16

- Added the checked-in `KineticCompanion.xcodeproj`, shared scheme, HealthKit
  entitlement, and pinned Firebase Swift package resolution.
- Proved Firebase email/password sign-in and ID-token retrieval.
- Proved read-only HealthKit access for sleep, HRV, and resting heart rate.
- Proved bounded local-day summarization and transactional `readiness` /
  `health_sync` Firestore writes without raw HealthKit samples.
- Proved Firestore failure leaves the local summary usable and retryable.
- Proved the same Firebase account hydrates mobile readiness on the web
  Recovery surface.
- Proved web deletion tombstones prevent the native app from recreating health
  data and clear the native local summary on the next sync attempt.
- Added web sign-in routing for accounts that have mobile readiness but have
  not completed web onboarding.
