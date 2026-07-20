# Kinetic Mobile Phase 2.5 Intake Handoff

Status: active starting milestone as of 2026-07-20.

Phase 1 HealthKit/Firebase sync and Phase 2A Native Today are complete,
device-validated, integrated into `main`, and pushed to `origin/main`. This
handoff scopes the next milestone: bounded mobile natural-language intake and
deterministic validation.

## Outcome

From Native Today, a signed-in runner can enter a short note about what
changed. Kinetic routes the note into a concrete bounded product flow. AI may
parse or classify the note, but it cannot mutate the plan, invent recovery or
medical values, or bypass deterministic validation.

Supported outcomes:

- Schedule, availability, travel, workout-swap, goal, and preferred-day notes
  produce a typed review-only draft.
- Recovery/readiness notes route to explicit perceived-recovery capture.
- Pain or injury language routes to a conservative caution flow.
- Missed-workout notes route to skipped/reschedule/rebalance choices.
- Post-workout reflection routes to completion and effort capture.
- Explanation questions route to a read-only deterministic explanation.
- Ambiguous input produces a clarification prompt.
- Unsupported or unsafe input stops with a bounded refusal or routing message.

## Work Order

### Part A — Windows/shared contract

Complete this part on Windows before changing native Swift code:

1. Inspect the existing web `POST /ai/parse-intake` request, response,
   validation, timeout, fallback, confirm/apply, and observability paths.
2. Define a versioned mobile intake routing contract that reuses the web
   endpoint where safe and introduces no parallel mutation authority.
3. Define strict typed outcomes for draft review, perceived recovery, caution,
   missed workout, reflection, explanation, clarification, and refusal.
4. Define bounded request context. Exclude raw HealthKit samples, tokens,
   identity, calendar/workout text not required by the parser, and unrelated
   history.
5. Define deterministic confirmation/apply behavior for mutable drafts.
   Routing or parsing alone must never write plan state.
6. Define stable auth, timeout, unavailable-AI, malformed-response, ambiguous,
   and unsupported failure behavior.
7. Define privacy-safe `mobile_intake_lifecycle` audit fields. Never store the
   raw note, generated prose, biometrics, email, UID, or token.
8. Add a canonical cross-platform fixture and deterministic frontend/backend
   tests for every route and failure class.
9. Extend `/qa/mobile` readback for the bounded intake lifecycle without
   exposing source text.
10. Update the roadmap, QA matrix, architecture, runbook, and this handoff with
    the completed shared-contract evidence.

### Part B — macOS/native implementation

Return to Mac only after Part A is committed and pushed:

1. Pull the stable shared-contract commit.
2. Add Swift Codable routing, draft, validation, and failure models that
   consume the canonical fixture.
3. Add the short “Tell Kinetic what changed” entry point from Native Today.
4. Render the bounded destination for each supported route.
5. Require explicit review and deterministic confirm/apply for mutable drafts.
6. Add authenticated requests, timeout/fallback handling, and privacy-safe
   native audit transport.
7. Run Swift tests, simulator tests, signed-device build/install/launch,
   strict-auth rejection/acceptance, malformed/timeout behavior, route
   coverage, deterministic mutation proof, and `/qa/mobile` readback.
8. Record dated evidence here before merging back to `main`.

## Stop Lines

- Do not start SwiftUI implementation before the shared contract and fixture
  pass on Windows.
- Do not build a general chat interface.
- Do not add autonomous AI plan mutation.
- Do not infer readiness, pain severity, diagnosis, injury, biometrics, or
  completion from free text.
- Do not persist raw notes or generated prose in mobile audit data.
- Do not broaden this phase into push notifications, Apple Calendar ingestion,
  full native plan editing, onboarding replacement, Garmin/Oura, coach
  sharing, or hosted-AI changes.
- Do not implement the full Phase 3 check-in persistence loop here. Phase 2.5
  must define and safely route to its bounded destinations; deeper check-in
  behavior follows after the routing contract is stable.

## Acceptance Gates

- Every supported note reaches one concrete bounded outcome.
- Mutable drafts are review-only until explicit confirmation and deterministic
  validation both pass.
- Anonymous calls fail under strict auth.
- Ambiguous, malformed, unsafe, or ungrounded input cannot mutate state.
- AI timeout or unavailability falls back or stops safely.
- Recovery and pain language never becomes a hidden biometric or medical
  value.
- Web and native use the same canonical fixture and outcome vocabulary.
- Owner-only Firestore rules continue to pass after any audit schema change.
- `/qa/mobile` shows only privacy-safe route/lifecycle outcomes.
- Existing frontend, backend, Firebase, and mobile Today gates remain green.

## Required Windows Validation

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run smoke
npm run build
npm run beta:readiness

cd ..\backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke

cd ..
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

`npm run beta:readiness` may report the expected warning that the connected
advisory audit was skipped. Run `npm run beta:audit` when network access is
available or dependencies change.

## Starting State

- Branch: `main`
- Integrated Phase 2A commit: `7139dcd`
- Working tree should be clean after this documentation checkpoint.
- Source-of-truth roadmap:
  [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md)
- Completed native proof:
  [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md)
- Stable Today contract:
  [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md)
