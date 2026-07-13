# Kinetic QA Matrix

This matrix captures the current release proof and the checks required before
the next beta checkpoint.

| Area | Required check | Current status |
| --- | --- | --- |
| Frontend lint | `cd frontend && npm run lint` | Passed 2026-07-13 |
| Frontend production build | `cd frontend && npm run build` | Passed 2026-07-13 |
| Frontend deterministic smoke | `cd frontend && npm run smoke` | Passed 2026-07-13; canonical PR units and calendar adjustment paths asserted |
| Frontend beta posture | `cd frontend && npm run beta:readiness` | Dependency pinning passes; default audit skip warning expected |
| Frontend advisory audit | `cd frontend && npm run beta:audit` | Passed 2026-07-13; no moderate/high/critical findings |
| Dependency pin review | direct frontend/backend dependencies exact-pinned | Passed 2026-07-09 |
| Backend compile | `cd backend && .\.venv\Scripts\python.exe -m compileall app evals` | Required before checkpoint |
| Backend deterministic gates | `cd backend && .\.venv\Scripts\python.exe -m evals._gates` | Required before checkpoint |
| Backend smoke | `cd backend && .\.venv\Scripts\python.exe -m evals._smoke` | Required before checkpoint |
| Firebase rules | `npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"` | Passed 2026-07-13; owner-only mobile readiness/health-sync access and tombstones asserted |
| Strict backend auth | signed-in token accepted and anonymous protected requests rejected | Passed in prior release gate; rerun after auth changes |
| Signed-in responsive UI | desktop and mobile browser QA | Passed in prior release gate; rerun after layout changes |
| Live Firebase hydration | same signed-in account hydrates across independent sessions | Passed 2026-07-09 |
| Live account isolation | Account B cannot hydrate Account A local or remote data | Passed 2026-07-09 |
| Live deletion tombstones | signed-in delete remains deleted after reload and second-origin sign-in | Passed 2026-07-09 |
| Natural-language intake | review-only draft, confirmation required, anonymous blocked under strict auth | Passed in prior release gate |
| Training review | grounded live local AI and deterministic fallback for unsafe output | Passed in prior release gate |
| Observability privacy | every event family sanitized, capped, typed, and failure-isolated | Covered by `smoke-instrumentation.ts` |
| Apple Health CSV import | bounded readiness metrics imported, unsupported note columns dropped | Covered by `smoke-apple-health.ts` |
| Plan safety invariants | race/experience/low-mileage plans stay bounded and coherent | Covered by `smoke-plan-safety.ts` |
| Plan fixture data contract | human-readable PR fixtures convert explicitly to canonical integer seconds; generated paces stay plausible | Covered by `fixtureHelpers.ts`, `smoke-plan.ts`, `smoke-plan-adjuster.ts`, and `smoke-plan-refresh.ts` |
| Behavior prompt privacy | raw workout notes excluded before AI narration | Covered by backend deterministic gates |
| Final runbook review | hosted preflight, rollback, triage, and protected-artifact handling documented | Passed 2026-07-09 |
| Mobile phase scope | [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md) defines iOS MVP, privacy boundary, phases, and gates | Selected 2026-07-10 |
| iOS HealthKit permissions | denied, partial, granted, and stale background delivery states handled | Required before mobile beta |
| iOS readiness sync | [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md) contract followed; bounded daily summaries only; no raw HealthKit samples in Firestore | Shared fixture and Windows validator passed 2026-07-13; native HealthKit execution required before mobile beta |
| Mobile calendar awareness | Today decisions consume existing calendar availability/freshness and lower confidence on stale/missing calendar data | Required before mobile beta |
| Mobile NLP intake | review-only drafts, strict-auth rejection when anonymous, deterministic confirm/apply, malformed/ambiguous fallback | Required before mobile beta |
| Mobile admin/eval observability | `/qa/mobile` shows mobile-originated sync, recommendation, intake, validation, and check-in events from the shared privacy-safe event log | Shared event-log-to-QA contract passed 2026-07-13; native event transport remains required before mobile beta |
| Mobile/web sync compatibility | web dashboard consumes mobile readiness without unsafe overwrite or confidence drift | Shared envelope and five-case conflict parity passed in TypeScript 2026-07-13; live cross-device readback required before mobile beta |
| Mobile delete/disconnect | synced summaries respect owner-only rules and deletion tombstones across devices | Emulator owner scope and both mobile tombstones passed 2026-07-13; on-device disconnect/full-delete QA remains required |
| iOS scaffold compile | `cd ios/KineticCompanion && swift test` on macOS/Xcode toolchain | Shared fixture tests authored; Swift unavailable on Windows, so execution remains required before mobile beta |

## Browser QA notes

Use disposable QA accounts. Do not commit browser profiles, screenshots, or
local proof artifacts. The protected patterns are `.edge-qa*` and
`tmp-onboarding-*.png`.

## Release interpretation

The demo is shippable and the Firebase persistence foundation is beta-ready.
Beta hardening is complete for a small controlled web beta. Apple Health CSV
import is an implemented web-beta bridge for readiness metrics.

As of 2026-07-10, native/background HealthKit sync and native mobile are
selected as the next phase, scoped to Mobile Companion Proof. Mobile beta must
preserve calendar-aware decisions, bounded NLP intake, deterministic
confirm/apply, and shared QA/eval observability. Garmin, Oura, hosted AI, coach
sharing, broad notifications, and autonomous AI mutation remain out of scope.
