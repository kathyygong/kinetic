import CryptoKit
import Foundation

enum MobilePlanRaceDistance: String, Codable { case fiveK = "5k", tenK = "10k", half, marathon }
enum MobilePlanExperience: String, Codable { case beginner, intermediate, advanced }
enum MobilePlanDay: String, Codable, CaseIterable { case mon, tue, wed, thu, fri, sat, sun }

struct MobilePlanGenerationContext: Equatable {
    var raceDistance: MobilePlanRaceDistance
    var targetDate: String
    var experience: MobilePlanExperience
    var weeklyMileage: Double
    var preferredDays: [MobilePlanDay]
    var personalBests: [MobilePlanRaceDistance: Int]
    var goalRevision: Int
}

enum MobilePlanProposalError: Error, Equatable { case invalidContext, invalidMutation }

enum MobilePlanProposalBuilder {
    private struct Template { var day: Int; var type: MobilePlanWorkoutType? }
    private struct Paces { var easy: Double; var tempo: Double; var intervals: Double; var longRun: Double }

    static func generate(context: MobilePlanGenerationContext, today: Date = Date()) throws -> MobilePlanSnapshot {
        guard MobilePlanValidation.isISODate(context.targetDate), context.weeklyMileage.isFinite,
              (0...150).contains(context.weeklyMileage), context.goalRevision >= 1,
              let target = parse(context.targetDate) else { throw MobilePlanProposalError.invalidContext }
        let calendar = utcCalendar
        let days = max(0, calendar.dateComponents([.day], from: calendar.startOfDay(for: today), to: target).day ?? 0)
        let totalWeeks = min(20, max(4, Int(ceil(Double(days + 1) / 7.0))))
        let perWeek: Int = switch context.experience { case .beginner: 3; case .intermediate: 4; case .advanced: 5 }
        let template = remap(template: baseTemplate(perWeek), preferred: context.preferredDays)
        let taper: [Double] = switch context.raceDistance {
        case .fiveK, .tenK: [0.7]
        case .half: [0.85, 0.6]
        case .marathon: [0.8, 0.65, 0.5]
        }
        let raceMiles: Double = switch context.raceDistance { case .fiveK: 3.1; case .tenK: 6.2; case .half: 13.1; case .marathon: 26.2 }
        let maxGrowth: Double = switch context.raceDistance { case .fiveK, .tenK: 1.5; case .half: 1.6; case .marathon: 1.8 }
        let minimumBase: Double = switch context.raceDistance { case .fiveK, .tenK: 0; case .half: 18; case .marathon: 25 }
        let estimated: Double = switch context.experience { case .beginner: 15; case .intermediate: 25; case .advanced: 40 }
        let base = max(context.weeklyMileage > 0 ? context.weeklyMileage : estimated, minimumBase)
        let distanceCap: Double = switch context.raceDistance { case .fiveK: 8; case .tenK: 10; case .half: 14; case .marathon: 22 }
        let volumeCap: Double = switch context.raceDistance { case .fiveK, .tenK: 0.30; case .half: 0.40; case .marathon: 0.50 }
        let longBump: Double = switch context.raceDistance { case .fiveK: 0.85; case .tenK: 1; case .half: 1.1; case .marathon: 1.25 }
        let peakOffset: Int = switch context.raceDistance { case .fiveK, .tenK: 1; case .half: 2; case .marathon: 3 }
        let longCap = min(distanceCap, base * maxGrowth * volumeCap)
        let longStart = min(base * 0.3 * longBump, longCap)
        let taperStart = max(0, totalWeeks - taper.count)
        let peakWeek = max(0, totalWeeks - 1 - peakOffset)
        let raceWeekStart = monday(containing: target)
        let planStart = calendar.date(byAdding: .day, value: -(totalWeeks - 1) * 7, to: raceWeekStart)!
        let easyCount = template.filter { $0.type == .easy }.count
        let planID = "plan-\(context.raceDistance.rawValue)-\(context.targetDate)"
        var workouts: [MobilePlanWorkout] = []

        for index in 0..<totalWeeks {
            let raceWeek = index == totalWeeks - 1
            let taperWeek = index >= taperStart
            let downWeek = !taperWeek && totalWeeks >= 6 && (totalWeeks - taper.count) >= 4 && index > 0 && (index + 1).isMultiple(of: 4)
            var phaseMultiplier = 1.0
            if taperWeek { phaseMultiplier = taper[index - taperStart] }
            else if downWeek { phaseMultiplier = 0.8 }
            let growth = min(1 + 0.1 * Double(index), maxGrowth)
            let weekMiles = base * growth * phaseMultiplier
            var longMiles: Double
            if peakWeek == 0 { longMiles = longCap * (taperWeek ? phaseMultiplier : 1) }
            else if index <= peakWeek {
                longMiles = longStart + (longCap - longStart) * Double(index) / Double(peakWeek)
                if downWeek { longMiles *= 0.8 }
            } else { longMiles = longCap * phaseMultiplier }
            longMiles = min(longMiles, longCap)
            let qualityMiles = weekMiles * 0.2
            var easyMiles = easyCount > 0 ? max(0, weekMiles - longMiles - qualityMiles) / Double(easyCount) : 0
            let easyCap = min(longMiles * 0.9, weekMiles * 0.4)
            if easyMiles > easyCap {
                let overflow = (easyMiles - easyCap) * Double(easyCount)
                easyMiles = easyCap; longMiles = min(longMiles + overflow, longCap)
            }
            let paces = trainingPaces(context: context, progress: totalWeeks > 1 ? Double(index) / Double(totalWeeks - 1) : 1)
            let weekStart = calendar.date(byAdding: .day, value: index * 7, to: planStart)!

            for (slot, item) in template.enumerated() {
                var type = item.type ?? (index.isMultiple(of: 2) ? .tempo : .intervals)
                var date = calendar.date(byAdding: .day, value: item.day, to: weekStart)!
                if raceWeek && type == .longRun { type = .race; date = target }
                if raceWeek && type != .race && date >= target { continue }
                let distance: Double
                if type == .race { distance = raceMiles }
                else if type == .longRun { distance = roundHalf(longMiles) }
                else if type == .tempo || type == .intervals { distance = roundHalf(qualityMiles) }
                else { distance = roundHalf(easyMiles) }
                let paceMinutes: Double = switch type {
                case .easy: paces.easy
                case .tempo, .race: paces.tempo
                case .intervals: paces.intervals
                case .longRun: paces.longRun
                }
                let day = format(date)
                workouts.append(.init(
                    id: "w-\(index + 1)-\(slot + 1)-\(day)", date: day, type: type,
                    status: .scheduled, distanceMiles: distance,
                    durationMinutes: min(480, roundFive(distance * paceMinutes)),
                    paceSecondsPerMile: Int((paceMinutes * 60).rounded()),
                    reasonCode: type == .race ? .raceDay : .basePlan
                ))
            }
        }
        let hardTypes: Set<MobilePlanWorkoutType> = [.tempo, .intervals, .longRun, .race]
        let raceDate = context.targetDate
        workouts.removeAll { workout in
            guard workout.type != .race, hardTypes.contains(workout.type), let date = parse(workout.date) else { return false }
            let gap = calendar.dateComponents([.day], from: date, to: target).day ?? 2
            return workout.date < raceDate && gap < 2
        }
        return try MobilePlanSnapshot(id: planID, version: 1, status: .draft, goalRevision: context.goalRevision, workouts: workouts).validated()
    }

