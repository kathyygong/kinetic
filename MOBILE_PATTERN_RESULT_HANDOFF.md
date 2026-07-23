# Mobile Phase 3.5 Behavior Pattern Result Handoff

Date: 2026-07-23

## Milestone

Mobile Phase 3.5 closes the Behavior Pattern Result Contract required before a
controlled mobile beta.

- Part A: Windows/shared contract, backend/frontend authority, fixture,
  telemetry, QA readback, and deterministic validation.
- Part B: optional native SwiftUI consumption and physical-device proof.

Part B must not change the `behavior-pattern-result.v1` vocabulary or create a
native-only mutation path.

## Part A implementation

Part A uses the existing authenticated, read-only `POST /behavior-insights`
endpoint. It adds:

- strict versioned backend and frontend response validation;
- deterministic result routing for all seven supported pattern families;
- deterministic model-output intersection and fallback behavior;
- explicit scoring-preference review;
- preferred-day review through the existing intake confirmation and plan
  regeneration authority;
- prompt-only stale-data/check-in routing;
- caution-only pain/discomfort routing;
- canonical cross-platform fixture coverage;
- strict-auth, timeout, unavailable-AI, malformed, invalid, and unsupported-AI
  gates;
- privacy-safe `mobile_pattern_result_lifecycle` telemetry;
- `/qa/mobile` and owner-only `mobile_audit` readback coverage.

No Swift or SwiftUI implementation is included in Part A.

## Windows validation

Run from the repository root unless a command changes directory:

```powershell
git status --short --branch
git diff --check
cd backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke
cd ..\frontend
npm ci
npm run lint
npx tsc --noEmit
npm run smoke
npm run build
npm run beta:readiness
cd ..
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

The managed Windows package proxy may still return `E404` for the pinned
Next.js `16.2.11` tarball. When that happens, do not downgrade or change the
lockfile. The checked-in GitHub-hosted Windows workflow is the authoritative
clean-install, audit, frontend, backend, and Firestore gate.

## Part B native scope

Only start Part B if native behavior-memory results are desired before the
controlled beta.

Part B should:

1. Start from clean synchronized `main`.
2. Read this handoff, [MOBILE_PATTERN_RESULT_CONTRACT.md](./MOBILE_PATTERN_RESULT_CONTRACT.md),
   the canonical fixture, [MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md),
   [ARCHITECTURE.md](./ARCHITECTURE.md), and [QA_MATRIX.md](./QA_MATRIX.md).
3. Add Swift `Codable` models and strict validation for the existing fixture.
4. Consume the authenticated read-only endpoint; parsing/rendering must not
   write.
5. Render the same noticed/why/change/never-change fields and result routes.
6. Keep scoring confirmation capped and owner-scoped.
7. Keep preferred-day results review-only unless the native code can reuse an
   equivalent deterministic plan validator without broadening into full plan
   editing. Otherwise route the runner to the existing web review surface.
8. Route stale/check-in results to existing sync/check-in UI.
9. Route pain/discomfort only to the existing fixed caution flow.
10. Add privacy-safe native audit events using the existing
    `mobile_audit` document.
11. Run Swift tests, simulator build/launch, signed generic-device build, and
    focused physical-iPhone interaction/readback.
12. Return to Windows for the final shared integration workflow before
    merging.

Do not add notifications, new Firestore domains, autonomous mutation, raw
notes, health values, medical fields, or full native plan editing.

## Simple continuation prompt

After Part A is merged, the copy-ready Mac prompt is:

> Continue Kinetic Mobile Phase 3.5 Part B.

That shorthand is authoritative only while this handoff remains the current
Phase 3.5 source of truth.
