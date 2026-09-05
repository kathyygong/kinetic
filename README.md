# Kinetic

Kinetic is a mobile-first adaptive running system for athletes whose plans need
to survive real life. It combines a deterministic training engine with bounded
AI explanations, reviewable inputs, and user-controlled changes.

[![Project status: active development](https://img.shields.io/badge/status-active%20development-2f855a)](./PROJECT_STATUS.md)

Native iOS is the primary runner experience. The web app provides advanced
What-if planning and deep analysis, plus the demo, administration, and quality
surfaces used to validate the shared system.

## What works today

- Deterministic plan generation, recovery-aware recommendations, calendar-aware
  adjustment, safety validation, and read-only What-if previews.
- Native iOS authentication, read-only HealthKit summaries, Firebase sync,
  Today recommendations, bounded natural-language intake, workout/recovery
  check-ins, and behavior-pattern results.
- Typed, privacy-minimized contracts between the iOS, web, backend, and
  Firestore layers. AI output can explain or propose, but deterministic logic
  remains authoritative for every plan mutation.
- Local-first web persistence with owner-scoped Firebase mirroring, deletion
  tombstones, deterministic offline fallbacks, and privacy-conscious audit
  events.
- Automated frontend, backend, Firestore, Swift, and iOS accessibility checks.

See [Project Status](./PROJECT_STATUS.md) for the implemented boundary, known
gaps, and next milestones.

## Product boundaries

Kinetic does not autonomously change training from free-form AI output. Pain or
discomfort signals route to conservative guidance rather than personalization,
and raw health, calendar, and note content is excluded from product telemetry.

Garmin/Oura ingestion, hosted AI, coach sharing, broad push notifications,
two-way calendar sync, Android, and autonomous AI plan mutation are not current
capabilities.

## Repository map

- [`ios/KineticCompanion`](./ios/KineticCompanion/README.md) — native SwiftUI
  app and shared-contract tests.
- [`frontend`](./frontend/README.md) — runner web experience and operator/QA
  surfaces.
- `backend` — authenticated decision, intake, review, and eval services.
- [Architecture](./ARCHITECTURE.md) — system boundaries and data flow.
- [AI boundaries and evals](./AI_BOUNDARIES_AND_EVALS.md) — concise rationale
  for AI use, deterministic authority, and evaluation coverage.
- [Model quality eval report](./MODEL_EVAL_REPORT.md) — measured task quality,
  grounding, safety, stability, and latency across local model candidates.
- [AI system safety and contract report](./EVAL_REPORT.md) — generated
  deterministic product-boundary evidence.
- Public contracts: [readiness](./MOBILE_READINESS_SCHEMA.md),
  [Today](./MOBILE_TODAY_CONTRACT.md), [intake](./MOBILE_INTAKE_CONTRACT.md),
  [check-in](./MOBILE_CHECKIN_CONTRACT.md),
  [pattern results](./MOBILE_PATTERN_RESULT_CONTRACT.md), and
  [notifications](./MOBILE_NOTIFICATION_CONTRACT.md).

Internal product requirements, release definitions, execution plans, QA
runbooks, and implementation handoffs are intentionally not published in this
public repository.

## Development

The web and backend setup lives in the [frontend README](./frontend/README.md).
For the native app, open
`ios/KineticCompanion/KineticCompanion.xcodeproj` in Xcode; configuration and
test commands are in the [iOS README](./ios/KineticCompanion/README.md).

## Author

Built by Kathy Gong as a product and engineering exploration of safe,
explainable adaptive training.
