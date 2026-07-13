# Kinetic Mobile Readiness Schema

## Purpose

This contract defines how the iOS companion syncs HealthKit-derived readiness
without weakening Kinetic's existing safety, privacy, and persistence model.

The first mobile spike has two write targets:

- `users/{uid}/kinetic/readiness`: bounded daily readiness metrics that the
  existing web app can already hydrate and use in deterministic decisions.
- `users/{uid}/kinetic/health_sync`: mobile-only sync and permission metadata
  used for freshness, debugging, disconnect, and beta QA.

Raw HealthKit samples are never written to Firestore.

## Existing Readiness Domain

Path:

```text
users/{uid}/kinetic/readiness
```

Envelope:

```json
{
  "schemaVersion": 1,
  "deleted": false,
  "clientUpdatedAt": "2026-07-10T12:00:00.000Z",
  "payload": {
    "entries": {
      "2026-07-10": {
        "date": "2026-07-10",
        "sleep_hours": 7.42,
        "hrv": 54.3,
        "resting_hr": 49,
        "source": "healthkit",
        "updated_at": "2026-07-10T12:00:00.000Z"
      }
    }
  }
}
```

Allowed readiness entry fields:

| Field | Type | Bounds | Notes |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` string | required | Local user day, not UTC day. |
| `sleep_hours` | number | `0..24` | Daily sleep duration summary. |
| `hrv` | number | `1..300` | Daily HRV summary in ms. |
| `resting_hr` | number | `20..220` | Daily resting heart rate in bpm. |
| `fatigue_level` | integer | `1..5` | Manual/self-report only. |
| `soreness_level` | integer | `1..5` | Manual/self-report only. |
| `source` | enum | see below | Advisory provenance for conflict handling. |
| `updated_at` | ISO timestamp | required | Time this daily entry was last changed. |

Allowed `source` values:

- `manual`
- `apple_health_csv`
- `healthkit`
- `demo`
- `mixed`

Only bounded summaries belong in this domain. Do not add raw sample arrays,
timestamps for every source sample, workout notes, calendar text, device
identifiers, email, UID, or tokens.

## Health Sync Domain

Path:

```text
users/{uid}/kinetic/health_sync
```

Envelope:

```json
{
  "schemaVersion": 1,
  "deleted": false,
  "clientUpdatedAt": "2026-07-10T12:00:00.000Z",
  "payload": {
    "provider": "apple_health",
    "schema": "health-sync.v1",
    "permission_state": "partial",
    "metric_permissions": {
      "sleep": "granted",
      "hrv": "granted",
      "resting_hr": "denied"
    },
    "last_attempted_sync_at": "2026-07-10T12:00:00.000Z",
    "last_successful_sync_at": "2026-07-10T12:00:00.000Z",
    "latest_readiness_date": "2026-07-10",
    "background_delivery": "enabled",
    "daily_status": {
      "2026-07-10": {
        "status": "synced",
        "confidence": "moderate",
        "coverage": {
          "sleep": "complete",
          "hrv": "complete",
          "resting_hr": "missing"
        },
        "conflict": "none"
      }
    },
    "last_error_code": null
  }
}
```

Allowed metadata fields:

| Field | Type | Notes |
| --- | --- | --- |
| `provider` | `"apple_health"` | Future providers should use separate explicit values. |
| `schema` | `"health-sync.v1"` | Payload contract marker. |
| `permission_state` | enum | `not_determined`, `denied`, `partial`, `granted`. |
| `metric_permissions` | object | Per-metric permission state, no raw values. |
| `last_attempted_sync_at` | ISO timestamp | Last mobile sync attempt. |
| `last_successful_sync_at` | ISO timestamp or null | Last sync that wrote a bounded readiness summary. |
| `latest_readiness_date` | date or null | Latest local-day key synced. |
| `background_delivery` | enum | `unknown`, `enabled`, `disabled`, `stale`. |
| `daily_status` | date-keyed object | Per-day coverage, confidence, conflict, and status. |
| `last_error_code` | enum or null | Coarse code only, no exception text with user data. |

Allowed `daily_status[date].status` values:

- `synced`
- `partial`
- `skipped_existing_user_entry`
- `failed`
- `deleted`

Allowed `coverage` values per metric:

- `complete`
- `partial`
- `missing`
- `not_permitted`

Allowed `confidence` values:

- `low`
- `moderate`
- `high`

Allowed `conflict` values:

- `none`
- `manual_wins`
- `csv_wins`
- `healthkit_update`
- `stale_healthkit`

## Local Summarization Rules

The iOS companion must summarize on device before writing Firestore:

- Sleep: total sleep duration for the local day, rounded to two decimals.
- HRV: bounded daily summary in milliseconds, rounded to two decimals.
- Resting HR: bounded daily summary in bpm, rounded to the nearest sensible
  value from HealthKit's statistics.
- Fatigue and soreness: never inferred from HealthKit. These remain manual
  self-reports.

If a metric is missing, not permitted, or too sparse, omit that metric from the
readiness entry and mark the coverage state in `health_sync`.

## Conflict Rules

The iOS writer must use a transaction or read-before-write merge. It must not
blindly replace the full `readiness` payload.

For each local day:

1. If no readiness entry exists, write the bounded HealthKit summary with
   `source: "healthkit"`.
2. If the existing entry has `source: "healthkit"` and the new summary is
   fresher, merge the HealthKit-owned metric fields.
3. If the existing entry has `source: "manual"`, do not overwrite it. Record
   `manual_wins` in `health_sync`.
4. If the existing entry has `source: "apple_health_csv"`, do not overwrite it
   during the spike. Record `csv_wins` in `health_sync`.
5. If the existing entry has no source, treat it as user-authored and do not
   overwrite it. Record `manual_wins` until the web app stamps source metadata
   everywhere.
6. If HealthKit supplies only some metrics for a day, merge only HealthKit-owned
   fields and mark partial coverage.

Manual web edits remain the highest-priority freshness source because they are
explicit user intent. HealthKit improves default coverage; it does not erase a
runner's correction.

## Delete And Disconnect

Deleting Kinetic training data must write tombstones for both `readiness` and
`health_sync`.

Disconnecting Apple Health on iOS must:

- stop future HealthKit queries/background delivery registration;
- write `health_sync.deleted=true` or a disconnected payload;
- leave existing readiness summaries in place only if the user chooses to keep
  historical training data;
- delete synced readiness summaries if the user chooses full training-data
  deletion.

## Privacy Checks

Before mobile beta, verify:

- Firestore contains no HealthKit sample arrays.
- Firestore contains no per-sample timestamps.
- Firestore contains no raw workout notes, calendar text, device identifier,
  email, UID in payload, token, or secret.
- Product telemetry does not log sleep, HRV, resting HR, fatigue, soreness, or
  HealthKit permission details beyond coarse event outcomes.

## Mobile Observability Contract

Mobile should use the existing privacy-conscious product event log rather than
a separate telemetry path. Web admin/QA/eval surfaces can then inspect
mobile-originated behavior by event name and `platform: "ios"`.

Allowed mobile event families:

| Event | Purpose | Sensitive data boundary |
| --- | --- | --- |
| `mobile_companion_sync_completed` | HealthKit/calendar/readback sync outcome, freshness, coarse coverage, confidence, and conflict state. | No raw HealthKit samples, raw biometrics, per-sample timestamps, calendar text, device identifiers, UID, email, or tokens. |
| `mobile_decision_validated` | Mobile Today decision result, selected action bucket, calendar/readiness state, warnings, and deterministic validation state. | No workout text, raw plan text, calendar event text, or raw health values. |
| `mobile_intake_lifecycle` | Mobile NLP reviewed/confirmed/discarded outcomes and deterministic validation state. | No raw user note, source text, medical/recovery note, or generated draft prose. |
| `mobile_checkin_synced` | Completion/skip/manual-check-in sync result and coarse effort/reflection booleans. | No raw reflection text or workout notes. |

Every mobile telemetry event must remain typed, capped, enum-bucketed, local
or operator-approved, and failure-isolated. Telemetry failure must never block
training, HealthKit sync, Firebase auth, deterministic decisions, or deletion.

## Web Compatibility

The current web readiness reader accepts the bounded metric fields it already
uses and ignores unknown readiness-entry fields. The mobile spike should keep
`readiness.payload.entries` compatible with this shape so the existing
dashboard can hydrate mobile summaries without a new read path.

`health_sync` is not required for the current web recommendation flow. It is a
metadata and operations domain so owner-only rules, delete semantics, and beta
QA can see the mobile sync state explicitly.
