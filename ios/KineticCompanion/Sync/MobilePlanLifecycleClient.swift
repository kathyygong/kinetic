import Foundation

enum MobilePlanNetworkFailure: String, Error, Codable {
    case authRequired = "auth_required", offline, timeout
    case backendUnavailable = "backend_unavailable", invalidResponse = "invalid_response", unknown
}

struct MobilePlanNetworkError: Error, Equatable {
    var failure: MobilePlanNetworkFailure
    var status: Int?
}

protocol MobilePlanLifecycleNetworking {
    func validate(request: MobilePlanLifecycleRequest, idToken: String) async throws -> MobilePlanLifecycleResponse
}

protocol MobilePlanGenerationNetworking {
    func generate(request: MobilePlanGenerationRequest, idToken: String) async throws -> MobilePlanGenerationResponse
}

protocol MobilePlanLifecycleV2Networking {
    func validate(request: MobilePlanLifecycleRequestV2, idToken: String) async throws -> MobilePlanLifecycleResponseV2
}

protocol MobilePlanGenerationV2Networking {
    func generate(request: MobilePlanGenerationRequestV2, idToken: String) async throws -> MobilePlanGenerationResponseV2
}

protocol MobileAccountCleanupNetworking {
    func perform(request: MobileAccountCleanupRequest, idToken: String) async throws -> MobileAccountCleanupResponse
}

final class URLSessionMobilePlanGenerationClient: MobilePlanGenerationNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let timeout: TimeInterval

    init(baseURL: URL = MobileTodayAppConfiguration.apiBaseURL, session: URLSession = .shared, timeout: TimeInterval = 30) {
        self.baseURL = baseURL; self.session = session; self.timeout = timeout
    }

    func generate(request: MobilePlanGenerationRequest, idToken: String) async throws -> MobilePlanGenerationResponse {
        guard !idToken.isEmpty else { throw MobilePlanNetworkError(failure: .authRequired) }
        let valid = try request.validated()
        let url = baseURL.appendingPathComponent("mobile").appendingPathComponent("plan-generation")
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"; urlRequest.timeoutInterval = timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try JSONEncoder().encode(valid)
        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else { throw MobilePlanNetworkError(failure: .invalidResponse) }
            guard (200...299).contains(http.statusCode) else {
                throw MobilePlanNetworkError(failure: Self.failure(status: http.statusCode), status: http.statusCode)
            }
            do { return try MobilePlanGenerationResponse.decodeStrict(data) }
            catch { throw MobilePlanNetworkError(failure: .invalidResponse) }
        } catch let error as MobilePlanNetworkError { throw error }
        catch let error as URLError { throw MobilePlanNetworkError(failure: Self.failure(urlError: error)) }
        catch { throw MobilePlanNetworkError(failure: .unknown) }
    }

    private static func failure(status: Int) -> MobilePlanNetworkFailure {
        if status == 401 || status == 403 { return .authRequired }
        if status == 408 || status == 504 { return .timeout }
        if status >= 500 { return .backendUnavailable }
        return .invalidResponse
    }

    private static func failure(urlError: URLError) -> MobilePlanNetworkFailure {
        switch urlError.code {
        case .timedOut: .timeout
        case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
             .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff: .offline
        default: .unknown
        }
    }
}

final class URLSessionMobilePlanLifecycleClient: MobilePlanLifecycleNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let timeout: TimeInterval

    init(baseURL: URL = MobileTodayAppConfiguration.apiBaseURL, session: URLSession = .shared, timeout: TimeInterval = 30) {
        self.baseURL = baseURL; self.session = session; self.timeout = timeout
    }

    func validate(request: MobilePlanLifecycleRequest, idToken: String) async throws -> MobilePlanLifecycleResponse {
        guard !idToken.isEmpty else { throw MobilePlanNetworkError(failure: .authRequired) }
        let valid = try request.validated()
        let url = baseURL.appendingPathComponent("mobile").appendingPathComponent("plan-lifecycle")
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"; urlRequest.timeoutInterval = timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try JSONEncoder().encode(valid)
        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else { throw MobilePlanNetworkError(failure: .invalidResponse) }
            guard (200...299).contains(http.statusCode) else {
                let failure: MobilePlanNetworkFailure = if http.statusCode == 401 || http.statusCode == 403 { .authRequired } else if http.statusCode == 408 || http.statusCode == 504 { .timeout } else if http.statusCode >= 500 { .backendUnavailable } else { .invalidResponse }
                throw MobilePlanNetworkError(failure: failure, status: http.statusCode)
            }
            do { return try MobilePlanLifecycleResponse.decodeStrict(data) }
            catch { throw MobilePlanNetworkError(failure: .invalidResponse) }
        } catch let error as MobilePlanNetworkError { throw error }
        catch let error as URLError {
            let failure: MobilePlanNetworkFailure = switch error.code {
            case .timedOut: .timeout
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff: .offline
            default: .unknown
            }
            throw MobilePlanNetworkError(failure: failure)
        } catch { throw MobilePlanNetworkError(failure: .unknown) }
    }
}

