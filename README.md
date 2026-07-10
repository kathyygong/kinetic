# Kinetic | AI-Driven Adaptive Training Engine

**Adaptive training plans for a dynamic life.** *Built with GitHub Copilot, Antigravity, and Cursor.*

[![Project Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-green)](https://github.com/kathyygong/kinetic)

Product requirements live in [PRD.md](./PRD.md), and the execution plan lives in [BUILD_PLAN.md](./BUILD_PLAN.md). The product philosophy and AI systems rationale live in [productreasoning](./productreasoning).

For a fast technical review, see [ARCHITECTURE.md](./ARCHITECTURE.md), the
[five-minute demo script](./DEMO_SCRIPT.md), and the generated
[deterministic AI eval report](./EVAL_REPORT.md). For beta handoff, see the
[beta runbook](./BETA_RUNBOOK.md) and [QA matrix](./QA_MATRIX.md).

## 🏃 The Problem
Most running apps provide static plans that exist in a vacuum. When life happens (e.g. a late-night meeting, poor sleep, or an unexpected trip) the plan breaks. Users are left to manually adjust their training or, more often, lose consistency and abandon the plan entirely.

**Kinetic** solves the "Consistency Gap" by transforming the training plan from a static document into a dynamic, living agent that responds to a user's real-time constraints.

## ✨ Current Product Direction
* **Deterministic Training Core:** Generates and adjusts running plans with explicit safety constraints, including mileage progression and recovery-aware workout selection.
* **Calendar-Aware Adjustment:** Uses schedule constraints to adapt the upcoming week while keeping the plan explainable and user-controlled.
* **Manual Readiness Input:** Lets runners log sleep, soreness, stress, and recovery signals without requiring wearable integrations for the demo.
* **Grounded AI Reasoning:** Uses bounded reasoning for decision explanations, recalibration summaries, behavior patterns, and evals. Deterministic validation remains the authority for plan changes.
* **Training Memory:** Shows tentative patterns and confirmed preferences with confidence, supporting-history context, and explicit confirm/dismiss/remove controls. Only confirmed preferences can become bounded scoring nudges.
* **Read-Only What-if Planning:** Previews day, duration, and easy-only plan variants without mutating the saved plan.
* **Bounded Natural-Language Intake:** Parses explicit goal, training-day, availability, and experience changes into a typed, source-grounded draft. The draft remains read-only until the runner confirms it, then the existing deterministic planner validates and applies it.
* **Read-Only Training Reviews:** Summarizes 7- or 30-day consistency, completed volume, and recovery trends from deterministic aggregates. Optional local AI can narrate those facts but cannot invent metrics or change the plan.
* **Consistent Readiness Decisions:** Dashboard and Recovery use the same rolling biometric baselines, so the displayed recovery score and training state cannot drift between surfaces.
* **Local-First Persistence:** Keeps the demo responsive through localStorage while authenticated Firebase repositories mirror user-scoped training domains in the background. Returning sign-in hydrates remote state before identity merge, and signed-in deletes require confirmed Firebase tombstones instead of silently dropping local state.
* **Privacy-Conscious Observability:** Records typed, local, bounded product events for recommendation, AI, intake, training-review, persistence, and stale-data surfaces without raw notes, biometrics, calendar/workout text, tokens, email, UID, or unnecessary identity data.
* **Offline-Friendly Demo:** Supports deterministic fallback behavior so the demo does not require paid hosted AI or available remote persistence.

## 🛠 The AI Stack & Strategy
Kinetic is designed as a hybrid deterministic + AI product.

* **Deterministic Safety Layer:** Owns training changes, safety caps, and persisted workout decisions.
* **Reasoning Layer:** Produces typed, schema-validated explanations and summaries that are safe to ignore or regenerate.
* **AI Runtime Modes:** Supports fallback, disabled, and optional local Ollama modes, reported through `GET /ai/status`.
* **Live Local Intake:** Synchronous intake uses a dedicated `llama3.2:3b`
  model, Ollama-native JSON Schema, deterministic field agreement, and startup
  warming. The model stays resident for the backend session; its 24-second
  server deadline remains below the frontend's 30-second safety deadline.
* **Eval Harness:** Tests AI boundaries, fallback behavior, sparse-data warnings, schema validity, no medical claims, and no-drift guarantees before demo ship.

## 📈 Roadmap & Product Evolution
- [X] **Foundation:** Deterministic planning, calendar-aware adjustment, manual readiness flows, and core API/frontend surfaces.
- [X] **Demo Vertical Slice:** AI status visibility, hardened explanation/fallback flows, training memory, read-only What-if planning, seed/reset controls, and the full responsive UI system.
- [X] **Demo Release Gate:** Signed-in responsive QA, strict backend token enforcement, Firestore rules, and deterministic evals pass.
- [X] **Beta-Ready Foundation:** Repository-backed Firebase persistence, deployed security rules, dependency pinning, advisory audit, privacy-conscious instrumentation, telemetry QA, runbook, and QA matrix are complete for a small controlled beta.
- [X] **Bounded Intake Workflow:** Natural-language changes produce a validated, reviewable draft; malformed output, ambiguity, timeouts, and unavailable AI fall back or stop safely, and only explicit confirmation can reach deterministic plan application.
- [X] **Training Review Workflow:** Weekly and monthly summaries use typed,
  privacy-minimized inputs, deterministic metrics, grounded narration, and
  fallback-safe read-only UI. Signed-in browser QA verifies both live grounded
  Ollama narration and safe deterministic rejection of ungrounded output.
- [X] **Beta Hardening:** Live persistence, auth/rules proof, dependency
  posture, telemetry privacy coverage, final runbook review, and operational
  rollback guidance are complete.
- [ ] **Later Integrations:** Native mobile app, Apple Health/Garmin/Oura ingestion, hosted AI provider option, coach sharing, and push notifications.

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
