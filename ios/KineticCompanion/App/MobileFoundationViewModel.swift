import FirebaseAuth
import Foundation

@MainActor
final class MobileFoundationViewModel: ObservableObject {
    enum AuthScreenState: Equatable { case restoring, signedOut, working, signedIn, failed(String) }

    @Published private(set) var authState: AuthScreenState = .restoring
    @Published private(set) var state: MobileFoundationState?
    @Published private(set) var message: String?
    @Published private(set) var isSaving = false

    private let configured: Bool
    private let store: MobileFoundationStoring
    private let reminders: EveningReminderDelivering
    private let audit: MobileAuditTransporting

    init(configured: Bool, store: MobileFoundationStoring = FirestoreMobileFoundationStore(), reminders: EveningReminderDelivering = LocalEveningReminderClient(), audit: MobileAuditTransporting = FirestoreMobileAuditTransport()) {
        self.configured = configured; self.store = store; self.reminders = reminders; self.audit = audit
    }

    var isSignedIn: Bool { if case .signedIn = authState { true } else { false } }
    var route: MobileProductRoute { state?.route ?? .onboarding }

    func restore() async {
        guard configured else { authState = .failed("Firebase configuration is missing."); return }
        guard Auth.auth().currentUser != nil else { authState = .signedOut; return }
        await restoreFoundation(action: .session)
    }

    func signIn(email: String, password: String) async {
        authState = .working
        do { _ = try await Auth.auth().signIn(withEmail: email, password: password); await restoreFoundation(action: .session) }
        catch { authState = .failed(Self.authMessage(error)) }
    }

    func createAccount(email: String, password: String) async {
        authState = .working
        do {
            let result = try await Auth.auth().createUser(withEmail: email, password: password)
            try? await result.user.sendEmailVerification()
            state = .newRunner
            try await store.save(.newRunner, expectedRevision: nil)
            authState = .signedIn
            emit(.onboarding, .success)
        } catch { authState = .failed(Self.authMessage(error)) }
    }

    func sendPasswordReset(email: String) async {
        do { try await Auth.auth().sendPasswordReset(withEmail: email); message = "Password reset email sent." }
        catch { message = Self.authMessage(error) }
    }

    func signOut() async {
        await reminders.cancelAll()
        try? Auth.auth().signOut()
        state = nil; authState = .signedOut; message = nil
    }

    func selectRoute(_ route: MobileProductRoute) async {
        guard var next = state, next.onboarding.status == .completed else { return }
        next.revision += 1; next.route = route
        await persist(next, action: .session)
    }

    func finishOnboarding(answers: MobileOnboardingAnswers, deferred: Set<MobileFoundationPermission>) async {
        guard var next = state else { return }
        do { try await store.saveOnboardingAnswers(answers) }
        catch { message = "Your onboarding answers were not saved. Review and retry."; emit(.onboarding, .failed); return }
        next.revision += 1
        next.onboarding = .init(status: .completed, completedSteps: MobileOnboardingStep.allCases, deferredPermissions: Array(deferred).sorted { $0.rawValue < $1.rawValue })
        next.route = .today
        await persist(next, action: .onboarding)
    }

    func updatePermission(_ permission: MobileFoundationPermission, state permissionState: MobilePermissionState, deferred: Bool) async {
        guard var next = state else { return }
        next.revision += 1; next.permissions[permission] = permissionState
        if deferred { if !next.onboarding.deferredPermissions.contains(permission) { next.onboarding.deferredPermissions.append(permission) } }
        else { next.onboarding.deferredPermissions.removeAll { $0 == permission } }
        if permission == .notifications && permissionState != .authorized { next.settings.eveningCheckinReminder.enabled = false; await reminders.cancelAll() }
        await persist(next, action: .settings)
    }

