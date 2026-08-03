import Foundation

#if canImport(UserNotifications)
import UserNotifications
#endif

protocol EveningReminderDelivering {
    func permission() async -> MobileNotificationPermission
    func requestPermission() async -> MobileNotificationPermission
    func apply(_ decision: MobileNotificationDecision) async throws
    func cancelAll() async
}

final class LocalEveningReminderClient: EveningReminderDelivering {
    func permission() async -> MobileNotificationPermission {
        #if canImport(UserNotifications)
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        switch status {
        case .authorized: return .authorized
        case .provisional, .ephemeral: return .provisional
        case .denied: return .denied
        default: return .notDetermined
        }
        #else
        return .denied
        #endif
    }

    func requestPermission() async -> MobileNotificationPermission {
        #if canImport(UserNotifications)
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        return await permission()
        #else
        return .denied
        #endif
    }

    func apply(_ decision: MobileNotificationDecision) async throws {
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        if decision.action == .cancel, let id = decision.notificationIdentifier {
            center.removePendingNotificationRequests(withIdentifiers: [id])
        } else if decision.action == .schedule, let id = decision.notificationIdentifier,
                  let target = decision.targetAt.flatMap(ISO8601DateFormatter().date(from:)) {
            let content = UNMutableNotificationContent()
            content.title = eveningCheckinTitle
            content.body = eveningCheckinBody
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: target)
            try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
        }
        #endif
    }

    func cancelAll() async {
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        let requests = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix("kinetic.evening-checkin.") })
        #endif
    }
}
