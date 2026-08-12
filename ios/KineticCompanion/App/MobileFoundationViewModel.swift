import FirebaseAuth
import FirebaseFirestore
import Foundation

#if DEBUG
private func print(_ message: String) { NSLog("%@", message) }
#endif

@MainActor
final class MobileFoundationViewModel: ObservableObject {
    enum AuthScreenState: Equatable { case restoring, signedOut, working, signedIn, failed(String) }

    @Published private(set) var authState: AuthScreenState = .restoring
    @Published private(set) var state: MobileFoundationState?
    @Published private(set) var message: String?
    @Published private(set) var isSaving = false
    @Published private(set) var trainingExport: String?
    @Published private(set) var accountDeletionNeedsReauthentication = false

    private let configured: Bool
    private let store: MobileFoundationStoring
    private let reminders: EveningReminderDelivering
    private let audit: MobileAuditTransporting
    private let accountCleanup: MobileAccountCleanupNetworking

    init(configured: Bool, store: MobileFoundationStoring = FirestoreMobileFoundationStore(), reminders: EveningReminderDelivering = LocalEveningReminderClient(), audit: MobileAuditTransporting = FirestoreMobileAuditTransport(), accountCleanup: MobileAccountCleanupNetworking = URLSessionMobileAccountCleanupClient()) {
        self.configured = configured; self.store = store; self.reminders = reminders; self.audit = audit; self.accountCleanup = accountCleanup
    }

    var isSignedIn: Bool { if case .signedIn = authState { true } else { false } }
    var route: MobileProductRoute { state?.route ?? .onboarding }

    func restore() async {
        guard configured else { authState = .failed("Firebase configuration is missing."); return }
        guard let user = Auth.auth().currentUser else { authState = .signedOut; return }
        if UserDefaults.standard.bool(forKey: Self.deletionPendingKey(user.uid)) {
            var recovery = MobileFoundationState.newRunner
            recovery.onboarding = .init(status: .completed, completedSteps: MobileOnboardingStep.allCases, deferredPermissions: MobileFoundationPermission.allCases)
            recovery.route = .settings
            state = try? recovery.requestingAccountDeletion(at: MobileTodayDate.isoString(Date()))
            authState = .signedIn
            isSaving = true
            do { try await continueAccountDeletion(password: nil) }
            catch { message = Self.accountDeletionMessage(error); accountDeletionNeedsReauthentication = true }
            isSaving = false
            return
        }
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
        do { try await store.saveOnboardingAnswers(answers, completed: true) }
        catch { message = "Your onboarding answers were not saved. Review and retry."; emit(.onboarding, .failed); return }
        next.revision += 1
        next.onboarding = .init(status: .completed, completedSteps: MobileOnboardingStep.allCases, deferredPermissions: Array(deferred).sorted { $0.rawValue < $1.rawValue })
        next.route = .today
        await persist(next, action: .onboarding)
    }

