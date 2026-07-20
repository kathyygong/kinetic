import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

protocol MobileIntakeApplying {
    func confirm(
        draft: MobileIntakeDraft,
        sourceText: String,
        today: String
    ) async throws -> Int
}

enum FirestoreMobileIntakeApplyError: Error {
    case signedOut
    case unavailable
    case invalidDomain(String)
    case validation(String)
}

final class FirestoreMobileIntakeApplyClient: MobileIntakeApplying {
    func confirm(
        draft: MobileIntakeDraft,
        sourceText: String,
        today: String
    ) async throws -> Int {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userID = Auth.auth().currentUser?.uid else {
            throw FirestoreMobileIntakeApplyError.signedOut
        }
        let root = Firestore.firestore()
            .collection("users")
            .document(userID)
            .collection("kinetic")
        let goalReference = root.document("goal")
        let profileReference = root.document("profile")
        let planReference = root.document("plan")
        let value = try await Firestore.firestore().runTransaction {
            transaction,
            errorPointer in
            do {
                let goalDocument = try transaction.getDocument(goalReference).data()
                let profileDocument = try transaction.getDocument(profileReference).data()
                let planDocument = try transaction.getDocument(planReference).data()
                var profilePayload = try Self.payload(
                    profileDocument,
                    domain: "profile",
                    required: true
                )!
                var goalPayload = try Self.payload(
                    goalDocument,
                    domain: "goal",
                    required: false
                )
                var planPayload = try Self.payload(
                    planDocument,
                    domain: "plan",
                    required: false
                )
                let planSnapshot = try planPayload.map {
                    try Self.decode(MobileIntakePlanSnapshot.self, from: $0, domain: "plan")
                }
                let result = try MobileIntakeConfirmationEngine.prepare(
                    draft: draft,
                    sourceText: sourceText,
                    today: today,
                    currentGoalExists: goalPayload != nil,
                    currentPlan: planSnapshot
                )

                if goalPayload == nil, !result.goalChanges.isEmpty {
                    goalPayload = [
                        "goal_type": "race",
                        "experience_level": profilePayload["experience_level"]
                            ?? MobileIntakeExperience.beginner.rawValue,
                        "current_prs": profilePayload["personal_bests"] ?? [:]
                    ]
                }
                for change in result.goalChanges {
                    switch change.value {
                    case .text(let value):
                        goalPayload?[change.field.rawValue] = value
                    case .number(let value):
                        goalPayload?[change.field.rawValue] = value
                        if change.field == .weeklyMileage {
                            profilePayload["weekly_mileage"] = value
                        }
                    }
                }
                for change in result.scheduleChanges {
                    profilePayload["preferred_training_days"] =
                        change.value.map(\.rawValue)
                }
                for change in result.preferenceChanges {
                    profilePayload["experience_level"] = change.value.rawValue
                    goalPayload?["experience_level"] = change.value.rawValue
                }

                let now = MobileTodayDate.isoString(Date())
                transaction.setData(
                    Self.envelope(
                        existing: profileDocument,
                        payload: profilePayload,
                        deleted: false,
                        now: now
                    ),
                    forDocument: profileReference
                )
                if let goalPayload {
                    transaction.setData(
                        Self.envelope(
                            existing: goalDocument,
                            payload: goalPayload,
                            deleted: false,
                            now: now
                        ),
                        forDocument: goalReference
                    )
                }
                switch result.planDisposition {
                case .unchanged:
                    break
                case .deleteForRegeneration:
                    transaction.setData(
                        Self.envelope(
                            existing: planDocument,
                            payload: nil,
                            deleted: true,
                            now: now
                        ),
                        forDocument: planReference
                    )
                case .updated(let update):
                    guard var payload = planPayload else {
                        throw FirestoreMobileIntakeApplyError.invalidDomain("plan")
                    }
                    payload["weeks"] = try Self.encode(update.weeks)
                    let existingReasoning = payload["reasoning"] as? [String] ?? []
                    payload["reasoning"] = Array(
                        (existingReasoning + update.reasoning).suffix(30)
                    )
                    if let easyOnlyDays = update.easyOnlyDays {
                        payload["easyOnlyDays"] = try Self.encode(easyOnlyDays)
                    }
                    payload["savedAt"] = now
                    planPayload = payload
                    transaction.setData(
                        Self.envelope(
                            existing: planDocument,
                            payload: payload,
                            deleted: false,
                            now: now
                        ),
                        forDocument: planReference
                    )
                }
                return NSNumber(value: result.appliedCount)
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
        guard let count = value as? NSNumber else {
            throw FirestoreMobileIntakeApplyError.validation(
                "Confirmation did not return an applied change count."
            )
        }
        return count.intValue
        #else
        throw FirestoreMobileIntakeApplyError.unavailable
        #endif
    }

    #if canImport(FirebaseFirestore)
    private static func payload(
        _ document: [String: Any]?,
        domain: String,
        required: Bool
    ) throws -> [String: Any]? {
        guard let document else {
            if required { throw FirestoreMobileIntakeApplyError.invalidDomain(domain) }
            return nil
        }
        if document["deleted"] as? Bool == true {
            if required { throw FirestoreMobileIntakeApplyError.invalidDomain(domain) }
            return nil
        }
        guard document["schemaVersion"] as? Int == 1,
              let payload = document["payload"] as? [String: Any] else {
            throw FirestoreMobileIntakeApplyError.invalidDomain(domain)
        }
        return payload
    }

    private static func envelope(
        existing: [String: Any]?,
        payload: [String: Any]?,
        deleted: Bool,
        now: String
    ) -> [String: Any] {
        var envelope = existing ?? [:]
        envelope["schemaVersion"] = 1
        envelope["payload"] = payload ?? NSNull()
        envelope["deleted"] = deleted
        envelope["clientUpdatedAt"] = now
        envelope["serverUpdatedAt"] = FieldValue.serverTimestamp()
        return envelope
    }

    private static func decode<Value: Decodable>(
        _ type: Value.Type,
        from object: [String: Any],
        domain: String
    ) throws -> Value {
        guard JSONSerialization.isValidJSONObject(object) else {
            throw FirestoreMobileIntakeApplyError.invalidDomain(domain)
        }
        do {
            return try JSONDecoder().decode(
                Value.self,
                from: JSONSerialization.data(withJSONObject: object)
            )
        } catch {
            throw FirestoreMobileIntakeApplyError.invalidDomain(domain)
        }
    }

    private static func encode<Value: Encodable>(_ value: Value) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }
    #endif
}
