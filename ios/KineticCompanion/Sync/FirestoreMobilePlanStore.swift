import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

enum MobilePlanStoreError: Error, Equatable {
    case signedOut, unavailable, invalidDomain(String), versionConflict, idempotencyConflict, deletionPending
}

struct MobilePlanStoredState: Equatable {
    var plan: MobilePlanSnapshot?
    var priorOperation: MobilePlanPriorOperation?
    var legacyPlanPresent: Bool
}

struct MobilePlanCommitResult: Equatable { var version: Int; var replayed: Bool }

protocol MobilePlanStoring {
    func load() async throws -> MobilePlanStoredState
    func loadGenerationContext() async throws -> MobilePlanGenerationContext
    func commit(response: MobilePlanLifecycleResponse, request: MobilePlanLifecycleRequest) async throws -> MobilePlanCommitResult
}

final class FirestoreMobilePlanStore: MobilePlanStoring {
    func load() async throws -> MobilePlanStoredState {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        let root = try ownerRoot()
        async let planDocument = root.document("plan").getDocument()
        async let operationDocument = root.document("plan_operations").getDocument()
        let documents = try await (planDocument, operationDocument)
        let rawPlan = try Self.payload(documents.0.data(), domain: "plan")
        let plan = try rawPlan.flatMap(Self.decodePlan)
        let operation = try Self.payload(documents.1.data(), domain: "plan_operations").flatMap(Self.decodeOperation)
        return .init(plan: plan, priorOperation: operation, legacyPlanPresent: rawPlan != nil && plan == nil)
        #else
        throw MobilePlanStoreError.unavailable
        #endif
    }

    func loadGenerationContext() async throws -> MobilePlanGenerationContext {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        let root = try ownerRoot()
        async let goalDocument = root.document("goal").getDocument()
        async let profileDocument = root.document("profile").getDocument()
        let documents = try await (goalDocument, profileDocument)
        guard let goal = try Self.payload(documents.0.data(), domain: "goal"),
              let profile = try Self.payload(documents.1.data(), domain: "profile"),
              let raceRaw = goal["race_distance"] as? String,
              let race = MobilePlanRaceDistance(rawValue: raceRaw),
              let targetDate = goal["target_date"] as? String,
              let experienceRaw = (profile["experience_level"] ?? goal["experience_level"]) as? String,
              let experience = MobilePlanExperience(rawValue: experienceRaw),
              let mileage = Self.double(profile["weekly_mileage"] ?? goal["weekly_mileage"]) else {
            throw MobilePlanStoreError.invalidDomain("goal/profile")
        }
        let preferred = (profile["preferred_training_days"] as? [String] ?? []).compactMap(MobilePlanDay.init(rawValue:))
        let rawBests = (profile["personal_bests"] ?? goal["current_prs"]) as? [String: Any] ?? [:]
        var bests: [MobilePlanRaceDistance: Int] = [:]
        for (key, value) in rawBests {
            if let distance = MobilePlanRaceDistance(rawValue: key), let number = Self.int(value), number > 0 { bests[distance] = number }
        }
        return .init(raceDistance: race, targetDate: targetDate, experience: experience, weeklyMileage: mileage, preferredDays: preferred, personalBests: bests, goalRevision: 1)
        #else
        throw MobilePlanStoreError.unavailable
        #endif
    }

