import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

protocol BehaviorPreferenceConfirming {
    func confirm(_ pattern: BehaviorPattern, now: Date) async throws
}

enum FirestoreBehaviorPreferenceError: Error, LocalizedError {
    case signedOut
    case unavailable
    case invalidPattern
    case invalidDomain
    case stateConflict

    var errorDescription: String? {
        switch self {
        case .signedOut: "Sign in before saving this preference."
        case .unavailable: "Preference persistence is unavailable on this build."
        case .invalidPattern: "This result cannot become a scoring preference."
        case .invalidDomain: "The existing preference history failed validation."
        case .stateConflict: "This preference changed elsewhere. Refresh before trying again."
        }
    }
}

final class FirestoreBehaviorPreferenceClient: BehaviorPreferenceConfirming {
    func confirm(_ pattern: BehaviorPattern, now: Date = Date()) async throws {
        guard case .scoringPreference(_, _, _, let type, _) = pattern.result,
              type != .none,
              type != .schedulePreference else {
            throw FirestoreBehaviorPreferenceError.invalidPattern
        }
        try BehaviorPatternValidator.validate(pattern)

        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userID = Auth.auth().currentUser?.uid else {
            throw FirestoreBehaviorPreferenceError.signedOut
        }
        let db = Firestore.firestore()
        let reference = db.collection("users")
            .document(userID)
            .collection("kinetic")
            .document("preferences")
        do {
            _ = try await db.runTransaction { transaction, errorPointer in
                do {
                    let document = try transaction.getDocument(reference).data()
                    if document?["deleted"] as? Bool == true {
                        throw FirestoreBehaviorPreferenceError.stateConflict
                    }
                    var payload: [String: Any]
                    if let document {
                        guard document["schemaVersion"] as? Int == 1,
                              let current = document["payload"] as? [String: Any],
                              current["version"] as? Int == 1,
                              current["preferences"] is [String: Any] else {
                            throw FirestoreBehaviorPreferenceError.invalidDomain
                        }
                        payload = current
                    } else {
                        payload = ["version": 1, "preferences": [String: Any]()]
                    }
                    var preferences = payload["preferences"] as? [String: Any] ?? [:]
                    let createdAt = MobileTodayDate.isoString(now)
                    let candidate: [String: Any] = [
                        "id": pattern.id,
                        "type": type.rawValue,
                        "description": pattern.description,
                        "confidence": pattern.confidence.rawValue,
                        "userConfirmed": true,
                        "createdAt": createdAt
                    ]
                    if let existing = preferences[pattern.id] as? [String: Any] {
                        guard existing["id"] as? String == pattern.id,
                              existing["type"] as? String == type.rawValue,
                              existing["userConfirmed"] as? Bool == true else {
                            throw FirestoreBehaviorPreferenceError.stateConflict
                        }
                        return NSNumber(value: 0)
                    }
                    preferences[pattern.id] = candidate
                    payload["preferences"] = preferences
                    transaction.setData(
                        [
                            "schemaVersion": 1,
                            "payload": payload,
                            "deleted": false,
                            "clientUpdatedAt": createdAt,
                            "serverUpdatedAt": FieldValue.serverTimestamp()
                        ],
                        forDocument: reference
                    )
                    return NSNumber(value: 1)
                } catch {
                    errorPointer?.pointee = error as NSError
                    return nil
                }
            }
        } catch let error as FirestoreBehaviorPreferenceError {
            throw error
        } catch {
            throw FirestoreBehaviorPreferenceError.stateConflict
        }
        #else
        throw FirestoreBehaviorPreferenceError.unavailable
        #endif
    }
}
