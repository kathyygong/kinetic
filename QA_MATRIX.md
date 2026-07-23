# Kinetic QA Matrix

This matrix captures the current release proof and the checks required before
the next beta checkpoint.

The 2026-07-23 dependency and integration entries below are backed by
[GitHub-hosted Windows run 30012524615](https://github.com/kathyygong/kinetic/actions/runs/30012524615).
The managed local Windows proxy still lacks the Next.js `16.2.11` tarball, so
the hosted `windows-latest` workflow is the reproducible Windows authority.

| Area | Required check | Current status |
| --- | --- | --- |
| Frontend lint | `cd frontend && npm run lint` | Passed 2026-07-23 on the patched Next.js 16.2.11 dependency baseline |
| Frontend production build | `cd frontend && npm run build` | Passed 2026-07-23 with Next.js 16.2.11 and the scoped patched PostCSS resolution; all 16 application routes built successfully |
| Frontend deterministic smoke | `cd frontend && npm run smoke` | Passed 2026-07-23; mobile readiness/Today/intake/check-in contracts, every intake route/failure class, deterministic confirmation, and canonical plan/calendar paths asserted |
| Frontend beta posture | `cd frontend && npm run beta:readiness` | Passed 2026-07-23 with 0 failures and the expected offline-audit warning |
| Frontend advisory audit | `cd frontend && npm run beta:audit` | Passed 2026-07-23 with 0 failures, 0 warnings, and 14 checks; no moderate/high/critical findings |
| Dependency pin review | direct frontend/backend dependencies exact-pinned | Passed 2026-07-23; Next.js and its ESLint config are pinned at 16.2.11, legacy `brace-expansion` at 1.1.16, `sharp` at 0.35.0, and the Next-only PostCSS resolution at 8.5.14 |
| Backend compile | `cd backend && python -m compileall app evals` | Passed 2026-07-23 in the Phase 3 integration rerun |
| Backend deterministic gates | `cd backend && python -m evals._gates` | Passed 2026-07-23, including project-scoped token claims, all mobile intake routes, strict context, strict-auth rejection, and AI failure fallback |
| Backend smoke | `cd backend && python -m evals._smoke` | Passed 2026-07-23 with the expanded mobile intake and check-in gates |
| Firebase rules | `npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"` | Passed 2026-07-23; owner-only mobile readiness/check-in/health-sync/audit access, bounded intake lifecycle readback, cross-user denial, and tombstones asserted |
| Strict backend auth | signed-in token accepted and anonymous protected requests rejected | Passed 2026-07-17; physical iPhone bearer token accepted over USB private link and anonymous request rejected |
| Signed-in responsive UI | desktop and mobile browser QA | Passed in prior release gate; rerun after layout changes |
| Live Firebase hydration | same signed-in account hydrates across independent sessions | Passed 2026-07-09 |
| Live account isolation | Account B cannot hydrate Account A local or remote data | Passed 2026-07-09 |
| Live deletion tombstones | signed-in delete remains deleted after reload and second-origin sign-in | Passed 2026-07-09 |
| Natural-language intake | supported notes route to a reviewable draft, guided check-in, read-only explanation, clarifying prompt, or safe refusal; confirmation required for state changes; anonymous blocked under strict auth | Shared and 41-test Swift contract passed 2026-07-20; strict live backend returned anonymous 401 and authenticated review draft 200; all bounded native destinations and confirmation/rejection passed on physical iPhone |
| Training review | grounded live local AI and deterministic fallback for unsafe output | Passed in prior release gate |
| Observability privacy | every event family sanitized, capped, typed, and failure-isolated | Covered by `smoke-instrumentation.ts` |
| Apple Health CSV import | bounded readiness metrics imported, unsupported note columns dropped | Covered by `smoke-apple-health.ts` |
| Plan safety invariants | race/experience/low-mileage plans stay bounded and coherent | Covered by `smoke-plan-safety.ts` |
| Plan fixture data contract | human-readable PR fixtures convert explicitly to canonical integer seconds; generated paces stay plausible | Covered by `fixtureHelpers.ts`, `smoke-plan.ts`, `smoke-plan-adjuster.ts`, and `smoke-plan-refresh.ts` |
| Behavior prompt privacy | raw workout notes excluded before AI narration | Covered by backend deterministic gates |
| Final runbook review | hosted preflight, rollback, triage, and protected-artifact handling documented | Passed 2026-07-09 |
| Mobile phase scope | [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md) defines iOS MVP, privacy boundary, phases, and gates | Selected 2026-07-10 |
| Mobile Mac handoff | [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md) records the completed Phase 1 and Phase 2A macOS/Xcode physical-device proof | Completed 2026-07-17 |
| iOS HealthKit permissions | denied, partial, granted, and unavailable states handled; stale background delivery remains later hardening | Read-only grant and bounded partial/unavailable code paths passed; background delivery not yet implemented |
| iOS readiness sync | [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md) contract followed; bounded daily summaries only; no raw HealthKit samples in Firestore | Passed 2026-07-20 on physical iPhone with web readback; Apple Health Time Asleep 11h 7m matched native and web values |
| Mobile Today shared contract | [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md), `smoke-mobile-today-contract.ts`, and the shared JSON fixture validate request, response, privacy, cache, and failure semantics | Passed TypeScript, 21-test Swift package, and signed-device gates 2026-07-17 |
| Mobile calendar awareness | Today decisions consume existing calendar availability/freshness, preserve explicit zero-minute windows, use a labeled planned-duration fallback, and lower confidence on stale/missing calendar data | Passed 2026-07-20; physical QA zero-minute override produced a conflict/rest action, while a normal launch with no calendar source used `planned_workout_fallback`; Apple Calendar ingestion remains out of scope |
| Mobile Phase 2.5 scope | [MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md) defines the fixed shared contract, native safety boundary, and acceptance gates | Parts A/B, physical-device evidence, and final Windows integration rerun completed 2026-07-20 without vocabulary or scope changes; fast-forwarded into `main` |
| Mobile NLP intake | schedule/availability/travel/goal/preference notes create review-only drafts; recovery, pain, missed-workout, and reflection notes open bounded flows; strict-auth rejection when anonymous; deterministic confirm/apply; malformed/ambiguous fallback | Shared plus Swift route/network/confirmation gates passed 2026-07-20; physical iPhone exercised all bounded destinations, a confirmed availability change, and rejection of an ungrounded Sunday swap |
| Mobile perceived-recovery flow | NLP recovery notes open explicit perceived-recovery capture; captured fields coexist with HealthKit summaries; AI never fabricates readiness values from text | Passed 2026-07-21 on physical iPhone: explicit 2/5 recovery, 4/5 fatigue, and 3/5 soreness saved while web Recovery preserved/read sleep 7h51m, HRV 68.71, and resting HR 53; bounded `/qa/mobile` success readback |
| Mobile Phase 3 shared check-in contract | [MOBILE_CHECKIN_CONTRACT.md](./MOBILE_CHECKIN_CONTRACT.md), canonical fixture, deterministic recovery/workout application, failure taxonomy, existing-domain payloads, strict auth, privacy-safe audit, and owner-only rules | Parts A/B and physical proof passed: 47 Swift tests, simulator and signed iPhone build/install/launch, strict backend, Auth/Firestore emulator, frontend regressions, recovery, completed/skipped atomic writes, same-user training-review/memory/audit readback; see [MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md). The patched Next.js 16.2.11 dependency baseline, clean connected audit, and full GitHub-hosted Windows integration rerun passed 2026-07-23; fast-forwarded into `main` the same day |
| Behavior pattern result contract | every surfaced pattern has a bounded response; confirmed schedule patterns can update preferred-day inputs for deterministic plan generation; pain patterns route to caution only | Required before mobile beta |
| Mobile admin/eval observability | `/qa/mobile` shows mobile-originated sync, recommendation, intake, validation, and check-in events from the shared privacy-safe event log | Expanded 2026-07-20 with bounded intake route, draft kind, failure, parser, mutation, validation, and latency readback; instrumentation privacy and owner-only emulator gates pass |
| Mobile/web sync compatibility | web dashboard consumes mobile readiness without unsafe overwrite or confidence drift | Passed 2026-07-16 with physical-device write and same-user web Recovery readback |
| Mobile companion state matrix | `cd frontend && npm run smoke` | Default smoke covers readiness, health-sync freshness, calendar, profile, goal, saved plan, preferences, workout history, intake, and check-in decision states without browser dependencies |
| Mobile companion browser smoke | `cd frontend && npm run smoke:mobile-browser` against a running `/mobile-companion` server | Optional visual/e2e gate authored 2026-07-13 with stable test hooks; local execution requires Playwright package |
| Mobile delete/disconnect | synced summaries respect owner-only rules and deletion tombstones across devices | Passed 2026-07-17; routine sync cannot resurrect tombstones and confirmed native reconnect starts new bounded data/audit epochs without restoring deleted history |
| iOS package and app compile | `cd ios/KineticCompanion && swift test`; Xcode simulator/device build | 47 Swift tests, unsigned simulator build/install/launch on iPhone 17 / iOS 26.3, signed generic-device build, and signed physical iPhone 17 / iOS 26.5.2 build/install/launch passed through 2026-07-21 |

## Browser QA notes

Use disposable QA accounts. Do not commit browser profiles, screenshots, or
local proof artifacts. The protected patterns are `.edge-qa*` and
`tmp-onboarding-*.png`.

## Release interpretation

The demo is shippable and the Firebase persistence foundation is beta-ready.
Beta hardening is complete for a small controlled web beta. Apple Health CSV
import is an implemented web-beta bridge for readiness metrics.

As of 2026-07-20, Mobile Companion Phase 1 native HealthKit/Firebase proof,
Phase 2A shared/SwiftUI Native Today, and Phase 2.5 bounded intake
implementation plus signed-device evidence are complete. Mobile beta must
preserve calendar-aware decisions, bounded NLP intake, deterministic
confirm/apply, perceived-recovery routing, pattern-to-action behavior memory,
and shared QA/eval observability. Garmin, Oura, hosted AI, coach sharing,
broad notifications, and autonomous AI mutation remain out of scope.
