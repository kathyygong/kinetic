import FirebaseAuth
import SwiftUI

enum CompanionAuthState: Equatable {
    case missingConfiguration
    case signedOut
    case working
    case signedIn
    case failed
}

enum HealthAccessState: Equatable {
    case notRequested
    case requesting
    case unavailable
    case denied
    case partial
    case granted
    case failed

    var label: String {
        switch self {
        case .notRequested: "Not requested"
        case .requesting: "Requesting"
        case .unavailable: "Unavailable"
        case .denied: "Denied"
        case .partial: "Partial"
        case .granted: "Granted"
        case .failed: "Failed"
        }
    }
}

enum CloudSyncState: Equatable {
    case idle
    case syncing
    case synced
    case deleted
    case failed

    var label: String {
        switch self {
        case .idle: "Not attempted"
        case .syncing: "Syncing"
        case .synced: "Synced"
        case .deleted: "Training data deleted"
        case .failed: "Retry available"
        }
    }
}

@MainActor
final class TodayViewModel: ObservableObject {
    @Published private(set) var authState: CompanionAuthState
    @Published private(set) var idTokenVerified = false
    @Published private(set) var healthState = HealthAccessState.notRequested
    @Published private(set) var cloudState = CloudSyncState.idle
    @Published private(set) var cloudErrorCode: String?
    @Published private(set) var dailySummary: HealthKitReadinessSummary?

    private let firebaseConfigured: Bool
    private let healthStore: ReadinessProviding
    private let syncClient: ReadinessSyncing

    init(
        firebaseConfigured: Bool,
        healthStore: ReadinessProviding = HealthKitReadinessStore(),
        syncClient: ReadinessSyncing = FirestoreReadinessSyncClient()
    ) {
        self.firebaseConfigured = firebaseConfigured
        self.healthStore = healthStore
        self.syncClient = syncClient
        authState = firebaseConfigured ? .signedOut : .missingConfiguration
    }

    var isSignedIn: Bool {
        authState == .signedIn
    }

    func restoreSession() async {
        guard firebaseConfigured, let user = Auth.auth().currentUser else { return }
        await verifyToken(for: user)
    }

    func signIn(email: String, password: String) async {
        guard firebaseConfigured else { return }
        authState = .working
        idTokenVerified = false
        do {
            let result = try await Auth.auth().signIn(withEmail: email, password: password)
            await verifyToken(for: result.user)
        } catch {
            authState = .failed
        }
    }

    func signOut() {
        try? Auth.auth().signOut()
        authState = firebaseConfigured ? .signedOut : .missingConfiguration
        idTokenVerified = false
        healthState = .notRequested
        cloudState = .idle
        cloudErrorCode = nil
        dailySummary = nil
    }

    func readAndSyncToday() async {
        guard isSignedIn else { return }
        healthState = .requesting
        cloudState = .idle
        cloudErrorCode = nil

        do {
            _ = try await healthStore.requestAuthorization()
            let summary = try await healthStore.summarizeLocalDay(Date())
            dailySummary = summary
            healthState = switch summary.permissionState {
            case .denied: .denied
            case .partial, .notDetermined: .partial
            case .granted: .granted
            }

            cloudState = .syncing
            do {
                let outcome = try await syncClient.syncHealthKitSummary(summary)
                switch outcome {
                case .synced:
                    cloudState = .synced
                case .trainingDataDeleted:
                    dailySummary = nil
                    cloudState = .deleted
                }
            } catch {
                // The local summary remains visible and can be retried later.
                let cloudError = error as NSError
                cloudErrorCode = "\(cloudError.domain):\(cloudError.code)"
                cloudState = .failed
            }
        } catch HealthKitReadinessError.unavailable {
            healthState = .unavailable
        } catch {
            healthState = .failed
        }
    }

    private func verifyToken(for user: User) async {
        do {
            let token = try await user.getIDToken()
            idTokenVerified = !token.isEmpty
            authState = idTokenVerified ? .signedIn : .failed
        } catch {
            idTokenVerified = false
            authState = .failed
        }
    }
}

