import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

protocol MobileCheckinSaving {
    func save(_ request: MobileCheckinRequest, now: Date) async throws
}

enum FirestoreMobileCheckinError: Error, LocalizedError {
    case signedOut
    case unavailable
    case invalidDomain(String)
    case stateConflict(String)
    case permissionDenied
    case offline
    case timeout
    case unknown

    var failureState: MobileCheckinFailureState {
        switch self {
        case .signedOut: .authRequired
        case .unavailable, .unknown: .unknown
        case .invalidDomain, .stateConflict: .stateConflict
        case .permissionDenied: .permissionDenied
        case .offline: .offline
        case .timeout: .timeout
        }
    }

    var errorDescription: String? {
        switch self {
        case .signedOut: "Sign in before saving a protected check-in."
        case .unavailable: "Check-in persistence is unavailable on this build."
        case .invalidDomain(let domain): "The current \(domain) state failed validation."
        case .stateConflict(let message): message
        case .permissionDenied: "Firestore denied this owner-scoped check-in write."
        case .offline: "Reconnect before retrying this check-in. No partial write was made."
        case .timeout: "The check-in write timed out without a confirmed commit."
        case .unknown: "The check-in could not be saved safely."
        }
    }
}

final class FirestoreMobileCheckinClient: MobileCheckinSaving {
    static func failureState(for error: Error) -> MobileCheckinFailureState {
        if let value = error as? FirestoreMobileCheckinError {
            return value.failureState
        }
        if let value = error as? MobileCheckinValidationError {
            return value.failureState
        }
        return map(error).failureState
    }

    func save(_ request: MobileCheckinRequest, now: Date = Date()) async throws {
        try MobileCheckinValidator.validate(request, now: now)
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userID = Auth.auth().currentUser?.uid else {
            throw FirestoreMobileCheckinError.signedOut
        }
        let db = Firestore.firestore()
        let root = db.collection("users").document(userID).collection("kinetic")
        let goalReference = root.document("goal")
        let planReference = root.document("plan")
        let readinessReference = root.document("readiness")
        let workoutsReference = root.document("workouts")
        let recommendationsReference = root.document("recommendations")

        do {
            _ = try await db.runTransaction { transaction, errorPointer in
                do {
                    let goalDocument = try transaction.getDocument(goalReference).data()
                    let planDocument = try transaction.getDocument(planReference).data()
                    let readinessDocument = try transaction.getDocument(readinessReference).data()
                    let workoutsDocument = try transaction.getDocument(workoutsReference).data()
                    let recommendationsDocument = try transaction
                        .getDocument(recommendationsReference).data()

                    let goal: TodayGoal = try Self.decodeRequired(
                        goalDocument,
                        domain: "goal"
                    )
                    let plan: TodaySavedPlan = try Self.decodeRequired(
                        planDocument,
                        domain: "plan"
                    )
                    if request.kind == .perceivedRecovery,
                       Self.isDeleted(readinessDocument) {
                        throw FirestoreMobileCheckinError.stateConflict(
                            "Deleted readiness data cannot be recreated by a routine check-in."
                        )
                    }
                    if request.kind == .workoutOutcome,
                       (Self.isDeleted(workoutsDocument)
                        || Self.isDeleted(recommendationsDocument)) {
                        throw FirestoreMobileCheckinError.stateConflict(
                            "Deleted workout history cannot be recreated by a routine check-in."
                        )
                    }
                    let workouts: MobileCheckinWorkoutLog? = try Self.decodeOptional(
                        workoutsDocument,
                        domain: "workouts"
                    )
                    let goalSignature: String
                    if let workouts {
                        guard MobileCheckinGoalSignature.matches(
                            workouts.goalSig,
                            goal: goal
                        ) else {
                            throw FirestoreMobileCheckinError.stateConflict(
                                "Workout history belongs to a different goal."
                            )
                        }
                        // Keep the web-authored representation so both clients retain
                        // the same workout-history scope after this transaction.
                        goalSignature = workouts.goalSig
                    } else {
                        goalSignature = MobileCheckinGoalSignature.make(goal)
                    }
                    let state = MobileCheckinState(
                        goalSignature: goalSignature,
                        planSlots: MobileCheckinPlanResolver.slots(plan: plan),
                        readiness: try Self.decodeOptional(
                            readinessDocument,
                            domain: "readiness"
                        ),
                        workouts: workouts,
                        recommendations: try Self.decodeOptional(
                            recommendationsDocument,
                            domain: "recommendations"
                        )
                    )
                    let result = try MobileCheckinEngine.apply(request, to: state, now: now)
                    let committedAt = MobileTodayDate.isoString(Date())
                    switch request.kind {
                    case .perceivedRecovery:
                        guard let readiness = result.readiness else {
                            throw FirestoreMobileCheckinError.invalidDomain("readiness")
                        }
                        transaction.setData(
                            try Self.envelope(
                                existing: readinessDocument,
                                payload: readiness,
                                now: committedAt
                            ),
                            forDocument: readinessReference
                        )
                    case .workoutOutcome:
                        guard let workouts = result.workouts,
                              let recommendations = result.recommendations else {
                            throw FirestoreMobileCheckinError.invalidDomain(
                                "workouts/recommendations"
                            )
                        }
                        transaction.setData(
                            try Self.envelope(
                                existing: workoutsDocument,
                                payload: workouts,
                                now: committedAt
                            ),
                            forDocument: workoutsReference
                        )
                        transaction.setData(
                            try Self.envelope(
                                existing: recommendationsDocument,
                                payload: recommendations,
                                now: committedAt
                            ),
                            forDocument: recommendationsReference
                        )
                    }
                    return NSNumber(value: 1)
                } catch {
                    errorPointer?.pointee = Self.transactionError(error)
                    return nil
                }
            }
        } catch let error as FirestoreMobileCheckinError {
            throw error
        } catch let validation as MobileCheckinValidationError {
            switch validation {
            case .invalid(let message):
                throw FirestoreMobileCheckinError.stateConflict(message)
            case .stateConflict(let message):
                throw FirestoreMobileCheckinError.stateConflict(message)
            }
        } catch {
            throw Self.map(error)
        }
        #else
        throw FirestoreMobileCheckinError.unavailable
        #endif
    }

