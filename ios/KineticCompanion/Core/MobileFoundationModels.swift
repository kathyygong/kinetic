import Foundation

let mobileFoundationSchema = "mobile-foundation.v1"

struct MobileOnboardingAnswers: Equatable {
    var raceDistance: String; var targetDate: String; var experience: String
    var weeklyMileage: Double; var preferredDays: [String]
    var personalBests: [String: Int] = [:]
    var weeklyAvailability: [MobileWeeklyAvailability] = []
    func validated() throws -> Self {
        let races = ["5k", "10k", "half", "marathon"]
        let experiences = ["beginner", "intermediate", "advanced"]
        let days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        guard races.contains(raceDistance), experiences.contains(experience),
              (0...150).contains(weeklyMileage), weeklyMileage.isFinite,
              !preferredDays.isEmpty, Set(preferredDays).count == preferredDays.count,
              preferredDays.allSatisfy(days.contains),
              Set(personalBests.keys).isSubset(of: Set(races)),
              personalBests.values.allSatisfy({ (180...86_400).contains($0) }),
              weeklyAvailability.count <= 7,
              Set(weeklyAvailability.map(\.day)).count == weeklyAvailability.count,
              targetDate.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              let date = DateFormatter.mobileFoundationDay.date(from: targetDate),
              Calendar(identifier: .gregorian).startOfDay(for: date) >= Calendar(identifier: .gregorian).startOfDay(for: Date())
        else { throw MobileFoundationValidationError.invalid("onboarding answers") }
        for value in weeklyAvailability { _ = try value.validated() }
        return self
    }
}

enum MobileAccountState: String, Codable { case active, deletionRequested = "deletion_requested", deleted }
enum MobileOnboardingStatus: String, Codable { case notStarted = "not_started", inProgress = "in_progress", readyForPlan = "ready_for_plan", completed }
enum MobileOnboardingStep: String, Codable, CaseIterable { case goal, experience, mileage, personalRecords = "personal_records", schedule }
enum MobileProductRoute: String, Codable, CaseIterable { case onboarding, today, plan, progress, settings }
enum MobileFoundationPermission: String, Codable { case health, calendar, notifications }
enum MobilePermissionState: String, Codable { case notRequested = "not_requested", denied, authorized, unavailable }
enum MobileAnalyticsState: String, Codable { case off, privacySafe = "privacy_safe" }
enum MobileMigrationSource: String, Codable { case newInstall = "new_install", kineticCompanionV1 = "kinetic_companion_v1" }
enum MobileMigrationState: String, Codable { case notNeeded = "not_needed", pending, completed, failed }
enum MobileDeletionScope: String, Codable { case none, trainingData = "training_data", account }
enum MobileFoundationDomain: String, Codable, CaseIterable {
    case profile, goal, plan, planHistory = "plan_history", planOperations = "plan_operations"
    case readiness, workouts, preferences, settings, onboarding, mobileAudit = "mobile_audit"

    static let trainingData: [Self] = [
        .profile, .goal, .plan, .planHistory, .planOperations,
        .readiness, .workouts, .preferences, .mobileAudit
    ]
}

struct MobileOnboardingState: Codable, Equatable {
    var status: MobileOnboardingStatus
    var completedSteps: [MobileOnboardingStep]
    var deferredPermissions: [MobileFoundationPermission]
    enum CodingKeys: String, CodingKey { case status, completedSteps = "completed_steps", deferredPermissions = "deferred_permissions" }
}

struct MobilePermissionStates: Codable, Equatable {
    var health: MobilePermissionState
    var calendar: MobilePermissionState
    var notifications: MobilePermissionState
    subscript(_ permission: MobileFoundationPermission) -> MobilePermissionState {
        get { switch permission { case .health: health; case .calendar: calendar; case .notifications: notifications } }
        set { switch permission { case .health: health = newValue; case .calendar: calendar = newValue; case .notifications: notifications = newValue } }
    }
}

struct MobileEveningReminder: Codable, Equatable {
    var enabled: Bool
    var localHour: Int
    var localMinute: Int
    var delivery = "local_only"
    var lockScreenCopy = "generic"
    enum CodingKeys: String, CodingKey { case enabled, localHour = "local_hour", localMinute = "local_minute", delivery, lockScreenCopy = "lock_screen_copy" }
}

struct MobileFoundationSettings: Codable, Equatable {
    var eveningCheckinReminder: MobileEveningReminder
    var analytics: MobileAnalyticsState
    enum CodingKeys: String, CodingKey { case eveningCheckinReminder = "evening_checkin_reminder", analytics }
}

struct MobileMigration: Codable, Equatable {
    var source: MobileMigrationSource
    var status: MobileMigrationState
    var legacyRevision: Int?
    enum CodingKeys: String, CodingKey { case source, status, legacyRevision = "legacy_revision" }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(source, forKey: .source); try container.encode(status, forKey: .status)
        if let legacyRevision { try container.encode(legacyRevision, forKey: .legacyRevision) } else { try container.encodeNil(forKey: .legacyRevision) }
    }
}

struct MobileDeletion: Codable, Equatable {
    var requestedAt: String?
    var scope: MobileDeletionScope
    var pendingDomains: [MobileFoundationDomain]
    enum CodingKeys: String, CodingKey { case requestedAt = "requested_at", scope, pendingDomains = "pending_domains" }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let requestedAt { try container.encode(requestedAt, forKey: .requestedAt) } else { try container.encodeNil(forKey: .requestedAt) }
        try container.encode(scope, forKey: .scope); try container.encode(pendingDomains, forKey: .pendingDomains)
    }
}

enum MobileFoundationValidationError: Error, Equatable { case invalid(String) }

