import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

enum MobileFoundationStoreError: Error { case signedOut, unavailable, invalidState, revisionConflict }

protocol MobileFoundationStoring {
    func restoreOrMigrate() async throws -> MobileFoundationState
    func save(_ state: MobileFoundationState, expectedRevision: Int?) async throws
    func deleteTrainingData(from state: MobileFoundationState) async throws -> MobileFoundationState
    func beginAccountDeletion(from state: MobileFoundationState) async throws -> MobileFoundationState
    func saveOnboardingAnswers(_ answers: MobileOnboardingAnswers, completed: Bool) async throws
    func exportTrainingData() async throws -> String
}

final class FirestoreMobileFoundationStore: MobileFoundationStoring {
    func exportTrainingData() async throws -> String {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let uid = Auth.auth().currentUser?.uid else { throw MobileFoundationStoreError.signedOut }
        let root = Firestore.firestore().collection("users").document(uid).collection("kinetic")
        var domains: [String: Any] = [:]
        for domain in MobileFoundationDomain.trainingData {
            let document = try await root.document(domain.rawValue).getDocument()
            guard let data = document.data(), data["deleted"] as? Bool != true else {
                domains[domain.rawValue] = NSNull()
                continue
            }
            domains[domain.rawValue] = Self.jsonValue(data["payload"] ?? data)
        }
        let export: [String: Any] = [
            "schema_version": "kinetic-training-export.v1",
            "exported_at": MobileTodayDate.isoString(Date()),
            "domains": domains
        ]
        guard JSONSerialization.isValidJSONObject(export) else { throw MobileFoundationStoreError.invalidState }
        let data = try JSONSerialization.data(withJSONObject: export, options: [.prettyPrinted, .sortedKeys])
        guard let value = String(data: data, encoding: .utf8) else { throw MobileFoundationStoreError.invalidState }
        return value
        #else
        throw MobileFoundationStoreError.unavailable
        #endif
    }

    func saveOnboardingAnswers(_ answers: MobileOnboardingAnswers, completed: Bool) async throws {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let user = Auth.auth().currentUser else { throw MobileFoundationStoreError.signedOut }
        let answers = try answers.validated()
        let root = Firestore.firestore().collection("users").document(user.uid).collection("kinetic")
        let now = MobileTodayDate.isoString(Date())
        let goal: [String: Any] = ["goal_type": "race", "race_distance": answers.raceDistance, "target_date": answers.targetDate, "experience_level": answers.experience, "current_prs": answers.personalBests, "weekly_mileage": answers.weeklyMileage]
        let profile: [String: Any] = ["full_name": "", "email": user.email ?? "", "experience_level": answers.experience, "weekly_mileage": answers.weeklyMileage, "preferred_training_days": answers.preferredDays, "personal_bests": answers.personalBests, "connected_services": ["google_calendar": ["connected": false], "apple_health": ["connected": false], "garmin": ["connected": false], "oura": ["connected": false]], "onboarding_completed": completed]
        let batch = Firestore.firestore().batch()
        batch.setData(["schemaVersion": 1, "payload": goal, "deleted": false, "clientUpdatedAt": now, "serverUpdatedAt": FieldValue.serverTimestamp()], forDocument: root.document("goal"))
        batch.setData(["schemaVersion": 1, "payload": profile, "deleted": false, "clientUpdatedAt": now, "serverUpdatedAt": FieldValue.serverTimestamp()], forDocument: root.document("profile"))
        try await batch.commit()
        #else
        throw MobileFoundationStoreError.unavailable
        #endif
    }

    func restoreOrMigrate() async throws -> MobileFoundationState {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let uid = Auth.auth().currentUser?.uid else { throw MobileFoundationStoreError.signedOut }
        let root = Firestore.firestore().collection("users").document(uid).collection("kinetic")
        async let onboarding = root.document("onboarding").getDocument()
        async let settings = root.document("settings").getDocument()
        let snapshots = try await (onboarding, settings)
        if let first = try Self.decodeState(snapshots.0.data()), let second = try Self.decodeState(snapshots.1.data()) {
            guard first == second else { throw MobileFoundationStoreError.revisionConflict }
            return try first.validated()
        }
        if let one = try Self.decodeState(snapshots.0.data()) ?? Self.decodeState(snapshots.1.data()) {
            let valid = try one.validated()
            try await save(valid, expectedRevision: nil)
            return valid
        }

        async let profile = root.document("profile").getDocument()
        async let goal = root.document("goal").getDocument()
        async let plan = root.document("plan").getDocument()
        let legacy = try await (profile, goal, plan)
        let hasLegacy = [legacy.0, legacy.1, legacy.2].contains { $0.exists && $0.data()?["deleted"] as? Bool != true }
        var state = MobileFoundationState.newRunner
        if hasLegacy {
            state.onboarding = .init(status: .completed, completedSteps: MobileOnboardingStep.allCases, deferredPermissions: [.health, .calendar, .notifications])
            state.route = .today
            state.migration = .init(source: .kineticCompanionV1, status: .completed, legacyRevision: 1)
        }
        state = try state.validated()
        try await save(state, expectedRevision: nil)
        return state
        #else
        throw MobileFoundationStoreError.unavailable
        #endif
    }

