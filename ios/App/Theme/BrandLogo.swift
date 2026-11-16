import SwiftUI

/// The mark: a cross drawn as a cloud, billowing only along its sunlit top
/// edges. Same geometry as `src/components/brand/Logo.tsx`, `src/app/icon.svg`
/// and `public/brand/sholam-mark.svg` (32 x 32 viewBox, shapes translated down
/// 0.65). Keep them in step.
struct CrossCloudMark: Shape {
    /// The two bars of the cross. Corner radius 3.5 is half their thickness.
    static let bars: [CGRect] = [
        CGRect(x: 12.5, y: 5.2, width: 7, height: 23.3), // upright
        CGRect(x: 3.5, y: 10.5, width: 25, height: 7), // beam
    ]
    static let barRadius: CGFloat = 3.5
    /// The billows along the sunlit top edges, as (cx, cy, r).
    static let puffs: [(cx: CGFloat, cy: CGFloat, r: CGFloat)] = [
        (16.6, 5.6, 3.4),
        (13.9, 7.7, 2.1),
        (7.2, 11, 2.4),
        (10.3, 10.2, 2.2),
        (21.9, 10.1, 2.3),
        (25, 11.1, 2.3),
    ]
    static let viewBox: CGFloat = 32
    static let offsetY: CGFloat = 0.65

    /// The mark's outline in its own 32 x 32 coordinates, as one filled
    /// region (the union of the bars and billows, so overlaps never cancel).
    static func unitPath() -> Path {
        var outline = Path()
        for bar in bars {
            outline = outline.union(
                Path(roundedRect: bar, cornerRadius: barRadius, style: .circular))
        }
        for puff in puffs {
            outline = outline.union(Path(ellipseIn: CGRect(
                x: puff.cx - puff.r, y: puff.cy - puff.r,
                width: puff.r * 2, height: puff.r * 2)))
        }
        return outline.applying(CGAffineTransform(translationX: 0, y: offsetY))
    }

    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / Self.viewBox
        let transform = CGAffineTransform(
            translationX: rect.midX - Self.viewBox / 2 * scale,
            y: rect.midY - Self.viewBox / 2 * scale
        ).scaledBy(x: scale, y: scale)
        return Self.unitPath().applying(transform)
    }
}

/// Mark + wordmark, as it sits top-left in the header. The mark scales with
/// Dynamic Type alongside the system headline wordmark. VoiceOver reads it
/// once as "Shalom".
struct BrandLogo: View {
    let markSize: CGFloat
    let showsWordmark: Bool
    @ScaledMetric(relativeTo: .headline) private var typeScale: CGFloat = 1

    init(markSize: CGFloat = 24, showsWordmark: Bool = true) {
        self.markSize = markSize
        self.showsWordmark = showsWordmark
    }

    var body: some View {
        HStack(spacing: ShalomTheme.Spacing.xs) {
            CrossCloudMark()
                .frame(width: markSize * typeScale, height: markSize * typeScale)
            if showsWordmark {
                Text(ShalomTheme.brandName)
                    .font(.headline)
                    .tracking(-0.2)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ShalomTheme.brandName)
        .accessibilityAddTraits(showsWordmark ? [] : .isImage)
    }
}

#Preview("Brand logo on the sky") {
    VStack(spacing: 24) {
        BrandLogo()
        BrandLogo(markSize: 48)
        BrandLogo(markSize: 64, showsWordmark: false)
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background { SkyBackground() }
}