    func prepareOnboardingPreview(answers: MobileOnboardingAnswers) async -> Bool {
        do {
            try await store.saveOnboardingAnswers(try answers.validated(), completed: false)
            message = nil
            return true
        } catch {
            message = "Your planning inputs were not saved for preview. Review and retry."
            emit(.onboarding, .failed)
            return false
        }
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

    func prepareTrainingDataExport() async {
        isSaving = true
        do {
            trainingExport = try await store.exportTrainingData()
            message = "Training-data export is ready to share."
        } catch {
            trainingExport = nil
            message = "Training-data export could not be prepared. Retry when connected."
        }
        isSaving = false
    }

    func requestAccountDeletion() async {
        guard let current = state else { return }; isSaving = true; await reminders.cancelAll()
        do {
            state = try await store.beginAccountDeletion(from: current)
            if let uid = Auth.auth().currentUser?.uid { UserDefaults.standard.set(true, forKey: Self.deletionPendingKey(uid)) }
        } catch {
            message = "Account deletion was not started. Nothing was reported as deleted."; emit(.deletion, .failed)
            isSaving = false; return
        }
        do { try await continueAccountDeletion(password: nil) }
        catch { message = Self.accountDeletionMessage(error); emit(.deletion, .retry) }
        isSaving = false
    }

    func retryAccountDeletion(password: String) async {
        isSaving = true; await reminders.cancelAll()
        do {
            try await continueAccountDeletion(password: password.isEmpty ? nil : password)
        } catch {
            message = Self.accountDeletionMessage(error)
            emit(.deletion, .retry)
        }
        isSaving = false
    }

    private func continueAccountDeletion(password: String?) async throws {
        guard let user = Auth.auth().currentUser else { throw MobileFoundationStoreError.signedOut }
        let userID = user.uid
        if let password {
            guard let email = user.email else { throw MobileFoundationStoreError.invalidState }
            try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: email, password: password))
        }
        let cleanup = try await accountCleanup.perform(
            request: .make(mode: .cleanup), idToken: try await user.getIDToken()
        )
        guard cleanup.receipt.pendingDomains.isEmpty else {
            accountDeletionNeedsReauthentication = false
            message = "Account cleanup is incomplete for \(cleanup.receipt.pendingDomains.count) domains. Retry safely."
            emit(.deletion, .retry)
            return
        }
        let finalized = try await accountCleanup.perform(
            request: .make(mode: .finalizeAuth), idToken: try await user.getIDToken()
        )
        switch finalized.result {
        case .completed:
            accountDeletionNeedsReauthentication = false
            UserDefaults.standard.removeObject(forKey: Self.deletionPendingKey(userID))
            state = nil; try? Auth.auth().signOut(); authState = .signedOut
            message = "Your training domains and account were deleted."
            emit(.deletion, .success)
        case .replayed where finalized.receipt.status == .completed:
            accountDeletionNeedsReauthentication = false
            UserDefaults.standard.removeObject(forKey: Self.deletionPendingKey(userID))
            state = nil; try? Auth.auth().signOut(); authState = .signedOut
            message = "Your training domains and account were deleted."
            emit(.deletion, .success)
        case .reauthenticationRequired:
            accountDeletionNeedsReauthentication = true
            message = "For security, enter your password to finish account deletion. Cleanup is safely retained."
            emit(.deletion, .retry)
        default:
            accountDeletionNeedsReauthentication = false
            message = "Account cleanup is ready. Retry final account deletion."
            emit(.deletion, .retry)
        }
    }

    private static func accountDeletionMessage(_ error: Error) -> String {
        if let network = error as? MobilePlanNetworkError {
            return switch network.failure {
            case .authRequired: "Sign in again to resume account deletion."
            case .offline: "You are offline. Account cleanup remains retryable."
            case .timeout: "Account cleanup timed out. Retry safely."
            case .backendUnavailable: "Account cleanup is temporarily unavailable. Retry later."
            default: "Account deletion could not be finalized. Nothing was reported as deleted."
            }
        }
        let value = error as NSError
        if value.domain == AuthErrorDomain && value.code == AuthErrorCode.wrongPassword.rawValue {
            return "That password was not accepted. Cleanup remains safely retryable."
        }
        return "Account deletion remains incomplete and can be retried."
    }

    private static func deletionPendingKey(_ uid: String) -> String { "kinetic.mobile.account-deletion-pending.\(uid)" }