    func save(_ state: MobileFoundationState, expectedRevision: Int?) async throws {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let uid = Auth.auth().currentUser?.uid else { throw MobileFoundationStoreError.signedOut }
        let valid = try state.validated()
        let encoded = try Self.encodeState(valid)
        let root = Firestore.firestore().collection("users").document(uid).collection("kinetic")
        let refs = [root.document("onboarding"), root.document("settings")]
        _ = try await Firestore.firestore().runTransaction { transaction, errorPointer in
            do {
                if let expectedRevision {
                    for ref in refs {
                        let existing = try transaction.getDocument(ref).data()
                        if let existing, let current = try Self.decodeState(existing), current.revision != expectedRevision {
                            throw MobileFoundationStoreError.revisionConflict
                        }
                    }
                }
                let envelope: [String: Any] = [
                    "schemaVersion": 1, "payload": encoded, "deleted": false,
                    "clientUpdatedAt": MobileTodayDate.isoString(Date()),
                    "serverUpdatedAt": FieldValue.serverTimestamp()
                ]
                refs.forEach { transaction.setData(envelope, forDocument: $0) }
            } catch { errorPointer?.pointee = error as NSError }
            return nil
        }
        #else
        throw MobileFoundationStoreError.unavailable
        #endif
    }

    func deleteTrainingData(from state: MobileFoundationState) async throws -> MobileFoundationState {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let uid = Auth.auth().currentUser?.uid else { throw MobileFoundationStoreError.signedOut }
        let training = MobileFoundationDomain.trainingData
        var boundary = state
        boundary.revision += 1
        boundary.deletion = .init(requestedAt: MobileTodayDate.isoString(Date()), scope: .trainingData, pendingDomains: training)
        try await save(boundary, expectedRevision: state.revision)
        let root = Firestore.firestore().collection("users").document(uid).collection("kinetic")
        for domain in training {
            try await root.document(domain.rawValue).setData([
                "schemaVersion": 1, "deleted": true,
                "clientUpdatedAt": MobileTodayDate.isoString(Date()),
                "serverUpdatedAt": FieldValue.serverTimestamp()
            ])
            boundary.deletion.pendingDomains.removeAll { $0 == domain }
            boundary.revision += 1
            try await save(boundary, expectedRevision: boundary.revision - 1)
        }
        boundary.deletion = .init(requestedAt: nil, scope: .none, pendingDomains: [])
        boundary.revision += 1
        try await save(boundary, expectedRevision: boundary.revision - 1)
        return boundary
        #else
        throw MobileFoundationStoreError.unavailable
        #endif
    }

    func beginAccountDeletion(from state: MobileFoundationState) async throws -> MobileFoundationState {
        let boundary = try state.requestingAccountDeletion(at: MobileTodayDate.isoString(Date()))
        try await save(boundary, expectedRevision: state.revision)
        return boundary
    }

    #if canImport(FirebaseFirestore)
    private static func encodeState(_ state: MobileFoundationState) throws -> [String: Any] {
        let encoder = JSONEncoder()
        let value = try JSONSerialization.jsonObject(with: encoder.encode(state))
        guard let object = value as? [String: Any] else { throw MobileFoundationStoreError.invalidState }
        return object
    }

    private static func decodeState(_ document: [String: Any]?) throws -> MobileFoundationState? {
        guard let document, document["deleted"] as? Bool != true else { return nil }
        let object: Any = document["payload"] ?? document
        guard let dictionary = object as? [String: Any] else { throw MobileFoundationStoreError.invalidState }
        guard let schema = dictionary["schema_version"] as? String else { return nil }
        guard schema == mobileFoundationSchema else { throw MobileFoundationStoreError.invalidState }
        guard JSONSerialization.isValidJSONObject(object) else { throw MobileFoundationStoreError.invalidState }
        do { return try MobileFoundationState.decodeStrict(JSONSerialization.data(withJSONObject: object)) }
        catch { throw MobileFoundationStoreError.invalidState }
    }

    private static func jsonValue(_ value: Any) -> Any {
        if let timestamp = value as? Timestamp { return MobileTodayDate.isoString(timestamp.dateValue()) }
        if let date = value as? Date { return MobileTodayDate.isoString(date) }
        if let dictionary = value as? [String: Any] {
            return dictionary.mapValues(jsonValue)
        }
        if let array = value as? [Any] { return array.map(jsonValue) }
        if value is NSNull || value is String || value is NSNumber { return value }
        return String(describing: value)
    }
    #endif
}
