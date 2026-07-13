import SwiftUI

#if canImport(FirebaseCore)
import FirebaseCore
#endif

@main
struct KineticCompanionApp: App {
    init() {
        #if canImport(FirebaseCore)
        FirebaseApp.configure()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            TodayView(
                viewModel: TodayViewModel.previewSynced()
            )
        }
    }
}
