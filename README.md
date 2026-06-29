# Kinetic | AI-Driven Adaptive Training Engine

**Adaptive training plans for a dynamic life.** *Built with GitHub Copilot, Antigravity, and Cursor.*

[![Project Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-green)](https://github.com/kathyygong/kinetic)

Product requirements live in [PRD.md](./PRD.md), and the execution plan lives in [BUILD_PLAN.md](./BUILD_PLAN.md). The product philosophy and AI systems rationale live in [productreasoning](./productreasoning).

For a fast technical review, see [ARCHITECTURE.md](./ARCHITECTURE.md), the
[five-minute demo script](./DEMO_SCRIPT.md), and the generated
[deterministic AI eval report](./EVAL_REPORT.md).

## 🏃 The Problem
Most running apps provide static plans that exist in a vacuum. When life happens (e.g. a late-night meeting, poor sleep, or an unexpected trip) the plan breaks. Users are left to manually adjust their training or, more often, lose consistency and abandon the plan entirely.

**Kinetic** solves the "Consistency Gap" by transforming the training plan from a static document into a dynamic, living agent that responds to a user's real-time constraints.

## ✨ Current Product Direction
* **Deterministic Training Core:** Generates and adjusts running plans with explicit safety constraints, including mileage progression and recovery-aware workout selection.
* **Calendar-Aware Adjustment:** Uses schedule constraints to adapt the upcoming week while keeping the plan explainable and user-controlled.
* **Manual Readiness Input:** Lets runners log sleep, soreness, stress, and recovery signals without requiring wearable integrations for the demo.
* **Grounded AI Reasoning:** Uses bounded reasoning for decision explanations, recalibration summaries, behavior patterns, and evals. Deterministic validation remains the authority for plan changes.
* **Offline-Friendly Demo:** Supports deterministic fallback behavior so the demo does not require paid hosted AI.

## 🛠 The AI Stack & Strategy
Kinetic is designed as a hybrid deterministic + AI product.

* **Deterministic Safety Layer:** Owns training changes, safety caps, and persisted workout decisions.
* **Reasoning Layer:** Produces typed, schema-validated explanations and summaries that are safe to ignore or regenerate.
* **AI Runtime Modes:** Supports fallback, disabled, and optional local Ollama modes, reported through `GET /ai/status`.
* **Eval Harness:** Tests AI boundaries, fallback behavior, sparse-data warnings, schema validity, no medical claims, and no-drift guarantees before demo ship.

## 📈 Roadmap & Product Evolution
- [X] **Foundation:** Deterministic planning, calendar-aware adjustment, manual readiness flows, and core API/frontend surfaces.
- [X] **Demo Vertical Slice:** AI status visibility, hardened explanation/fallback flows, behavior learning, seed/reset controls, and the full responsive UI system.
- [X] **Demo Release Gate:** Signed-in responsive QA, strict backend token enforcement, Firestore rules, and deterministic evals pass.
- [ ] **Beta-Ready Foundation:** Firebase persistence, security rules, privacy-conscious instrumentation, and broader UI polish.
- [ ] **Later Integrations:** Native mobile app, Apple Health/Garmin/Oura ingestion, hosted AI provider option, coach sharing, and push notifications.
---

# 👩‍💻 About the Author
Product Manager at Microsoft focused on high-scale infrastructure and 0→1 initiatives. Kinetic was built to bridge the gap between technical possibility and user-centric design in the AI space.