    static func proposal(
        action: MobilePlanAction,
        current: MobilePlanSnapshot,
        targetWorkoutID: String? = nil,
        newDate: String? = nil,
        newDuration: Int? = nil,
        replacementType: MobilePlanWorkoutType? = nil,
        regenerated: MobilePlanSnapshot? = nil
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
        case .regenerateFuture:
            guard let regenerated else { throw MobilePlanProposalError.invalidMutation }
            let completed = current.workouts.filter { $0.status == .completed }
            let races = current.workouts.filter { $0.type == .race }
            var future = regenerated.workouts.filter { candidate in
                candidate.type != .race && !completed.contains(where: { $0.id == candidate.id || $0.date == candidate.date })
            }
            future = future.map { workout in var value = workout; value.reasonCode = .futureRegeneration; return value }
            next.workouts = completed + future + races
            next.goalRevision = max(current.goalRevision, regenerated.goalRevision)
        case .generate:
            throw MobilePlanProposalError.invalidMutation
        }
        return try next.validated()
    }

    private static func baseTemplate(_ count: Int) -> [Template] {
        switch count {
        case 3: [Template(day: 1, type: .easy), Template(day: 3, type: nil), Template(day: 6, type: .longRun)]
        case 5: [Template(day: 0, type: .easy), Template(day: 1, type: nil), Template(day: 3, type: .easy), Template(day: 4, type: .easy), Template(day: 6, type: .longRun)]
        default: [Template(day: 0, type: .easy), Template(day: 2, type: nil), Template(day: 4, type: .easy), Template(day: 6, type: .longRun)]
        }
    }

    private static func remap(template: [Template], preferred: [MobilePlanDay]) -> [Template] {
        let ranks = Array(Set(preferred.map(dayRank))).sorted()
        guard ranks.count >= template.count else { return template }
        var remaining = Set(ranks), mapped = template
        for index in template.indices.sorted(by: { template[$0].day > template[$1].day }) {
            let selected = remaining.min { left, right in
                let ld = abs(left - template[index].day), rd = abs(right - template[index].day)
                return ld == rd ? left < right : ld < rd
            }!
            mapped[index].day = selected; remaining.remove(selected)
        }
        return mapped
    }

    private static func dayRank(_ day: MobilePlanDay) -> Int { MobilePlanDay.allCases.firstIndex(of: day)! }
    private static func roundHalf(_ value: Double) -> Double { max(0.5, (value * 2).rounded() / 2) }
    private static func roundFive(_ value: Double) -> Int { max(5, Int((value / 5).rounded()) * 5) }

    private static func trainingPaces(context: MobilePlanGenerationContext, progress: Double) -> Paces {
        let miles: [MobilePlanRaceDistance: Double] = [.fiveK: 3.107, .tenK: 6.214, .half: 13.109, .marathon: 26.219]
        let candidates = context.personalBests.compactMap { distance, seconds -> Double? in
            guard seconds > 0, let from = miles[distance] else { return nil }
            return Double(seconds) * pow(3.107 / from, 1.06)
        }
        let current = candidates.min() ?? 1500
        let improvement: Double = switch context.experience { case .beginner: 0.045; case .intermediate: 0.035; case .advanced: 0.025 }
        let projected = current * (1 - improvement)
        let seconds = current + (projected - current) * min(1, max(0, progress))
        let base = seconds / 60 / 3.107
        func round2(_ value: Double) -> Double { (value * 100).rounded() / 100 }
        return .init(easy: round2(base + 1.75), tempo: round2(base + 0.5), intervals: round2(base - 0.08), longRun: round2(base + 1.5))
    }

    private static var utcCalendar: Calendar { var value = Calendar(identifier: .gregorian); value.timeZone = TimeZone(secondsFromGMT: 0)!; return value }
    private static func parse(_ value: String) -> Date? { let f = DateFormatter(); f.calendar = utcCalendar; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = utcCalendar.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.date(from: value) }
    private static func format(_ value: Date) -> String { let f = DateFormatter(); f.calendar = utcCalendar; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = utcCalendar.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from: value) }
    private static func monday(containing date: Date) -> Date { let weekday = utcCalendar.component(.weekday, from: date); let offset = (weekday + 5) % 7; return utcCalendar.date(byAdding: .day, value: -offset, to: utcCalendar.startOfDay(for: date))! }
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
