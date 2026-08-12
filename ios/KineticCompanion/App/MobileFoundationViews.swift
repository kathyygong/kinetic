import Foundation
import SwiftUI

#if DEBUG
private func print(_ message: String) { NSLog("%@", message) }
#endif

struct MobileRootView: View {
    @ObservedObject var foundation: MobileFoundationViewModel
    @ObservedObject var today: TodayViewModel
    @ObservedObject var plan: MobilePlanViewModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if foundation.isSignedIn, let state = foundation.state {
                if state.onboarding.status == .completed { productTabs(state) }
                else { MobileOnboardingView(foundation: foundation, today: today, plan: plan) }
            } else { MobileAuthView(viewModel: foundation) }
        }
        .task {
            await foundation.restore()
#if DEBUG
            if let answers = await foundation.prepareQADisposableOwnerIfRequested() {
                guard await foundation.prepareOnboardingPreview(answers: answers) else {
                    print("KINETIC_QA_BOOTSTRAP_FAILED planning_inputs")
                    return
                }
                await plan.previewGeneration()
                guard plan.preview != nil, await plan.commitPreview() else {
                    print("KINETIC_QA_BOOTSTRAP_FAILED plan \(plan.message ?? "unknown")")
                    return
                }
                await foundation.finishOnboarding(answers: answers, deferred: Set(MobileFoundationPermission.allCases))
                guard foundation.state?.onboarding.status == .completed, plan.plan?.version == 1 else {
                    print("KINETIC_QA_BOOTSTRAP_FAILED onboarding")
                    return
                }
                print("KINETIC_QA_BOOTSTRAP_SUCCESS plan_version=1 availability=4")
            }
#endif
            if foundation.isSignedIn {
#if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-route-plan") {
                    await foundation.selectRoute(.plan)
                } else if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-route-settings") {
                    await foundation.selectRoute(.settings)
                }
#endif
                await today.restoreSession()
                await plan.restore()
#if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-complete-plan-matrix") {
                    await plan.runQARemainingLifecycleMatrix()
                }
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-transaction-matrix") {
                    await plan.runQATransactionMatrix()
                }
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-offline-plan") {
                    await plan.runQAOfflinePreview()
                }
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-audit-readback") {
                    do {
                        let result = try await FirestoreMobileAuditTransport.qaValidateOwnerReadbackAndCrossUserDenial()
                        print("KINETIC_QA_AUDIT_SUCCESS foundation=\(result.foundation) plan=\(result.plan) cross_user=denied")
                    } catch {
                        print("KINETIC_QA_AUDIT_FAILED \(String(describing: error))")
                    }
                }
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-deletion-matrix") {
                    await foundation.runQADeletionMatrix(plan: plan)
                }
                if ProcessInfo.processInfo.arguments.contains("-kinetic.qa-account-boundary-readback") {
                    await foundation.runQAAccountDeletionBoundaryReadback()
                }
