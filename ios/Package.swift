// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MyCredMan",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "MyCredMan",
            targets: ["MyCredMan"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "MyCredMan",
            dependencies: [],
            path: "MyCredMan",
            exclude: ["App/MyCredManApp.swift", "Resources/Info.plist"]
        ),
        .testTarget(
            name: "MyCredManTests",
            dependencies: ["MyCredMan"],
            path: "MyCredManTests"
        ),
    ]
)
