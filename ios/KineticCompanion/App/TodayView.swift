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
    @Published private(set) var todayLoading = false
    @Published private(set) var todayResult: MobileTodayLoadResult?
    @Published private(set) var todayBuildFailure: MobileTodayBuildFailure?

    private let firebaseConfigured: Bool
    private let healthStore: ReadinessProviding
    private let syncClient: ReadinessSyncing
    private let stateReader: MobileTodayStateReading
    private let decisionClient: MobileTodayDecisionNetworking
    private let cache: MobileTodayCaching
    private let audit: MobileAuditTransporting

    init(
        firebaseConfigured: Bool,
        healthStore: ReadinessProviding = HealthKitReadinessStore(),
        syncClient: ReadinessSyncing = FirestoreReadinessSyncClient(),
        stateReader: MobileTodayStateReading = FirestoreMobileTodayStateReader(),
        decisionClient: MobileTodayDecisionNetworking = URLSessionMobileTodayDecisionClient(),
        cache: MobileTodayCaching = UserDefaultsMobileTodayCache(),
        audit: MobileAuditTransporting = FirestoreMobileAuditTransport()
    ) {
        self.firebaseConfigured = firebaseConfigured
        self.healthStore = healthStore
        self.syncClient = syncClient
        self.stateReader = stateReader
        self.decisionClient = decisionClient
        self.cache = cache
        self.audit = audit
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
        todayResult = nil
        todayBuildFailure = nil
        cache.clear()
    }

    func loadToday() async {
        guard isSignedIn, let user = Auth.auth().currentUser, !todayLoading else { return }
        todayLoading = true
        todayBuildFailure = nil
        let startedAt = Date()
        let cached = cache.load()

        do {
            let shared = try await stateReader.readTodayState(now: Date())
            let contract: MobileTodayRequestContract
            do {
                contract = try MobileTodayRequestBuilder.build(shared.buildContext())
            } catch let buildFailure as MobileTodayBuildFailure {
                todayBuildFailure = buildFailure
                todayResult = MobileTodayCacheResolver.resolve(
                    cache: nil,
                    failure: .missingContext
                )
                todayLoading = false
                emitAudit(
                    result: todayResult!,
                    metadata: nil,
                    latency: startedAt,
                    validation: .notRun
                )
                return
            }

            let token: String
            do {
                token = try await user.getIDToken()
            } catch {
                todayResult = MobileTodayCacheResolver.resolve(
                    cache: cached,
                    failure: .authRequired
                )
                todayLoading = false
                emitAudit(
                    result: todayResult!,
                    metadata: contract.metadata,
                    latency: startedAt,
                    validation: .notRun
                )
                return
            }

            do {
                let response = try await decisionClient.fetchDecision(
                    request: contract.request,
                    idToken: token
                )
                let snapshot = try MobileTodayDecisionSnapshot.make(
                    contract: contract,
                    response: response
                )
                let envelope = try MobileTodayCacheEnvelope.make(snapshot: snapshot)
                try? cache.save(envelope)
                todayResult = MobileTodayCacheResolver.resolve(
                    live: snapshot,
                    cache: envelope
                )
                todayLoading = false
                emitAudit(
                    result: todayResult!,
                    metadata: contract.metadata,
                    latency: startedAt,
                    validation: .passed
                )
            } catch let requestError as MobileTodayRequestError {
                todayResult = MobileTodayCacheResolver.resolve(
                    cache: cached,
                    failure: requestError.code
                )
                todayLoading = false
                emitAudit(
                    result: todayResult!,
                    metadata: contract.metadata,
                    latency: startedAt,
                    validation: requestError.code == .invalidResponse ? .failed : .notRun
                )
            } catch {
                todayResult = MobileTodayCacheResolver.resolve(
                    cache: cached,
                    failure: .invalidResponse
                )
                todayLoading = false
                emitAudit(
                    result: todayResult!,
                    metadata: contract.metadata,
                    latency: startedAt,
                    validation: .failed
                )
            }
        } catch {
            todayResult = MobileTodayCacheResolver.resolve(
                cache: cached,
                failure: Self.classifyStateReadFailure(error)
            )
            todayLoading = false
            emitAudit(
                result: todayResult!,
                metadata: todayResult?.snapshot?.context,
                latency: startedAt,
                validation: .notRun
            )
        }
    }

    func readAndSyncToday() async {
        await readAndSyncToday(intent: .routine)
    }

    func recoverDeletedTrainingData() async {
        await readAndSyncToday(intent: .recoverDeletedData)
    }

    private func readAndSyncToday(intent: ReadinessSyncIntent) async {
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
                let outcome = switch intent {
                case .routine:
                    try await syncClient.syncHealthKitSummary(summary)
                case .recoverDeletedData:
                    try await syncClient.recoverDeletedTrainingData(summary)
                }
                switch outcome {
                case .synced, .recovered:
                    cloudState = .synced
                    await loadToday()
                case .trainingDataDeleted:
                    dailySummary = nil
                    cloudState = .deleted
                }
            } catch {
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
            if idTokenVerified {
                await loadToday()
            }
        } catch {
            idTokenVerified = false
            authState = .failed
        }
    }

    private func emitAudit(
        result: MobileTodayLoadResult,
        metadata: MobileTodayRequestMetadata?,
        latency startedAt: Date,
        validation: DeterministicValidationState
    ) {
        let failure = result.failure
        let outcome: MobileDecisionOutcome
        if failure == .timeout {
            outcome = .timeout
        } else if failure == .invalidResponse {
            outcome = .invalid
        } else if result.source == .live || result.source == .cache {
            outcome = .success
        } else {
            outcome = .failed
        }
        let snapshot = result.snapshot
        let readiness = metadata?.readinessState ?? snapshot?.context.readinessState
        let properties = MobileDecisionValidatedAudit(
            outcome: outcome,
            decisionSource: result.source,
            failureState: MobileAuditFailureState(failure),
            cacheState: result.cacheState,
            availabilitySource: metadata?.availabilitySource
                ?? snapshot?.context.availabilitySource
                ?? .missing,
            selectedAction: snapshot.map {
                SelectedActionBucket(rawValue: $0.decision.selectedAction.name.rawValue) ?? .unknown
            } ?? .unknown,
            confidenceBucket: Self.confidenceBucket(snapshot?.decision.confidence),
            calendarState: MobileCalendarState(
                rawValue: (
                    metadata?.calendarState
                        ?? snapshot?.context.calendarState
                        ?? .missing
                ).rawValue
            ) ?? .missing,
            readinessState: Self.auditReadiness(readiness),
            deterministicValidation: validation,
            hasCalendarWarning: metadata?.calendarState != .clear
                || !(snapshot?.decision.stalenessWarnings.isEmpty ?? true),
            hasRecoveryWarning: readiness != .complete,
            aiAssisted: snapshot?.explanation.source == .cachedAI,
            latencyMs: min(
                60_000,
                max(0, Int(Date().timeIntervalSince(startedAt) * 1000))
            )
        )
        Task {
            await audit.send(MobileAuditEnvelope(properties: properties))
        }
    }

    private static func confidenceBucket(_ value: Double?) -> ConfidenceBucket {
        guard let value else { return .low }
        if value >= 0.75 { return .high }
        if value >= 0.5 { return .moderate }
        return .low
    }

    private static func auditReadiness(
        _ state: MobileTodayReadinessContractState?
    ) -> MobileReadinessState {
        switch state {
        case .complete: .ready
        case .partial: .caution
        case .stale: .stale
        default: .unknown
        }
    }

    private static func classifyStateReadFailure(_ error: Error) -> MobileTodayFailureCode {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            return .offline
        }
        if nsError.domain == "FIRFirestoreErrorDomain" {
            switch nsError.code {
            case 7, 16: return .authRequired
            case 4: return .timeout
            case 14: return .offline
            default: return .unknown
            }
        }
        return error is FirestoreTodayError ? .invalidResponse : .unknown
    }
}

