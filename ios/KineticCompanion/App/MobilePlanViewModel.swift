import Combine
import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

struct MobilePlanPendingPreview: Equatable {
    var operationID: String
    var action: MobilePlanAction
    var targetWorkoutID: String?
    var currentPlan: MobilePlanSnapshot?
    var proposedPlan: MobilePlanSnapshot
    var response: MobilePlanLifecycleResponse
    var weeks: [MobilePlanWeekMetadata]?
    var generationExplanations: [MobilePlanGenerationExplanationCode]
}

@MainActor
final class MobilePlanViewModel: ObservableObject {
    @Published private(set) var plan: MobilePlanSnapshot?
    @Published private(set) var preview: MobilePlanPendingPreview?
    @Published private(set) var weeks: [MobilePlanWeekMetadata]?
    @Published private(set) var generationExplanations: [MobilePlanGenerationExplanationCode] = []
    @Published private(set) var isWorking = false
    @Published private(set) var legacyPlanPresent = false
    @Published private(set) var message: String?

    private let configured: Bool
    private let generationNetwork: MobilePlanGenerationNetworking
    private let network: MobilePlanLifecycleNetworking
    private let store: MobilePlanStoring
    private let audit: MobileAuditTransporting

    init(configured: Bool, generationNetwork: MobilePlanGenerationNetworking = URLSessionMobilePlanGenerationClient(), network: MobilePlanLifecycleNetworking = URLSessionMobilePlanLifecycleClient(), store: MobilePlanStoring = FirestoreMobilePlanStore(), audit: MobileAuditTransporting = FirestoreMobileAuditTransport()) {
        self.configured = configured; self.generationNetwork = generationNetwork
        self.network = network; self.store = store; self.audit = audit
    }

    func restore() async {
        guard configured else { message = "Firebase configuration is missing."; return }
        do {
            let state = try await store.load()
            plan = state.plan; legacyPlanPresent = state.legacyPlanPresent; message = state.legacyPlanPresent ? "Your proof-era plan is preserved until you approve the validated native replacement." : nil
        } catch { message = "Your owner-scoped plan could not be restored safely." }
    }

