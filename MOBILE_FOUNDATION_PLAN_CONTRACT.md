# Mobile Foundation And Plan Lifecycle Contract

Status: Windows Batch B is green at `d5bbfdc`, shared blocker resolution is
pushed at `46fcbba`, Mac v2 consumption is pushed at `92bad76`, and authenticated
Mac implementation is committed at `b91269b`. The Mac pass proves authenticated
v2 generation/lifecycle, the five-domain transaction and exact replay,
relaunch/offline/rejection behavior, privacy-safe audit/cross-user denial, and
retryable deletion boundaries. Swift tests, signed simulator execution,
accessibility XXXL/contrast/landscape, and a signed generic-device build pass.
Mandatory final Windows integration remains open. Physical install/hands-on
VoiceOver and Admin-backed final cleanup remain external because the paired
iPhone and Admin credential were unavailable; neither may be silently treated
as passed.

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

`mobile-account-cleanup.v1` resolves the client-only finalization gap through
authenticated `POST /mobile/account-cleanup`. Its server-only receipt lives at
`mobile_account_cleanup/{uid}`, outside the owner-domain sweep and outside
client Firestore rules. `cleanup` creates or resumes the receipt and removes all
18 documented owner domains without deleting the receipt. `finalize_auth`
requires an empty pending list and a Firebase token with `auth_time` no more
than five minutes old, records `deletion_started`, deletes the Auth identity,
and retains a durable completed receipt. Matching operation IDs replay;
different fingerprints conflict; partial domain failures remain pending.

Migration from proof-era state is copy-then-validate:

1. Read the existing owner-scoped documents without changing project signing,
   Firebase configuration, or entitlements.
2. Map bounded values into `mobile-foundation.v1`.
3. Validate the complete new state and route.
4. Persist the new revision before marking migration complete.
5. Keep legacy state readable until the first successful Phase 5 restore.

## Phase 6 Shared Generation

`mobile-plan-generation.v1` is the required authenticated FastAPI boundary for
initial generation and future regeneration. Windows Batch B owns its Pydantic
models, canonical fixture, deterministic implementation, strict-auth/privacy
gates, web-runtime migration, and chained proof that every returned candidate
is accepted or safely rejected by the independent lifecycle validator.

The authenticated endpoint is `POST /mobile/plan-generation`.

The request contains only bounded planning inputs: an explicit planning date,
race distance, target date, experience, weekly mileage, preferred days,
personal-best seconds, goal revision, an explicit generation mode, and the
current plan when regenerating. The planning date removes clock-dependent
generation behavior and is not identity or health data.
`mobile-plan-generation.v2` adds `weekly_availability`: zero to seven unique
weekday entries containing only `day`, `available_minutes`, and `easy_only`.
Omitted weekdays are unconstrained, zero minutes skips that weekday, positive
values are 15–240 minutes, and an empty list clears recurring constraints.
Generation schedules only usable weekdays, caps duration, and converts an
easy-only slot to an easy workout. No event text or Calendar identity crosses
the boundary. Version 1 remains accepted for existing clients.
The response is storage-neutral and returns a candidate plan plus bounded
explanation/version metadata. It also returns authoritative week-phase metadata
(`build`, `recovery`, `taper`, or `race`) so web and Swift do not independently
derive training phases or taper length. It never writes Firestore.

Initial and future plan generation must call this shared service. Production
web code and Swift must not independently calculate training weeks, mileage,
paces, taper, workout dates, or regenerated futures. The former Swift
`MobilePlanProposalBuilder.generate()` checkpoint was removed in the 2026-08-10
Mac Batch B implementation checkpoint.

Version 2 stores `metadata` inside `MobilePlanSnapshotV2`; `plan_version` must
equal the snapshot version and metadata must cover every workout exactly once.
The shared lifecycle authority recomputes week phase/explanation metadata for
every accepted edit before returning the commit package. Legacy workout-only
plans remain readable and gain v2 metadata on their next shared regeneration.

## Phase 6 Plan Lifecycle

`mobile-plan-lifecycle.v1` is implemented in TypeScript and Pydantic, with one
canonical fixture consumed by both languages. The authenticated endpoint is:

`POST /mobile/plan-lifecycle`

Supported action names are `generate`, `save`, `move`, `shorten`, `replace`,
`skip`, `availability`, `preferred_day`, `regenerate_future`, `pause`, and
`resume`. The lifecycle `generate` action validates an initial candidate; it
does not construct that candidate.

The native app builds an explicit proposal for review. The backend is the
deterministic validation authority. It returns one of `preview`,
`commit_ready`, `replayed`, `conflict`, or `rejected`; the endpoint itself
never writes Firestore (`mutation_performed` is always false).

