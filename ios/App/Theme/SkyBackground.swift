import SwiftUI

/// The still sky behind the app (native counterpart of
/// `src/components/shell/CloudSky.tsx`): flat-bottomed cumulus over a blue
/// gradient, with one cloud shaped as the cross, lit warmly from behind to
/// the right of the reading column.
///
/// The sky is brand artwork, not ambient motion: it is still in every
/// section by default, so reading never competes with drifting clouds and
/// nobody has to turn on Reduce Motion to get a calm page. It shows the same
/// composed frame the animated version used as its still (time 0).
///
/// Cost is bounded: every cloud is authored once per sky size as a vector
/// outline (domes unioned and cut flat at the base), shaded and softened,
/// then rasterised a single time with `ImageRenderer`. There is no timeline
/// or redraw loop; the canvas repaints only when the size (and so the
/// authored scene) changes, placing at most eight pre-rendered sprites and
/// one gradient. Nothing runs in the background or in Low Power Mode.
/// Purely decorative: hidden from accessibility and never takes touches.
struct SkyBackground: View {
    @State private var scene = SkyScene.empty

    init() {}

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            // A value snapshot for the painter; the task below reads and
            // writes the @State itself through `self.scene`.
            let snapshot = self.scene
            Canvas(opaque: true) { context, canvasSize in
                SkyPainter.paint(snapshot, time: SkyPainter.stillTime, size: canvasSize, in: &context)
            }
            .task(id: size) {
                guard size.width > 0, size.height > 0 else { return }
                // Live window resizing (iPad) settles before the sprites are
                // redrawn; the first layout is immediate.
                if self.scene.size != .zero {
                    try? await Task.sleep(for: .milliseconds(150))
                    if Task.isCancelled { return }
                }
                self.scene = SkyScene.make(size: size)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - Scene

/// One cloud as placed in the sky. Outlines are centred on (0, 0).
struct SkyCloud {
    var outline: Path
    var highlight: Path
    var softness: CGFloat
    /// The pre-rendered sprite and the outline bounds it covers (padded for
    /// the blur). When rendering failed the painter draws the outline live.
    var sprite: Image?
    var spriteRect: CGRect
    var startX: CGFloat
    var y: CGFloat
    var speed: CGFloat
    var opacity: Double
    var halfWidth: CGFloat
    var bobPhase: Double
    var bobAmplitude: CGFloat
    var isCross: Bool
}

struct SkyScene {
    var size: CGSize
    var far: [SkyCloud]
    var cross: SkyCloud?
    var near: [SkyCloud]

    static var empty: SkyScene { SkyScene(size: .zero, far: [], cross: nil, near: []) }

    /// Sprites are rendered at this scale: clouds are soft, so a modest
    /// resolution is indistinguishable and keeps memory small (a few MB).
    private static let spriteScale: CGFloat = 1.25
    private static let maxClouds = 7

    /// Authors the sky for `size`. A fixed seed keeps the composition stable
    /// across launches and rotations; only the layout adapts to the size.
    @MainActor
    static func make(size: CGSize, seed: UInt64 = 0x5A1_0A) -> SkyScene {
        var rng = SeededGenerator(seed: seed)
        let count = min(maxClouds, max(4, Int((size.width / 240).rounded())))
        var clouds: [SkyCloud] = (0..<count).map { i in
            let depth = (Double(i) + Double.random(in: 0..<1, using: &rng)) / Double(count)
            return render(SkyShapes.cumulus(depth: depth, in: size, rng: &rng))
        }
        clouds.sort { $0.speed < $1.speed }
        let farCount = (clouds.count + 1) / 2
        return SkyScene(
            size: size,
            far: Array(clouds.prefix(farCount)),
            cross: render(SkyShapes.cross(in: size)),
            near: Array(clouds.dropFirst(farCount))
        )
    }

    @MainActor
    private static func render(_ cloud: SkyCloud) -> SkyCloud {
        var cloud = cloud
        let pad = cloud.softness * 3
        let rect = cloud.outline.boundingRect.insetBy(dx: -pad, dy: -pad).integral
        cloud.spriteRect = rect
        guard rect.width > 0, rect.height > 0 else { return cloud }
        let outline = cloud.outline
        let highlight = cloud.highlight
        let softness = cloud.softness
        let sprite = Canvas { context, _ in
            context.translateBy(x: -rect.minX, y: -rect.minY)
            SkyPainter.drawCloud(outline: outline, highlight: highlight,
                                 softness: softness, in: &context)
        }
        .frame(width: rect.width, height: rect.height)
        let renderer = ImageRenderer(content: sprite)
        renderer.scale = spriteScale
        if let image = renderer.cgImage {
            cloud.sprite = Image(decorative: image, scale: spriteScale)
        }
        return cloud
    }
}

// MARK: - Shapes

enum SkyShapes {
    /// A flat-bottomed cumulus: a low base with two to four domes of lobes
    /// on top, unioned into one outline and cut level along the bottom.
    static func cumulus(depth: Double, in sky: CGSize, rng: inout SeededGenerator) -> SkyCloud {
        func random(_ range: ClosedRange<Double>) -> CGFloat {
            CGFloat(Double.random(in: range, using: &rng))
        }
        let scale = 0.55 + depth * 0.65
        let width = (220 + random(0...280)) * scale
        let height = width * (0.34 + random(0...0.14))
        let baseY = height * 0.2
        var outline = Path(roundedRect: CGRect(x: -width * 0.46, y: baseY - height * 0.36,
                                               width: width * 0.92, height: height * 0.36),
                           cornerRadius: height * 0.18)
        var highlight = Path()
        let domes = Int.random(in: 2...4, using: &rng)
        for _ in 0..<domes {
            let cx = (random(0...1) - 0.5) * width * 0.6
            let domeWidth = width * (0.35 + random(0...0.35))
            let domeHeight = height * (0.55 + random(0...0.45))
            let lobes = Int.random(in: 3...5, using: &rng)
            for k in 0..<lobes {
                let t = (CGFloat(k) + 0.5) / CGFloat(lobes)
                let arc = sqrt(max(0, 1 - pow(2 * (t - 0.5), 2)))
                let radius = domeHeight * (0.26 + 0.2 * arc) * (0.85 + random(0...0.3))
                let x = cx + (t - 0.5) * domeWidth
                let top = baseY - domeHeight * (0.5 + 0.5 * arc)
                let y = top + radius
                outline = outline.union(circle(x, y, radius))
                if arc > 0.55 {
                    highlight = highlight.union(circle(x, y - radius * 0.28, radius * 0.6))
                }
            }
        }
        // A cloud's base is level: cut everything below it.
        let keep = Path(CGRect(x: -width, y: -height * 3, width: width * 2, height: height * 3 + baseY))
        outline = outline.intersection(keep)
        highlight = highlight.intersection(outline)
        let bounds = outline.boundingRect
        return SkyCloud(
            outline: outline, highlight: highlight, softness: max(3, height * 0.05),
            sprite: nil, spriteRect: bounds,
            startX: random(0...1) * (sky.width + bounds.width) - bounds.width / 2,
            y: sky.height * (0.12 + random(0...0.75)),
            speed: 4 + depth * 16, opacity: 0.45 + depth * 0.5,
            halfWidth: max(-bounds.minX, bounds.maxX) + 40,
            bobPhase: Double(random(0...(2 * .pi))), bobAmplitude: 3, isCross: false
        )
    }

    /// The cross, as a cloud: a slender upright and beam billowing only along
    /// their sunlit top edges, like the brand mark. It sits in the open sky
    /// to the right of the centred reading column so white vapour never
    /// covers white type; narrow screens tuck it low at the trailing edge.
    static func cross(in sky: CGSize) -> SkyCloud {
        let (vw, vh) = (sky.width, sky.height)
        let textRight = vw / 2 + min(348, vw * 0.34)
        let edge = vw - 20
        func reach(_ h: CGFloat) -> CGFloat { h * 0.64 * 0.58 + h * 0.22 }
        var h = min(vh * 0.48, 380)
        let room = edge - textRight - 64
        let tuck = room < 150
        if tuck {
            h = min(vh * 0.32, 220)
        } else {
            while reach(h) > room && h > 160 { h *= 0.86 }
        }
        let t = h * 0.18 // bar thickness
        let beamWidth = h * 0.64
        let beamY = -h / 2 + h * 0.3
        let anchorX = tuck ? edge + reach(h) * 0.15 : min(edge, textRight + 64 + reach(h))
        let anchorY = tuck ? vh * 0.84 : vh * 0.6

        var outline = Path(roundedRect: CGRect(x: -t / 2, y: -h / 2, width: t, height: h),
                           cornerRadius: t / 2)
        outline = outline.union(Path(roundedRect: CGRect(x: -beamWidth / 2, y: beamY - t / 2,
                                                         width: beamWidth, height: t),
                                     cornerRadius: t / 2))
        // Billows along the top edges, the same rhythm as the mark's puffs:
        // a crown on the upright, two on each arm of the beam.
        let billows: [(CGFloat, CGFloat, CGFloat)] = [
            (0.08 * t, -h / 2 + 0.08 * t, 0.62 * t),
            (-0.3 * t, -h / 2 + 0.55 * t, 0.42 * t),
            (-beamWidth * 0.36, beamY - 0.3 * t, 0.42 * t),
            (-beamWidth * 0.2, beamY - 0.38 * t, 0.4 * t),
            (beamWidth * 0.22, beamY - 0.38 * t, 0.4 * t),
            (beamWidth * 0.38, beamY - 0.28 * t, 0.4 * t),
        ]
        var highlight = Path()
        for (x, y, r) in billows {
            outline = outline.union(circle(x, y, r))
            highlight = highlight.union(circle(x, y - r * 0.25, r * 0.62))
        }
        let bounds = outline.boundingRect
        return SkyCloud(
            outline: outline, highlight: highlight.intersection(outline),
            softness: max(3, t * 0.12), sprite: nil, spriteRect: bounds,
            startX: anchorX, y: anchorY, speed: 0, opacity: 1,
            halfWidth: beamWidth / 2 + 80, bobPhase: 0, bobAmplitude: 7, isCross: true
        )
    }

    private static func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }
}

// MARK: - Painting

enum SkyPainter {
    /// The composed still frame: every cloud at its authored place. The
    /// placement still takes a time so the composition is defined in one
    /// way, but the app only ever paints this instant.
    static let stillTime: TimeInterval = 0