    func clear() { plan = nil; preview = nil; weeks = nil; generationExplanations = []; legacyPlanPresent = false; message = nil }

#if DEBUG
    func runQARemainingLifecycleMatrix() async {
        await restore()
        guard let startingPlan = plan else { print("KINETIC_QA_PLAN_MATRIX_FAILED missing_plan"); return }
        let startingVersion = startingPlan.version
        guard await commitFirstValidPreferredDay() else {
            print("KINETIC_QA_PLAN_MATRIX_FAILED preferred_day \(message ?? "unknown")"); return
        }
        guard let skipTarget = plan?.scheduledWorkouts.first(where: { $0.type != .race }) else {
            print("KINETIC_QA_PLAN_MATRIX_FAILED missing_skip_target"); return
        }
        await previewChange(action: .skip, target: skipTarget)
        guard preview?.action == .skip else {
            print("KINETIC_QA_PLAN_MATRIX_FAILED skip_preview \(message ?? "unknown")"); return
        }
        await commitPreview()
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
                  let target = current.scheduledWorkouts.first(where: { $0.type != .race && $0.durationMinutes > 1 }) else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED missing_target"); return
            }
            let startingState = try await store.load()
            let operationID = MobilePlanRequestFactory.operationID()
            let proposed = try MobilePlanProposalBuilder.proposal(
                action: .shorten, current: current, targetWorkoutID: target.id,
                newDuration: target.durationMinutes - 1
            )
            let commitRequest = try MobilePlanRequestFactory.make(
                mode: .commit, operationID: operationID, current: current,
                proposed: proposed, action: .shorten, targetWorkoutID: target.id,
                priorOperation: startingState.priorOperation
            )
            let commitResponse = try await network.validate(request: commitRequest, idToken: try await idToken())
            let first = try await store.commit(response: commitResponse, request: commitRequest)
            guard first.version == current.version + 1, !first.replayed else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED first_commit"); return
            }
            let replay = try await store.commit(response: commitResponse, request: commitRequest)
            guard replay.version == first.version, replay.replayed else {
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED replay"); return
            }

            let alternate = try MobilePlanProposalBuilder.proposal(action: .skip, current: current, targetWorkoutID: target.id)
            let reusedOperationRequest = try MobilePlanRequestFactory.make(
                mode: .commit, operationID: operationID, current: current,
                proposed: alternate, action: .skip, targetWorkoutID: target.id,
                priorOperation: startingState.priorOperation
            )
            let reusedOperationResponse = try await network.validate(request: reusedOperationRequest, idToken: try await idToken())
            do {
                _ = try await store.commit(response: reusedOperationResponse, request: reusedOperationRequest)
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED idempotency_accepted"); return
            } catch MobilePlanStoreError.idempotencyConflict {}

            let staleRequest = try MobilePlanRequestFactory.make(
                mode: .commit, operationID: MobilePlanRequestFactory.operationID(), current: current,
                proposed: alternate, action: .skip, targetWorkoutID: target.id,
                priorOperation: startingState.priorOperation
            )
            let staleResponse = try await network.validate(request: staleRequest, idToken: try await idToken())
            do {
                _ = try await store.commit(response: staleResponse, request: staleRequest)
                print("KINETIC_QA_TRANSACTION_MATRIX_FAILED stale_accepted"); return
            } catch MobilePlanStoreError.versionConflict {}

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
#endif

    func previewGeneration() async {
        await performPreview(action: .generate, targetWorkoutID: nil) {
            try await self.sharedGeneration(mode: .initial, currentPlan: nil)
        }
    }

    func previewChange(action: MobilePlanAction, target: MobilePlanWorkout? = nil, date: String? = nil, duration: Int? = nil, replacement: MobilePlanWorkoutType? = nil) async {
        guard let current = plan else { message = "Generate a plan first."; return }
        await performPreview(action: action, targetWorkoutID: target?.id) {
            if action == .regenerateFuture {
                return try await self.sharedGeneration(mode: .regenerateFuture, currentPlan: current)
            }
            let proposed = try MobilePlanProposalBuilder.proposal(action: action, current: current, targetWorkoutID: target?.id, newDate: date, newDuration: duration, replacementType: replacement)
            return (proposed, self.weeks, self.generationExplanations)
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
            let request = try MobilePlanRequestFactory.make(
                mode: .commit, operationID: pending.operationID, current: pending.currentPlan,
                proposed: pending.proposedPlan, action: pending.action,
                targetWorkoutID: pending.targetWorkoutID, priorOperation: latest.priorOperation
            )
            let response = try await network.validate(request: request, idToken: try await idToken())
            switch response.result {
            case .commitReady:
                let committed = try await store.commit(response: response, request: request)
                let state = try await store.load(); plan = state.plan; legacyPlanPresent = false; preview = nil
                weeks = pending.weeks; generationExplanations = pending.generationExplanations
                message = committed.replayed ? "This change was already saved." : "Plan version \(committed.version) saved."
                emit(action: pending.action, response: response, mutation: .applied, failure: .none, started: started)
                succeeded = true
            case .replayed:
                let state = try await store.load(); plan = state.plan; preview = nil
                weeks = pending.weeks; generationExplanations = pending.generationExplanations
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
        proposal: () async throws -> (plan: MobilePlanSnapshot, weeks: [MobilePlanWeekMetadata]?, explanations: [MobilePlanGenerationExplanationCode])
    ) async {
        isWorking = true; message = nil
        let started = Date(), operationID = MobilePlanRequestFactory.operationID()
        do {
            let current = plan, generated = try await proposal(), proposed = generated.plan, latest = try await store.load()
            let request = try MobilePlanRequestFactory.make(mode: .preview, operationID: operationID, current: current, proposed: proposed, action: action, targetWorkoutID: targetWorkoutID, priorOperation: latest.priorOperation)
            let response = try await network.validate(request: request, idToken: try await idToken())
            if response.result == .preview, response.commitPlan == proposed {
                preview = .init(
                    operationID: operationID, action: action, targetWorkoutID: targetWorkoutID,
                    currentPlan: current, proposedPlan: proposed, response: response,
                    weeks: generated.weeks, generationExplanations: generated.explanations
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
        currentPlan: MobilePlanSnapshot?
    ) async throws -> (plan: MobilePlanSnapshot, weeks: [MobilePlanWeekMetadata], explanations: [MobilePlanGenerationExplanationCode]) {
        let context = try await store.loadGenerationContext()
        let request = try MobilePlanGenerationRequestFactory.make(
            mode: mode, context: context, planningDate: MobileTodayDate.localDay(Date()), currentPlan: currentPlan
        )
        let response = try await generationNetwork.generate(request: request, idToken: try await idToken())
        guard response.mode == mode else { throw MobilePlanNetworkError(failure: .invalidResponse) }
        return (response.candidatePlan, response.weeks, response.explanationCodes)
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

    private func conflictMessage(_ response: MobilePlanLifecycleResponse) -> String {
        response.reasonCodes.contains(.idempotencyConflict) ? "This operation conflicts with an earlier change. Refresh and review again." : "Your plan changed elsewhere. Refresh and review again."
    }
    private func rejectionMessage(_ response: MobilePlanLifecycleResponse) -> String {
        if response.reasonCodes.contains(.completedHistoryChanged) { return "Completed workouts are locked and were not changed." }
        if response.reasonCodes.contains(.raceDayChanged) || response.reasonCodes.contains(.raceDayMissingOrInvalid) { return "Race day is locked and was not changed." }
        if response.reasonCodes.contains(.spacingViolation) { return "This change puts hard workouts too close together. Choose another day." }
        return "The deterministic validator rejected this change. Nothing was saved."
    }
    private func failure(_ response: MobilePlanLifecycleResponse) -> MobilePlanAuditFailureState {
        if response.reasonCodes.contains(.versionConflict) { return .versionConflict }
        if response.reasonCodes.contains(.idempotencyConflict) { return .idempotencyConflict }
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
    private func emit(action: MobilePlanAction, response: MobilePlanLifecycleResponse, mutation: MobileIntakeMutationState, failure: MobilePlanAuditFailureState, started: Date) {
        let outcome: MobileDecisionOutcome = response.result == .preview || response.result == .commitReady || response.result == .replayed ? .success : response.result == .rejected ? .invalid : .failed
        let audit = MobilePlanLifecycleAudit(action: action, outcome: outcome, result: response.result, mutationState: mutation, deterministicValidation: response.result == .rejected ? .failed : .passed, failureState: failure, versionDelta: (response.proposedVersion ?? response.baseVersion) - response.baseVersion, affectedCount: response.impact.affectedWorkoutIDs.count, completedPreserved: response.impact.completedWorkoutsPreserved, latencyMs: min(60_000, max(0, Int(Date().timeIntervalSince(started) * 1000))))
        Task { await self.audit.send(MobileAuditEnvelope(properties: audit)) }
    }
    private func emitFailure(action: MobilePlanAction, failure: MobilePlanAuditFailureState, started: Date) {
        let audit = MobilePlanLifecycleAudit(action: action, outcome: .failed, result: .rejected, mutationState: .rejected, deterministicValidation: .failed, failureState: failure, versionDelta: 0, affectedCount: 0, completedPreserved: 0, latencyMs: min(60_000, max(0, Int(Date().timeIntervalSince(started) * 1000))))
        Task { await self.audit.send(MobileAuditEnvelope(properties: audit)) }
    }
}
