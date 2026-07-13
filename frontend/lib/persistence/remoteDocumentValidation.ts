import {
  assertHealthSyncEnvelope,
  assertReadinessEnvelope,
} from "../mobileReadinessContract";
import type {
  PersistedEnvelope,
  PersistenceDomain,
} from "./storageRepository";

export function coerceRemoteEnvelope(
  domain: PersistenceDomain,
  value: unknown,
): PersistedEnvelope<unknown> | null {
  if (!isObject(value)) return null;
  if (value.schemaVersion !== 1 || typeof value.deleted !== "boolean") return null;
  if (typeof value.clientUpdatedAt !== "string") return null;
  if (value.deleted && value.payload !== null) return null;
  if (!value.deleted && value.payload === null) return null;

  try {
    if (domain === "readiness") assertReadinessEnvelope(value);
    if (domain === "health_sync") assertHealthSyncEnvelope(value);
  } catch {
    return null;
  }

  return {
    schemaVersion: 1,
    payload: value.payload ?? null,
    deleted: value.deleted,
    clientUpdatedAt: value.clientUpdatedAt,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