final class URLSessionMobilePlanGenerationV2Client: MobilePlanGenerationV2Networking {
    private let baseURL: URL; private let session: URLSession; private let timeout: TimeInterval
    init(baseURL: URL = MobileTodayAppConfiguration.apiBaseURL, session: URLSession = .shared, timeout: TimeInterval = 30) {
        self.baseURL = baseURL; self.session = session; self.timeout = timeout
    }
    func generate(request: MobilePlanGenerationRequestV2, idToken: String) async throws -> MobilePlanGenerationResponseV2 {
        try await MobilePlanHTTP.post(
            request: try request.validated(), path: "plan-generation", idToken: idToken,
            baseURL: baseURL, session: session, timeout: timeout,
            decode: MobilePlanGenerationResponseV2.decodeStrict
        )
    }
}

final class URLSessionMobilePlanLifecycleV2Client: MobilePlanLifecycleV2Networking {
    private let baseURL: URL; private let session: URLSession; private let timeout: TimeInterval
    init(baseURL: URL = MobileTodayAppConfiguration.apiBaseURL, session: URLSession = .shared, timeout: TimeInterval = 30) {
        self.baseURL = baseURL; self.session = session; self.timeout = timeout
    }
    func validate(request: MobilePlanLifecycleRequestV2, idToken: String) async throws -> MobilePlanLifecycleResponseV2 {
        try await MobilePlanHTTP.post(
            request: try request.validated(), path: "plan-lifecycle", idToken: idToken,
            baseURL: baseURL, session: session, timeout: timeout,
            decode: MobilePlanLifecycleResponseV2.decodeStrict
        )
    }
}

final class URLSessionMobileAccountCleanupClient: MobileAccountCleanupNetworking {
    private let baseURL: URL; private let session: URLSession; private let timeout: TimeInterval
    init(baseURL: URL = MobileTodayAppConfiguration.apiBaseURL, session: URLSession = .shared, timeout: TimeInterval = 45) {
        self.baseURL = baseURL; self.session = session; self.timeout = timeout
    }
    func perform(request: MobileAccountCleanupRequest, idToken: String) async throws -> MobileAccountCleanupResponse {
        try await MobilePlanHTTP.post(
            request: request, path: "account-cleanup", idToken: idToken,
            baseURL: baseURL, session: session, timeout: timeout,
            decode: MobileAccountCleanupResponse.decodeStrict
        )
    }
}

private enum MobilePlanHTTP {
    static func post<Request: Encodable, Response>(
        request: Request, path: String, idToken: String, baseURL: URL,
        session: URLSession, timeout: TimeInterval,
        decode: (Data) throws -> Response
    ) async throws -> Response {
        guard !idToken.isEmpty else { throw MobilePlanNetworkError(failure: .authRequired) }
        let url = baseURL.appendingPathComponent("mobile").appendingPathComponent(path)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"; urlRequest.timeoutInterval = timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try JSONEncoder().encode(request)
        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else { throw MobilePlanNetworkError(failure: .invalidResponse) }
            guard (200...299).contains(http.statusCode) else {
                let failure: MobilePlanNetworkFailure = if http.statusCode == 401 || http.statusCode == 403 { .authRequired } else if http.statusCode == 408 || http.statusCode == 504 { .timeout } else if http.statusCode >= 500 { .backendUnavailable } else { .invalidResponse }
                throw MobilePlanNetworkError(failure: failure, status: http.statusCode)
            }
            do { return try decode(data) }
            catch { throw MobilePlanNetworkError(failure: .invalidResponse) }
        } catch let error as MobilePlanNetworkError { throw error }
        catch let error as URLError {
            let failure: MobilePlanNetworkFailure = switch error.code {
            case .timedOut: .timeout
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff: .offline
            default: .unknown
            }
            throw MobilePlanNetworkError(failure: failure)
        } catch { throw MobilePlanNetworkError(failure: .unknown) }
    }
}
