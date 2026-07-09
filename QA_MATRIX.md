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
| Observability privacy | sanitized, capped, typed event envelopes; failure isolation | Covered by smoke and code review |

## Browser QA notes

Use disposable QA accounts. Do not commit browser profiles, screenshots, or
local proof artifacts. The protected patterns are `.edge-qa*` and
`tmp-onboarding-*.png`.

## Release interpretation

The demo is shippable and the Firebase persistence foundation is beta-ready.
The overall product is still in beta hardening until final runbook review and
any remaining telemetry QA gaps are closed.