    func setEveningReminder(enabled: Bool, hour: Int, minute: Int, hasPlannedWorkout: Bool) async {
        guard var next = state else { return }
        var permission = await reminders.permission()
        if enabled && permission == .notDetermined { permission = await reminders.requestPermission() }
        let foundationPermission: MobilePermissionState = switch permission { case .authorized, .provisional: .authorized; case .denied: .denied; case .notDetermined: .notRequested }
        next.permissions.notifications = foundationPermission
        next.settings.eveningCheckinReminder = .init(enabled: enabled && foundationPermission == .authorized, localHour: hour, localMinute: minute)
        next.revision += 1
        await persist(next, action: .settings)

        let now = Date(), calendar = Calendar.current
        let localDay = MobileTodayDate.localDay(now)
        let target = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: now) ?? now
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime]; formatter.timeZone = .current
        let request = MobileNotificationRequest(schemaVersion: mobileNotificationSchema, platform: "ios", kind: "evening_checkin", localDay: localDay, now: formatter.string(from: now), targetAt: formatter.string(from: target), enabled: next.settings.eveningCheckinReminder.enabled, permission: permission, hasPlannedWorkout: hasPlannedWorkout, checkinState: hasPlannedWorkout ? .pending : .notApplicable, existingRequest: true)
        if let decision = try? MobileNotificationContract.decide(request) { try? await reminders.apply(decision) }
        message = enabled && foundationPermission == .denied ? "Notifications are denied. You can enable them in iOS Settings." : nil
    }

    func deleteTrainingData() async {
        guard let current = state else { return }; isSaving = true
        do { state = try await store.deleteTrainingData(from: current); message = "Training data was deleted. Your account and settings remain."; emit(.deletion, .success) }
        catch { message = "Deletion is incomplete and can be retried."; emit(.deletion, .retry) }
        isSaving = false
    }

    func requestAccountDeletion() async {
        guard let current = state else { return }; isSaving = true; await reminders.cancelAll()
        do { state = try await store.beginAccountDeletion(from: current); message = "Deletion boundary saved. Sign in recently and retry cleanup if Firebase requires reauthentication."; emit(.deletion, .retry) }
        catch { message = "Account deletion was not started. Nothing was reported as deleted."; emit(.deletion, .failed) }
        isSaving = false
    }

    private func restoreFoundation(action: MobileFoundationAuditAction) async {
        do { state = try await store.restoreOrMigrate(); authState = .signedIn; emit(action, .success) }
        catch { authState = .failed("Your protected app state could not be restored safely."); emit(action, .failed) }
    }

    private func persist(_ next: MobileFoundationState, action: MobileFoundationAuditAction) async {
        guard let current = state else { return }; isSaving = true
        do { let valid = try next.validated(); try await store.save(valid, expectedRevision: current.revision); state = valid; emit(action, .success) }
        catch { message = "Your change was not saved. Refresh and retry."; emit(action, .failed) }
        isSaving = false
    }

    private func emit(_ action: MobileFoundationAuditAction, _ outcome: MobileFoundationAuditOutcome) {
        guard let state else { return }
        let values = [state.permissions.health, state.permissions.calendar, state.permissions.notifications]
        let aggregate: MobileFoundationPermissionAggregate = values.allSatisfy { $0 == .authorized } ? .complete : values.allSatisfy { $0 == .notRequested } ? .none : .partial
        Task { await audit.send(MobileAuditEnvelope(properties: MobileFoundationLifecycleAudit(action: action, outcome: outcome, accountState: state.accountState, permissionState: aggregate, migrationState: state.migration.status, latencyMs: 0))) }
    }

    private static func authMessage(_ error: Error) -> String {
        let code = AuthErrorCode(rawValue: (error as NSError).code)
        return switch code {
        case .invalidEmail: "Enter a valid email address."
        case .weakPassword: "Use a stronger password with at least six characters."
        case .emailAlreadyInUse: "That account already exists. Sign in or reset the password."
        case .wrongPassword, .invalidCredential, .userNotFound: "The email or password is incorrect."
        case .networkError: "You appear to be offline. Try again when connected."
        default: "Authentication failed. Try again."
        }
    }
}
