import Foundation

enum ReadinessSource: String, Codable {
    case manual
    case appleHealthCsv = "apple_health_csv"
    case healthkit
    case demo
    case mixed
}

struct ReadinessEntry: Codable, Equatable {
    var date: String
    var sleepHours: Double?
    var hrv: Double?
    var restingHeartRate: Double?
    var fatigueLevel: Int?
    var sorenessLevel: Int?
    var source: ReadinessSource?
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case date
        case sleepHours = "sleep_hours"
        case hrv
        case restingHeartRate = "resting_hr"
        case fatigueLevel = "fatigue_level"
        case sorenessLevel = "soreness_level"
        case source
        case updatedAt = "updated_at"
    }
}

struct ReadinessLog: Codable, Equatable {
    var entries: [String: ReadinessEntry]
}

struct PersistedEnvelope<Payload: Codable>: Codable {
    var schemaVersion: Int
    var payload: Payload?
    var deleted: Bool
    var clientUpdatedAt: Date
}

enum HealthProvider: String, Codable {
    case appleHealth = "apple_health"
}

enum HealthSyncSchema: String, Codable {
    case v1 = "health-sync.v1"
}

enum PermissionState: String, Codable {
    case notDetermined = "not_determined"
    case denied
    case partial
    case granted
}

enum MetricPermission: String, Codable {
    case notDetermined = "not_determined"
    case denied
    case granted
}

enum BackgroundDeliveryState: String, Codable {
    case unknown
    case enabled
    case disabled
    case stale
}

enum DailySyncStatus: String, Codable {
    case synced
    case partial
    case skippedExistingUserEntry = "skipped_existing_user_entry"
    case failed
    case deleted
}

enum CoverageState: String, Codable {
    case complete
    case partial
    case missing
    case notPermitted = "not_permitted"
}

enum ConfidenceBucket: String, Codable {
    case low
    case moderate
    case high
}

enum SyncConflict: String, Codable, Equatable {
    case none
    case manualWins = "manual_wins"
    case csvWins = "csv_wins"
    case healthkitUpdate = "healthkit_update"
    case staleHealthkit = "stale_healthkit"
}

enum HealthMetric: String, Codable, CaseIterable {
    case sleep
    case hrv
    case restingHeartRate = "resting_hr"
}

struct DailyHealthSyncStatus: Codable, Equatable {
    var status: DailySyncStatus
    var confidence: ConfidenceBucket
    var coverage: [String: CoverageState]
    var conflict: SyncConflict
}

struct HealthSyncPayload: Codable, Equatable {
    var provider: HealthProvider
    var schema: HealthSyncSchema
    var permissionState: PermissionState
    var metricPermissions: [String: MetricPermission]
    var lastAttemptedSyncAt: Date
    var lastSuccessfulSyncAt: Date?
    var latestReadinessDate: String?
    var backgroundDelivery: BackgroundDeliveryState
    var dailyStatus: [String: DailyHealthSyncStatus]
    var lastErrorCode: String?

    enum CodingKeys: String, CodingKey {
        case provider
        case schema
        case permissionState = "permission_state"
        case metricPermissions = "metric_permissions"
        case lastAttemptedSyncAt = "last_attempted_sync_at"
        case lastSuccessfulSyncAt = "last_successful_sync_at"
        case latestReadinessDate = "latest_readiness_date"
        case backgroundDelivery = "background_delivery"
        case dailyStatus = "daily_status"
        case lastErrorCode = "last_error_code"
    }
}