struct MobileFoundationState: Codable, Equatable {
    var schemaVersion: String
    var revision: Int
    var accountState: MobileAccountState
    var onboarding: MobileOnboardingState
    var route: MobileProductRoute
    var permissions: MobilePermissionStates
    var settings: MobileFoundationSettings
    var migration: MobileMigration
    var deletion: MobileDeletion

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", revision, accountState = "account_state"
        case onboarding, route, permissions, settings, migration, deletion
    }

    static var newRunner: Self {
        .init(
            schemaVersion: mobileFoundationSchema, revision: 1, accountState: .active,
            onboarding: .init(status: .notStarted, completedSteps: [], deferredPermissions: MobileFoundationPermission.allCases),
            route: .onboarding,
            permissions: .init(health: .notRequested, calendar: .notRequested, notifications: .notRequested),
            settings: .init(eveningCheckinReminder: .init(enabled: false, localHour: 19, localMinute: 0), analytics: .off),
            migration: .init(source: .newInstall, status: .notNeeded, legacyRevision: nil),
            deletion: .init(requestedAt: nil, scope: .none, pendingDomains: [])
        )
    }

    static func decodeStrict(_ data: Data) throws -> Self {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw MobileFoundationValidationError.invalid("structure") }
        try exact(root, ["schema_version", "revision", "account_state", "onboarding", "route", "permissions", "settings", "migration", "deletion"])
        try exactObject(root["onboarding"], ["status", "completed_steps", "deferred_permissions"])
        try exactObject(root["permissions"], ["health", "calendar", "notifications"])
        guard let settings = root["settings"] as? [String: Any] else { throw MobileFoundationValidationError.invalid("settings") }
        try exact(settings, ["evening_checkin_reminder", "analytics"])
        try exactObject(settings["evening_checkin_reminder"], ["enabled", "local_hour", "local_minute", "delivery", "lock_screen_copy"])
        try exactObject(root["migration"], ["source", "status", "legacy_revision"])
        try exactObject(root["deletion"], ["requested_at", "scope", "pending_domains"])
        return try JSONDecoder().decode(Self.self, from: data).validated()
    }

    private static func exactObject(_ value: Any?, _ keys: Set<String>) throws {
        guard let object = value as? [String: Any] else { throw MobileFoundationValidationError.invalid("structure") }
        try exact(object, keys)
    }

    private static func exact(_ value: [String: Any], _ keys: Set<String>) throws {
        guard Set(value.keys) == keys else {
            throw MobileFoundationValidationError.invalid("unknown keys: \(Set(value.keys).symmetricDifference(keys).sorted().joined(separator: ","))")
        }
    }

    func validated() throws -> Self {
        guard schemaVersion == mobileFoundationSchema, revision > 0 else { throw MobileFoundationValidationError.invalid("schema") }
        guard Set(onboarding.completedSteps).count == onboarding.completedSteps.count,
              Set(onboarding.deferredPermissions).count == onboarding.deferredPermissions.count,
              Set(deletion.pendingDomains).count == deletion.pendingDomains.count else { throw MobileFoundationValidationError.invalid("duplicates") }
        guard (0...23).contains(settings.eveningCheckinReminder.localHour),
              (0...59).contains(settings.eveningCheckinReminder.localMinute),
              settings.eveningCheckinReminder.delivery == "local_only",
              settings.eveningCheckinReminder.lockScreenCopy == "generic" else { throw MobileFoundationValidationError.invalid("reminder") }
        if settings.eveningCheckinReminder.enabled && permissions.notifications != .authorized { throw MobileFoundationValidationError.invalid("reminder permission") }
        if migration.source == .newInstall && (migration.status != .notNeeded || migration.legacyRevision != nil) { throw MobileFoundationValidationError.invalid("migration") }
        if migration.source == .kineticCompanionV1 && (migration.status == .notNeeded || migration.legacyRevision == nil) { throw MobileFoundationValidationError.invalid("legacy migration") }
        if deletion.scope == .none && (deletion.requestedAt != nil || !deletion.pendingDomains.isEmpty) { throw MobileFoundationValidationError.invalid("deletion") }
        if deletion.scope != .none && deletion.requestedAt == nil { throw MobileFoundationValidationError.invalid("deletion timestamp") }
        if accountState == .active && deletion.scope == .account { throw MobileFoundationValidationError.invalid("account deletion") }
        if accountState == .deletionRequested && (deletion.scope != .account || Set(deletion.pendingDomains) != Set(MobileFoundationDomain.allCases)) { throw MobileFoundationValidationError.invalid("account boundary") }
        if accountState == .deleted && (!deletion.pendingDomains.isEmpty || deletion.scope != .account) { throw MobileFoundationValidationError.invalid("deleted receipt") }
        if onboarding.status == .completed && Set(onboarding.completedSteps) != Set(MobileOnboardingStep.allCases) { throw MobileFoundationValidationError.invalid("onboarding steps") }
        if route != .onboarding && onboarding.status != .completed { throw MobileFoundationValidationError.invalid("route") }
        return self
    }

    func requestingAccountDeletion(at timestamp: String) throws -> Self {
        guard accountState == .active, ISO8601DateFormatter().date(from: timestamp) != nil else { throw MobileFoundationValidationError.invalid("account deletion request") }
        var copy = self
        copy.revision += 1
        copy.accountState = .deletionRequested
        copy.route = .settings
        copy.settings.eveningCheckinReminder.enabled = false
        copy.deletion = .init(requestedAt: timestamp, scope: .account, pendingDomains: MobileFoundationDomain.allCases)
        return try copy.validated()
    }
}

extension MobileFoundationPermission: CaseIterable {}

private extension DateFormatter {
    static let mobileFoundationDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }()
}
