# Kinetic QA Matrix

This matrix captures the current release proof and the checks required before
the next beta checkpoint.

| Area | Required check | Current status |
| --- | --- | --- |
| Frontend lint | `cd frontend && npm run lint` | Passed 2026-07-16 |
| Frontend production build | `cd frontend && npm run build` | Passed 2026-07-16 |
| Frontend deterministic smoke | `cd frontend && npm run smoke` | Passed 2026-07-16; mobile-only readiness routing and canonical plan/calendar paths asserted |
| Frontend beta posture | `cd frontend && npm run beta:readiness` | Dependency pinning passes; default audit skip warning expected |
| Frontend advisory audit | `cd frontend && npm run beta:audit` | Passed 2026-07-13; no moderate/high/critical findings |
| Dependency pin review | direct frontend/backend dependencies exact-pinned | Passed 2026-07-09 |
| Backend compile | `cd backend && .\.venv\Scripts\python.exe -m compileall app evals` | Passed 2026-07-16 |
| Backend deterministic gates | `cd backend && .\.venv\Scripts\python.exe -m evals._gates` | Passed 2026-07-16 |
| Backend smoke | `cd backend && .\.venv\Scripts\python.exe -m evals._smoke` | Passed 2026-07-16 |
| Firebase rules | `npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"` | Passed 2026-07-16 on Mac; owner-only mobile readiness/health-sync access and tombstones asserted |
| Strict backend auth | signed-in token accepted and anonymous protected requests rejected | Passed in prior release gate; rerun after auth changes |
| Signed-in responsive UI | desktop and mobile browser QA | Passed in prior release gate; rerun after layout changes |
| Live Firebase hydration | same signed-in account hydrates across independent sessions | Passed 2026-07-09 |
| Live account isolation | Account B cannot hydrate Account A local or remote data | Passed 2026-07-09 |
| Live deletion tombstones | signed-in delete remains deleted after reload and second-origin sign-in | Passed 2026-07-09 |
| Natural-language intake | supported notes route to a reviewable draft, guided check-in, read-only explanation, clarifying prompt, or safe refusal; confirmation required for state changes; anonymous blocked under strict auth | Passed for current review-only draft scope in prior release gate; expanded routing required before mobile beta |
| Training review | grounded live local AI and deterministic fallback for unsafe output | Passed in prior release gate |
| Observability privacy | every event family sanitized, capped, typed, and failure-isolated | Covered by `smoke-instrumentation.ts` |
| Apple Health CSV import | bounded readiness metrics imported, unsupported note columns dropped | Covered by `smoke-apple-health.ts` |
| Plan safety invariants | race/experience/low-mileage plans stay bounded and coherent | Covered by `smoke-plan-safety.ts` |
| Plan fixture data contract | human-readable PR fixtures convert explicitly to canonical integer seconds; generated paces stay plausible | Covered by `fixtureHelpers.ts`, `smoke-plan.ts`, `smoke-plan-adjuster.ts`, and `smoke-plan-refresh.ts` |
| Behavior prompt privacy | raw workout notes excluded before AI narration | Covered by backend deterministic gates |
| Final runbook review | hosted preflight, rollback, triage, and protected-artifact handling documented | Passed 2026-07-09 |
| Mobile phase scope | [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md) defines iOS MVP, privacy boundary, phases, and gates | Selected 2026-07-10 |
| Mobile Mac handoff | [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md) defines the macOS/Xcode execution checklist and records the physical-device proof | Completed 2026-07-16 |
| iOS HealthKit permissions | denied, partial, granted, and unavailable states handled; stale background delivery remains later hardening | Read-only grant and bounded partial/unavailable code paths passed; background delivery not yet implemented |
| iOS readiness sync | [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md) contract followed; bounded daily summaries only; no raw HealthKit samples in Firestore | Passed 2026-07-16 on physical iPhone with web readback |
| Mobile Today shared contract | [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md), `smoke-mobile-today-contract.ts`, and the shared JSON fixture validate request, response, privacy, cache, and failure semantics | Passed TypeScript and 17-test Swift package gates 2026-07-17; signed-device interaction remains |
| Mobile calendar awareness | Today decisions consume existing calendar availability/freshness, preserve explicit zero-minute windows, use a labeled planned-duration fallback, and lower confidence on stale/missing calendar data | Native fixture/fallback/zero-window tests passed 2026-07-17; physical-device conflict rerun remains |
| Mobile NLP intake | schedule/availability/travel/goal/preference notes create review-only drafts; recovery, pain, missed-workout, and reflection notes open bounded flows; strict-auth rejection when anonymous; deterministic confirm/apply; malformed/ambiguous fallback | Required before mobile beta |
| Mobile perceived-recovery flow | NLP recovery notes open explicit perceived-recovery capture; captured fields coexist with HealthKit summaries; AI never fabricates readiness values from text | Required before mobile beta |
| Behavior pattern result contract | every surfaced pattern has a bounded response; confirmed schedule patterns can update preferred-day inputs for deterministic plan generation; pain patterns route to caution only | Required before mobile beta |
| Mobile admin/eval observability | `/qa/mobile` shows mobile-originated sync, recommendation, intake, validation, and check-in events from the shared privacy-safe event log | Native capped owner-only decision transport and Firebase readback implemented 2026-07-17; live signed-user readback rerun remains |
| Mobile/web sync compatibility | web dashboard consumes mobile readiness without unsafe overwrite or confidence drift | Passed 2026-07-16 with physical-device write and same-user web Recovery readback |
| Mobile companion state matrix | `cd frontend && npm run smoke` | Default smoke covers readiness, health-sync freshness, calendar, profile, goal, saved plan, preferences, workout history, intake, and check-in decision states without browser dependencies |
| Mobile companion browser smoke | `cd frontend && npm run smoke:mobile-browser` against a running `/mobile-companion` server | Optional visual/e2e gate authored 2026-07-13 with stable test hooks; local execution requires Playwright package |
| Mobile delete/disconnect | synced summaries respect owner-only rules and deletion tombstones across devices | Web delete/native next-sync tombstone behavior passed 2026-07-16; explicit native disconnect UI remains future work |
| iOS package and app compile | `cd ios/KineticCompanion && swift test`; Xcode simulator/device build | 17 Swift tests, signed generic-device build, and iPhone 17 / iOS 26.3 simulator build/install/launch passed 2026-07-17; physical iPhone unavailable |

## Browser QA notes

Use disposable QA accounts. Do not commit browser profiles, screenshots, or
local proof artifacts. The protected patterns are `.edge-qa*` and
`tmp-onboarding-*.png`.

## Release interpretation

The demo is shippable and the Firebase persistence foundation is beta-ready.
Beta hardening is complete for a small controlled web beta. Apple Health CSV
import is an implemented web-beta bridge for readiness metrics.

As of 2026-07-17, Mobile Companion Phase 1 native HealthKit/Firebase proof and
the Phase 2A shared/SwiftUI Native Today implementation are complete. Signed
physical-device Today interaction and live `/qa/mobile` readback remain the
bounded rerun before this checkpoint is fully closed. Mobile beta must
preserve calendar-aware decisions, bounded NLP intake, deterministic
confirm/apply, perceived-recovery routing, pattern-to-action behavior memory,
and shared QA/eval observability. Garmin, Oura, hosted AI, coach sharing,
broad notifications, and autonomous AI mutation remain out of scope.
