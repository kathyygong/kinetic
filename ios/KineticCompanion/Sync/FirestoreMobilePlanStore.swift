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
    var metadata: MobilePlanMetadataV2?
    var planningInputs: MobilePlanningInputs?
}

struct MobilePlanCommitResult: Equatable { var version: Int; var replayed: Bool }

protocol MobilePlanStoring {
    func load() async throws -> MobilePlanStoredState
    func loadGenerationContext() async throws -> MobilePlanGenerationContext
    func commit(response: MobilePlanLifecycleResponse, request: MobilePlanLifecycleRequest) async throws -> MobilePlanCommitResult
    func commitV2(response: MobilePlanLifecycleResponseV2, request: MobilePlanLifecycleRequestV2) async throws -> MobilePlanCommitResult
}

final class FirestoreMobilePlanStore: MobilePlanStoring {
    func load() async throws -> MobilePlanStoredState {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        let root = try ownerRoot()
        async let planDocument = root.document("plan").getDocument()
        async let operationDocument = root.document("plan_operations").getDocument()
        async let profileDocument = root.document("profile").getDocument()
        async let goalDocument = root.document("goal").getDocument()
        let documents = try await (planDocument, operationDocument, profileDocument, goalDocument)
        let rawPlan = try Self.payload(documents.0.data(), domain: "plan")
        let v2 = try rawPlan.flatMap(Self.decodePlanV2)
        let plan: MobilePlanSnapshot?
        if let v2 { plan = v2.snapshot } else { plan = try rawPlan.flatMap(Self.decodePlan) }
        let operation = try Self.payload(documents.1.data(), domain: "plan_operations").flatMap(Self.decodeOperation)
        let profile = try Self.payload(documents.2.data(), domain: "profile")
        let goal = try Self.payload(documents.3.data(), domain: "goal")
        let inputs = try Self.decodePlanningInputs(profile: profile, goal: goal, fallbackRevision: plan?.goalRevision)
        return .init(plan: plan, priorOperation: operation, legacyPlanPresent: rawPlan != nil && plan == nil, metadata: v2?.metadata, planningInputs: inputs)
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
              let experience = MobilePlanExperience(rawValue: experienceRaw) else {
            throw MobilePlanStoreError.invalidDomain("goal/profile")
        }
        let mileage = Self.double(profile["weekly_mileage"] ?? goal["weekly_mileage"]) ?? 0
        let preferred = (profile["preferred_training_days"] as? [String] ?? []).compactMap(MobilePlanDay.init(rawValue:))
        let rawBests = (profile["personal_bests"] ?? goal["current_prs"]) as? [String: Any] ?? [:]
        var bests: [MobilePlanRaceDistance: Int] = [:]
        for (key, value) in rawBests {
            if let distance = MobilePlanRaceDistance(rawValue: key), let number = Self.int(value), number > 0 { bests[distance] = number }
        }
        let availability = try Self.decodeAvailability(profile["weekly_availability"])
        let revision = Self.int(profile["planning_revision"] ?? goal["planning_revision"]) ?? 1
        return .init(raceDistance: race, targetDate: targetDate, experience: experience, weeklyMileage: mileage, preferredDays: preferred, personalBests: bests, weeklyAvailability: availability, goalRevision: revision)
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

    func commitV2(response: MobilePlanLifecycleResponseV2, request: MobilePlanLifecycleRequestV2) async throws -> MobilePlanCommitResult {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        let validResponse = try response.validated(), validRequest = try request.validated()
        guard validResponse.result == .commitReady, validRequest.mode == .commit,
              let commitPlan = validResponse.commitPlan,
              let inputs = validResponse.commitPlanningInputs,
              commitPlan == validRequest.proposedPlan,
              inputs == validRequest.proposedPlanningInputs,
              validResponse.baseVersion == validRequest.expectedVersion else {
            throw MobilePlanStoreError.invalidDomain("commit_package_v2")
        }
        let root = try ownerRoot()
        let profileRef = root.document("profile"), goalRef = root.document("goal")
        let planRef = root.document("plan"), historyRef = root.document("plan_history")
        let operationRef = root.document("plan_operations"), settingsRef = root.document("settings")
        let result = try await Firestore.firestore().runTransaction { transaction, errorPointer in
            do {
                let profileDocument = try transaction.getDocument(profileRef).data()
                let goalDocument = try transaction.getDocument(goalRef).data()
                let planDocument = try transaction.getDocument(planRef).data()
                let historyDocument = try transaction.getDocument(historyRef).data()
                let operationDocument = try transaction.getDocument(operationRef).data()
                let settingsDocument = try transaction.getDocument(settingsRef).data()
                if let settings = try Self.payload(settingsDocument, domain: "settings"),
                   let deletion = settings["deletion"] as? [String: Any],
                   (deletion["scope"] as? String ?? "none") != "none" {
                    throw MobilePlanStoreError.deletionPending
                }
                let rawCurrent = try Self.payload(planDocument, domain: "plan")
                let storedV2 = try rawCurrent.flatMap(Self.decodePlanV2)
                let current: MobilePlanSnapshot?
                if let storedV2 { current = storedV2.snapshot } else { current = try rawCurrent.flatMap(Self.decodePlan) }
                guard (current?.version ?? 0) == validResponse.baseVersion else { throw MobilePlanStoreError.versionConflict }

                let profile = try Self.payload(profileDocument, domain: "profile") ?? [:]
                let goal = try Self.payload(goalDocument, domain: "goal") ?? [:]
                let storedRevision = Self.int(profile["planning_revision"] ?? goal["planning_revision"])
                let expectedRevision = validRequest.currentPlanningInputs?.revision ?? validRequest.proposedPlanningInputs.revision
                if let storedRevision, storedRevision != expectedRevision { throw MobilePlanStoreError.versionConflict }

                let operations = try Self.decodeOperations(try Self.payload(operationDocument, domain: "plan_operations"))
                if let prior = operations.first(where: { $0.operationID == validRequest.operationID }) {
                    guard prior.requestFingerprint == validRequest.requestFingerprint,
                          prior.committedVersion == commitPlan.version else { throw MobilePlanStoreError.idempotencyConflict }
                    return ["version": commitPlan.version, "replayed": true] as NSDictionary
                }

                let now = MobileTodayDate.isoString(Date())
                var nextProfile = profile
                nextProfile["experience_level"] = inputs.experienceLevel.rawValue
                if let mileage = inputs.weeklyMileage { nextProfile["weekly_mileage"] = mileage }
                else { nextProfile.removeValue(forKey: "weekly_mileage") }
                nextProfile["preferred_training_days"] = inputs.preferredDays.map(\.rawValue)
                nextProfile["personal_bests"] = inputs.personalBestsSeconds
                nextProfile["weekly_availability"] = try Self.encodeArray(inputs.weeklyAvailability)
                nextProfile["planning_revision"] = inputs.revision

                var nextGoal = goal
                nextGoal["goal_type"] = "race"; nextGoal["race_distance"] = inputs.raceDistance.rawValue
                nextGoal["target_date"] = inputs.targetDate; nextGoal["experience_level"] = inputs.experienceLevel.rawValue
                if let mileage = inputs.weeklyMileage { nextGoal["weekly_mileage"] = mileage }
                else { nextGoal.removeValue(forKey: "weekly_mileage") }
                nextGoal["current_prs"] = inputs.personalBestsSeconds
                nextGoal["planning_revision"] = inputs.revision

                let history = try Self.decodeHistory(try Self.payload(historyDocument, domain: "plan_history"))
                let operation = MobilePlanPriorOperation(operationID: validRequest.operationID, requestFingerprint: validRequest.requestFingerprint, committedVersion: commitPlan.version)
                transaction.setData(Self.envelopeV2(payload: nextProfile, now: now), forDocument: profileRef)
                transaction.setData(Self.envelopeV2(payload: nextGoal, now: now), forDocument: goalRef)
                transaction.setData(Self.envelopeV2(payload: try Self.encode(commitPlan), now: now), forDocument: planRef)
                transaction.setData(Self.envelopeV2(payload: ["versions": history + [try Self.encode(commitPlan)]], now: now), forDocument: historyRef)
                transaction.setData(Self.envelopeV2(payload: ["operations": try Self.encodeArray(operations + [operation])], now: now), forDocument: operationRef)
                return ["version": commitPlan.version, "replayed": false] as NSDictionary
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
        guard let values = result as? [String: Any], let version = Self.int(values["version"]), let replayed = values["replayed"] as? Bool else {
            throw MobilePlanStoreError.invalidDomain("transaction_result_v2")
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
        guard let schema = document["schemaVersion"] as? Int, schema == 1 || schema == 2 else { throw MobilePlanStoreError.invalidDomain(domain) }
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

    private static func decodePlanV2(_ object: [String: Any]) throws -> MobilePlanSnapshotV2? {
        guard Set(object.keys) == Set(["id", "version", "status", "goal_revision", "workouts", "metadata"]) else { return nil }
        guard JSONSerialization.isValidJSONObject(object) else { throw MobilePlanStoreError.invalidDomain("plan") }
        do { return try JSONDecoder().decode(MobilePlanSnapshotV2.self, from: JSONSerialization.data(withJSONObject: object)).validated() }
        catch { throw MobilePlanStoreError.invalidDomain("plan") }
    }

    private static func decodeOperation(_ object: [String: Any]) throws -> MobilePlanPriorOperation? {
        if let operations = object["operations"] as? [[String: Any]] { return try operations.last.flatMap(decodeOperationItem) }
        return try decodeOperationItem(object)
    }

    private static func decodeOperationItem(_ object: [String: Any]) throws -> MobilePlanPriorOperation? {
        let allowed = Set(["operation_id", "request_fingerprint", "committed_version", "planning_revision"])
        guard Set(object.keys).isSubset(of: allowed), Set(["operation_id", "request_fingerprint", "committed_version"]).isSubset(of: Set(object.keys)) else { throw MobilePlanStoreError.invalidDomain("plan_operations") }
        guard JSONSerialization.isValidJSONObject(object) else { throw MobilePlanStoreError.invalidDomain("plan_operations") }
        let reduced = object.filter { $0.key != "planning_revision" }
        return try JSONDecoder().decode(MobilePlanPriorOperation.self, from: JSONSerialization.data(withJSONObject: reduced)).validated()
    }

    private static func decodeOperations(_ object: [String: Any]?) throws -> [MobilePlanPriorOperation] {
        guard let object else { return [] }
        if let values = object["operations"] as? [[String: Any]] { return try values.compactMap(decodeOperationItem) }
        return try decodeOperationItem(object).map { [$0] } ?? []
    }

    private static func decodeHistory(_ object: [String: Any]?) throws -> [[String: Any]] {
        guard let object else { return [] }
        if let versions = object["versions"] as? [[String: Any]] { return versions }
        if let prior = object["prior_plan"] as? [String: Any] { return [prior] }
        return []
    }

    private static func decodeAvailability(_ value: Any?) throws -> [MobileWeeklyAvailability] {
        guard let value else { return [] }
        guard let array = value as? [[String: Any]], JSONSerialization.isValidJSONObject(array) else { throw MobilePlanStoreError.invalidDomain("weekly_availability") }
        return try JSONDecoder().decode([MobileWeeklyAvailability].self, from: JSONSerialization.data(withJSONObject: array)).map { try $0.validated() }
    }

    private static func decodePlanningInputs(profile: [String: Any]?, goal: [String: Any]?, fallbackRevision: Int?) throws -> MobilePlanningInputs? {
        guard let profile, let goal,
              let race = (goal["race_distance"] as? String).flatMap(MobilePlanRaceDistance.init(rawValue:)),
              let target = goal["target_date"] as? String,
              let experience = ((profile["experience_level"] ?? goal["experience_level"]) as? String).flatMap(MobilePlanExperience.init(rawValue:)) else { return nil }
        let preferred = (profile["preferred_training_days"] as? [String] ?? []).compactMap(MobilePlanDay.init(rawValue:))
        let bestsRaw = (profile["personal_bests"] ?? goal["current_prs"]) as? [String: Any] ?? [:]
        let bests = Dictionary(uniqueKeysWithValues: bestsRaw.compactMap { key, value in Self.int(value).map { (key, $0) } })
        return try MobilePlanningInputs(
            revision: Self.int(profile["planning_revision"] ?? goal["planning_revision"]) ?? fallbackRevision ?? 1,
            raceDistance: race, targetDate: target, experienceLevel: experience,
            weeklyMileage: Self.double(profile["weekly_mileage"] ?? goal["weekly_mileage"]),
            preferredDays: preferred, personalBestsSeconds: bests,
            weeklyAvailability: try decodeAvailability(profile["weekly_availability"])
        ).validated()
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

    private static func envelopeV2(payload: [String: Any], now: String) -> [String: Any] {
        ["schemaVersion": 2, "payload": payload, "deleted": false, "clientUpdatedAt": now, "serverUpdatedAt": FieldValue.serverTimestamp()]
    }

    private static func encodeArray<Value: Encodable>(_ value: [Value]) throws -> [Any] {
        guard let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [Any] else { throw MobilePlanStoreError.invalidDomain("encoding") }
        return object
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