#endif
            }
        }
        .onChange(of: foundation.isSignedIn) { _, signedIn in
            if signedIn { Task { await today.restoreSession(); await plan.restore() } }
            else { plan.clear() }
        }
    }

    private func productTabs(_ state: MobileFoundationState) -> some View {
        TabView(selection: Binding(get: { state.route == .onboarding ? .today : state.route }, set: { route in Task { await foundation.selectRoute(route) } })) {
            TodayView(viewModel: today, planViewModel: plan, embeddedInProduct: true).tabItem { accessibleTabLabel("Today", compact: "Run", systemImage: "figure.run") }.tag(MobileProductRoute.today)
            MobilePlanView(viewModel: plan).tabItem { accessibleTabLabel("Plan", compact: "Plan", systemImage: "calendar") }.tag(MobileProductRoute.plan)
            PlaceholderProductView(title: "Progress", detail: "Recent check-ins and pattern review stay available from Today while Progress is built.", icon: "chart.line.uptrend.xyaxis").tabItem { accessibleTabLabel("Progress", compact: "Stats", systemImage: "chart.line.uptrend.xyaxis") }.tag(MobileProductRoute.progress)
            MobileSettingsView(foundation: foundation, today: today, plan: plan).tabItem { accessibleTabLabel("Settings", compact: "More", systemImage: "gearshape") }.tag(MobileProductRoute.settings)
        }
    }

    @ViewBuilder
    private func accessibleTabLabel(_ title: String, compact: String, systemImage: String) -> some View {
        Label(dynamicTypeSize.isAccessibilitySize ? compact : title, systemImage: systemImage)
            .accessibilityLabel(title)
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
    @ObservedObject var plan: MobilePlanViewModel
    @State private var race = "10K"; @State private var date = Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
    @State private var experience = "Intermediate"; @State private var mileage = 20.0; @State private var trainingDays: Set<String> = ["Tue", "Thu", "Sat"]
    @State private var fiveKBest = ""; @State private var tenKBest = ""; @State private var halfBest = ""; @State private var marathonBest = ""
    @State private var constrainedDays: Set<String> = []
    @State private var availabilityMinutes: [String: Int] = [:]
    @State private var easyOnlyDays: Set<String> = []
    @State private var deferred: Set<MobileFoundationPermission> = [.health, .calendar, .notifications]
    @State private var previewAnswers: MobileOnboardingAnswers?
    @State private var inputError: String?
    var body: some View { NavigationStack { Form {
        Section("Goal") { Picker("Race", selection: $race) { ForEach(["5K", "10K", "Half marathon", "Marathon"], id: \.self) { Text($0) } }; DatePicker("Race date", selection: $date, in: minimumTargetDate..., displayedComponents: .date) }
        Section("Training background") { Picker("Experience", selection: $experience) { ForEach(["Beginner", "Intermediate", "Advanced"], id: \.self) { Text($0) } }; Stepper("\(Int(mileage)) miles per week", value: $mileage, in: 0...150) }
        Section {
            TextField("5K — mm:ss", text: $fiveKBest).keyboardType(.numbersAndPunctuation)
            TextField("10K — mm:ss", text: $tenKBest).keyboardType(.numbersAndPunctuation)
            TextField("Half marathon — h:mm:ss", text: $halfBest).keyboardType(.numbersAndPunctuation)
            TextField("Marathon — h:mm:ss", text: $marathonBest).keyboardType(.numbersAndPunctuation)
        } header: {
            Text("Personal records")
        } footer: { Text("Optional. Leave any distance blank to use the shared planner’s bounded defaults.") }
        Section("Preferred days") { ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) { day in Toggle(day, isOn: Binding(get: { trainingDays.contains(day) }, set: { enabled in if enabled { trainingDays.insert(day) } else { trainingDays.remove(day) } })) } }
        Section {
            ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) { day in
                Toggle("Constrain \(day)", isOn: Binding(
                    get: { constrainedDays.contains(day) },
                    set: { enabled in
                        if enabled { constrainedDays.insert(day); availabilityMinutes[day] = availabilityMinutes[day] ?? 45 }
                        else { constrainedDays.remove(day); easyOnlyDays.remove(day) }
                    }
                ))
                if constrainedDays.contains(day) {
                    Stepper("\(availabilityMinutes[day] ?? 45) available minutes", value: Binding(get: { availabilityMinutes[day] ?? 45 }, set: { availabilityMinutes[day] = $0 }), in: 0...240, step: 15)
                    Toggle("Easy workout only", isOn: Binding(get: { easyOnlyDays.contains(day) }, set: { enabled in if enabled { easyOnlyDays.insert(day) } else { easyOnlyDays.remove(day) } }))
                }
            }
        } header: { Text("Weekly availability") } footer: { Text("Optional. Zero minutes skips that weekday; 15–240 minutes caps the workout; easy-only prevents hard sessions. Calendar titles never leave your device.") }
        Section("Permissions") {
            permissionRow("Apple Health", permission: .health, detail: "Read-only daily summaries; raw samples stay on device.") { Task { await today.readAndSyncToday(); let mapped: MobilePermissionState = today.healthState == .granted || today.healthState == .partial ? .authorized : today.healthState == .unavailable ? .unavailable : .denied; await foundation.updatePermission(.health, state: mapped, deferred: false); deferred.remove(.health) } }
            permissionRow("Calendar", permission: .calendar, detail: "Calendar access is deferred to the Phase 7 EventKit spike.") { Task { await foundation.updatePermission(.calendar, state: .notRequested, deferred: true) } }
            permissionRow("Evening reminder", permission: .notifications, detail: "Optional, local-only, and generic on the lock screen.") { Task { await foundation.setEveningReminder(enabled: true, hour: 19, minute: 0, hasPlannedWorkout: false); deferred.remove(.notifications) } }
        }
        if let inputError { Section { Label(inputError, systemImage: "exclamationmark.triangle").foregroundStyle(KineticColor.rose) } }
        if let message = foundation.message ?? plan.message { Section { Text(message) } }
        Section {
            Button("Review shared plan") { Task { await reviewPlan() } }
                .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                .disabled(plan.isWorking || trainingDays.isEmpty)
        } footer: { Text("Denied or deferred permissions never block setup. Kinetic calls the authenticated shared planner, then validates the candidate before anything is saved as your plan.") }
    }.navigationTitle("Set up Kinetic")
      .sheet(isPresented: Binding(get: { plan.preview != nil }, set: { if !$0 { plan.discardPreview() } })) {
          if let preview = plan.preview {
              MobilePlanPreviewView(
                  preview: preview, isWorking: plan.isWorking, message: plan.message,
                  confirm: {
                      Task {
                          guard let answers = previewAnswers, await plan.commitPreview() else { return }
                          await foundation.finishOnboarding(answers: answers, deferred: deferred)
                      }
                  },
                  discard: plan.discardPreview
              )
          }
      }
    } }

    private func permissionRow(_ title: String, permission: MobileFoundationPermission, detail: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.headline); Text(detail).font(.footnote).foregroundStyle(.secondary); Button(deferred.contains(permission) ? "Enable or review" : "Reviewed", action: action) }.padding(.vertical, 4)
    }

    private var minimumTargetDate: Date {
        Calendar.current.date(byAdding: .day, value: 21, to: Calendar.current.startOfDay(for: Date())) ?? Date()
    }

    @MainActor
    private func reviewPlan() async {
        do {
            let answers = try onboardingAnswers()
            guard await foundation.prepareOnboardingPreview(answers: answers) else { return }
            previewAnswers = answers
            inputError = nil
            await plan.previewGeneration()
        } catch {
            inputError = "Use a future race date, at least one preferred day, and optional record times such as 24:30 or 1:52:10."
        }
    }

    private func onboardingAnswers() throws -> MobileOnboardingAnswers {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        let distance = ["5K": "5k", "10K": "10k", "Half marathon": "half", "Marathon": "marathon"][race] ?? "10k"
        let rawBests = ["5k": fiveKBest, "10k": tenKBest, "half": halfBest, "marathon": marathonBest]
        let bests = try rawBests.reduce(into: [String: Int]()) { values, entry in
            let trimmed = entry.value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { values[entry.key] = try seconds(from: trimmed) }
        }
        return try MobileOnboardingAnswers(
            raceDistance: distance, targetDate: formatter.string(from: date),
            experience: experience.lowercased(), weeklyMileage: mileage,
            preferredDays: trainingDays.map { $0.lowercased() }.sorted(), personalBests: bests,
            weeklyAvailability: try constrainedDays.sorted().map { day in
                guard let value = MobilePlanDay(rawValue: day.lowercased()) else { throw MobileFoundationValidationError.invalid("availability day") }
                return try MobileWeeklyAvailability(day: value, availableMinutes: availabilityMinutes[day] ?? 45, easyOnly: easyOnlyDays.contains(day)).validated()
            }
        ).validated()
    }

    private func seconds(from value: String) throws -> Int {
        let rawParts = value.split(separator: ":", omittingEmptySubsequences: false)
        let parts = rawParts.compactMap { Int($0) }
        guard (2...3).contains(parts.count), parts.count == rawParts.count,
              parts.dropFirst().allSatisfy({ (0...59).contains($0) }) else {
            throw MobileFoundationValidationError.invalid("personal record")
        }
        let seconds = parts.count == 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2]
        guard (180...86_400).contains(seconds) else { throw MobileFoundationValidationError.invalid("personal record") }
        return seconds
    }
}

