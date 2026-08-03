import SwiftUI

struct MobileRootView: View {
    @ObservedObject var foundation: MobileFoundationViewModel
    @ObservedObject var today: TodayViewModel
    @ObservedObject var plan: MobilePlanViewModel

    var body: some View {
        Group {
            if foundation.isSignedIn, let state = foundation.state {
                if state.onboarding.status == .completed { productTabs(state) }
                else { MobileOnboardingView(foundation: foundation, today: today) }
            } else { MobileAuthView(viewModel: foundation) }
        }
        .task { await foundation.restore(); if foundation.isSignedIn { await today.restoreSession() } }
        .onChange(of: foundation.isSignedIn) { _, signedIn in
            if signedIn { Task { await today.restoreSession(); await plan.restore() } }
            else { plan.clear() }
        }
    }

    private func productTabs(_ state: MobileFoundationState) -> some View {
        TabView(selection: Binding(get: { state.route == .onboarding ? .today : state.route }, set: { route in Task { await foundation.selectRoute(route) } })) {
            TodayView(viewModel: today, planViewModel: plan, embeddedInProduct: true).tabItem { Label("Today", systemImage: "figure.run") }.tag(MobileProductRoute.today)
            MobilePlanView(viewModel: plan).tabItem { Label("Plan", systemImage: "calendar") }.tag(MobileProductRoute.plan)
            PlaceholderProductView(title: "Progress", detail: "Recent check-ins and pattern review stay available from Today while Progress is built.", icon: "chart.line.uptrend.xyaxis").tabItem { Label("Progress", systemImage: "chart.line.uptrend.xyaxis") }.tag(MobileProductRoute.progress)
            MobileSettingsView(foundation: foundation, today: today).tabItem { Label("Settings", systemImage: "gearshape") }.tag(MobileProductRoute.settings)
        }
    }
}

private struct MobileAuthView: View {
    @ObservedObject var viewModel: MobileFoundationViewModel
    @State private var email = ""; @State private var password = ""; @State private var creating = false
    var body: some View {
        NavigationStack { Form {
            Section { Text("KINETIC").font(.caption.bold()).foregroundStyle(KineticColor.blue); Text(creating ? "Create your account" : "Welcome back").font(.largeTitle.bold()); Text("Your Firebase account protects every training read and write.").foregroundStyle(.secondary) }
            Section(creating ? "New account" : "Sign in") {
                TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                SecureField("Password", text: $password).textContentType(creating ? .newPassword : .password)
                Button(creating ? "Create account" : "Sign in") { Task { if creating { await viewModel.createAccount(email: email, password: password) } else { await viewModel.signIn(email: email, password: password) }; password = "" } }.disabled(email.isEmpty || password.count < 6)
                Button(creating ? "I already have an account" : "Create an account") { creating.toggle() }
                Button("Forgot password?") { Task { await viewModel.sendPasswordReset(email: email) } }.disabled(email.isEmpty)
            }
            if case .working = viewModel.authState { ProgressView("Contacting Firebase") }
            if case .failed(let error) = viewModel.authState { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(KineticColor.rose) } }
            if let message = viewModel.message { Section { Text(message) } }
        }.navigationTitle("Kinetic") }
    }
}

private struct MobileOnboardingView: View {
    @ObservedObject var foundation: MobileFoundationViewModel; @ObservedObject var today: TodayViewModel
    @State private var race = "10K"; @State private var date = Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
    @State private var experience = "Intermediate"; @State private var mileage = 20.0; @State private var trainingDays: Set<String> = ["Tue", "Thu", "Sat"]
    @State private var deferred: Set<MobileFoundationPermission> = [.health, .calendar, .notifications]
    var body: some View { NavigationStack { Form {
        Section("Goal") { Picker("Race", selection: $race) { ForEach(["5K", "10K", "Half marathon", "Marathon"], id: \.self) { Text($0) } }; DatePicker("Race date", selection: $date, in: Date()..., displayedComponents: .date) }
        Section("Training background") { Picker("Experience", selection: $experience) { ForEach(["Beginner", "Intermediate", "Advanced"], id: \.self) { Text($0) } }; Stepper("\(Int(mileage)) miles per week", value: $mileage, in: 0...150) }
        Section("Personal records") { Text("Optional records can be added later in Settings.").foregroundStyle(.secondary) }
        Section("Preferred days") { ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) { day in Toggle(day, isOn: Binding(get: { trainingDays.contains(day) }, set: { enabled in if enabled { trainingDays.insert(day) } else { trainingDays.remove(day) } })) } }
        Section("Permissions") {
            permissionRow("Apple Health", permission: .health, detail: "Read-only daily summaries; raw samples stay on device.") { Task { await today.readAndSyncToday(); let mapped: MobilePermissionState = today.healthState == .granted || today.healthState == .partial ? .authorized : today.healthState == .unavailable ? .unavailable : .denied; await foundation.updatePermission(.health, state: mapped, deferred: false); deferred.remove(.health) } }
            permissionRow("Calendar", permission: .calendar, detail: "Calendar access is deferred to the Phase 7 EventKit spike.") { Task { await foundation.updatePermission(.calendar, state: .notRequested, deferred: true) } }
            permissionRow("Evening reminder", permission: .notifications, detail: "Optional, local-only, and generic on the lock screen.") { Task { await foundation.setEveningReminder(enabled: true, hour: 19, minute: 0, hasPlannedWorkout: false); deferred.remove(.notifications) } }
        }
        Section { Button("Finish setup") { Task { let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"; let distance = ["5K": "5k", "10K": "10k", "Half marathon": "half", "Marathon": "marathon"][race] ?? "10k"; await foundation.finishOnboarding(answers: .init(raceDistance: distance, targetDate: formatter.string(from: date), experience: experience.lowercased(), weeklyMileage: mileage, preferredDays: trainingDays.map { $0.lowercased() }.sorted()), deferred: deferred) } }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity) } footer: { Text("Denied or deferred permissions never block setup. Your plan preview is created by the deterministic Phase 6 validator.") }
    }.navigationTitle("Set up Kinetic") } }

    private func permissionRow(_ title: String, permission: MobileFoundationPermission, detail: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.headline); Text(detail).font(.footnote).foregroundStyle(.secondary); Button(deferred.contains(permission) ? "Enable or review" : "Reviewed", action: action) }.padding(.vertical, 4)
    }
}

