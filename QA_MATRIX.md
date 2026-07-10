# Kinetic QA Matrix

This matrix captures the current release proof and the checks required before
the next beta checkpoint.

| Area | Required check | Current status |
| --- | --- | --- |
| Frontend lint | `cd frontend && npm run lint` | Required before checkpoint |
| Frontend production build | `cd frontend && npm run build` | Required before checkpoint |
| Frontend deterministic smoke | `cd frontend && npm run smoke` | Required before checkpoint |
| Frontend beta posture | `cd frontend && npm run beta:readiness` | Dependency pinning passes; default audit skip warning expected |
| Frontend advisory audit | `cd frontend && npm run beta:audit` | Passed 2026-07-09; rerun after package changes |
| Dependency pin review | direct frontend/backend dependencies exact-pinned | Passed 2026-07-09 |
| Backend compile | `cd backend && .\.venv\Scripts\python.exe -m compileall app evals` | Required before checkpoint |
| Backend deterministic gates | `cd backend && .\.venv\Scripts\python.exe -m evals._gates` | Required before checkpoint |
| Backend smoke | `cd backend && .\.venv\Scripts\python.exe -m evals._smoke` | Required before checkpoint |
| Firebase rules | `npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"` | Required after rules/repository changes |
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
| Behavior prompt privacy | raw workout notes excluded before AI narration | Covered by backend deterministic gates |
| Final runbook review | hosted preflight, rollback, triage, and protected-artifact handling documented | Passed 2026-07-09 |

## Browser QA notes

Use disposable QA accounts. Do not commit browser profiles, screenshots, or
local proof artifacts. The protected patterns are `.edge-qa*` and
`tmp-onboarding-*.png`.

## Release interpretation

The demo is shippable and the Firebase persistence foundation is beta-ready.
Beta hardening is complete for a small controlled beta. Apple Health CSV import
is an implemented web-beta bridge for readiness metrics; native/background
HealthKit sync, Garmin, and Oura remain intentionally out of scope until
selected as a new product phase.
