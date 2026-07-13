import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

enum FirestoreSyncError: Error {
    case signedOut
    case unavailable
    case encodingFailed
}

protocol ReadinessSyncing {
    func syncHealthKitSummary(_ summary: HealthKitReadinessSummary) async throws
}

final class FirestoreReadinessSyncClient: ReadinessSyncing {
    #if canImport(FirebaseFirestore)
    private let db = Firestore.firestore()
    #endif

    func syncHealthKitSummary(_ summary: HealthKitReadinessSummary) async throws {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreSyncError.signedOut
        }

        let readinessRef = db
            .collection("users")
            .document(userId)
            .collection("kinetic")
            .document("readiness")
        let healthSyncRef = db
            .collection("users")
            .document(userId)
            .collection("kinetic")
            .document("health_sync")

        try await db.runTransaction { transaction, errorPointer in
            do {
                let readinessDocument = try transaction.getDocument(readinessRef)
                let currentLog = try Self.decodeReadinessLog(from: readinessDocument.data())
                let existing = currentLog.entries[summary.entry.date]
                let merge = ReadinessConflictResolver.merge(
                    existing: existing,
                    incomingHealthKit: summary.entry
                )

                var nextLog = currentLog
                if let entryToWrite = merge.entryToWrite {
                    nextLog.entries[entryToWrite.date] = entryToWrite
                    let envelope = PersistedEnvelope(
                        schemaVersion: 1,
                        payload: nextLog,
                        deleted: false,
                        clientUpdatedAt: Date()
                    )
                    transaction.setData(try Self.encodeEnvelope(envelope), forDocument: readinessRef)
                }

                var dailyStatus = summary.dailyStatus
                dailyStatus.conflict = merge.conflict
                dailyStatus.status = merge.status

                let syncPayload = HealthSyncPayload(
                    provider: .appleHealth,
                    schema: .v1,
                    permissionState: .granted,
                    metricPermissions: [
                        HealthMetric.sleep.rawValue: .granted,
                        HealthMetric.hrv.rawValue: .granted,
                        HealthMetric.restingHeartRate.rawValue: .granted
                    ],
                    lastAttemptedSyncAt: Date(),
                    lastSuccessfulSyncAt: merge.entryToWrite == nil ? nil : Date(),
                    latestReadinessDate: summary.entry.date,
                    backgroundDelivery: .unknown,
                    dailyStatus: [summary.entry.date: dailyStatus],
                    lastErrorCode: nil
                )
                let syncEnvelope = PersistedEnvelope(
                    schemaVersion: 1,
                    payload: syncPayload,
                    deleted: false,
                    clientUpdatedAt: Date()
                )
                transaction.setData(try Self.encodeEnvelope(syncEnvelope), forDocument: healthSyncRef)
            } catch {
                errorPointer?.pointee = error as NSError
            }
            return nil
        }
        #else
        throw FirestoreSyncError.unavailable
        #endif
    }

    #if canImport(FirebaseFirestore)
    private static func decodeReadinessLog(from data: [String: Any]?) throws -> ReadinessLog {
        guard
            let payload = data?["payload"],
            JSONSerialization.isValidJSONObject(payload)
        else {
            return ReadinessLog(entries: [:])
        }

        let json = try JSONSerialization.data(withJSONObject: payload)
        return try jsonDecoder.decode(ReadinessLog.self, from: json)
    }

    private static func encodeEnvelope<Payload: Codable>(
        _ envelope: PersistedEnvelope<Payload>
    ) throws -> [String: Any] {
        let data = try jsonEncoder.encode(envelope)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = object as? [String: Any] else {
            throw FirestoreSyncError.encodingFailed
        }
        return dictionary
    }
    #endif

    private static let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private static let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
