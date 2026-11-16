// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ShalomCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "ShalomCore", targets: ["ShalomCore"])],
    targets: [
        .target(name: "ShalomCore"),
        .testTarget(
            name: "ShalomCoreTests",
            dependencies: ["ShalomCore"],
            resources: [.process("Fixtures")]
        ),
    ]
)