    func commit(response: MobilePlanLifecycleResponse, request: MobilePlanLifecycleRequest) async throws -> MobilePlanCommitResult {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        let validResponse = try response.validated(), validRequest = try request.validated()
        guard validResponse.result == .commitReady, validRequest.mode == .commit,
              let commitPlan = validResponse.commitPlan,
              commitPlan == validRequest.proposedPlan,
              validResponse.baseVersion == validRequest.expectedVersion else {
            throw MobilePlanStoreError.invalidDomain("commit_package")
        }
        let root = try ownerRoot()
        let planRef = root.document("plan"), historyRef = root.document("plan_history")
        let operationRef = root.document("plan_operations"), settingsRef = root.document("settings")
        let result = try await Firestore.firestore().runTransaction { transaction, errorPointer in
            do {
                let planDocument = try transaction.getDocument(planRef).data()
                let operationDocument = try transaction.getDocument(operationRef).data()
                let settingsDocument = try transaction.getDocument(settingsRef).data()
                if let settings = try Self.payload(settingsDocument, domain: "settings"),
                   let deletion = settings["deletion"] as? [String: Any],
                   (deletion["scope"] as? String ?? "none") != "none" {
                    throw MobilePlanStoreError.deletionPending
                }
                let existingOperation = try Self.payload(operationDocument, domain: "plan_operations").flatMap(Self.decodeOperation)
                let rawCurrent = try Self.payload(planDocument, domain: "plan")
                let current = try rawCurrent.flatMap(Self.decodePlan)
                let decision = try MobilePlanTransactionGate.evaluate(current: current, priorOperation: existingOperation, request: validRequest, commitPlan: commitPlan)
                if decision == .replay {
                    return ["version": commitPlan.version, "replayed": true] as NSDictionary
                }
                let now = MobileTodayDate.isoString(Date())
                let prior: Any
                if let current { prior = try Self.encode(current) }
                else if let rawCurrent { prior = rawCurrent }
                else { prior = NSNull() }
                let priorFormat = current != nil ? mobilePlanLifecycleSchema : rawCurrent != nil ? "kinetic_companion_v1" : "none"
                transaction.setData(Self.envelope(payload: ["prior_plan": prior, "prior_format": priorFormat, "replaced_by_version": commitPlan.version], now: now), forDocument: historyRef)
                transaction.setData(Self.envelope(payload: try Self.encode(commitPlan), now: now), forDocument: planRef)
                let operation = MobilePlanPriorOperation(operationID: validRequest.operationID, requestFingerprint: validRequest.requestFingerprint, committedVersion: commitPlan.version)
                transaction.setData(Self.envelope(payload: try Self.encode(operation), now: now), forDocument: operationRef)
                return ["version": commitPlan.version, "replayed": false] as NSDictionary
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
        guard let values = result as? [String: Any], let version = Self.int(values["version"]), let replayed = values["replayed"] as? Bool else {
            throw MobilePlanStoreError.invalidDomain("transaction_result")
        }
        return .init(version: version, replayed: replayed)
        #else
        throw MobilePlanStoreError.unavailable
        #endif
    }

    #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
    private func ownerRoot() throws -> CollectionReference {
        guard let uid = Auth.auth().currentUser?.uid else { throw MobilePlanStoreError.signedOut }
        return Firestore.firestore().collection("users").document(uid).collection("kinetic")
    }

    private static func payload(_ document: [String: Any]?, domain: String) throws -> [String: Any]? {
        guard let document, document["deleted"] as? Bool != true else { return nil }
        guard document["schemaVersion"] as? Int == 1 else { throw MobilePlanStoreError.invalidDomain(domain) }
        if document["payload"] is NSNull { return nil }
        guard let payload = document["payload"] as? [String: Any] else { throw MobilePlanStoreError.invalidDomain(domain) }
        return payload
    }

    private static func decodePlan(_ object: [String: Any]) throws -> MobilePlanSnapshot? {
        guard Set(object.keys) == Set(MobilePlanValidation.snapshotKeys) else { return nil }
        guard JSONSerialization.isValidJSONObject(object) else { throw MobilePlanStoreError.invalidDomain("plan") }
        do {
            try MobilePlanValidation.validateSnapshotShape(object)
            return try JSONDecoder().decode(MobilePlanSnapshot.self, from: JSONSerialization.data(withJSONObject: object)).validated()
        } catch { throw MobilePlanStoreError.invalidDomain("plan") }
    }

    private static func decodeOperation(_ object: [String: Any]) throws -> MobilePlanPriorOperation? {
        guard Set(object.keys) == Set(["operation_id", "request_fingerprint", "committed_version"]) else { throw MobilePlanStoreError.invalidDomain("plan_operations") }
        guard JSONSerialization.isValidJSONObject(object) else { throw MobilePlanStoreError.invalidDomain("plan_operations") }
        return try JSONDecoder().decode(MobilePlanPriorOperation.self, from: JSONSerialization.data(withJSONObject: object)).validated()
    }

    private static func encode<Value: Encodable>(_ value: Value) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any] else {
            throw MobilePlanStoreError.invalidDomain("encoding")
        }
        return object
    }

    private static func envelope(payload: [String: Any], now: String) -> [String: Any] {
        ["schemaVersion": 1, "payload": payload, "deleted": false, "clientUpdatedAt": now, "serverUpdatedAt": FieldValue.serverTimestamp()]
    }
    #endif

    private static func double(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }
    private static func int(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return nil
    }
}
