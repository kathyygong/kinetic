"""Retry-safe, owner-scoped account cleanup for Mobile Phase 5.

The durable receipt lives outside the owner domain sweep.  Cleanup and Auth
deletion are separate idempotent operations so a failed domain delete or a
reauthentication requirement can be resumed without claiming completion.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Protocol

from pydantic import Field

from .mobile_plan import StrictModel


OwnerDomain = Literal[
    "profile", "goal", "plan", "plan_history", "plan_operations",
    "readiness", "workouts", "recommendations", "preferences", "settings",
    "onboarding", "dismissed_preferences", "today", "schedule",
    "calendar_sync", "calendar_failure", "health_sync", "mobile_audit",
]

OWNER_DOMAINS: list[OwnerDomain] = [
    "profile", "goal", "plan", "plan_history", "plan_operations",
    "readiness", "workouts", "recommendations", "preferences", "settings",
    "onboarding", "dismissed_preferences", "today", "schedule",
    "calendar_sync", "calendar_failure", "health_sync", "mobile_audit",
]


class MobileAccountCleanupRequest(StrictModel):
    schema_version: Literal["mobile-account-cleanup.v1"]
    platform: Literal["web", "ios"]
    mode: Literal["cleanup", "finalize_auth"]
    operation_id: str = Field(min_length=8, max_length=100)
    request_fingerprint: str = Field(min_length=8, max_length=128)


class MobileAccountCleanupReceipt(StrictModel):
    revision: int = Field(ge=1)
    status: Literal[
        "cleanup_pending",
        "reauthentication_required",
        "ready_for_auth_deletion",
        "completed",
    ]
    pending_domains: list[OwnerDomain]
    auth_state: Literal["retained", "deletion_started", "deleted"]
    last_operation_id: str
    last_request_fingerprint: str
    updated_at: datetime


class MobileAccountCleanupResponse(StrictModel):
    schema_version: Literal["mobile-account-cleanup.v1"] = "mobile-account-cleanup.v1"
    result: Literal["progress", "replayed", "reauthentication_required", "completed"]
    receipt: MobileAccountCleanupReceipt
    mutation_performed: bool


class AccountCleanupStore(Protocol):
    def read_receipt(self, uid: str) -> MobileAccountCleanupReceipt | None: ...
    def write_receipt(self, uid: str, receipt: MobileAccountCleanupReceipt) -> None: ...
    def delete_owner_domain(self, uid: str, domain: str) -> None: ...
    def owner_domain_exists(self, uid: str, domain: str) -> bool: ...
    def delete_auth_user(self, uid: str) -> None: ...


class FirebaseAccountCleanupStore:
    """Firebase Admin adapter. Client Firestore rules never expose receipts."""

    def __init__(self) -> None:
        from firebase_admin import auth, firestore

        self._auth = auth
        self._db = firestore.client()

    def _receipt(self, uid: str):
        return self._db.collection("mobile_account_cleanup").document(uid)

    def _domain(self, uid: str, domain: str):
        return self._db.collection("users").document(uid).collection("kinetic").document(domain)

    def read_receipt(self, uid: str) -> MobileAccountCleanupReceipt | None:
        snapshot = self._receipt(uid).get()
        return MobileAccountCleanupReceipt.model_validate(snapshot.to_dict()) if snapshot.exists else None

    def write_receipt(self, uid: str, receipt: MobileAccountCleanupReceipt) -> None:
        self._receipt(uid).set(receipt.model_dump(mode="json"))

    def delete_owner_domain(self, uid: str, domain: str) -> None:
        self._domain(uid, domain).delete()

    def owner_domain_exists(self, uid: str, domain: str) -> bool:
        return self._domain(uid, domain).get().exists

    def delete_auth_user(self, uid: str) -> None:
        try:
            self._auth.delete_user(uid)
        except self._auth.UserNotFoundError:
            return


def _now() -> datetime:
    return datetime.now(timezone.utc)


def coordinate_account_cleanup(
    request: MobileAccountCleanupRequest,
    *,
    uid: str,
    auth_time: int | None,
    store: AccountCleanupStore,
    now: datetime | None = None,
) -> MobileAccountCleanupResponse:
    timestamp = now or _now()
    receipt = store.read_receipt(uid)
    if receipt and receipt.status == "completed":
        return MobileAccountCleanupResponse(
            result="replayed", receipt=receipt, mutation_performed=False
        )
    matching_operation = bool(
        receipt
        and receipt.last_operation_id == request.operation_id
        and receipt.last_request_fingerprint == request.request_fingerprint
    )
    if matching_operation and receipt and (
        receipt.status == "completed"
        or (request.mode == "cleanup" and not receipt.pending_domains)
    ):
        return MobileAccountCleanupResponse(
            result="replayed", receipt=receipt, mutation_performed=False
        )
    if (
        receipt
        and receipt.last_operation_id == request.operation_id
        and receipt.last_request_fingerprint != request.request_fingerprint
    ):
        raise ValueError("operation id was reused with a different fingerprint")

    if request.mode == "cleanup":
        pending = receipt.pending_domains if receipt else list(OWNER_DOMAINS)
        base_revision = receipt.revision if receipt else 0
        working = MobileAccountCleanupReceipt(
            revision=base_revision + 1,
            status="cleanup_pending",
            pending_domains=pending,
            auth_state="retained",
            last_operation_id=request.operation_id,
            last_request_fingerprint=request.request_fingerprint,
            updated_at=timestamp,
        )
        store.write_receipt(uid, working)
        remaining: list[OwnerDomain] = []
        for domain in pending:
            try:
                store.delete_owner_domain(uid, domain)
                if store.owner_domain_exists(uid, domain):
                    remaining.append(domain)
            except Exception:  # noqa: BLE001 - preserve retry state for partial cleanup
                remaining.append(domain)
        working = working.model_copy(
            update={
                "revision": working.revision + 1,
                "status": "cleanup_pending" if remaining else "ready_for_auth_deletion",
                "pending_domains": remaining,
                "updated_at": timestamp,
            }
        )
        store.write_receipt(uid, working)
        return MobileAccountCleanupResponse(result="progress", receipt=working, mutation_performed=True)

    if receipt is None or receipt.pending_domains:
        raise ValueError("owner domains must be cleaned before Auth deletion")
    recent = auth_time is not None and timestamp.timestamp() - auth_time <= 300
    if not recent:
        receipt = receipt.model_copy(
            update={
                "revision": receipt.revision + 1,
                "status": "reauthentication_required",
                "last_operation_id": request.operation_id,
                "last_request_fingerprint": request.request_fingerprint,
                "updated_at": timestamp,
            }
        )
        store.write_receipt(uid, receipt)
        return MobileAccountCleanupResponse(
            result="reauthentication_required", receipt=receipt, mutation_performed=True
        )
    started = receipt.model_copy(
        update={
            "revision": receipt.revision + 1,
            "status": "ready_for_auth_deletion",
            "auth_state": "deletion_started",
            "last_operation_id": request.operation_id,
            "last_request_fingerprint": request.request_fingerprint,
            "updated_at": timestamp,
        }
    )
    store.write_receipt(uid, started)
    store.delete_auth_user(uid)
    completed = started.model_copy(
        update={
            "revision": started.revision + 1,
            "status": "completed",
            "auth_state": "deleted",
            "updated_at": timestamp,
        }
    )
    store.write_receipt(uid, completed)
    return MobileAccountCleanupResponse(result="completed", receipt=completed, mutation_performed=True)