#if DEBUG
    func prepareQADisposableOwnerIfRequested() async -> MobileOnboardingAnswers? {
        guard ProcessInfo.processInfo.arguments.contains("-kinetic.qa-bootstrap-disposable-owner") else { return nil }
        if let current = Auth.auth().currentUser {
            guard current.email?.hasPrefix("kinetic-phase56-") == true else {
                print("KINETIC_QA_BOOTSTRAP_FAILED existing_owner")
                return nil
            }
        } else {
            let suffix = UUID().uuidString.lowercased()
            let email = "kinetic-phase56-\(suffix)@example.com"
            let password = "Kinetic-QA-\(suffix.prefix(12))!"
            await createAccount(email: email, password: password)
        }
        guard isSignedIn else {
            print("KINETIC_QA_BOOTSTRAP_FAILED create_account")
            return nil
        }

        let target = Calendar(identifier: .gregorian).date(byAdding: .day, value: 84, to: Date()) ?? Date()
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return MobileOnboardingAnswers(
            raceDistance: "10k",
            targetDate: formatter.string(from: target),
            experience: "intermediate",
            weeklyMileage: 20,
            preferredDays: ["tue", "thu", "sat", "sun"],
            personalBests: ["10k": 3_600],
            weeklyAvailability: [
                .init(day: .tue, availableMinutes: 45, easyOnly: true),
                .init(day: .thu, availableMinutes: 60, easyOnly: false),
                .init(day: .sat, availableMinutes: 45, easyOnly: true),
                .init(day: .sun, availableMinutes: 120, easyOnly: false),
            ]
        )
    }

    func runQADeletionMatrix(plan: MobilePlanViewModel) async {
        guard let before = state, let userId = Auth.auth().currentUser?.uid else {
            print("KINETIC_QA_DELETION_FAILED missing_owner")
            return
        }
        await deleteTrainingData()
        guard let trainingDeleted = state,
              trainingDeleted.accountState == .active,
              trainingDeleted.onboarding == before.onboarding,
              trainingDeleted.permissions == before.permissions,
              trainingDeleted.settings == before.settings,
              trainingDeleted.migration == before.migration,
              trainingDeleted.deletion.scope == .none,
              trainingDeleted.deletion.pendingDomains.isEmpty else {
            print("KINETIC_QA_DELETION_FAILED retained_foundation")
            return
        }
        do {
            let root = Firestore.firestore().collection("users").document(userId).collection("kinetic")
            for domain in MobileFoundationDomain.trainingData {
                let document = try await root.document(domain.rawValue).getDocument()
                guard document.data()?["deleted"] as? Bool == true else {
                    print("KINETIC_QA_DELETION_FAILED tombstone_\(domain.rawValue)")
                    return
                }
            }
            for domain in [MobileFoundationDomain.settings, .onboarding] {
                let document = try await root.document(domain.rawValue).getDocument()
                guard document.data()?["deleted"] as? Bool != true else {
                    print("KINETIC_QA_DELETION_FAILED preserved_\(domain.rawValue)")
                    return
                }
            }
            await plan.restore()
            guard plan.plan == nil, !plan.legacyPlanPresent else {
                print("KINETIC_QA_DELETION_FAILED plan_readback")
                return
            }
            guard await qaValidateAccountDeletionBoundary(userId: userId) else { return }
            print("KINETIC_QA_DELETION_SUCCESS training_tombstones=9 account_boundary=retryable auth_identity=retained")
        } catch {
            print("KINETIC_QA_DELETION_FAILED \(String(describing: error))")
        }
    }

    func runQAAccountDeletionBoundaryReadback() async {
        guard let userId = Auth.auth().currentUser?.uid else {
            print("KINETIC_QA_ACCOUNT_BOUNDARY_FAILED missing_owner")
            return
        }
        if await qaValidateAccountDeletionBoundary(userId: userId) {
            print("KINETIC_QA_ACCOUNT_BOUNDARY_SUCCESS account_boundary=retryable auth_identity=retained")
        }
    }

    private func qaValidateAccountDeletionBoundary(userId: String) async -> Bool {
        if state?.accountState == .active { await requestAccountDeletion() }
        guard let boundary = state,
              boundary.accountState == .deletionRequested,
              boundary.deletion.scope == .account,
              Set(boundary.deletion.pendingDomains) == Set(MobileFoundationDomain.allCases),
              Auth.auth().currentUser?.uid == userId else {
            let account = state?.accountState.rawValue ?? "none"
            let scope = state?.deletion.scope.rawValue ?? "none"
            let pending = state?.deletion.pendingDomains.count ?? -1
            print("KINETIC_QA_ACCOUNT_BOUNDARY_FAILED state=\(account) scope=\(scope) pending=\(pending) message=\(message ?? "none")")
            return false
        }
        do {
            let readback = try await store.restoreOrMigrate()
            guard readback.accountState == .deletionRequested,
                  readback.deletion.scope == .account,
                  Set(readback.deletion.pendingDomains) == Set(MobileFoundationDomain.allCases),
                  Auth.auth().currentUser?.uid == userId else {
                print("KINETIC_QA_ACCOUNT_BOUNDARY_FAILED boundary_readback")
                return false
            }
            return true
        } catch {
            print("KINETIC_QA_ACCOUNT_BOUNDARY_FAILED \(String(describing: error))")
            return false
        }
    }
#endif

    private func restoreFoundation(action: MobileFoundationAuditAction) async {
        do { state = try await store.restoreOrMigrate(); authState = .signedIn; emit(action, .success) }
        catch {
#if DEBUG
            authState = .failed("Your protected app state could not be restored safely. QA detail: \(Self.restoreDetail(error))")
#else
            authState = .failed("Your protected app state could not be restored safely.")
#endif
            emit(action, .failed)
        }
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

    private static func restoreDetail(_ error: Error) -> String {
        if let failure = error as? MobileFoundationStoreError {
            return switch failure {
            case .signedOut: "signed_out"
            case .unavailable: "store_unavailable"
            case .invalidState: "invalid_saved_state"
            case .revisionConflict: "paired_revision_conflict"
            }
        }
        let value = error as NSError
        return "\(value.domain):\(value.code) \(value.localizedDescription)"
    }
}
