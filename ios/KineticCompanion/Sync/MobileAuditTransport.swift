import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

protocol MobileAuditTransporting {
    func send<Payload: MobileAuditPayload>(_ envelope: MobileAuditEnvelope<Payload>) async
}

final class FirestoreMobileAuditTransport: MobileAuditTransporting {
    func send<Payload: MobileAuditPayload>(_ envelope: MobileAuditEnvelope<Payload>) async {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userId = Auth.auth().currentUser?.uid else { return }
        do {
            let event = try Self.encodeEvent(envelope)
            let reference = Firestore.firestore()
                .collection("users")
                .document(userId)
                .collection("kinetic")
                .document("mobile_audit")
            _ = try await Firestore.firestore().runTransaction { transaction, errorPointer in
                do {
                    let existing = try transaction.getDocument(reference).data()
                    if existing?["deleted"] as? Bool == true {
                        return nil
                    }
                    var events = Self.existingEvents(existing)
                    events.append(event)
                    if events.count > 200 {
                        events = Array(events.suffix(200))
                    }
                    let now = MobileTodayDate.isoString(Date())
                    transaction.setData(
                        [
                            "schemaVersion": 1,
                            "payload": [
                                "version": 2,
                                "events": events
                            ],
                            "deleted": false,
                            "clientUpdatedAt": now,
                            "serverUpdatedAt": FieldValue.serverTimestamp()
                        ],
                        forDocument: reference
                    )
                } catch {
                    errorPointer?.pointee = error as NSError
                }
                return nil
            }
        } catch {
            // Observability is best-effort and cannot block Today.
        }
        #endif
    }

    #if DEBUG && canImport(FirebaseFirestore) && canImport(FirebaseAuth)
    static func qaValidateOwnerReadbackAndCrossUserDenial() async throws -> (foundation: Int, plan: Int) {
        guard let userId = Auth.auth().currentUser?.uid else { throw MobileFoundationStoreError.signedOut }
        let database = Firestore.firestore()
        let document = try await database
            .collection("users").document(userId).collection("kinetic").document("mobile_audit")
            .getDocument()
        let events = existingEvents(document.data())
        guard !events.isEmpty else { throw MobileFoundationStoreError.invalidState }
        let forbiddenKeys = Set([
            "operation_id", "request_fingerprint", "workouts", "target_date",
            "email", "uid", "user_id", "hrv", "sleep", "health_data"
        ])
        guard !events.contains(where: { containsForbiddenKey($0, forbidden: forbiddenKeys) }) else {
            throw MobileFoundationStoreError.invalidState
        }
        let foundation = events.filter { $0["name"] as? String == MobileAuditEventName.foundationLifecycle.rawValue }.count
        let plan = events.filter { $0["name"] as? String == MobileAuditEventName.planLifecycle.rawValue }.count
        guard foundation > 0, plan > 0 else { throw MobileFoundationStoreError.invalidState }

        do {
            _ = try await database
                .collection("users").document("kinetic-phase56-guaranteed-foreign-owner")
                .collection("kinetic").document("plan").getDocument()
            throw MobileFoundationStoreError.invalidState
        } catch {
            let value = error as NSError
            guard value.domain == "FIRFirestoreErrorDomain", value.code == 7 else { throw error }
        }
        return (foundation, plan)
    }

    private static func containsForbiddenKey(_ value: Any, forbidden: Set<String>) -> Bool {
        if let dictionary = value as? [String: Any] {
            if dictionary.keys.contains(where: forbidden.contains) { return true }
            return dictionary.values.contains { containsForbiddenKey($0, forbidden: forbidden) }
        }
        if let array = value as? [Any] {
            return array.contains { containsForbiddenKey($0, forbidden: forbidden) }
        }
        return false
    }
    #endif

    #if canImport(FirebaseFirestore)
    private static func encodeEvent<Payload: MobileAuditPayload>(
        _ envelope: MobileAuditEnvelope<Payload>
    ) throws -> [String: Any] {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let object = try JSONSerialization.jsonObject(with: encoder.encode(envelope))
        guard let dictionary = object as? [String: Any] else {
            throw FirestoreSyncError.encodingFailed
        }
        return dictionary
    }

    private static func existingEvents(_ document: [String: Any]?) -> [[String: Any]] {
        guard
            document?["deleted"] as? Bool != true,
            let payload = document?["payload"] as? [String: Any],
            payload["version"] as? Int == 2,
            let events = payload["events"] as? [[String: Any]]
        else { return [] }
        return events
    }
    #endif
}
