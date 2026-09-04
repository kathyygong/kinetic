import FirebaseCore
import SwiftUI

@main
struct KineticCompanionApp: App {
    @StateObject private var viewModel: TodayViewModel

    init() {
        let firebaseConfigured = Self.configureFirebase()
        let viewModel = TodayViewModel(firebaseConfigured: firebaseConfigured)
        #if DEBUG
        if BehaviorPatternAccessibilityQA.isEnabled {
            viewModel.prepareBehaviorPatternAccessibilityQA()
        }
        #endif
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some Scene {
        WindowGroup {
            rootView
        }
    }

    @ViewBuilder
    private var rootView: some View {
        #if DEBUG
        if BehaviorPatternAccessibilityQA.isEnabled {
            BehaviorPatternView(viewModel: viewModel, accessibilityQAPreview: true)
        } else {
            productionRoot
        }
        #else
        productionRoot
        #endif
    }

    private var productionRoot: some View {
        TodayView(viewModel: viewModel)
            .task {
                await viewModel.restoreSession()
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