private struct MobileSettingsView: View {
    @ObservedObject var foundation: MobileFoundationViewModel; @ObservedObject var today: TodayViewModel
    @State private var reminderTime = Calendar.current.date(bySettingHour: 19, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var confirmTrainingDelete = false; @State private var confirmAccountDelete = false
    var body: some View { NavigationStack { Form {
        Section("Account") { LabeledContent("Session", value: "Protected by Firebase"); Button("Sign out") { Task { today.signOut(); await foundation.signOut() } } }
        Section("Permissions") { permission("Apple Health", foundation.state?.permissions.health); permission("Calendar", foundation.state?.permissions.calendar); permission("Notifications", foundation.state?.permissions.notifications) }
        Section("Evening check-in reminder") {
            Toggle("Local reminder", isOn: Binding(get: { foundation.state?.settings.eveningCheckinReminder.enabled ?? false }, set: { enabled in let parts = Calendar.current.dateComponents([.hour, .minute], from: reminderTime); Task { await foundation.setEveningReminder(enabled: enabled, hour: parts.hour ?? 19, minute: parts.minute ?? 0, hasPlannedWorkout: today.workoutCheckinAvailable) } }))
            DatePicker("Reminder time", selection: $reminderTime, displayedComponents: .hourAndMinute)
            Text("Kinetic check-in · Take a moment to update today.").font(.footnote).foregroundStyle(.secondary)
        }
        Section("Privacy and data") {
            ShareLink(item: exportText) { Label("Export foundation receipt", systemImage: "square.and.arrow.up") }
            Button("Delete training data", role: .destructive) { confirmTrainingDelete = true }
            Button("Request account deletion", role: .destructive) { confirmAccountDelete = true }
            Text("Training deletion keeps the minimum account/settings shell. Account deletion first saves a retryable boundary and disables reminders.").font(.footnote).foregroundStyle(.secondary)
        }
        Section("Support") { Link("Support and issue reporting", destination: URL(string: "https://github.com/kathyygong/kinetic/issues")!); LabeledContent("App", value: "Kinetic Phase 5") }
        if let message = foundation.message { Section { Text(message) } }
    }.navigationTitle("Settings")
      .confirmationDialog("Delete training data?", isPresented: $confirmTrainingDelete, titleVisibility: .visible) { Button("Delete training data", role: .destructive) { Task { await foundation.deleteTrainingData() } } }
      .confirmationDialog("Request account deletion?", isPresented: $confirmAccountDelete, titleVisibility: .visible) { Button("Request deletion", role: .destructive) { Task { await foundation.requestAccountDeletion() } } }
    } }
    private func permission(_ title: String, _ state: MobilePermissionState?) -> some View { LabeledContent(title, value: (state ?? .notRequested).rawValue.replacingOccurrences(of: "_", with: " ").capitalized) }
    private var exportText: String { guard let state = foundation.state, let data = try? JSONEncoder().encode(state) else { return "Kinetic export unavailable" }; return String(data: data, encoding: .utf8) ?? "Kinetic export unavailable" }
}

private struct PlaceholderProductView: View { let title: String; let detail: String; let icon: String; var body: some View { NavigationStack { ContentUnavailableView(title, systemImage: icon, description: Text(detail)).navigationTitle(title) } } }
