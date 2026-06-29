# Kinetic Build Plan

## Goal

Turn Kinetic into a resume-grade shippable demo with a beta-ready foundation:

- Fast deterministic training decisions.
- A grounded AI layer for explanation, recalibration summaries, behavior learning, read-only what-if analysis, and evals, with intake and broader training summaries staged for later.
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

### Status - Updated 2026-06-27

Implemented as domain slices; the Firestore security gate passes.

- Added the generic `StorageRepository<T>` contract with synchronous local reads/writes, asynchronous remote mirroring, Firebase hydration, idempotent migration markers, and deletion tombstones.
- Added Firebase-backed repositories for profile/goal, plan/readiness/workout log, recommendation history/preferences, today completion, and calendar-freshness metadata.
- Existing storage helpers remain local-first and mirror writes in the background; unavailable Firebase never blocks the recommendation flow.
- Remote records live under `users/{uid}/kinetic/{domain}`. The local cache records its authenticated owner and is cleared before a different UID hydrates, preventing cross-user migration.
- Added `firestore.rules` with authenticated owner-only access and default denial, plus `firebase.json`.
- Added persistence smoke coverage for migration, authenticated cache-owner switching, UID isolation, remote hydration, offline behavior, and deletion tombstones.
- Added a Firestore emulator test for owner access, cross-user denial, guest denial, and unknown-domain denial. After installing Microsoft OpenJDK 21, the full Auth + Firestore emulator suite passed on 2026-06-27.
- Added a Profile data-control action that clears local training state and the signed-in Firebase mirror. Existing demo reset, learning reset, and integration disconnect controls remain available.

Remaining beta-ready gate:

- Complete an authenticated two-session browser test against a configured Firebase project or emulator.

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

### Status - Updated 2026-06-27

What-if vertical slice completed; later workflows remain intentionally sequenced.

- Added deterministic, pure What-if simulation on Plan. It previews day, duration, and easy-only changes without mutating the saved plan.
- Added `POST /ai/what-if` with a typed `what-if.v1` envelope, explicit deterministic grounding, timeout protection, and the existing bounded weekly reasoning fallback.
- Added malformed-output and timeout eval cases and frontend no-mutation smoke coverage.
- Natural-language intake and weekly/monthly training summaries remain the next AI workflows. They will not begin until the persistence/memory and authenticated QA gates are closed.

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

Baseline deterministic release proof completed.

- Added [EVAL_REPORT.md](./EVAL_REPORT.md), generated by `python -m evals.generate_report`.
- The current report passes 13 cases covering runtime fallback, daily and weekly schema/safety, no medical claims, no recommendation drift, sparse-history behavior, no AI mutation, What-if no-mutation, malformed output, and timeout fallback.
- Added frontend smoke suites for persistence migration/deletion, memory lifecycle actions, and deterministic What-if behavior.
- Optional local Ollama measurements remain informational and do not block the baseline gate.

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

### Status - Updated 2026-06-27

Demo packaging is complete.

- Added the architecture summary and five-minute walkthrough.
- README links directly to the proof artifacts and separates demo-complete from beta work.
- Added a user-facing training-data deletion control.
- Deployment/monitoring guidance can expand when a hosted beta target is selected; hosted AI, wearable ingestion, native mobile, and autonomous AI mutation remain out of scope.

## Execution Order

1. Close and checkpoint the current UI slice without adding QA artifacts.
2. Keep the shippable-demo proof green: readable eval report, architecture summary, and five-minute walkthrough.
3. Build persistence by domain behind the local-first repository boundary; require UID scoping, idempotent migration, offline fallback, rules, and emulator tests.
4. Deliver training memory on that repository boundary; tentative patterns never score and confirmed preferences remain bounded nudges.
5. Expand AI one read-only workflow at a time: deterministic What-if plus explanation first, natural-language intake second, and training summaries last.
6. Do not begin hosted AI, wearable ingestion, native mobile, or autonomous plan mutation.

## Worktree Checkpoint - Updated 2026-06-27

Reviewed and checkpointed.

- `git status --short` and `git diff --check` were run before implementation.
- `.edge-qa*` profiles and temporary screenshots were left untouched and must remain excluded from any product commit.
- Product changes were reviewed as UI, persistence/memory, What-if/evals, and documentation slices.
- The reviewed UI, persistence/memory, What-if/eval, and documentation slices were selectively committed as `5d13c38`.
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
- Local Ollama mode is wired but not performance-tested on this machine; every user-facing path must remain fallback-safe.
- `npm audit` still reports dependency vulnerabilities from the frontend dependency tree; these have not been triaged yet.
- Local Ollama can be slow; every user-facing AI path must remain async or fallback-safe.
- Natural-language intake and training summaries remain intentionally behind the current authenticated persistence/QA gate.
- Firestore isolation rules pass in the emulator; authenticated cross-session hydration/deletion behavior still needs live browser verification before persistence is called beta-ready.
- `.edge-qa*` profiles and temporary screenshots remain intentionally untracked and must not be included in product commits.
