import FirebaseCore
import SwiftUI

@main
struct KineticCompanionApp: App {
    private static var firebaseConfigured = false
    @StateObject private var viewModel: TodayViewModel
    @StateObject private var foundationViewModel: MobileFoundationViewModel

    init() {
        let firebaseConfigured = Self.configureFirebase()
        _viewModel = StateObject(
            wrappedValue: TodayViewModel(firebaseConfigured: firebaseConfigured)
        )
        _foundationViewModel = StateObject(wrappedValue: MobileFoundationViewModel(configured: firebaseConfigured))
    }

    var body: some Scene {
        WindowGroup {
            MobileRootView(foundation: foundationViewModel, today: viewModel)
        }
    }

    private static func configureFirebase() -> Bool {
        if firebaseConfigured {
            return true
        }
        guard
            let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
            let options = FirebaseOptions(contentsOfFile: path)
        else {
            return false
        }
        FirebaseApp.configure(options: options)
        firebaseConfigured = true
        return true
    }
}
