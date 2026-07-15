import FirebaseCore
import SwiftUI

@main
struct KineticCompanionApp: App {
    @StateObject private var viewModel: TodayViewModel

    init() {
        let firebaseConfigured = Self.configureFirebase()
        _viewModel = StateObject(
            wrappedValue: TodayViewModel(firebaseConfigured: firebaseConfigured)
        )
    }

    var body: some Scene {
        WindowGroup {
            TodayView(viewModel: viewModel)
                .task {
                    await viewModel.restoreSession()
                }
        }
    }

    private static func configureFirebase() -> Bool {
        if FirebaseApp.app() != nil {
            return true
        }
        guard
            let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
            let options = FirebaseOptions(contentsOfFile: path)
        else {
            return false
        }
        FirebaseApp.configure(options: options)
        return true
    }
}
