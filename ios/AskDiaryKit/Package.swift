// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "AskDiaryKit",
    platforms: [.iOS(.v18), .macOS(.v14)],
    products: [
        .library(name: "AskDiaryKit", targets: ["AskDiaryKit"])
    ],
    targets: [
        .target(name: "AskDiaryKit"),
        .testTarget(
            name: "AskDiaryKitTests",
            dependencies: ["AskDiaryKit"],
            resources: [.copy("Fixtures")]
        )
    ]
)
