# Kinetic Project Status

_Updated September 5, 2026. This page describes the code available on the
public `main` branch, not private planning or unmerged experiments._

## Implemented

### Native iOS

- Firebase authentication and owner-scoped Firestore synchronization.
- Read-only HealthKit authorization and bounded daily readiness summaries.
- A native Today surface with authenticated decisions, deterministic fallbacks,
  same-day caching, calendar-load context, and privacy-safe audit events.
- Bounded natural-language intake with review-before-write confirmation.
- Recovery and workout check-ins with deterministic validation and idempotent
  persistence.
- Behavior-pattern results for scoring review, preferred-day review, readiness
  prompts, and conservative caution routes.
- A debug-only, read-only accessibility fixture and XCUITest suite covering
  pattern success, loading, failure, and confirmed states. Automated iPhone SE
  semantic audits and portrait/landscape traversal pass.

### Shared platform and web

- Deterministic training-plan generation, safety validation, recovery
  classification, calendar-aware adjustment, and read-only What-if planning.
- Grounded AI explanations, recalibration summaries, training reviews, and
  supported-intake parsing with schema validation and safe deterministic
  fallback.
- Local-first web persistence with authenticated Firebase mirroring,
  owner-isolation rules, and deletion tombstones.
- Privacy-minimized product events and an owner-only QA readback surface.
- A versioned model-quality eval suite covering daily reasoning, intake,
  behavior insights, and training summaries, with candidate comparison,
  workload-specific metrics, grounding, safety, stability, and latency.
- A provider-free notification decision contract for local evening check-in
  reminders. Native OS scheduling is not yet part of `main`.

### Verification

- The Swift package suite passes 52 tests.
- The iPhone SE behavior-pattern UI suite passes all 3 tests, including
  semantic accessibility checks and portrait/landscape traversal.
- GitHub Actions validates frontend lint, TypeScript, deterministic smoke,
  production build, backend gates, offline model-eval graders, generated safety
  evidence, dependency posture, and owner-only Firestore rules on Windows.

## Known gaps

- Authenticated VoiceOver order and labels still need a physical-device pass
  before external beta.
- The permanent native navigation, onboarding/account recovery, settings/data
  controls, and complete native plan lifecycle are not yet on `main`.
- EventKit free/busy ingestion, recent-progress views, offline/sync migration
  hardening, production operations, and TestFlight support remain incomplete.
- Kinetic is not currently presented as an externally supported beta product.
- Model-quality coverage is intentionally small and synthetic; blinded human
  ratings and broader adversarial/regression cases are still pending.

## Next milestones

1. Complete the native foundation: navigation, onboarding, progressive
   permissions, account recovery, settings, support, and data controls.
2. Complete native plan ownership: generate, preview, save, browse, safely
   edit/regenerate, pause/resume, and confirm preferences.
3. Add privacy-minimized Apple Calendar context and shared-history progress.
4. Close external-beta gates across accessibility, devices, offline/sync,
   migrations, privacy, operations, support, and TestFlight.

Later candidates include Garmin/Oura ingestion, hosted AI, coach collaboration,
broader notifications, Apple Watch/widgets, and Android. They are not committed
release scope.