    static func paint(_ scene: SkyScene, time: TimeInterval, size: CGSize,
                      in context: inout GraphicsContext) {
        let full = CGRect(origin: .zero, size: size)
        context.fill(Path(full), with: .linearGradient(
            ShalomTheme.skyGradient, startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height)))
        guard scene.size != .zero else { return }
        for cloud in scene.far { place(cloud, time: time, width: size.width, in: &context) }
        if let cross = scene.cross { place(cross, time: time, width: size.width, in: &context) }
        for cloud in scene.near { place(cloud, time: time, width: size.width, in: &context) }
    }

    private static func place(_ cloud: SkyCloud, time: TimeInterval, width: CGFloat,
                              in context: inout GraphicsContext) {
        let x: CGFloat
        if cloud.isCross {
            // Sways slowly around its anchor so it never leaves the sky.
            x = cloud.startX + CGFloat(sin(time * 0.06)) * 20
        } else {
            let span = width + cloud.halfWidth * 2
            let travelled = (cloud.startX + cloud.halfWidth + cloud.speed * CGFloat(time))
                .truncatingRemainder(dividingBy: span)
            x = (travelled < 0 ? travelled + span : travelled) - cloud.halfWidth
        }
        let y = cloud.y + CGFloat(sin(time * 0.3 + cloud.bobPhase)) * cloud.bobAmplitude

        if cloud.isCross {
            // Faint warm light behind the cross.
            let radius = cloud.halfWidth * 0.85
            let centre = CGPoint(x: x, y: y - 60)
            context.fill(
                Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius,
                                       width: radius * 2, height: radius * 2)),
                with: .radialGradient(
                    Gradient(stops: [
                        .init(color: ShalomTheme.crossGlow.opacity(0.32), location: 0),
                        .init(color: ShalomTheme.crossGlow.opacity(0.1), location: 0.5),
                        .init(color: ShalomTheme.crossGlow.opacity(0), location: 1),
                    ]),
                    center: centre, startRadius: 0, endRadius: radius))
        }

        var layer = context
        layer.opacity = cloud.opacity
        if let sprite = cloud.sprite {
            layer.draw(sprite, in: cloud.spriteRect.offsetBy(dx: x, dy: y))
        } else {
            layer.translateBy(x: x, y: y)
            drawCloud(outline: cloud.outline, highlight: cloud.highlight,
                      softness: cloud.softness, in: &layer)
        }
    }

    /// Body lit from above and shaded grey-blue toward the base, softened at
    /// the edge like vapour, then brighter sunlit tops on the upper lobes.
    static func drawCloud(outline: Path, highlight: Path, softness: CGFloat,
                          in context: inout GraphicsContext) {
        let bounds = outline.boundingRect
        context.drawLayer { body in
            body.addFilter(.blur(radius: softness))
            body.fill(outline, with: .linearGradient(
                Gradient(stops: [
                    .init(color: .white, location: 0),
                    .init(color: .white.opacity(0.96), location: 0.45),
                    .init(color: ShalomTheme.cloudShade.opacity(0.92), location: 1),
                ]),
                startPoint: CGPoint(x: bounds.midX, y: bounds.minY),
                endPoint: CGPoint(x: bounds.midX, y: bounds.maxY)))
        }
        context.drawLayer { light in
            light.addFilter(.blur(radius: softness * 1.8))
            light.fill(highlight, with: .color(.white.opacity(0.6)))
        }
    }
}

/// SplitMix64: a small deterministic generator, so the authored sky is the
/// same on every launch.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

#Preview("Sky") {
    SkyBackground()
}
