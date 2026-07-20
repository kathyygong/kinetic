# Mobile Today Contract

Status: Windows contract complete on 2026-07-16. Native Swift models,
authenticated networking, Firestore reads, same-day cache/failure handling,
SwiftUI Today, and owner-only audit readback were implemented and validated on
macOS on 2026-07-17. Signed physical-device interaction, authenticated live
decision, zero-minute calendar conflict, same-day cache fallback, and
`/qa/mobile` readback passed on an iPhone 17 / iOS 26.5.2 the same day.

This contract defines how the authenticated iOS Today surface derives a
deterministic recommendation from the same Kinetic state and backend endpoint
used by web. The TypeScript source of truth is
`frontend/lib/mobileTodayContract.ts`. The canonical cross-platform fixture is
`ios/KineticCompanion/Tests/Fixtures/mobile-today-contract.json`.

## Authority and boundaries

- Firebase Auth supplies the ID token. Identity fields do not appear in the
  decision payload, cache, or telemetry.
- Firestore/local cache supplies profile presence, goal, saved plan,
  readiness, HealthKit sync metadata, workout history, and confirmed
  preferences.
- The existing authenticated `POST /decision` endpoint remains the only
  decision authority.
- AI explanation is optional and downstream. Malformed or unavailable AI copy
  is discarded without invalidating a deterministic result.
- Raw HealthKit samples, calendar event text, notes, tokens, email, UID, and
  full name are forbidden at the mobile Today boundary.

## Request construction

Schema: `mobile-today.v1`.

The client builds the existing decision shape:

- `biometrics`: latest complete bounded readiness entry plus a rolling HRV
  baseline. With only one HRV reading, current HRV is reused as a neutral
  baseline rather than inventing a trend.
- `training_context.planned_workout`: derived from the accepted saved plan for
  the current local day.
- `training_context.recent_workouts`: at most five controlled workout labels
  derived from completed plan slots. Free-text workout notes are excluded.
- `constraints.available_minutes`: fresh bounded calendar availability when
  known; otherwise the planned workout duration as an explicit safe fallback.
- `constraints.calendar_authoritative`: always `true` for Native Today. This
  prevents the backend from replacing a real zero-minute window or fallback
  with server-calendar data or a generic default.
- `data_freshness`: recovery and calendar ages in hours. Missing calendar age
  remains `null` and lowers backend confidence.
- `bias_toward_original`: existing bounded behavior-history signal.
- `learned_preferences`: confirmed preferences only, capped at 20. Free-text
  descriptions are omitted because scoring uses bounded type/confidence fields.

Request construction stops safely with:

| Missing state | Failure | Safe action |
| --- | --- | --- |
| Goal | `missing_goal` | Complete setup |
| Saved plan | `missing_plan` | Complete setup |
| Complete readiness metrics | `missing_readiness` | Log readiness |

Missing or stale calendar data does not block the request. It uses the planned
workout duration, records `planned_workout_fallback`, preserves the real
freshness state, and never invents event availability.

## Response and presentation snapshot

The backend may return the wrapped current response or the legacy bare
decision. The validator requires:

- selected action in `proceed`, `modify`, or `rest`;
- recovery score and confidence in `[0, 1]`;
- available minutes in `[0, 240]`;
- bounded candidate modifiers, factors, alternatives, scores, trace, and
  staleness warnings.

Native Today stores and renders a privacy-minimized snapshot containing:

- state, recovery score, selected action, final workout, confidence, and
  available minutes;
- bounded key factors and staleness warnings;
- cached AI reasoning when valid, otherwise deterministic explanation copy;
- source-state metadata only, never raw readiness values or identity.

The full decision trace, alternatives, and score map may be used for live
validation but are not retained in the mobile cache.

## Cache behavior

Schema: `mobile-today-cache.v1`.

- Cache is fresh for 6 hours.
- Cache is visibly stale after 6 hours.
- Cache is unusable after 24 hours or when its local-day key differs from
  today.
- A valid live result always wins.
- Offline/backend/timeout failure may show a labeled fresh or stale same-day
  cache.
- Missing or expired cache degrades to a safe fallback surface; it never
  reuses yesterday's recommendation.

## Failure contract

| Failure | Code | Cache allowed |
| --- | --- | --- |
| Firebase token rejected/missing | `auth_required` | Yes, same day |
| Network unavailable | `offline` | Yes, same day |
| Client/server deadline | `timeout` | Yes, same day |
| Backend 5xx | `backend_unavailable` | Yes, same day |
| Malformed/non-contract response | `invalid_response` | Yes, same day |
| Goal/plan/readiness unavailable | `missing_context` | No live request |
| Unclassified error | `unknown` | Yes, same day |

## Observability contract

`mobile_decision_validated` records only bounded fields:

- `decision_source`: `live`, `cache`, or `fallback`;
- `failure_state`: stable failure code or `none`;
- `cache_state`: `fresh`, `stale`, `expired`, or `missing`;
- `availability_source`: `calendar`, `planned_workout_fallback`, or `missing`;
- selected-action, confidence, calendar/readiness, deterministic-validation,
  warning-presence, AI-assisted, and latency buckets already used by mobile QA.

The local `/qa/mobile` surface inspects these properties from the capped
owner-only native audit transport.

## Validation

Windows/shared gates:

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run smoke
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke
```

The mobile Today smoke verifies the canonical fixture, missing-context stops,
calendar fallback, a real zero-minute window, response rejection, optional-AI
fallback, privacy rejection, cache aging, live/cache/fallback priority, and
stable HTTP failure mapping.

## Completed macOS proof

The former seven-step macOS handoff is complete. Implementation result,
2026-07-17:

- Steps 1 through 7 pass native fixture/package, Xcode simulator/device,
  authenticated backend, and frontend readback gates.
- The signed-out surface launched on an iPhone 17 / iOS 26.3 simulator.
- Calendar conflict, zero-minute availability, offline same-day cache,
  timeout/invalid response, and prior-day expiry are covered by deterministic
  Swift tests.
- A signed iPhone 17 / iOS 26.5.2 build installed and launched. Firebase Auth
  supplied the bearer token over the USB private link, strict `POST /decision`
  returned `200`, and `/qa/mobile` read back a privacy-safe live success.
- A device-only zero-minute calendar input produced
  `availability_source=calendar`, `calendar_state=conflict`, and `rest`.
  A separate timeout used the fresh same-day cache; prior-day expiry remains a
  deterministic clock-controlled Swift gate because device time was not
  changed.

The completed Phase 2A work was integrated into `main` on 2026-07-20. New
mobile work should follow [MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md)
for the Windows-first Phase 2.5 contract; this document remains the stable
Today boundary.
