import Combine
import Foundation

#if DEBUG
private func print(_ message: String) { NSLog("%@", message) }
#endif

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

struct MobilePlanPendingPreview: Equatable {
    var operationID: String
    var action: MobilePlanAction
    var targetWorkoutID: String?
    var currentPlan: MobilePlanSnapshot?
    var proposedPlan: MobilePlanSnapshot
    var response: MobilePlanLifecycleResponseV2
    var metadata: MobilePlanMetadataV2
    var currentPlanningInputs: MobilePlanningInputs?
    var proposedPlanningInputs: MobilePlanningInputs
    var generationExplanations: [MobilePlanGenerationExplanationCode] { metadata.explanationCodes }
}

@MainActor
final class MobilePlanViewModel: ObservableObject {
    @Published private(set) var plan: MobilePlanSnapshot?
    @Published private(set) var preview: MobilePlanPendingPreview?
    @Published private(set) var weeks: [MobilePlanWeekMetadata]?
    @Published private(set) var generationExplanations: [MobilePlanGenerationExplanationCode] = []
    @Published private(set) var planningInputs: MobilePlanningInputs?
    @Published private(set) var isWorking = false
    @Published private(set) var legacyPlanPresent = false
    @Published private(set) var message: String?

    private let configured: Bool
    private let generationNetworkV2: MobilePlanGenerationV2Networking
    private let networkV2: MobilePlanLifecycleV2Networking
    private let store: MobilePlanStoring
    private let audit: MobileAuditTransporting

    init(configured: Bool, generationNetworkV2: MobilePlanGenerationV2Networking = URLSessionMobilePlanGenerationV2Client(), networkV2: MobilePlanLifecycleV2Networking = URLSessionMobilePlanLifecycleV2Client(), store: MobilePlanStoring = FirestoreMobilePlanStore(), audit: MobileAuditTransporting = FirestoreMobileAuditTransport()) {
        self.configured = configured; self.generationNetworkV2 = generationNetworkV2
        self.networkV2 = networkV2; self.store = store; self.audit = audit
    }

    func restore() async {
        guard configured else { message = "Firebase configuration is missing."; return }
        do {
            let state = try await store.load()
            plan = state.plan; planningInputs = state.planningInputs
            weeks = state.metadata?.weeks; generationExplanations = state.metadata?.explanationCodes ?? []
            legacyPlanPresent = state.legacyPlanPresent
            message = state.legacyPlanPresent ? "Your proof-era plan is preserved until you approve the validated native replacement." : nil
        } catch { message = "Your owner-scoped plan could not be restored safely." }
    }

    func clear() { plan = nil; preview = nil; weeks = nil; generationExplanations = []; planningInputs = nil; legacyPlanPresent = false; message = nil }

#if DEBUG
    func runQARemainingLifecycleMatrix() async {
        await restore()
        guard let startingPlan = plan else { print("KINETIC_QA_PLAN_MATRIX_FAILED missing_plan"); return }
        let startingVersion = startingPlan.version
        guard await commitFirstValidPreferredDay() else {
            print("KINETIC_QA_PLAN_MATRIX_FAILED preferred_day \(message ?? "unknown")"); return
        }
        guard await commitFirstValidSkip() else {
            print("KINETIC_QA_PLAN_MATRIX_FAILED skip_preview \(message ?? "unknown")"); return
        }
        guard plan?.version == startingVersion + 2 else {
            print("KINETIC_QA_PLAN_MATRIX_FAILED final_version \(plan?.version ?? -1)"); return
        }
        message = "QA preferred-day and skip passed at version \(startingVersion + 2)."
        print("KINETIC_QA_PLAN_MATRIX_SUCCESS version=\(startingVersion + 2)")
    }