Only `commit_ready` may be persisted. The client must use one owner-scoped
Firestore transaction across:

- `plan`: the new current snapshot;
- `plan_history`: the recoverable prior snapshot/version;
- `plan_operations`: operation ID, request fingerprint, and committed version.

For `mobile-plan-lifecycle.v2`, the same package also includes versioned
`commit_planning_inputs` and requires the transaction to update `profile` and
`goal`. `planning_revision_matches` joins the existing version/idempotency
preconditions so Settings cannot expose new inputs with an old plan or the
reverse. The web adapter is
`frontend/lib/persistence/mobilePlanV2Transaction.ts`.

The transaction must prove the authenticated owner, current version equality,
and operation-ID absence or matching content. A repeated matching operation is
a replay; reusing the operation ID for different content is a conflict.

The shared gate rejects stale versions, non-sequential versions, duplicate
workout IDs, invalid pause/resume transitions, edits to completed workouts,
and race-day changes. Windows Batch B must also make every action delta
explicit:

- `move`, `availability`, and `preferred_day` may change only the permitted
  target date and matching reason metadata;
- `shorten` may only reduce the target workout's duration/load inside shared
  safety bounds;
- `replace` may only change the target workout through a bounded replacement
  validated against plan load and spacing;
- `regenerate_future` may change only eligible future workouts returned by the
  shared generator and may never rewrite completed history or race identity;
- `pause`, `resume`, and `save` may change status only.

Every `commit_ready` candidate must rerun the complete mileage progression,
weekly load, taper, hard-spacing, race-day, availability, and completed-history
invariants. Advisory warnings may explain a safe accepted result; they may not
stand in for enforcement of a safety invariant. The regression suite must
include the rejected 29-mile/300-minute `availability` mutation discovered in
the 2026-08-06 review plus unrelated-field and multi-workout bypass attempts.
Responses remain bounded and exclude runner identity, notes, biometrics, pain,
or medical data.

The native UI may collect and preview bounded edits, but neither UI code nor AI
output can become the generation authority or directly create a persistable
snapshot. The required flow is shared generation, lifecycle preview, explicit
confirmation, lifecycle commit packaging, then one owner-scoped Firestore
transaction. Completed workout identity/content is immutable across all future
regeneration.

The current storage-neutral design protects normal product flows from UI/AI
bypass but does not make Firestore rules a plan-invariant enforcement engine:
an authenticated owner can write an allowlisted owner-scoped domain directly.
Before external beta, the Windows/shared lane must record an explicit threat
model decision: either move validated plan commit into an authenticated
server-side transaction, or accept and document that invariant authority is a
trusted-client guarantee rather than protection against a tampered client. The
Mac client follows that decision; it does not define a separate policy.

## Closeout ownership

- **Windows/shared Batch B:** FastAPI generation, authoritative phase metadata,
  lifecycle delta/full-plan enforcement, canonical fixtures, adversarial
  regressions, production-web migration, workflow/branch routing, Firebase
  emulators, and hosted Windows plus macOS workflow definitions.
- **Mac/native Batch B:** shared-generation client, removal of native generation
  and phase/taper heuristics, bounded edit UI, complete onboarding/profile/data
  export and account deletion, Swift parity tests, simulator/physical-device
  behavior, accessibility, signing, and live readback.
- **Final Windows integration:** reconcile both lanes, rerun shared/emulator/
  dependency gates, require green hosted Windows and macOS jobs, and record the
  exact evidence before Phases 5–6 close.

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
.\.venv\Scripts\python.exe -m evals.mobile_plan_generation_contract_smoke
.\.venv\Scripts\python.exe -m evals.mobile_plan_contract_smoke
.\.venv\Scripts\python.exe -m evals.mobile_phase5_6_shared_contract_smoke
.\.venv\Scripts\python.exe -m evals._smoke
```

The generation/lifecycle smoke must include action-delta adversarial cases and
generator-to-lifecycle chaining, not only one valid example per action.

With Firebase emulators:

```powershell
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

From hosted macOS CI after the Windows workflow definition is pushed:

```bash
cd ios/KineticCompanion
swift test
xcodebuild -project KineticCompanion.xcodeproj -scheme Kinetic -sdk iphonesimulator build
```

## Explicit non-goals

- No SwiftUI screen or temporary notification settings screen is created on
  Windows.
- No EventKit payload, permission, free/busy, or calendar contract is frozen.
- No push service, device token, remote scheduler, or sensitive telemetry is
  introduced.
- This contract does not rename the Xcode target or bundle identity; the Mac
  implementation performs and validates that migration.