private struct MobileSettingsView: View {
    @ObservedObject var foundation: MobileFoundationViewModel; @ObservedObject var today: TodayViewModel; @ObservedObject var plan: MobilePlanViewModel
    @State private var reminderTime = Calendar.current.date(bySettingHour: 19, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var confirmTrainingDelete = false; @State private var confirmAccountDelete = false
    @State private var deletionPassword = ""; @State private var editPlanningInputs = false
    var body: some View { NavigationStack { Form {
        Section("Account") { LabeledContent("Session", value: "Protected by Firebase"); Button("Sign out") { Task { today.signOut(); await foundation.signOut() } } }
        Section("Permissions") { permission("Apple Health", foundation.state?.permissions.health); permission("Calendar", foundation.state?.permissions.calendar); permission("Notifications", foundation.state?.permissions.notifications) }
        Section("Planning") {
            if let inputs = plan.planningInputs {
                LabeledContent("Race", value: inputs.raceDistance.rawValue.uppercased())
                LabeledContent("Target", value: inputs.targetDate)
                LabeledContent("Availability rules", value: String(inputs.weeklyAvailability.count))
                Button("Edit planning inputs") { editPlanningInputs = true }
            } else { Text("Planning inputs are available after a shared plan is restored.").foregroundStyle(.secondary) }
        }
        Section("Evening check-in reminder") {
            Toggle("Local reminder", isOn: Binding(get: { foundation.state?.settings.eveningCheckinReminder.enabled ?? false }, set: { enabled in let parts = Calendar.current.dateComponents([.hour, .minute], from: reminderTime); Task { await foundation.setEveningReminder(enabled: enabled, hour: parts.hour ?? 19, minute: parts.minute ?? 0, hasPlannedWorkout: today.workoutCheckinAvailable) } }))
            DatePicker("Reminder time", selection: $reminderTime, displayedComponents: .hourAndMinute)
            Text("Kinetic check-in · Take a moment to update today.").font(.footnote).foregroundStyle(.secondary)
        }
        Section("Privacy and data") {
            Button("Prepare training-data export") { Task { await foundation.prepareTrainingDataExport() } }
            if let trainingExport = foundation.trainingExport {
                ShareLink(item: trainingExport) { Label("Share training-data export", systemImage: "square.and.arrow.up") }
            }
            ShareLink(item: exportText) { Label("Export foundation receipt", systemImage: "square.and.arrow.up") }
            Button("Delete training data", role: .destructive) { confirmTrainingDelete = true }
            Button("Request account deletion", role: .destructive) { confirmAccountDelete = true }
            if foundation.accountDeletionNeedsReauthentication {
                SecureField("Password to finish deletion", text: $deletionPassword).textContentType(.password)
                Button("Reauthenticate and finish deletion", role: .destructive) { Task { await foundation.retryAccountDeletion(password: deletionPassword); deletionPassword = "" } }.disabled(deletionPassword.isEmpty)
            }
            Text("Training deletion keeps the minimum account/settings shell. Account deletion first saves a retryable boundary and disables reminders.").font(.footnote).foregroundStyle(.secondary)
        }
        Section("Support") { Link("Support and issue reporting", destination: URL(string: "https://github.com/kathyygong/kinetic/issues")!); LabeledContent("App", value: "Kinetic Phase 5") }
        if let message = foundation.message { Section { Text(message) } }
    }.navigationTitle("Settings")
      .confirmationDialog("Delete training data?", isPresented: $confirmTrainingDelete, titleVisibility: .visible) { Button("Delete training data", role: .destructive) { Task { await foundation.deleteTrainingData() } } }
      .confirmationDialog("Request account deletion?", isPresented: $confirmAccountDelete, titleVisibility: .visible) { Button("Request deletion", role: .destructive) { Task { await foundation.requestAccountDeletion() } } }
      .sheet(isPresented: $editPlanningInputs) { MobilePlanningSettingsSheet(viewModel: plan) }
    } }
    private func permission(_ title: String, _ state: MobilePermissionState?) -> some View { LabeledContent(title, value: (state ?? .notRequested).rawValue.replacingOccurrences(of: "_", with: " ").capitalized) }
    private var exportText: String { guard let state = foundation.state, let data = try? JSONEncoder().encode(state) else { return "Kinetic export unavailable" }; return String(data: data, encoding: .utf8) ?? "Kinetic export unavailable" }
}

private struct MobilePlanningSettingsSheet: View {
    @ObservedObject var viewModel: MobilePlanViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var race: MobilePlanRaceDistance = .tenK
    @State private var targetDate = Date()
    @State private var experience: MobilePlanExperience = .intermediate
    @State private var mileage = 20.0
    @State private var usesMileage = true
    @State private var preferredDays: Set<MobilePlanDay> = []
    @State private var constrainedDays: Set<MobilePlanDay> = []
    @State private var minutes: [MobilePlanDay: Int] = [:]
    @State private var easyOnly: Set<MobilePlanDay> = []
    @State private var personalBests: [String: String] = [:]
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Race", selection: $race) { ForEach(MobilePlanRaceDistance.allCases, id: \.rawValue) { Text(label($0)).tag($0) } }.disabled(true)
                    DatePicker("Target date", selection: $targetDate, in: minimumTargetDate..., displayedComponents: .date).disabled(true)
                    Picker("Experience", selection: $experience) { ForEach([MobilePlanExperience.beginner, .intermediate, .advanced], id: \.rawValue) { Text($0.rawValue.capitalized).tag($0) } }
                    Toggle("Use current weekly mileage", isOn: $usesMileage)
                    if usesMileage { Stepper("\(Int(mileage)) miles per week", value: $mileage, in: 1...150) }
                } header: { Text("Goal and training") } footer: { Text("Race distance and race day stay locked to preserve the active plan’s race-day safety invariant. Other planning inputs regenerate the future plan.") }
                Section("Personal records") {
                    ForEach(MobilePlanRaceDistance.allCases, id: \.rawValue) { distance in
                        TextField("\(label(distance)) — mm:ss or h:mm:ss", text: Binding(get: { personalBests[distance.rawValue] ?? "" }, set: { personalBests[distance.rawValue] = $0 })).keyboardType(.numbersAndPunctuation)
                    }
                }
                Section("Preferred days") {
                    ForEach(MobilePlanDay.allCases, id: \.rawValue) { day in
                        Toggle(day.rawValue.capitalized, isOn: membership(day, in: $preferredDays))
                    }
                }
                Section {
                    ForEach(MobilePlanDay.allCases, id: \.rawValue) { day in
                        Toggle("Constrain \(day.rawValue.capitalized)", isOn: Binding(
                            get: { constrainedDays.contains(day) },
                            set: { enabled in
                                if enabled { constrainedDays.insert(day); minutes[day] = minutes[day] ?? 45 }
                                else { constrainedDays.remove(day); easyOnly.remove(day) }
                            }
                        ))
                        if constrainedDays.contains(day) {
                            Stepper("\(minutes[day] ?? 45) available minutes", value: Binding(get: { minutes[day] ?? 45 }, set: { minutes[day] = $0 }), in: 0...240, step: 15)
                            Toggle("Easy workout only", isOn: membership(day, in: $easyOnly))
                        }
                    }
                } header: { Text("Weekly availability") } footer: { Text("Removing every constraint clears recurring availability. Raw Calendar data is never included.") }
                if let error { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(KineticColor.rose) } }
                Section {
                    Button("Review regenerated plan") { Task { await review() } }.buttonStyle(.borderedProminent).disabled(viewModel.isWorking || preferredDays.isEmpty)
                } footer: { Text("Your inputs and regenerated plan are saved together only after a second confirmation.") }
            }
            .navigationTitle("Planning inputs")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { viewModel.discardPreview(); dismiss() } } }
            .task { load() }
            .sheet(item: Binding(get: { viewModel.preview.map(PlanningPreview.init) }, set: { if $0 == nil { viewModel.discardPreview() } })) { identified in
                MobilePlanPreviewView(
                    preview: identified.value, isWorking: viewModel.isWorking, message: viewModel.message,
                    confirm: { Task { if await viewModel.commitPreview() { dismiss() } } },
                    discard: viewModel.discardPreview
                )
            }
        }
    }

    private var minimumTargetDate: Date { Calendar.current.date(byAdding: .day, value: 21, to: Calendar.current.startOfDay(for: Date())) ?? Date() }
    private func membership(_ day: MobilePlanDay, in values: Binding<Set<MobilePlanDay>>) -> Binding<Bool> {
        .init(get: { values.wrappedValue.contains(day) }, set: { enabled in if enabled { values.wrappedValue.insert(day) } else { values.wrappedValue.remove(day) } })
    }
    private func load() {
        guard let value = viewModel.planningInputs else { return }
        race = value.raceDistance; experience = value.experienceLevel
        targetDate = isoFormatter.date(from: value.targetDate) ?? minimumTargetDate
        usesMileage = value.weeklyMileage != nil; mileage = value.weeklyMileage ?? 20
        preferredDays = Set(value.preferredDays)
        constrainedDays = Set(value.weeklyAvailability.map(\.day))
        minutes = Dictionary(uniqueKeysWithValues: value.weeklyAvailability.map { ($0.day, $0.availableMinutes) })
        easyOnly = Set(value.weeklyAvailability.filter(\.easyOnly).map(\.day))
        personalBests = value.personalBestsSeconds.mapValues(duration)
    }
    @MainActor private func review() async {
        do {
            let bests = try personalBests.reduce(into: [String: Int]()) { result, entry in
                let trimmed = entry.value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { result[entry.key] = try seconds(trimmed) }
            }
            let availability = try constrainedDays.sorted { $0.rawValue < $1.rawValue }.map {
                try MobileWeeklyAvailability(day: $0, availableMinutes: minutes[$0] ?? 45, easyOnly: easyOnly.contains($0)).validated()
            }
            let currentRevision = viewModel.planningInputs?.revision ?? 1
            let value = try MobilePlanningInputs(
                revision: currentRevision, raceDistance: race, targetDate: isoFormatter.string(from: targetDate),
                experienceLevel: experience, weeklyMileage: usesMileage ? mileage : nil,
                preferredDays: preferredDays.sorted { $0.rawValue < $1.rawValue },
                personalBestsSeconds: bests, weeklyAvailability: availability
            ).validated()
            error = nil; await viewModel.previewPlanningUpdate(value)
        } catch { self.error = "Review the target date, preferred days, availability, and record times." }
    }
    private func seconds(_ value: String) throws -> Int {
        let raw = value.split(separator: ":", omittingEmptySubsequences: false), parts = value.split(separator: ":", omittingEmptySubsequences: false).compactMap { Int($0) }
        guard (2...3).contains(parts.count), raw.count == parts.count, parts.dropFirst().allSatisfy({ (0...59).contains($0) }) else { throw MobileFoundationValidationError.invalid("personal record") }
        let result = parts.count == 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2]
        guard (180...86_400).contains(result) else { throw MobileFoundationValidationError.invalid("personal record") }
        return result
    }
    private func duration(_ seconds: Int) -> String {
        seconds >= 3600 ? String(format: "%d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60) : String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
    private func label(_ value: MobilePlanRaceDistance) -> String { switch value { case .fiveK: "5K"; case .tenK: "10K"; case .half: "Half marathon"; case .marathon: "Marathon" } }
    private var isoFormatter: DateFormatter { let value = DateFormatter(); value.calendar = Calendar(identifier: .gregorian); value.locale = Locale(identifier: "en_US_POSIX"); value.timeZone = TimeZone(secondsFromGMT: 0); value.dateFormat = "yyyy-MM-dd"; return value }
}

private struct PlanningPreview: Identifiable { var value: MobilePlanPendingPreview; var id: String { value.operationID } }

private struct PlaceholderProductView: View { let title: String; let detail: String; let icon: String; var body: some View { NavigationStack { ContentUnavailableView(title, systemImage: icon, description: Text(detail)).navigationTitle(title) } } }
