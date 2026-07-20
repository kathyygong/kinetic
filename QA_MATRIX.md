# Kinetic QA Matrix

This matrix captures the current release proof and the checks required before
the next beta checkpoint.

| Area | Required check | Current status |
| --- | --- | --- |
| Frontend lint | `cd frontend && npm run lint` | Passed 2026-07-20 on the hardened `codex/mobile-intake-contract` dependency baseline |
| Frontend production build | `cd frontend && npm run build` | Passed 2026-07-20 with Next.js 16.2.10 and the scoped patched PostCSS resolution |
| Frontend deterministic smoke | `cd frontend && npm run smoke` | Passed 2026-07-20 after dependency hardening; mobile readiness/Today/intake contracts, every intake route/failure class, deterministic confirmation, and canonical plan/calendar paths asserted |
| Frontend beta posture | `cd frontend && npm run beta:readiness` | Passed 2026-07-20; default audit skip warning expected |
| Frontend advisory audit | `cd frontend && npm run beta:audit` | Passed 2026-07-20 after remediation; no moderate/high/critical findings |
| Dependency pin review | direct frontend/backend dependencies exact-pinned | Passed 2026-07-20; Next.js and its ESLint config are pinned at 16.2.10 and the Next-only PostCSS resolution is pinned at 8.5.14 |
| Backend compile | `cd backend && python -m compileall app evals` | Passed 2026-07-20 on integrated `main` |
| Backend deterministic gates | `cd backend && python -m evals._gates` | Passed 2026-07-20, including project-scoped token claims, all mobile intake routes, strict context, strict-auth rejection, and AI failure fallback |
| Backend smoke | `cd backend && python -m evals._smoke` | Passed 2026-07-20 with the expanded mobile intake gates |
| Firebase rules | `npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"` | Passed 2026-07-20 after Firebase transitive remediation; owner-only mobile readiness/health-sync/audit access, bounded intake lifecycle readback, cross-user denial, and tombstones asserted |
| Strict backend auth | signed-in token accepted and anonymous protected requests rejected | Passed 2026-07-17; physical iPhone bearer token accepted over USB private link and anonymous request rejected |
| Signed-in responsive UI | desktop and mobile browser QA | Passed in prior release gate; rerun after layout changes |
| Live Firebase hydration | same signed-in account hydrates across independent sessions | Passed 2026-07-09 |
| Live account isolation | Account B cannot hydrate Account A local or remote data | Passed 2026-07-09 |
| Live deletion tombstones | signed-in delete remains deleted after reload and second-origin sign-in | Passed 2026-07-09 |
| Natural-language intake | supported notes route to a reviewable draft, guided check-in, read-only explanation, clarifying prompt, or safe refusal; confirmation required for state changes; anonymous blocked under strict auth | Shared and 32-test Swift contract passed 2026-07-20; strict live backend returned anonymous 401 and authenticated review draft 200; native physical-device interaction remains |
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
| iOS readiness sync | [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md) contract followed; bounded daily summaries only; no raw HealthKit samples in Firestore | Passed 2026-07-16 on physical iPhone with web readback |
| Mobile Today shared contract | [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md), `smoke-mobile-today-contract.ts`, and the shared JSON fixture validate request, response, privacy, cache, and failure semantics | Passed TypeScript, 21-test Swift package, and signed-device gates 2026-07-17 |
| Mobile calendar awareness | Today decisions consume existing calendar availability/freshness, preserve explicit zero-minute windows, use a labeled planned-duration fallback, and lower confidence on stale/missing calendar data | Passed 2026-07-17; physical zero-minute input produced live calendar conflict and rest action |
| Mobile Phase 2.5 scope | [MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md) defines the fixed shared contract, native safety boundary, and acceptance gates | Parts A/B implementation complete 2026-07-20 without vocabulary/scope changes; physical-device intake/readback evidence remains |
| Mobile NLP intake | schedule/availability/travel/goal/preference notes create review-only drafts; recovery, pain, missed-workout, and reflection notes open bounded flows; strict-auth rejection when anonymous; deterministic confirm/apply; malformed/ambiguous fallback | Shared plus Swift route/network/confirmation gates passed 2026-07-20; unsigned simulator and signed generic-device builds pass; physical route interaction remains |
| Mobile perceived-recovery flow | NLP recovery notes open explicit perceived-recovery capture; captured fields coexist with HealthKit summaries; AI never fabricates readiness values from text | Native destination renders `inferred_values=false`; Phase 3 capture/persistence remains intentionally deferred |
| Behavior pattern result contract | every surfaced pattern has a bounded response; confirmed schedule patterns can update preferred-day inputs for deterministic plan generation; pain patterns route to caution only | Required before mobile beta |
| Mobile admin/eval observability | `/qa/mobile` shows mobile-originated sync, recommendation, intake, validation, and check-in events from the shared privacy-safe event log | Expanded 2026-07-20 with bounded intake route, draft kind, failure, parser, mutation, validation, and latency readback; instrumentation privacy and owner-only emulator gates pass |
| Mobile/web sync compatibility | web dashboard consumes mobile readiness without unsafe overwrite or confidence drift | Passed 2026-07-16 with physical-device write and same-user web Recovery readback |
| Mobile companion state matrix | `cd frontend && npm run smoke` | Default smoke covers readiness, health-sync freshness, calendar, profile, goal, saved plan, preferences, workout history, intake, and check-in decision states without browser dependencies |
| Mobile companion browser smoke | `cd frontend && npm run smoke:mobile-browser` against a running `/mobile-companion` server | Optional visual/e2e gate authored 2026-07-13 with stable test hooks; local execution requires Playwright package |
| Mobile delete/disconnect | synced summaries respect owner-only rules and deletion tombstones across devices | Passed 2026-07-17; routine sync cannot resurrect tombstones and confirmed native reconnect starts new bounded data/audit epochs without restoring deleted history |
| iOS package and app compile | `cd ios/KineticCompanion && swift test`; Xcode simulator/device build | 32 Swift tests, unsigned simulator build/launch, and signed generic-device build passed 2026-07-20; connected iPhone unavailable for install |

## Browser QA notes

Use disposable QA accounts. Do not commit browser profiles, screenshots, or
local proof artifacts. The protected patterns are `.edge-qa*` and
`tmp-onboarding-*.png`.

## Release interpretation

The demo is shippable and the Firebase persistence foundation is beta-ready.
Beta hardening is complete for a small controlled web beta. Apple Health CSV
import is an implemented web-beta bridge for readiness metrics.

As of 2026-07-17, Mobile Companion Phase 1 native HealthKit/Firebase proof and
the Phase 2A shared/SwiftUI Native Today implementation and signed-device
handoff are complete. Mobile beta must
preserve calendar-aware decisions, bounded NLP intake, deterministic
confirm/apply, perceived-recovery routing, pattern-to-action behavior memory,
and shared QA/eval observability. Garmin, Oura, hosted AI, coach sharing,
broad notifications, and autonomous AI mutation remain out of scope.