    func runQATransactionMatrix() async {
        await restore()
        do {
            guard let current = plan,
                  let metadata = currentMetadata,
                  let inputs = planningInputs,
                  let target = current.scheduledWorkouts.first(where: { $0.type != .race && $0.durationMinutes > 1 }) else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED missing_target"); return
            }
            let startingState = try await store.load()
            let operationID = MobilePlanRequestFactory.operationID()
            let proposed = try MobilePlanProposalBuilder.proposal(
                action: .shorten, current: current, targetWorkoutID: target.id,
                newDuration: target.durationMinutes - 1
            )
            let commitRequest = try MobilePlanV2RequestFactory.lifecycle(
                mode: .commit, operationID: operationID, current: current,
                proposed: proposed, metadata: metadata, currentInputs: inputs, proposedInputs: inputs,
                action: .shorten, targetWorkoutID: target.id,
                priorOperation: startingState.priorOperation
            )
            let commitResponse = try await networkV2.validate(request: commitRequest, idToken: try await idToken())
            let first = try await store.commitV2(response: commitResponse, request: commitRequest)
            guard first.version == current.version + 1, !first.replayed else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED first_commit"); return
            }
            print("KINETIC_QA_TRANSACTION_MATRIX_STEP first_commit")
            let replay = try await store.commitV2(response: commitResponse, request: commitRequest)
            guard replay.version == first.version, replay.replayed else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED replay"); return
            }
            print("KINETIC_QA_TRANSACTION_MATRIX_STEP replay")

            var reusedOperationRequest = commitRequest
            reusedOperationRequest.requestFingerprint = "sha256-" + String(repeating: "f", count: 64)
            do {
                _ = try await store.commitV2(response: commitResponse, request: reusedOperationRequest)
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED idempotency_accepted"); return
            } catch MobilePlanStoreError.idempotencyConflict {}
            print("KINETIC_QA_TRANSACTION_MATRIX_STEP idempotency_conflict")

            var staleRequest = commitRequest
            staleRequest.operationID = MobilePlanRequestFactory.operationID()
            staleRequest.requestFingerprint = "sha256-" + String(repeating: "e", count: 64)
            do {
                _ = try await store.commitV2(response: commitResponse, request: staleRequest)
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED stale_accepted"); return
            } catch MobilePlanStoreError.versionConflict {}
            print("KINETIC_QA_TRANSACTION_MATRIX_STEP stale_conflict")

            await restore()
            guard plan?.version == current.version + 1 else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED readback \(plan?.version ?? -1)"); return
            }
            print("KINETIC_QA_TRANSACTION_MATRIX_SUCCESS version=\(current.version + 1)")
        } catch {
            print("KINETIC_QA_TRANSACTION_MATRIX_FAILED \(String(describing: error))")
        }
    }

    func runQAOfflinePreview() async {
        await restore()
        guard let current = plan,
              let target = current.scheduledWorkouts.first(where: { $0.type != .race }) else {
            print("KINETIC_QA_OFFLINE_FAILED missing_target"); return
        }
        await previewChange(action: .skip, target: target)
        let offlineMessage = message
        await restore()
        guard preview == nil, plan?.version == current.version,
              offlineMessage?.contains("offline") == true else {
            print("KINETIC_QA_OFFLINE_FAILED version=\(plan?.version ?? -1) message=\(offlineMessage ?? "none")"); return
        }
        print("KINETIC_QA_OFFLINE_SUCCESS version=\(current.version)")
    }

    private func commitFirstValidPreferredDay() async -> Bool {
        guard let current = plan else { return false }
        let candidates = current.scheduledWorkouts.filter { $0.type == .easy }
            + current.scheduledWorkouts.filter { $0.type != .easy && $0.type != .race }
        for target in candidates {
            let occupied = Set(current.workouts.filter { $0.id != target.id && $0.status != .skipped }.map(\.date))
            for offset in 2...21 {
                guard let date = shifted(target.date, days: offset), !occupied.contains(date) else { continue }
                discardPreview()
                await previewChange(action: .preferredDay, target: target, date: date)
                guard preview?.action == .preferredDay else { continue }
                let version = current.version
                await commitPreview()
                return plan?.version == version + 1
            }
        }
        return false
    }

    private func commitFirstValidSkip() async -> Bool {
        guard let current = plan else { return false }
        let today = MobileTodayDate.localDay(Date())
        for target in current.scheduledWorkouts where target.type != .race && target.date >= today {
            discardPreview()
            await previewChange(action: .skip, target: target)
            guard preview?.action == .skip else { continue }
            let version = current.version
            await commitPreview()
            return plan?.version == version + 1
        }
        return false
    }
