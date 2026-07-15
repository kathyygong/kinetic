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
    case trainingDataDeleted
}

protocol ReadinessSyncing {
    func syncHealthKitSummary(_ summary: HealthKitReadinessSummary) async throws
}

final class FirestoreReadinessSyncClient: ReadinessSyncing {
    func syncHealthKitSummary(_ summary: HealthKitReadinessSummary) async throws {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreSyncError.signedOut
        }

        let db = Firestore.firestore()
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
                let readinessData = try transaction.getDocument(readinessRef).data()
                let healthSyncData = try transaction.getDocument(healthSyncRef).data()
                guard !Self.isDeleted(readinessData), !Self.isDeleted(healthSyncData) else {
                    throw FirestoreSyncError.trainingDataDeleted
                }

                let currentLog = try Self.decodeReadinessLog(from: readinessData)
                let currentSync = try Self.decodeHealthSync(from: healthSyncData)
                let merge: ReadinessMergeResult
                if let incoming = summary.entry {
                    merge = ReadinessConflictResolver.merge(
                        existing: currentLog.entries[incoming.date],
                        incomingHealthKit: incoming
                    )
                } else {
                    merge = ReadinessMergeResult(
                        entryToWrite: nil,
                        conflict: .none,
                        status: summary.dailyStatus.status
                    )
                }

                let now = Date()
                if let entryToWrite = merge.entryToWrite {
                    var nextLog = currentLog
                    nextLog.entries[entryToWrite.date] = entryToWrite
                    let envelope = PersistedEnvelope(
                        schemaVersion: 1,
                        payload: nextLog,
                        deleted: false,
                        clientUpdatedAt: now
                    )
                    transaction.setData(try Self.encodeEnvelope(envelope), forDocument: readinessRef)
                }

                var dailyStatus = summary.dailyStatus
                dailyStatus.conflict = merge.conflict
                if summary.entry != nil && merge.entryToWrite == nil {
                    dailyStatus.status = merge.status
                }

                var allDailyStatus = currentSync?.dailyStatus ?? [:]
                allDailyStatus[summary.date] = dailyStatus
                let wroteReadiness = merge.entryToWrite != nil
                let syncPayload = HealthSyncPayload(
                    provider: .appleHealth,
                    schema: .v1,
                    permissionState: summary.permissionState,
                    metricPermissions: summary.metricPermissions,
                    lastAttemptedSyncAt: now,
                    lastSuccessfulSyncAt: wroteReadiness
                        ? now
                        : currentSync?.lastSuccessfulSyncAt,
                    latestReadinessDate: wroteReadiness
                        ? summary.date
                        : currentSync?.latestReadinessDate,
                    backgroundDelivery: .unknown,
                    dailyStatus: allDailyStatus,
                    lastErrorCode: summary.lastErrorCode
                )
                let syncEnvelope = PersistedEnvelope(
                    schemaVersion: 1,
                    payload: syncPayload,
                    deleted: false,
                    clientUpdatedAt: now
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
    private static func isDeleted(_ data: [String: Any]?) -> Bool {
        data?["deleted"] as? Bool == true
    }

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

    private static func decodeHealthSync(from data: [String: Any]?) throws -> HealthSyncPayload? {
        guard
            let payload = data?["payload"],
            JSONSerialization.isValidJSONObject(payload)
        else {
            return nil
        }

        let json = try JSONSerialization.data(withJSONObject: payload)
        return try jsonDecoder.decode(HealthSyncPayload.self, from: json)
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
