# Kinetic Build Plan

## Goal

Turn Kinetic into a resume-grade shippable demo with a beta-ready foundation:

- Fast deterministic training decisions.
- A grounded AI layer for explanation, recalibration summaries, behavior learning, and evals, with intake, what-if analysis, and broader training summaries staged for later.
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
- Real Apple Health, Garmin, or Oura ingestion.
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

### Status - Updated 2026-06-25

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

### Status - Updated 2026-06-25

Checkpoint complete.

- README now links to PRD, BUILD_PLAN, and `productreasoning`.
- README describes FastAPI, Next.js, Firebase auth, deterministic decisioning, AI runtime modes, and eval/smoke checks without presenting future integrations as complete.
- Remaining documentation polish belongs to demo packaging: concise architecture diagram/README section and a tighter walkthrough script once the dashboard vertical slice is visually final.

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

Still to implement or verify.

- Hero primary CTA is still below the desktop fold; bringing it fully above the fold needs section reordering, which is a broader layout change deferred out of this scoped QA pass.
- Decide whether `LiquidSurface` / `FloatingMetric` should be reused on Plan/Profile before broad UI refresh work.
- Optional debug/export UI for the local instrumentation log, if useful for the demo walkthrough.
- Optional local Ollama eval/reporting path for live AI demo mode.

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
- `ProductStage`
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
  - native mobile
  - real wearable integrations

### Acceptance Criteria

- A reviewer can run or watch the demo without special paid services.
- The architecture story is clear in under two minutes.
- The next beta steps are obvious and grounded.

## Execution Order

1. Stabilize build and tooling.
2. Fix documentation and product claims.
3. Build the demo ship vertical slice.
4. Add persistence, security rules, and privacy-conscious instrumentation.
5. Expand AI beyond the first wedge only after eval gates are stable.
6. Scale the UI refresh across pages.
7. Add broader deterministic evals and smoke coverage.
8. Add demo script and architecture materials.

## Worktree Checkpoint - Updated 2026-06-25

Completed.

- `git status --short` was reviewed before continuing Dashboard visual work.
- No tracked generated artifacts were found.
- Ignored runtime byproducts are present but already covered by ignore rules:
  - `backend/.uvicorn.*.log`
  - backend `__pycache__/` and `.pyc` files
- Current review buckets:
  - Build reliability: `.gitignore`, frontend lint/build config, local `tsx`, backend requirements, README reliability notes.
  - AI runtime/evals: backend AI runtime, LLM client, reasoning/cache modules, safety guards, eval harness, `/ai/status`, frontend API types.
  - Behavior learning: backend behavior insights/scoring, frontend behavior storage/types, `LearningCard`, confirmed-preference request wiring.
  - Demo controls: `frontend/lib/demoData.ts`, Dashboard demo toolbar, seed/reset smoke.
  - Product/UI groundwork: Dashboard/Plan/Profile/Recovery/Settings updates already in the dirty tree.
  - Docs/source docs: `PRD.md`, `BUILD_PLAN.md`, `README.md`.
  - Probe scripts: backend local Ollama/decision probe scripts remain untracked and should be reviewed before commit.
- No files were deleted during this checkpoint; cleanup stayed non-invasive to avoid removing potentially useful local artifacts.

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

- Several AI and behavior-learning files are currently untracked and should be intentionally reviewed before commit.
- Strict Firebase auth has been verified only at Admin SDK initialization level; end-to-end signed-in frontend token verification still needs a browser/auth check. Local demo mode can keep `KINETIC_AUTH_REQUIRED=false`.
- Dashboard browser visual QA was completed (2026-06-25) at desktop (1440x900) and mobile (375x812); three scoped issues (Action-metric truncation, missing reduced-motion handling, first-viewport density) were fixed and verified live. Remaining layout watch items: hero CTA still below the desktop fold (needs section reorder), and `ThisWeekStrip` chips are tight on 375px for long workout labels.
- Local Ollama mode is wired but not performance-tested on this machine; every user-facing path must remain fallback-safe.
- `npm audit` still reports dependency vulnerabilities from the frontend dependency tree; these have not been triaged yet.
- Local Ollama can be slow; every user-facing AI path must remain async or fallback-safe.
- Scope can sprawl if natural-language intake, what-if planning, and training summaries start before the first AI wedge is stable.
- Firebase persistence is not beta-ready until security rules, reset/delete controls, and privacy boundaries are implemented.
