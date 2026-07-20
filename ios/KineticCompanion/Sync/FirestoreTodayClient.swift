import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

enum FirestoreTodayError: Error {
    case signedOut
    case unavailable
    case invalidDomain(String)
}

struct MobileTodaySharedState {
    var profilePresent: Bool
    var intakeProfile: MobileIntakeProfileSnapshot?
    var goal: TodayGoal?
    var plan: TodaySavedPlan?
    var readiness: ReadinessLog?
    var healthSync: HealthSyncPayload?
    var calendar: MobileTodayCalendarInput?
    var preferences: [TodayPreference]
    var workouts: [TodayWorkoutLogEntry]

    func buildContext(now: Date = Date()) -> MobileTodayBuildContext {
        MobileTodayBuildContext(
            profilePresent: profilePresent,
            goal: goal,
            savedPlan: plan,
            readinessLog: readiness,
            healthSync: healthSync,
            calendar: calendar,
            learnedPreferences: preferences,
            workoutLog: workouts,
            now: now
        )
    }
}

struct MobileIntakeProfileSnapshot: Codable, Equatable {
    var experienceLevel: MobileIntakeExperience?
    var preferredTrainingDays: [MobileIntakeDay]

    enum CodingKeys: String, CodingKey {
        case experienceLevel = "experience_level"
        case preferredTrainingDays = "preferred_training_days"
    }

    init(
        experienceLevel: MobileIntakeExperience?,
        preferredTrainingDays: [MobileIntakeDay]
    ) {
        self.experienceLevel = experienceLevel
        self.preferredTrainingDays = preferredTrainingDays
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        experienceLevel = try container.decodeIfPresent(
            MobileIntakeExperience.self,
            forKey: .experienceLevel
        )
        preferredTrainingDays = try container.decodeIfPresent(
            [MobileIntakeDay].self,
            forKey: .preferredTrainingDays
        ) ?? []
    }
}

protocol MobileTodayStateReading {
    func readTodayState(now: Date) async throws -> MobileTodaySharedState
}

final class FirestoreMobileTodayStateReader: MobileTodayStateReading {
    private let calendarCache: MobileTodayCalendarCaching

    init(
        calendarCache: MobileTodayCalendarCaching = UserDefaultsMobileTodayCalendarCache()
    ) {
        self.calendarCache = calendarCache
    }

    func readTodayState(now: Date = Date()) async throws -> MobileTodaySharedState {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreTodayError.signedOut
        }
        let root = Firestore.firestore()
            .collection("users")
            .document(userId)
            .collection("kinetic")

        let profile = try await root.document("profile").getDocument()
        let goal = try await root.document("goal").getDocument()
        let plan = try await root.document("plan").getDocument()
        let readiness = try await root.document("readiness").getDocument()
        let healthSync = try await root.document("health_sync").getDocument()
        let workouts = try await root.document("workouts").getDocument()
        let preferences = try await root.document("preferences").getDocument()
        let calendarSync = try await root.document("calendar_sync").getDocument()
        let calendarFailure = try await root.document("calendar_failure").getDocument()

        let localCalendar = calendarInput(
            local: calendarCache.load(now: now),
            success: try decodeStringPayload(calendarSync.data(), domain: "calendar_sync"),
            failure: try decodeStringPayload(calendarFailure.data(), domain: "calendar_failure"),
            now: now
        )
        let preferenceLog: TodayPreferenceLog? = try decodePayload(
            preferences.data(),
            domain: "preferences"
        )
        let workoutLog: TodayWorkoutLog? = try decodePayload(
            workouts.data(),
            domain: "workouts"
        )
        let intakeProfile: MobileIntakeProfileSnapshot? = try decodePayload(
            profile.data(),
            domain: "profile"
        )

        return MobileTodaySharedState(
            profilePresent: intakeProfile != nil,
            intakeProfile: intakeProfile,
            goal: try decodePayload(goal.data(), domain: "goal"),
            plan: try decodePayload(plan.data(), domain: "plan"),
            readiness: try decodePayload(readiness.data(), domain: "readiness"),
            healthSync: try decodePayload(healthSync.data(), domain: "health_sync"),
            calendar: localCalendar,
            preferences: preferenceLog.map { Array($0.preferences.values) } ?? [],
            workouts: workoutLog?.entries ?? []
        )
        #else
        throw FirestoreTodayError.unavailable
        #endif
    }

    #if canImport(FirebaseFirestore)
    private func hasPayload(
        _ document: [String: Any]?,
        domain: String
    ) throws -> Bool {
        guard let document else { return false }
        if document["deleted"] as? Bool == true { return false }
        guard document["schemaVersion"] as? Int == 1 else {
            throw FirestoreTodayError.invalidDomain(domain)
        }
        return document["payload"] != nil && !(document["payload"] is NSNull)
    }

    private func decodePayload<Payload: Decodable>(
        _ document: [String: Any]?,
        domain: String
    ) throws -> Payload? {
        guard try hasPayload(document, domain: domain), let payload = document?["payload"] else {
            return nil
        }
        guard JSONSerialization.isValidJSONObject(payload) else {
            throw FirestoreTodayError.invalidDomain(domain)
        }
        do {
            return try Self.decoder.decode(
                Payload.self,
                from: JSONSerialization.data(withJSONObject: payload)
            )
        } catch {
            throw FirestoreTodayError.invalidDomain(domain)
        }
    }

    private func decodeStringPayload(
        _ document: [String: Any]?,
        domain: String
    ) throws -> String? {
        guard try hasPayload(document, domain: domain) else { return nil }
        guard let payload = document?["payload"] as? String else {
            throw FirestoreTodayError.invalidDomain(domain)
        }
        return payload
    }
    #endif

    private func calendarInput(
        local: MobileTodayCalendarInput?,
        success: String?,
        failure: String?,
        now: Date
    ) -> MobileTodayCalendarInput? {
        guard var local else { return nil }
        if local.bypassCloudFreshnessForQA {
            return local
        }
        if let successDate = success.flatMap(MobileTodayDate.parse) {
            local.ageHours = max(0, now.timeIntervalSince(successDate) / 3600)
        }
        if
            let failureDate = failure.flatMap(MobileTodayDate.parse),
            success.flatMap(MobileTodayDate.parse).map({ failureDate > $0 }) ?? true
        {
            local.unhealthy = true
        }
        return local
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