#endif

    func previewGeneration() async {
        await performPreview(action: .generate, targetWorkoutID: nil) {
            try await self.sharedGeneration(mode: .initial, currentPlan: nil, proposedInputs: nil)
        }
    }

    func previewPlanningUpdate(_ inputs: MobilePlanningInputs) async {
        guard let current = plan else { message = "Generate a plan before editing planning inputs."; return }
        await performPreview(action: .regenerateFuture, targetWorkoutID: nil) {
            try await self.sharedGeneration(mode: .regenerateFuture, currentPlan: current, proposedInputs: inputs)
        }
    }

    func previewChange(action: MobilePlanAction, target: MobilePlanWorkout? = nil, date: String? = nil, duration: Int? = nil, replacement: MobilePlanWorkoutType? = nil) async {
        guard let current = plan else { message = "Generate a plan first."; return }
        await performPreview(action: action, targetWorkoutID: target?.id) {
            if action == .regenerateFuture {
                return try await self.sharedGeneration(mode: .regenerateFuture, currentPlan: current, proposedInputs: nil)
            }
            guard let metadata = self.currentMetadata, let inputs = self.planningInputs else {
                throw MobilePlanContractError.invalid("Versioned plan metadata is required. Regenerate the plan first.")
            }
            let proposed = try MobilePlanProposalBuilder.proposal(action: action, current: current, targetWorkoutID: target?.id, newDate: date, newDuration: duration, replacementType: replacement)
            return (proposed, metadata, inputs)
        }
    }

    func previewPreferredDay(strategy: BehaviorPatternPreferredDayStrategy, observedDay: MobileIntakeDay) async {
        if plan == nil { await restore() }
        guard let plan else { message = "Generate and save a plan before confirming a preferred-day pattern."; return }
        let candidates = plan.scheduledWorkouts.filter { $0.type != .race }
        let target: MobilePlanWorkout?
        let shift: Int
        switch strategy {
        case .avoidDay:
            target = candidates.first { weekday($0.date) == observedDay }
            shift = 1
        case .preferLongRunDay:
            target = candidates.first { $0.type == .longRun }
            guard let target else { message = "No future long run is available to review."; return }
            let currentRank = weekdayRank(weekday(target.date)), desiredRank = weekdayRank(observedDay)
            let delta = (desiredRank - currentRank + 7) % 7
            shift = delta == 0 ? 7 : delta
        }
        guard let target, let date = shifted(target.date, days: shift) else {
            message = "No matching future workout is available for this preferred-day review."; return
        }
        await previewChange(action: .preferredDay, target: target, date: date)
    }

    func discardPreview() { preview = nil; message = nil }

    @discardableResult
    func commitPreview() async -> Bool {
        guard let pending = preview else { return false }
        isWorking = true
        let started = Date()
        var succeeded = false
        do {
            let latest = try await store.load()
            let request = try MobilePlanV2RequestFactory.lifecycle(
                mode: .commit, operationID: pending.operationID, current: pending.currentPlan,
                proposed: pending.proposedPlan, metadata: pending.metadata,
                currentInputs: pending.currentPlanningInputs, proposedInputs: pending.proposedPlanningInputs,
                action: pending.action, targetWorkoutID: pending.targetWorkoutID, priorOperation: latest.priorOperation
            )
            let response = try await networkV2.validate(request: request, idToken: try await idToken())
            switch response.result {
            case .commitReady:
                let committed = try await store.commitV2(response: response, request: request)
                let state = try await store.load(); plan = state.plan; legacyPlanPresent = false; preview = nil
                weeks = state.metadata?.weeks; generationExplanations = state.metadata?.explanationCodes ?? []
                planningInputs = state.planningInputs
                message = committed.replayed ? "This change was already saved." : "Plan version \(committed.version) saved."
                emit(action: pending.action, response: response, mutation: .applied, failure: .none, started: started)
                succeeded = true
            case .replayed:
                let state = try await store.load(); plan = state.plan; preview = nil
                weeks = state.metadata?.weeks; generationExplanations = state.metadata?.explanationCodes ?? []
                planningInputs = state.planningInputs
                message = "This change was already saved."
                emit(action: pending.action, response: response, mutation: .applied, failure: .none, started: started)
                succeeded = true
            case .conflict:
                let conflict = conflictMessage(response); await restore(); preview = nil; message = conflict
                emit(action: pending.action, response: response, mutation: .rejected, failure: failure(response), started: started)
            case .rejected:
                message = rejectionMessage(response)
                emit(action: pending.action, response: response, mutation: .rejected, failure: failure(response), started: started)
            case .preview:
                message = "The validator returned a preview when a commit package was required."
                emit(action: pending.action, response: response, mutation: .rejected, failure: .invalidResponse, started: started)
            }
        } catch {
            let failureMessage = errorMessage(error)
            if error as? MobilePlanStoreError == .versionConflict { await restore(); preview = nil }
            message = failureMessage
            emitFailure(action: pending.action, failure: auditFailure(error), started: started)
        }
        isWorking = false
        return succeeded
    }

    private func performPreview(
        action: MobilePlanAction,
        targetWorkoutID: String?,
        proposal: () async throws -> (plan: MobilePlanSnapshot, metadata: MobilePlanMetadataV2, inputs: MobilePlanningInputs)
    ) async {
        isWorking = true; message = nil
        let started = Date(), operationID = MobilePlanRequestFactory.operationID()
        do {
            let current = plan, generated = try await proposal(), proposed = generated.plan, latest = try await store.load()
            let currentInputs = current == nil ? nil : latest.planningInputs
            let request = try MobilePlanV2RequestFactory.lifecycle(
                mode: .preview, operationID: operationID, current: current,
                proposed: proposed, metadata: generated.metadata,
                currentInputs: currentInputs, proposedInputs: generated.inputs,
                action: action, targetWorkoutID: targetWorkoutID, priorOperation: latest.priorOperation
            )
            let response = try await networkV2.validate(request: request, idToken: try await idToken())
            if response.result == .preview, let accepted = response.commitPlan, let acceptedInputs = response.commitPlanningInputs {
                preview = .init(
                    operationID: operationID, action: action, targetWorkoutID: targetWorkoutID,
                    currentPlan: current, proposedPlan: accepted.snapshot, response: response,
                    metadata: accepted.metadata, currentPlanningInputs: currentInputs,
                    proposedPlanningInputs: acceptedInputs
                )
                emit(action: action, response: response, mutation: .reviewOnly, failure: .none, started: started)
            } else {
                message = response.result == .conflict ? conflictMessage(response) : rejectionMessage(response)
                emit(action: action, response: response, mutation: .rejected, failure: failure(response), started: started)
            }
        } catch {
            message = errorMessage(error); emitFailure(action: action, failure: auditFailure(error), started: started)
        }
        isWorking = false
    }

    private func sharedGeneration(
        mode: MobilePlanGenerationMode,
        currentPlan: MobilePlanSnapshot?,
        proposedInputs: MobilePlanningInputs?
    ) async throws -> (plan: MobilePlanSnapshot, metadata: MobilePlanMetadataV2, inputs: MobilePlanningInputs) {
        let context = try await store.loadGenerationContext()
        var inputs = proposedInputs ?? MobilePlanningInputs(context: context)
        if let current = planningInputs, proposedInputs != nil, inputs != current { inputs.revision = current.revision + 1 }
        let request = try MobilePlanGenerationRequestV2(
            mode: mode, planningDate: MobileTodayDate.localDay(Date()),
            planningInputs: inputs, currentPlan: currentPlan
        ).validated()
        let response = try await generationNetworkV2.generate(request: request, idToken: try await idToken())
        guard response.mode == mode else { throw MobilePlanNetworkError(failure: .invalidResponse) }
        return (response.candidatePlan.snapshot, response.candidatePlan.metadata, inputs)
    }

    private var currentMetadata: MobilePlanMetadataV2? {
        guard let plan, let weeks else { return nil }
        return try? MobilePlanMetadataV2(planVersion: plan.version, weeks: weeks, explanationCodes: generationExplanations).validated(for: plan)
    }

    private func idToken() async throws -> String {
        #if canImport(FirebaseAuth)
        guard let user = Auth.auth().currentUser else { throw MobilePlanNetworkError(failure: .authRequired) }
        return try await user.getIDToken()
        #else
        throw MobilePlanNetworkError(failure: .authRequired)
        #endif
    }

    private func weekday(_ value: String) -> MobileIntakeDay? {
        guard let date = isoFormatter.date(from: value) else { return nil }
        return [nil, .sun, .mon, .tue, .wed, .thu, .fri, .sat][Calendar(identifier: .gregorian).component(.weekday, from: date)]
    }
    private func weekdayRank(_ value: MobileIntakeDay?) -> Int {
        guard let value else { return 0 }
        return [.mon, .tue, .wed, .thu, .fri, .sat, .sun].firstIndex(of: value) ?? 0
    }
    private func shifted(_ value: String, days: Int) -> String? {
        guard let date = isoFormatter.date(from: value), let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: date) else { return nil }
        return isoFormatter.string(from: next)
    }
    private var isoFormatter: DateFormatter {
        let value = DateFormatter(); value.calendar = Calendar(identifier: .gregorian); value.locale = Locale(identifier: "en_US_POSIX"); value.timeZone = TimeZone(secondsFromGMT: 0); value.dateFormat = "yyyy-MM-dd"; return value
    }

    private func errorMessage(_ error: Error) -> String {
        if let network = error as? MobilePlanNetworkError {
            return switch network.failure {
            case .authRequired: "Sign in again before changing your plan."
            case .offline: "You are offline. The preview is unchanged; retry when connected."
            case .timeout: "Plan validation timed out. Nothing was saved; retry safely."
            case .backendUnavailable: "Plan validation is temporarily unavailable. Nothing was saved."
            case .invalidResponse: "The validator returned an invalid package. Nothing was saved."
            case .unknown: "Plan validation failed. Nothing was saved."
            }
        }
        if let store = error as? MobilePlanStoreError {
            return switch store {
            case .versionConflict: "Your plan changed elsewhere. It has been refreshed; review the change again."
            case .idempotencyConflict: "This operation identifier was already used for different content. Nothing was saved."
            case .deletionPending: "Plan changes are disabled while data deletion is pending."
            case .signedOut: "Sign in again before changing your plan."
            default: "The owner-scoped transaction failed. Nothing was partially saved."
            }
        }
        if error is MobilePlanProposalError { return "That change cannot produce a valid plan proposal." }
        return "The plan change failed safely. Nothing was saved."
    }

    private func conflictMessage(_ response: MobilePlanLifecycleResponseV2) -> String {
        response.reasonCodes.contains(MobilePlanReason.idempotencyConflict.rawValue) ? "This operation conflicts with an earlier change. Refresh and review again." : "Your plan changed elsewhere. Refresh and review again."
    }
    private func rejectionMessage(_ response: MobilePlanLifecycleResponseV2) -> String {
        if response.reasonCodes.contains(MobilePlanReason.completedHistoryChanged.rawValue) { return "Completed workouts are locked and were not changed." }
        if response.reasonCodes.contains(MobilePlanReason.raceDayChanged.rawValue) || response.reasonCodes.contains(MobilePlanReason.raceDayMissingOrInvalid.rawValue) { return "Race day is locked and was not changed." }
        if response.reasonCodes.contains(MobilePlanReason.spacingViolation.rawValue) { return "This change puts hard workouts too close together. Choose another day." }
        if response.reasonCodes.contains("weekly_availability_violation") { return "The proposed plan does not fit the saved weekly availability." }
        if response.reasonCodes.contains("planning_inputs_conflict") { return "Planning inputs changed elsewhere. Refresh and review again." }
        return "The deterministic validator rejected this change. Nothing was saved."
    }
    private func failure(_ response: MobilePlanLifecycleResponseV2) -> MobilePlanAuditFailureState {
        if response.reasonCodes.contains(MobilePlanReason.versionConflict.rawValue) { return .versionConflict }
        if response.reasonCodes.contains(MobilePlanReason.idempotencyConflict.rawValue) { return .idempotencyConflict }
        return .none
    }
    private func auditFailure(_ error: Error) -> MobilePlanAuditFailureState {
        if let value = error as? MobilePlanNetworkError {
            return MobilePlanAuditFailureState(rawValue: value.failure.rawValue) ?? .unknown
        }
        if let value = error as? MobilePlanStoreError {
            return switch value { case .versionConflict: .versionConflict; case .idempotencyConflict: .idempotencyConflict; case .signedOut: .authRequired; default: .unknown }
        }
        return .unknown
    }
    private func emit(action: MobilePlanAction, response: MobilePlanLifecycleResponseV2, mutation: MobileIntakeMutationState, failure: MobilePlanAuditFailureState, started: Date) {
        let outcome: MobileDecisionOutcome = response.result == .preview || response.result == .commitReady || response.result == .replayed ? .success : response.result == .rejected ? .invalid : .failed
        let audit = MobilePlanLifecycleAudit(action: action, outcome: outcome, result: response.result, mutationState: mutation, deterministicValidation: response.result == .rejected ? .failed : .passed, failureState: failure, versionDelta: (response.proposedVersion ?? response.baseVersion) - response.baseVersion, affectedCount: response.impact.affectedWorkoutIDs.count, completedPreserved: response.impact.completedWorkoutsPreserved, latencyMs: min(60_000, max(0, Int(Date().timeIntervalSince(started) * 1000))))
        Task { await self.audit.send(MobileAuditEnvelope(properties: audit)) }
    }
    private func emitFailure(action: MobilePlanAction, failure: MobilePlanAuditFailureState, started: Date) {
        let audit = MobilePlanLifecycleAudit(action: action, outcome: .failed, result: .rejected, mutationState: .rejected, deterministicValidation: .failed, failureState: failure, versionDelta: 0, affectedCount: 0, completedPreserved: 0, latencyMs: min(60_000, max(0, Int(Date().timeIntervalSince(started) * 1000))))
        Task { await self.audit.send(MobileAuditEnvelope(properties: audit)) }
    }
}
