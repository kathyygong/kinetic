# Mobile Foundation And Plan Lifecycle Contract

Status: Windows Batch A contract, schema version 1, 2026-07-30.

This contract is the shared boundary for Mobile Phase 5 native foundation and
Mobile Phase 6 native plan ownership. It defines native inputs, shared
validation, owner-scoped persistence, deletion, migration, and privacy-safe
readback. It does not define SwiftUI layout, Apple permission prompts,
EventKit behavior, or a second native planner.

## Phase 5 Foundation

`mobile-foundation.v1` is implemented in
`frontend/lib/mobileFoundationContract.ts` and the canonical fixture is
`ios/KineticCompanion/Tests/Fixtures/mobile-foundation-contract.json`.

The state deliberately excludes identity secrets and free text. Firebase Auth
owns account identity, verification, recovery, session restoration, and
sign-out. Firestore stores only the owner-scoped product state:

- onboarding progress and the stable onboarding/product route;
- bounded Health, Calendar, and notification permission states;
- the opt-in, local-only evening reminder, off by default;
- proof-era `kinetic_companion_v1` migration status;
- training-data or account-deletion progress.

Denied, unavailable, or deferred permissions never block unrelated onboarding
steps. An enabled reminder requires notification authorization, retains the
generic lock-screen-copy decision, and is disabled as soon as account deletion
is requested.

### Persistence and deletion

The authenticated owner may read and write the allowlisted single-document
domains in `firestore.rules`. Phase 5 adds `settings` and `onboarding`; Phase 6
adds `plan_history` and `plan_operations`.

An account-deletion request must first persist the deletion boundary, disable
local reminders, cancel pending local notification requests, and prevent new
plan commits. The server/owner flow then tombstones or removes every domain in
`pending_domains` before Firebase Auth identity deletion. A training-data-only
deletion retains the minimum account/settings shell but clears training
domains. Failures remain retryable and must not report the account as deleted
while pending domains remain.

Migration from proof-era state is copy-then-validate:

1. Read the existing owner-scoped documents without changing project signing,
   Firebase configuration, or entitlements.
2. Map bounded values into `mobile-foundation.v1`.
3. Validate the complete new state and route.
4. Persist the new revision before marking migration complete.
5. Keep legacy state readable until the first successful Phase 5 restore.

## Phase 6 Plan Lifecycle

`mobile-plan-lifecycle.v1` is implemented in TypeScript and Pydantic, with one
canonical fixture consumed by both languages. The authenticated endpoint is:

`POST /mobile/plan-lifecycle`

Supported action names are `generate`, `save`, `move`, `shorten`, `replace`,
`skip`, `availability`, `preferred_day`, `regenerate_future`, `pause`, and
`resume`.

The native app builds an explicit proposal for review. The backend is the
deterministic validation authority. It returns one of `preview`,
`commit_ready`, `replayed`, `conflict`, or `rejected`; the endpoint itself
never writes Firestore (`mutation_performed` is always false).

Only `commit_ready` may be persisted. The client must use one owner-scoped
Firestore transaction across:

- `plan`: the new current snapshot;
- `plan_history`: the recoverable prior snapshot/version;
- `plan_operations`: operation ID, request fingerprint, and committed version.

The transaction must prove the authenticated owner, current version equality,
and operation-ID absence or matching content. A repeated matching operation is
a replay; reusing the operation ID for different content is a conflict.

The shared gate rejects stale versions, non-sequential versions, duplicate
workout IDs, invalid pause/resume transitions, edits to completed workouts,
and race-day changes. It reports bounded impact and advisory spacing/growth
warnings without emitting runner identity, notes, biometrics, pain, or medical
data.

Generation and future regeneration must still run through the existing
deterministic planner/validator inputs. The native UI may collect and preview
bounded changes, but neither UI code nor AI output can directly create a
persistable plan snapshot. Completed workout identity/content is immutable
across all future regeneration.

## Privacy-safe observability

The audit allowlist adds:

- `mobile_foundation_lifecycle`: bounded session/onboarding/settings/deletion
  outcome, account state, aggregate permission state, migration state, and
  latency;
- `mobile_plan_lifecycle`: bounded action/result, validation outcome, version
  delta, affected count, preserved-completed count, failure class, and latency.

No operation IDs, fingerprints, workout contents, dates, goal details, free
text, account identifiers, or health data enter audit events. `/qa/mobile`
supports local and owner-scoped Firebase readback for both event families.

## Required gates

From `frontend`:

```powershell
npm run lint
npx tsc --noEmit
npm run smoke
```

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals.mobile_plan_contract_smoke
.\.venv\Scripts\python.exe -m evals._smoke
```

With Firebase emulators:

```powershell
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

## Explicit non-goals

- No SwiftUI screen or temporary notification settings screen is created on
  Windows.
- No EventKit payload, permission, free/busy, or calendar contract is frozen.
- No push service, device token, remote scheduler, or sensitive telemetry is
  introduced.
- This contract does not rename the Xcode target or bundle identity; the Mac
  implementation performs and validates that migration.