struct TodayView: View {
    @ObservedObject var viewModel: TodayViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var showingReconnectConfirmation = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isSignedIn {
                    signedInContent
                } else {
                    signedOutContent
                }
            }
            .navigationTitle(viewModel.isSignedIn ? "Today" : "Kinetic")
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
            Section("Sign in") {
                if viewModel.authState == .missingConfiguration {
                    Label("Firebase configuration missing", systemImage: "exclamationmark.triangle")
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
                    .disabled(email.isEmpty || password.isEmpty || viewModel.authState == .working)

                    if viewModel.authState == .working {
                        ProgressView("Verifying Firebase session")
                    } else if viewModel.authState == .failed {
                        Label("Sign-in failed", systemImage: "xmark.circle")
                            .foregroundStyle(KineticColor.rose)
                        Text("No protected Today or health data is shown while signed out.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Privacy") {
                Label("Your Firebase session gates every protected read.", systemImage: "lock.shield")
                Label("Raw HealthKit samples stay on this device.", systemImage: "heart.text.square")
            }
            .font(.footnote)
        }
    }

    private var signedInContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                todayCard
                healthCard
                privacyCard
            }
            .padding()
        }
        .background(KineticColor.canvas.ignoresSafeArea())
        .refreshable {
            await viewModel.loadToday()
        }
    }

    @ViewBuilder
    private var todayCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Today’s recommendation", systemImage: "figure.run")
                    .font(.headline)
                Spacer()
                if viewModel.todayLoading {
                    ProgressView()
                } else if let result = viewModel.todayResult {
                    sourceBadge(result)
                }
            }

            if viewModel.todayLoading && viewModel.todayResult == nil {
                ProgressView("Reading your current training context")
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if let snapshot = viewModel.todayResult?.snapshot {
                snapshotContent(snapshot)
            } else if let buildFailure = viewModel.todayBuildFailure {
                missingContextContent(buildFailure)
            } else if let failure = viewModel.todayResult?.failure {
                failureContent(failure)
            } else {
                Text("Pull to refresh today’s deterministic recommendation.")
                    .foregroundStyle(.secondary)
            }

            Button {
                Task { await viewModel.loadToday() }
            } label: {
                Label("Refresh Today", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.todayLoading)
        }
        .padding(20)
        .kineticCard()
    }

    private func snapshotContent(_ snapshot: MobileTodayDecisionSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(snapshot.decision.selectedAction.name.rawValue.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(actionColor(snapshot.decision.selectedAction.name))
            Text(snapshot.decision.finalWorkout)
                .font(.title2.weight(.semibold))
                .foregroundStyle(KineticColor.ink)

            HStack(spacing: 12) {
                metric(
                    "Recovery",
                    "\(Int((snapshot.decision.recoveryScore * 100).rounded()))%"
                )
                metric(
                    "Confidence",
                    "\(Int((snapshot.decision.confidence * 100).rounded()))%"
                )
                metric(
                    "Window",
                    "\(snapshot.decision.availableMinutes) min"
                )
            }

            Text(snapshot.explanation.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            ForEach(Array(snapshot.decision.keyFactors.prefix(3)), id: \.self) { factor in
                Label(factor, systemImage: "checkmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if !snapshot.decision.stalenessWarnings.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(snapshot.decision.stalenessWarnings, id: \.self) {
                        Label($0, systemImage: "exclamationmark.triangle")
                    }
                }
                .font(.footnote)
                .foregroundStyle(KineticColor.amber)
            }

            if let result = viewModel.todayResult, result.source == .cache {
                Label(cacheExplanation(result), systemImage: "clock.arrow.circlepath")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(result.cacheState == .stale ? KineticColor.amber : KineticColor.blue)
            }

            Text(freshnessCopy(snapshot.context))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func missingContextContent(_ failure: MobileTodayBuildFailure) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(
                failure.code == .missingReadiness ? "Readiness needed" : "Setup incomplete",
                systemImage: failure.code == .missingReadiness ? "heart.text.square" : "list.bullet.clipboard"
            )
            .font(.title3.weight(.semibold))
            Text(
                failure.code == .missingReadiness
                    ? "Log a complete readiness entry or sync Apple Health before requesting a recommendation."
                    : "Complete your goal and accept a saved plan on the web, then refresh Today."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
    }

    private func failureContent(_ failure: MobileTodayFailureCode) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(failureTitle(failure), systemImage: failureIcon(failure))
                .font(.title3.weight(.semibold))
                .foregroundStyle(KineticColor.rose)
            Text(failureDetail(failure))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var healthCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Apple Health readiness", systemImage: "heart.text.square")
                .font(.headline)
            HStack {
                Text("Read access")
                Spacer()
                Text(viewModel.healthState.label)
                    .foregroundStyle(healthColor)
            }
            Text(healthDetail)
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let summary = viewModel.dailySummary {
                Divider()
                LabeledContent("Date", value: summary.date)
                metricLine("Sleep", value: summary.entry?.sleepHours, unit: "h")
                metricLine("HRV", value: summary.entry?.hrv, unit: "ms")
                metricLine("Resting HR", value: summary.entry?.restingHeartRate, unit: "bpm")
                LabeledContent(
                    "Confidence",
                    value: summary.dailyStatus.confidence.rawValue.capitalized
                )
            }

            LabeledContent("Firestore", value: viewModel.cloudState.label)
            if viewModel.cloudState == .failed {
                Text("The local summary remains usable. No plan or manual readiness data was changed.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let cloudErrorCode = viewModel.cloudErrorCode {
                    Text("Firestore error: \(cloudErrorCode)")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }

            if viewModel.cloudState == .deleted {
                Text(
                    "Deleted training data stays deleted until you explicitly start a new Apple Health sync history."
                )
                .font(.footnote)
                .foregroundStyle(.secondary)

                Button {
                    showingReconnectConfirmation = true
                } label: {
                    Label("Reconnect Apple Health", systemImage: "link.badge.plus")
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.healthState == .requesting)
                .confirmationDialog(
                    "Reconnect Apple Health?",
                    isPresented: $showingReconnectConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Reconnect Apple Health") {
                        Task { await viewModel.recoverDeletedTrainingData() }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(
                        "Previously deleted data stays deleted. Kinetic will create new bounded readiness and sync records and start a new privacy-safe mobile audit history."
                    )
                }
            } else {
                Button {
                    Task { await viewModel.readAndSyncToday() }
                } label: {
                    Label(syncButtonLabel, systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.bordered)
                .disabled(
                    viewModel.healthState == .requesting
                        || viewModel.cloudState == .syncing
                )
            }
        }
        .padding(20)
        .kineticCard()
    }

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Privacy boundary", systemImage: "checkmark.shield")
                .font(.headline)
            Label("Today sends bounded summaries, never identity or raw samples.", systemImage: "lock")
            Label("Cached decisions expire after 24 hours and never cross a local day.", systemImage: "calendar.badge.clock")
            Label("Audit events contain buckets and failure codes, not health values.", systemImage: "waveform.path.ecg.rectangle")
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(20)
        .kineticCard()
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metricLine(_ title: String, value: Double?, unit: String) -> some View {
        LabeledContent(
            title,
            value: value.map {
                "\(Self.metricFormatter.string(from: NSNumber(value: $0)) ?? "-") \(unit)"
            } ?? "Missing"
        )
    }

    private func sourceBadge(_ result: MobileTodayLoadResult) -> some View {
        Text(result.source == .live ? "LIVE" : result.cacheState.rawValue.uppercased())
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(
                result.source == .live
                    ? KineticColor.emerald.opacity(0.14)
                    : KineticColor.amber.opacity(0.14)
            )
            .clipShape(Capsule())
    }

    private func actionColor(_ action: DecisionActionName) -> Color {
        switch action {
        case .proceed: KineticColor.emerald
        case .modify: KineticColor.blue
        case .rest: KineticColor.amber
        }
    }

    private func cacheExplanation(_ result: MobileTodayLoadResult) -> String {
        let age = result.cacheState == .stale ? "Stale same-day recommendation" : "Saved same-day recommendation"
        return "\(age) · \(failureTitle(result.failure ?? .unknown))"
    }

    private func freshnessCopy(_ context: MobileTodayRequestMetadata) -> String {
        let readiness = context.readinessState == .stale ? "Readiness is stale" : "Readiness available"
        let calendar: String
        switch context.availabilitySource {
        case .calendar:
            calendar = context.calendarState == .conflict ? "calendar conflict applied" : "calendar current"
        case .plannedWorkoutFallback:
            calendar = "planned-duration fallback"
        case .missing:
            calendar = "calendar missing"
        }
        return "\(readiness) · \(calendar)"
    }

    private func failureTitle(_ failure: MobileTodayFailureCode) -> String {
        switch failure {
        case .authRequired: "Sign-in required"
        case .offline: "You’re offline"
        case .timeout: "Decision timed out"
        case .backendUnavailable: "Decision service unavailable"
        case .invalidResponse: "Response failed validation"
        case .missingContext: "Training context missing"
        case .unknown: "Today unavailable"
        }
    }

    private func failureDetail(_ failure: MobileTodayFailureCode) -> String {
        switch failure {
        case .authRequired:
            "Your Firebase session could not authorize the decision request. Sign in again."
        case .offline:
            "Reconnect and refresh. Kinetic will use only a labeled same-day cache when one is safe."
        case .timeout:
            "The decision deadline elapsed. Retry without changing your saved plan."
        case .backendUnavailable:
            "The deterministic service is unavailable. Retry when it recovers."
        case .invalidResponse:
            "Kinetic rejected a malformed or out-of-contract response."
        case .missingContext:
            "Complete setup or readiness before requesting Today."
        case .unknown:
            "Today could not load safely. Retry when your connection is stable."
        }
    }

    private func failureIcon(_ failure: MobileTodayFailureCode) -> String {
        switch failure {
        case .offline: "wifi.slash"
        case .timeout: "clock.badge.exclamationmark"
        case .authRequired: "person.crop.circle.badge.exclamationmark"
        case .invalidResponse: "checkmark.shield.trianglebadge.exclamationmark"
        default: "exclamationmark.triangle"
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

    private var syncButtonLabel: String {
        switch viewModel.cloudState {
        case .failed: "Retry readiness sync"
        case .deleted: "Training data deleted"
        default: "Read and sync readiness"
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

    private static let metricFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter
    }()
}
