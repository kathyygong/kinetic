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
