// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "KineticCompanion",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "KineticCompanion",
            targets: ["KineticCompanion"]
        )
    ],
    targets: [
        .target(
            name: "KineticCompanion",
            path: ".",
            exclude: [
                "App",
                "Config",
                "README.md",
                "Tests"
            ],
            sources: [
                "Core",
                "Health",
                "Sync"
            ]
        ),
        .testTarget(
            name: "KineticCompanionTests",
            dependencies: ["KineticCompanion"],
            path: "Tests"
        )
    ]
)
