import Foundation

struct MobileTodayRequestError: Error, Equatable {
    var code: MobileTodayFailureCode
    var status: Int?
}

protocol MobileTodayDecisionNetworking {
    func fetchDecision(
        request: DecisionRequest,
        idToken: String
    ) async throws -> DecisionResponse
}

final class URLSessionMobileTodayDecisionClient: MobileTodayDecisionNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let timeout: TimeInterval

    init(
        baseURL: URL = MobileTodayAppConfiguration.apiBaseURL,
        session: URLSession = .shared,
        timeout: TimeInterval = 8
    ) {
        self.baseURL = baseURL
        self.session = session
        self.timeout = timeout
    }

    func fetchDecision(
        request: DecisionRequest,
        idToken: String
    ) async throws -> DecisionResponse {
        guard !idToken.isEmpty else {
            throw MobileTodayRequestError(code: .authRequired)
        }
        let url = baseURL.appendingPathComponent("decision")
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try JSONEncoder().encode(request)

        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else {
                throw MobileTodayRequestError(code: .invalidResponse)
            }
            guard (200...299).contains(http.statusCode) else {
                throw MobileTodayRequestError(
                    code: Self.failure(for: http.statusCode),
                    status: http.statusCode
                )
            }
            do {
                return try DecisionResponse.parse(data)
            } catch {
                throw MobileTodayRequestError(code: .invalidResponse)
            }
        } catch let error as MobileTodayRequestError {
            throw error
        } catch let error as URLError {
            switch error.code {
            case .timedOut:
                throw MobileTodayRequestError(code: .timeout)
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
                 .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff:
                throw MobileTodayRequestError(code: .offline)
            default:
                throw MobileTodayRequestError(code: .unknown)
            }
        } catch {
            throw MobileTodayRequestError(code: .unknown)
        }
    }

    static func failure(for status: Int) -> MobileTodayFailureCode {
        if status == 401 || status == 403 { return .authRequired }
        if status == 408 || status == 504 { return .timeout }
        if status >= 500 { return .backendUnavailable }
        return .invalidResponse
    }
}

enum MobileTodayAppConfiguration {
    static var apiBaseURL: URL {
        let defaultsValue = UserDefaults.standard.string(forKey: "kinetic.api-base-url")
        let plistValue = Bundle.main.object(forInfoDictionaryKey: "KINETIC_API_BASE_URL") as? String
        let raw = defaultsValue ?? plistValue ?? "http://127.0.0.1:8000"
        return URL(string: raw) ?? URL(string: "http://127.0.0.1:8000")!
    }

    static var webProfileURL: URL {
        let defaultsValue = UserDefaults.standard.string(forKey: "kinetic.web-profile-url")
        let plistValue = Bundle.main.object(forInfoDictionaryKey: "KINETIC_WEB_PROFILE_URL") as? String
        let raw = defaultsValue ?? plistValue ?? "http://127.0.0.1:3000/profile"
        return URL(string: raw) ?? URL(string: "http://127.0.0.1:3000/profile")!
    }

    static var behaviorPatternsEnabled: Bool {
        if UserDefaults.standard.object(forKey: "kinetic.behavior-patterns-enabled") != nil {
            return UserDefaults.standard.bool(forKey: "kinetic.behavior-patterns-enabled")
        }
        if let value = Bundle.main.object(
            forInfoDictionaryKey: "KINETIC_BEHAVIOR_PATTERNS_ENABLED"
        ) as? Bool {
            return value
        }
        return true
    }
}