struct TodayView: View {
    @ObservedObject var viewModel: TodayViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isSignedIn {
                    signedInContent
                } else {
                    signedOutContent
                }
            }
            .navigationTitle("Health sync")
            .toolbar {
                if viewModel.isSignedIn {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            viewModel.signOut()
                        } label: {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                        }
                        .accessibilityLabel("Sign out")
                    }
                }
            }
        }
    }

    private var signedOutContent: some View {
        Form {
            Section("Firebase") {
                if viewModel.authState == .missingConfiguration {
                    Label("Configuration missing", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(KineticColor.amber)
                    Text("Add the untracked GoogleService-Info.plist to this app target.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                        .textContentType(.password)

                    Button {
                        Task {
                            await viewModel.signIn(email: email, password: password)
                            password = ""
                        }
                    } label: {
                        Label("Sign in", systemImage: "person.crop.circle.badge.checkmark")
                    }
                    .disabled(
                        email.isEmpty ||
                            password.isEmpty ||
                            viewModel.authState == .working
                    )

                    if viewModel.authState == .working {
                        ProgressView("Verifying Firebase session")
                    } else if viewModel.authState == .failed {
                        Label("Sign-in failed", systemImage: "xmark.circle")
                            .foregroundStyle(KineticColor.rose)
                        Text("Check the disposable test account and network, then retry.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Protected data") {
                Text("Health data is hidden until Firebase authentication succeeds.")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var signedInContent: some View {
        List {
            Section("Auth gate") {
                statusRow(
                    title: "Firebase user",
                    value: "Authenticated",
                    systemImage: "person.crop.circle.badge.checkmark",
                    color: KineticColor.emerald
                )
                statusRow(
                    title: "ID token",
                    value: viewModel.idTokenVerified ? "Verified" : "Unavailable",
                    systemImage: "key",
                    color: viewModel.idTokenVerified ? KineticColor.emerald : KineticColor.rose
                )
                Text("Firestore writes use the current Firebase UID owner boundary.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Apple Health") {
                statusRow(
                    title: "Read access",
                    value: viewModel.healthState.label,
                    systemImage: "heart.text.square",
                    color: healthColor
                )
                Text(healthDetail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Button {
                    Task { await viewModel.readAndSyncToday() }
                } label: {
                    Label(
                        syncButtonLabel,
                        systemImage: "arrow.triangle.2.circlepath"
                    )
                }
                .disabled(
                    viewModel.healthState == .requesting ||
                        viewModel.cloudState == .syncing ||
                        viewModel.cloudState == .deleted
                )
            }

            if let summary = viewModel.dailySummary {
                Section("Local daily summary") {
                    LabeledContent("Date", value: summary.date)
                    metricRow(
                        "Sleep",
                        value: summary.entry?.sleepHours,
                        unit: "h",
                        coverage: summary.dailyStatus.coverage[HealthMetric.sleep.rawValue]
                    )
                    metricRow(
                        "HRV",
                        value: summary.entry?.hrv,
                        unit: "ms",
                        coverage: summary.dailyStatus.coverage[HealthMetric.hrv.rawValue]
                    )
                    metricRow(
                        "Resting HR",
                        value: summary.entry?.restingHeartRate,
                        unit: "bpm",
                        coverage: summary.dailyStatus.coverage[HealthMetric.restingHeartRate.rawValue]
                    )
                    LabeledContent("Confidence", value: summary.dailyStatus.confidence.rawValue.capitalized)
                }
            }

            Section("Cloud gate") {
                statusRow(
                    title: "Firestore",
                    value: viewModel.cloudState.label,
                    systemImage: "icloud.and.arrow.up",
                    color: cloudColor
                )
                if viewModel.cloudState == .failed {
                    Text("The local summary remains usable. No plan or manual readiness data was changed.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let errorCode = viewModel.cloudErrorCode {
                        Text("Firebase diagnostic: \(errorCode)")
                            .font(.footnote.monospaced())
                            .foregroundStyle(.secondary)
                    }
                } else if viewModel.cloudState == .deleted {
                    Text("The web deletion tombstone was honored. No HealthKit summary was written back.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Privacy boundary") {
                Label("Sleep, HRV, and resting heart rate are read locally.", systemImage: "iphone")
                Label("Only one bounded daily summary is sent to Firebase.", systemImage: "checkmark.shield")
                Label("Raw samples and per-sample timestamps stay on device.", systemImage: "lock")
            }
            .font(.footnote)
        }
    }

    private var healthColor: Color {
        switch viewModel.healthState {
        case .granted: KineticColor.emerald
        case .partial: KineticColor.amber
        case .denied, .failed: KineticColor.rose
        default: KineticColor.muted
        }
    }

    private var cloudColor: Color {
        switch viewModel.cloudState {
        case .synced: KineticColor.emerald
        case .failed: KineticColor.rose
        default: KineticColor.muted
        }
    }

    private var syncButtonLabel: String {
        switch viewModel.cloudState {
        case .failed:
            "Retry today's sync"
        case .deleted:
            "Training data deleted"
        default:
            "Read and sync today"
        }
    }

    private var healthDetail: String {
        switch viewModel.healthState {
        case .notRequested:
            "Kinetic has not requested read-only HealthKit access."
        case .requesting:
            "Waiting for HealthKit and local daily queries."
        case .unavailable:
            "HealthKit is unavailable on this simulator or device."
        case .denied:
            "No read access was granted. Use the existing manual readiness fallback."
        case .partial:
            "Some metrics are missing, not shared, or not present for today."
        case .granted:
            "All three bounded daily metrics were available locally."
        case .failed:
            "The local HealthKit request failed and can be retried."
        }
    }

    @ViewBuilder
    private func statusRow(
        title: String,
        value: String,
        systemImage: String,
        color: Color
    ) -> some View {
        LabeledContent {
            Text(value)
                .foregroundStyle(color)
        } label: {
            Label(title, systemImage: systemImage)
        }
    }

    private func metricRow(
        _ label: String,
        value: Double?,
        unit: String,
        coverage: CoverageState?
    ) -> some View {
        let displayValue = value.map { "\(Self.metricFormatter.string(from: NSNumber(value: $0)) ?? "-") \(unit)" }
            ?? coverageLabel(coverage)
        return LabeledContent(label, value: displayValue)
    }

    private func coverageLabel(_ coverage: CoverageState?) -> String {
        switch coverage {
        case .notPermitted: "Not permitted"
        case .missing: "Missing"
        case .partial: "Partial"
        case .complete: "Complete"
        case .none: "Unavailable"
        }
    }

    private static let metricFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter
    }()
}
