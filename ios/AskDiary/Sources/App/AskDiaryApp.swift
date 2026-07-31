import SwiftData
import SwiftUI

@main
struct AskDiaryApp: App {
    let container: ModelContainer = {
        // CloudKit mirroring activates automatically once the iCloud entitlement
        // exists (paid developer account); until then this is a local store.
        let schema = Schema([Conversation.self, Message.self])
        do {
            return try ModelContainer(for: schema)
        } catch {
            fatalError("Could not create SwiftData container: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(AppModel())
        }
        .modelContainer(container)
    }
}