    #if canImport(FirebaseFirestore)
    private static func isDeleted(_ document: [String: Any]?) -> Bool {
        document?["deleted"] as? Bool == true
    }

    private static func decodeRequired<Value: Decodable>(
        _ document: [String: Any]?,
        domain: String
    ) throws -> Value {
        guard let value: Value = try decodeOptional(document, domain: domain) else {
            throw FirestoreMobileCheckinError.invalidDomain(domain)
        }
        return value
    }

    private static func decodeOptional<Value: Decodable>(
        _ document: [String: Any]?,
        domain: String
    ) throws -> Value? {
        guard let document else { return nil }
        if isDeleted(document) { return nil }
        guard document["schemaVersion"] as? Int == 1,
              let payload = document["payload"],
              !(payload is NSNull),
              JSONSerialization.isValidJSONObject(payload) else {
            throw FirestoreMobileCheckinError.invalidDomain(domain)
        }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(
                Value.self,
                from: JSONSerialization.data(withJSONObject: payload)
            )
        } catch {
            throw FirestoreMobileCheckinError.invalidDomain(domain)
        }
    }

    private static func envelope<Value: Encodable>(
        existing: [String: Any]?,
        payload: Value,
        now: String
    ) throws -> [String: Any] {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encoded = try encoder.encode(payload)
        let object = try JSONSerialization.jsonObject(with: encoded)
        var envelope = existing ?? [:]
        envelope["schemaVersion"] = 1
        envelope["payload"] = object
        envelope["deleted"] = false
        envelope["clientUpdatedAt"] = now
        envelope["serverUpdatedAt"] = FieldValue.serverTimestamp()
        return envelope
    }
    #endif

    private static func map(_ error: Error) -> FirestoreMobileCheckinError {
        let value = error as NSError
        if value.domain == transactionErrorDomain {
            switch value.code {
            case 1:
                return .stateConflict(
                    value.userInfo[NSLocalizedDescriptionKey] as? String
                        ?? "Current training state changed before save."
                )
            case 2: return .invalidDomain("owner-scoped training")
            default: return .unknown
            }
        }
        if value.domain == NSURLErrorDomain {
            switch value.code {
            case NSURLErrorTimedOut: return .timeout
            case NSURLErrorNotConnectedToInternet,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorCannotFindHost: return .offline
            default: return .unknown
            }
        }
        if value.domain == "FIRFirestoreErrorDomain" {
            switch value.code {
            case 4: return .timeout
            case 7: return .permissionDenied
            case 14: return .offline
            case 16: return .signedOut
            default: return .unknown
            }
        }
        return .unknown
    }

    private static let transactionErrorDomain = "Kinetic.MobileCheckin.Transaction"

    private static func transactionError(_ error: Error) -> NSError {
        if let value = error as? FirestoreMobileCheckinError {
            switch value {
            case .stateConflict(let message):
                return NSError(
                    domain: transactionErrorDomain,
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: message]
                )
            case .invalidDomain(let domain):
                return NSError(
                    domain: transactionErrorDomain,
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: domain]
                )
            default:
                return value as NSError
            }
        }
        if let value = error as? MobileCheckinValidationError {
            return NSError(
                domain: transactionErrorDomain,
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: value.localizedDescription]
            )
        }
        return error as NSError
    }
}
