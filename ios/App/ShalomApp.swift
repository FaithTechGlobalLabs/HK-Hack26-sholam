import SwiftUI

@main @MainActor
struct ShalomApp: App {
    @State private var application = ApplicationModel()

    var body: some Scene {
        WindowGroup {
            RootView(application: application)
                .task { await application.start() }
                .onOpenURL { url in
                    Task { await application.handleURL(url) }
                }
        }
    }
}
