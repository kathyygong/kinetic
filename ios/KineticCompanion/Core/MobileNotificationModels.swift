import Foundation

let mobileNotificationSchema = "mobile-notification.v1"
let eveningCheckinTitle = "Kinetic check-in"
let eveningCheckinBody = "Take a moment to update today."

enum MobileNotificationPermission: String, Codable { case notDetermined = "not_determined", denied, authorized, provisional }
enum MobileNotificationCheckinState: String, Codable { case notApplicable = "not_applicable", pending, completed, skipped }
enum MobileNotificationAction: String, Codable { case requestPermission = "request_permission", schedule, cancel, none }
enum MobileNotificationReason: String, Codable { case userOptInRequired = "user_opt_in_required", permissionRequired = "permission_required", permissionDenied = "permission_denied", noPlannedWorkout = "no_planned_workout", checkinComplete = "checkin_complete", checkinSkipped = "checkin_skipped", targetElapsed = "target_elapsed", eligible }

struct MobileNotificationRequest: Codable, Equatable {
    var schemaVersion: String; var platform: String; var kind: String; var localDay: String
    var now: String; var targetAt: String; var enabled: Bool; var permission: MobileNotificationPermission
    var hasPlannedWorkout: Bool; var checkinState: MobileNotificationCheckinState; var existingRequest: Bool
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", platform, kind, localDay = "local_day", now, targetAt = "target_at", enabled, permission, hasPlannedWorkout = "has_planned_workout", checkinState = "checkin_state", existingRequest = "existing_request" }
}

struct MobileNotificationDecision: Codable, Equatable {
    var schemaVersion = mobileNotificationSchema; var action: MobileNotificationAction; var reason: MobileNotificationReason
    var notificationIdentifier: String?; var targetAt: String?; var title: String?; var body: String?; var lockScreenCopy = "generic"
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", action, reason, notificationIdentifier = "notification_identifier", targetAt = "target_at", title, body, lockScreenCopy = "lock_screen_copy" }
}

enum MobileNotificationContract {
    static func decide(_ request: MobileNotificationRequest) throws -> MobileNotificationDecision {
        guard request.schemaVersion == mobileNotificationSchema, request.platform == "ios", request.kind == "evening_checkin",
              request.localDay.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              request.targetAt.hasPrefix(request.localDay), ISO8601DateFormatter().date(from: request.now) != nil,
              let target = ISO8601DateFormatter().date(from: request.targetAt), let now = ISO8601DateFormatter().date(from: request.now) else { throw MobileFoundationValidationError.invalid("notification") }
        let identifier = "kinetic.evening-checkin.\(request.localDay)"
        func result(_ action: MobileNotificationAction, _ reason: MobileNotificationReason, _ existing: Bool = false) -> MobileNotificationDecision {
            .init(action: action, reason: reason, notificationIdentifier: existing ? identifier : nil, targetAt: nil, title: nil, body: nil)
        }
        if !request.enabled { return result(request.existingRequest ? .cancel : .none, .userOptInRequired, request.existingRequest) }
        if request.permission == .notDetermined { return result(.requestPermission, .permissionRequired) }
        if request.permission == .denied { return result(request.existingRequest ? .cancel : .none, .permissionDenied, request.existingRequest) }
        if !request.hasPlannedWorkout || request.checkinState == .notApplicable { return result(request.existingRequest ? .cancel : .none, .noPlannedWorkout, request.existingRequest) }
        if request.checkinState == .completed { return result(request.existingRequest ? .cancel : .none, .checkinComplete, request.existingRequest) }
        if request.checkinState == .skipped { return result(request.existingRequest ? .cancel : .none, .checkinSkipped, request.existingRequest) }
        if target <= now { return result(request.existingRequest ? .cancel : .none, .targetElapsed, request.existingRequest) }
        return .init(action: .schedule, reason: .eligible, notificationIdentifier: identifier, targetAt: request.targetAt, title: eveningCheckinTitle, body: eveningCheckinBody)
    }
}
