# Kinetic | AI-Driven Adaptive Training Engine

**Adaptive training plans for a dynamic life.** *Built with GitHub Copilot, Antigravity, and Cursor.*

[![Project Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-green)](https://github.com/kathyygong/kinetic)

Product requirements live in [PRD.md](./PRD.md), and the execution plan lives in [BUILD_PLAN.md](./BUILD_PLAN.md). The product philosophy and AI systems rationale live in [productreasoning](./productreasoning).

For a fast technical review, see [ARCHITECTURE.md](./ARCHITECTURE.md), the
[five-minute demo script](./DEMO_SCRIPT.md), and the generated
[deterministic AI eval report](./EVAL_REPORT.md). For beta handoff, see the
[beta runbook](./BETA_RUNBOOK.md) and [QA matrix](./QA_MATRIX.md). The active
product roadmap is the iOS
[User-Ready Native Mobile Plan](./MOBILE_APP_PLAN.md),
with the sync contract in [Mobile Readiness Schema](./MOBILE_READINESS_SCHEMA.md)
and the authenticated Today boundary in
[Mobile Today Contract](./MOBILE_TODAY_CONTRACT.md).
Native iOS is Kinetic's primary user-facing product; web remains the advanced
What-if/deep-analysis surface and the primary demo, admin, QA/eval, and
beta-operations surface. Core runner features are not complete when they exist
only on web.
The browser-viewable prototype lives at `/mobile-companion` when the frontend is
running locally. The Phase 1 native HealthKit/Firebase app and Xcode project
live in [`ios/KineticCompanion`](./ios/KineticCompanion/README.md); physical
iPhone sync, web readback, retry, and deletion-tombstone behavior were proven on
2026-07-16. The mobile audit surface lives at `/qa/mobile`. The shared
Windows-side Native Today request, response, cache, failure, privacy, and
observability contract completed on 2026-07-16. The SwiftUI implementation and
signed physical-device proof completed on 2026-07-17 and were integrated into
`main` on 2026-07-20. [Mobile Phase 2.5 bounded intake](./MOBILE_INTAKE_HANDOFF.md)
and its [shared contract](./MOBILE_INTAKE_CONTRACT.md) completed on
2026-07-20, including native Codable/SwiftUI, deterministic
confirmation/rejection, signed-device, and `/qa/mobile` evidence. The complete
Phase 2.5 implementation was integrated into `main` after the final Windows
frontend/backend/Firebase revalidation passed.
Phase 3 now has a fixed [check-in contract](./MOBILE_CHECKIN_CONTRACT.md) and a
native recovery/completed/skipped implementation with green Swift fixture,
simulator, signed-device, strict-backend, owner-only emulator, and shared
frontend gates. Physical-device recovery/completed/skipped interaction and
live same-user Recovery, training-review, memory, and audit readback passed on
2026-07-21. The July dependency blocker was cleared on 2026-07-23 with patched
Next.js `16.2.11`, a clean connected audit, and a complete GitHub-hosted
Windows integration rerun. The completed Phase 3 branch was fast-forwarded
into `main` on 2026-07-23; the managed workstation proxy's stale tarball mirror
is documented as a local environment limitation.

## 🏃 The Problem
Most running apps provide static plans that exist in a vacuum. When life happens (e.g. a late-night meeting, poor sleep, or an unexpected trip) the plan breaks. Users are left to manually adjust their training or, more often, lose consistency and abandon the plan entirely.

**Kinetic** solves the "Consistency Gap" by transforming the training plan from a static document into a dynamic, living agent that responds to a user's real-time constraints.

## ✨ Current Product Direction
* **Deterministic Training Core:** Generates and adjusts running plans with explicit safety constraints, including mileage progression and recovery-aware workout selection.
* **Calendar-Aware Adjustment:** Uses schedule constraints to adapt the upcoming week while keeping the plan explainable and user-controlled.
* **Readiness Input:** Lets runners log sleep, soreness, stress, and recovery signals manually, or import bounded Apple Health CSV exports for sleep/HRV/resting-heart-rate readiness without requiring native wearable sync for the demo.
* **Grounded AI Reasoning:** Uses bounded reasoning for decision explanations, recalibration summaries, behavior patterns, and evals. Deterministic validation remains the authority for plan changes.
* **Training Memory:** Shows tentative patterns and confirmed preferences with confidence, supporting-history context, and explicit confirm/dismiss/remove controls. Every surfaced pattern should have a bounded result; confirmed preferences can become scoring nudges, and schedule-style preferences can feed deterministic plan generation as preferred-day inputs.
* **Bounded Pattern Results:** The versioned `behavior-pattern-result.v1` contract maps every supported behavior family to scoring review, preferred-day review, sync/check-in prompt, or conservative caution. Detection and review never write; schedule confirmation reuses the deterministic intake/planner path, and pain/discomfort never becomes personalization or medical data.
* **Read-Only What-if Planning:** Previews day, duration, and easy-only plan variants without mutating the saved plan.
* **Bounded Natural-Language Intake:** The web path parses explicit goal, training-day, availability, experience, and workout-swap changes into typed, grounded drafts. The shared mobile contract also routes recovery, pain/injury, missed-workout, reflection, explanation, ambiguous, unsupported, and unsafe notes to bounded non-mutating destinations. Drafts remain read-only until the runner confirms them and deterministic validation passes.
* **Read-Only Training Reviews:** Summarizes 7- or 30-day consistency, completed volume, and recovery trends from deterministic aggregates. Optional local AI can narrate those facts but cannot invent metrics or change the plan.
* **Consistent Readiness Decisions:** Dashboard and Recovery use the same rolling biometric baselines, so the displayed recovery score and training state cannot drift between surfaces.
* **Local-First Persistence:** Keeps the demo responsive through localStorage while authenticated Firebase repositories mirror user-scoped training domains in the background. Returning sign-in hydrates remote state before identity merge, and signed-in deletes require confirmed Firebase tombstones instead of silently dropping local state.
* **Privacy-Conscious Observability:** Records typed, local, bounded product events for recommendation, AI, intake, training-review, persistence, and stale-data surfaces without raw notes, biometrics, calendar/workout text, tokens, email, UID, or unnecessary identity data.
* **Offline-Friendly Demo:** Supports deterministic fallback behavior so the demo does not require paid hosted AI or available remote persistence.

## 🛠 The AI Stack & Strategy
Kinetic is designed as a hybrid deterministic + AI product.

### 3-layer architecture

1. **Deterministic safety core** — the authenticated shared FastAPI generator owns production plan creation and authoritative week phases; independent validators own recovery classification, candidate scoring, mileage/load/taper/spacing gates, calendar-aware adjustments, and every persisted workout decision.
2. **Bounded AI reasoning layer** — explains decisions, summarizes recalibrations/training reviews, and parses supported intake into reviewable drafts. AI output is typed, schema-validated, timeout-protected, grounded, and safe to discard.
3. **Local-first persistence and privacy layer** — keeps the app usable offline through localStorage, mirrors authenticated training domains to user-scoped Firebase documents, enforces owner-only Firestore rules, and records only sanitized local product events.

Runtime modes are explicit:

* `fallback` — deterministic explanation templates; safe hosted/default mode.
* `disabled` — deterministic training flow without AI reasoning calls.
* `local_ollama` — optional no-cost live AI demo mode, reported through `GET /ai/status`.

* **Live Local Intake:** Synchronous intake uses a dedicated `llama3.2:3b`
  model, Ollama-native JSON Schema, deterministic field agreement, and startup
  warming. The model stays resident for the backend session; its 24-second
  server deadline remains below the frontend's 30-second safety deadline.
* **Eval Harness:** Tests AI boundaries, fallback behavior, sparse-data warnings, schema validity, no medical claims, and no-drift guarantees before demo ship.

## 📈 Roadmap & Product Evolution
- [X] **Foundation:** Deterministic planning, calendar-aware adjustment, manual/Apple Health CSV readiness flows, and core API/frontend surfaces.
- [X] **Demo Vertical Slice:** AI status visibility, hardened explanation/fallback flows, training memory, read-only What-if planning, seed/reset controls, and the full responsive UI system.
- [X] **Demo Release Gate:** Signed-in responsive QA, strict backend token enforcement, Firestore rules, and deterministic evals pass.
- [X] **Beta-Ready Foundation:** Repository-backed Firebase persistence, deployed security rules, dependency pinning, advisory audit, privacy-conscious instrumentation, telemetry QA, runbook, and QA matrix are complete for a small controlled beta.
- [X] **Bounded Intake Workflow:** Natural-language changes produce a validated, reviewable draft; malformed output, ambiguity, timeouts, and unavailable AI fall back or stop safely, and only explicit confirmation can reach deterministic plan application.
- [X] **Behavior Pattern Result Contract:** All seven supported pattern families have strict typed outcomes, deterministic fallback and confirmation, canonical shared fixtures, privacy-safe mobile QA telemetry, and no decorative or autonomous pattern mutation.
- [X] **Training Review Workflow:** Weekly and monthly summaries use typed,
  privacy-minimized inputs, deterministic metrics, grounded narration, and
  fallback-safe read-only UI. Signed-in browser QA verifies both live grounded
  Ollama narration and safe deterministic rejection of ungrounded output.
- [X] **Beta Hardening:** Live persistence, auth/rules proof, dependency
  posture, telemetry privacy coverage, behavior-prompt privacy gates, plan
  safety smoke coverage, final runbook review, and operational rollback
  guidance are complete.
- [X] **Mobile Phase 1 — HealthKit/Firebase Proof:** Native Firebase sign-in,
  read-only HealthKit permission, bounded local summarization, Firestore sync,
  same-user web readback, retry behavior, and deletion tombstones passed on a
  physical iPhone.
- [X] **Mobile Phase 2 — Native Today:** The shared authenticated contract,
  SwiftUI live/cache/failure surfaces, owner-only audit readback, and signed
  physical-device proof are complete.
- [X] **Mobile Phase 2.5 — Bounded Intake:** Authenticated NLP routing,
  review-only drafts, deterministic confirm/apply, privacy-safe lifecycle
  observability, and signed-device evidence completed on 2026-07-20. See
  [MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md).
- [X] **Mobile Phase 3 — Recovery/Check-In:** Windows/shared Part A and native
  SwiftUI Part B implementation completed 2026-07-20. Explicit recovery and
  completion/skipped/effort capture, deterministic validation, atomic existing-
  domain persistence, and privacy-safe audit passed the physical-device and
  live same-user web proof on 2026-07-21. Evidence and the remaining patched-
  Active-LTS Next.js distribution blocker are in
  [MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md). Trusted project
  rules prompt for the scoped Git, Swift/Xcode, Simulator, and device commands
  that may require approval.
- [X] **Mobile Phase 3.5 — Behavior Pattern Results:** The shared contract and
  native scoring/preferred-day/prompt/caution routes passed Windows, Mac,
  simulator, physical-device, same-user, and privacy-safe audit proof.
- [X] **Mobile Phase 4A — Notification Contract:** The opt-in local evening
  check-in eligibility, permission, cancellation, and generic lock-screen
  privacy contract passes the default frontend smoke suite.
- [ ] **Mobile Phase 5 — Native Foundation:** Permanent navigation, account
  creation/recovery, onboarding, progressive permissions, Settings, privacy,
  support, data controls, and local notification delivery. Windows/shared
  `mobile-foundation.v1`, deletion/migration boundaries, owner-only domains,
  and audit gates plus the Mac implementation checkpoint are present. Mac B
  must finish personal-record/availability onboarding, shared plan preview and
  confirmation, editable profile inputs, training-data export, account
  deletion, accessibility, signing, and live readback.
- [ ] **Mobile Phase 6 — Native Plan Lifecycle:** Generate, preview, save,
  browse, safely edit/regenerate, pause/resume, and confirm preferences without
  a normal-runner web handoff. Windows B owns shared generation, authoritative
  phase metadata, action-specific/full-plan lifecycle enforcement, adversarial
  gates, production-web migration, and hosted workflow routing. Windows B is
  green at `d5bbfdc`; Mac B is authorized to remove native generation/phase
  heuristics and close native/device proof. Final Windows integration still
  requires green hosted Windows and macOS runs after the Mac commit.
- [ ] **Pre-Phase 7 Product Evidence:** After Phases 5–6 close, run moderated
  signed-build onboarding-to-check-in sessions with 3–5 target runners. Validate
  independent core-loop use before expanding into Calendar/Progress.
- [ ] **Mobile Phase 7 — Apple Calendar And Progress:** Privacy-minimized
  EventKit free/busy ingestion, calendar-aware planning, optional explicit
  one-way export, and shared-history progress.
- [ ] **Mobile Phase 8 — User-Ready External Beta:** Accessibility/device,
  offline/sync/migration, production operations, privacy, TestFlight, support,
  and install-to-deletion external-user evidence.
- [ ] **Later Integrations:** Garmin/Oura, hosted AI, coach/social features,
  broad push notifications, full two-way Calendar sync, open-ended chat,
  Apple Watch/widgets, Android, and autonomous AI plan mutation.

Optional live-model verification (requires Ollama and the configured intake
model) runs two repeatability passes across eight exact-value, no-fallback
cases:

```powershell
cd backend
.\.venv\Scripts\python.exe -m evals.benchmark_intake_live
```
---

# 👩‍💻 About the Author
Product Manager at Microsoft focused on high-scale infrastructure and 0→1 initiatives. Kinetic was built to bridge the gap between technical possibility and user-centric design in the AI space.
