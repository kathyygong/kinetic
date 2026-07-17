import Foundation

protocol MobileTodayCaching {
    func load() -> MobileTodayCacheEnvelope?
    func save(_ cache: MobileTodayCacheEnvelope) throws
    func clear()
}

final class UserDefaultsMobileTodayCache: MobileTodayCaching {
    private let defaults: UserDefaults
    private let key: String

    init(
        defaults: UserDefaults = .standard,
        key: String = "kinetic.mobile-today-cache.v1"
    ) {
        self.defaults = defaults
        self.key = key
    }

    func load() -> MobileTodayCacheEnvelope? {
        guard
            let data = defaults.data(forKey: key),
            let cache = try? JSONDecoder().decode(MobileTodayCacheEnvelope.self, from: data),
            (try? MobileTodayValidator.validate(cache)) != nil
        else { return nil }
        return cache
    }

    func save(_ cache: MobileTodayCacheEnvelope) throws {
        try MobileTodayValidator.validate(cache)
        defaults.set(try JSONEncoder().encode(cache), forKey: key)
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}

struct MobileTodayLocalCalendarContext: Codable, Equatable {
    var capturedAt: String
    var availableMinutes: Int
    var unhealthy: Bool
}

protocol MobileTodayCalendarCaching {
    func load(now: Date) -> MobileTodayCalendarInput?
}

final class UserDefaultsMobileTodayCalendarCache: MobileTodayCalendarCaching {
    private let defaults: UserDefaults
    private let key: String

    init(
        defaults: UserDefaults = .standard,
        key: String = "kinetic.mobile-today-calendar.v1"
    ) {
        self.defaults = defaults
        self.key = key
    }

    func load(now: Date = Date()) -> MobileTodayCalendarInput? {
        if let qaMinutes = Self.qaAvailableMinutes(
            environment: ProcessInfo.processInfo.environment,
            defaultsValue: defaults.string(forKey: "kinetic.qa-available-minutes"),
            arguments: ProcessInfo.processInfo.arguments
        ) {
            return MobileTodayCalendarInput(
                ageHours: 0,
                availableMinutesToday: qaMinutes,
                unhealthy: false,
                bypassCloudFreshnessForQA: true
            )
        }
        guard
            let data = defaults.data(forKey: key),
            let context = try? JSONDecoder().decode(
                MobileTodayLocalCalendarContext.self,
                from: data
            ),
            let captured = MobileTodayDate.parse(context.capturedAt)
        else { return nil }
        return MobileTodayCalendarInput(
            ageHours: max(0, now.timeIntervalSince(captured) / 3600),
            availableMinutesToday: context.availableMinutes,
            unhealthy: context.unhealthy
        )
    }

    static func qaAvailableMinutes(
        environment: [String: String],
        defaultsValue: String?,
        arguments: [String] = []
    ) -> Int? {
        let argumentName = "-kinetic.qa-available-minutes"
        let argumentValue = arguments.firstIndex(of: argumentName).flatMap { index in
            arguments.indices.contains(index + 1) ? arguments[index + 1] : nil
        }
        let rawValue = environment["KINETIC_QA_AVAILABLE_MINUTES"]
            ?? argumentValue
            ?? defaultsValue
        guard let rawValue, let minutes = Int(rawValue), (0...240).contains(minutes) else {
            return nil
        }
        return minutes
    }
}
