import CryptoKit
import Foundation

enum MobilePlanRaceDistance: String, Codable, CaseIterable { case fiveK = "5k", tenK = "10k", half, marathon }
enum MobilePlanExperience: String, Codable { case beginner, intermediate, advanced }
enum MobilePlanDay: String, Codable, CaseIterable { case mon, tue, wed, thu, fri, sat, sun }

struct MobilePlanGenerationContext: Equatable {
    var raceDistance: MobilePlanRaceDistance
    var targetDate: String
    var experience: MobilePlanExperience
    var weeklyMileage: Double
    var preferredDays: [MobilePlanDay]
    var personalBests: [MobilePlanRaceDistance: Int]
    var weeklyAvailability: [MobileWeeklyAvailability] = []
    var goalRevision: Int
}

enum MobilePlanProposalError: Error, Equatable { case invalidContext, invalidMutation }

enum MobilePlanProposalBuilder {
    static func proposal(
        action: MobilePlanAction,
        current: MobilePlanSnapshot,
        targetWorkoutID: String? = nil,
        newDate: String? = nil,
        newDuration: Int? = nil,
        replacementType: MobilePlanWorkoutType? = nil
    ) throws -> MobilePlanSnapshot {
        var next = current
        next.version += 1
        switch action {
        case .save:
            guard current.status == .draft else { throw MobilePlanProposalError.invalidMutation }
            next.status = .active
        case .pause:
            guard current.status == .active else { throw MobilePlanProposalError.invalidMutation }
            next.status = .paused
        case .resume:
            guard current.status == .paused else { throw MobilePlanProposalError.invalidMutation }
            next.status = .active
        case .move, .availability, .preferredDay:
            guard let targetWorkoutID, let index = next.workouts.firstIndex(where: { $0.id == targetWorkoutID }),
                  next.workouts[index].status != .completed, next.workouts[index].type != .race,
                  let newDate, MobilePlanValidation.isISODate(newDate), newDate != next.workouts[index].date else {
                throw MobilePlanProposalError.invalidMutation
            }
            next.workouts[index].date = newDate
            next.workouts[index].reasonCode = action == .preferredDay ? .preferredDay : action == .availability ? .availability : .runnerEdit
        case .shorten:
            guard let targetWorkoutID, let index = next.workouts.firstIndex(where: { $0.id == targetWorkoutID }),
                  next.workouts[index].status != .completed, next.workouts[index].type != .race,
                  let newDuration, (0..<next.workouts[index].durationMinutes).contains(newDuration) else {
                throw MobilePlanProposalError.invalidMutation
            }
            let ratio = Double(newDuration) / Double(max(1, next.workouts[index].durationMinutes))
            next.workouts[index].durationMinutes = newDuration
            next.workouts[index].distanceMiles = (next.workouts[index].distanceMiles * ratio * 10).rounded() / 10
            next.workouts[index].reasonCode = .runnerEdit
        case .replace:
            guard let targetWorkoutID, let index = next.workouts.firstIndex(where: { $0.id == targetWorkoutID }),
                  next.workouts[index].status != .completed, next.workouts[index].type != .race,
                  let replacementType, replacementType != .race, replacementType != next.workouts[index].type else {
                throw MobilePlanProposalError.invalidMutation
            }
            next.workouts[index].type = replacementType; next.workouts[index].reasonCode = .runnerEdit
        case .skip:
            guard let targetWorkoutID, let index = next.workouts.firstIndex(where: { $0.id == targetWorkoutID }),
                  next.workouts[index].status == .scheduled, next.workouts[index].type != .race else {
                throw MobilePlanProposalError.invalidMutation
            }
            next.workouts[index].status = .skipped; next.workouts[index].reasonCode = .runnerEdit
        case .generate, .regenerateFuture:
            throw MobilePlanProposalError.invalidMutation
        }
        return try next.validated()
    }
}

enum MobilePlanRequestFactory {
    static func make(
        mode: MobilePlanMode,
        operationID: String,
        current: MobilePlanSnapshot?,
        proposed: MobilePlanSnapshot,
        action: MobilePlanAction,
        targetWorkoutID: String?,
        priorOperation: MobilePlanPriorOperation?
    ) throws -> MobilePlanLifecycleRequest {
        let material = FingerprintMaterial(mode: mode, operationID: operationID, expectedVersion: current?.version ?? 0, currentPlan: current, proposedPlan: proposed, action: action, targetWorkoutID: targetWorkoutID)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let digest = SHA256.hash(data: try encoder.encode(material)).map { String(format: "%02x", $0) }.joined()
        return try MobilePlanLifecycleRequest(
            mode: mode, operationID: operationID, requestFingerprint: "sha256-\(digest)",
            expectedVersion: current?.version ?? 0, currentPlan: current, proposedPlan: proposed,
            mutation: .init(action: action, targetWorkoutID: targetWorkoutID, explanationCode: MobilePlanValidation.explanation(for: action)),
            priorOperation: priorOperation
        ).validated()
    }

    static func operationID() -> String { "op-ios-\(UUID().uuidString.lowercased())" }

    private struct FingerprintMaterial: Codable {
        var mode: MobilePlanMode
        var operationID: String
        var expectedVersion: Int
        var currentPlan: MobilePlanSnapshot?
        var proposedPlan: MobilePlanSnapshot
        var action: MobilePlanAction
        var targetWorkoutID: String?
    }
}
