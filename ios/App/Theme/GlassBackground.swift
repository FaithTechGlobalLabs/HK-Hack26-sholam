import SwiftUI

/// Frosted blue glass for panels, chips and controls over the sky (the web's
/// `.glass` / `.glass-btn`). Use it as a background:
/// `.background { GlassBackground(cornerRadius: 22) }`.
///
/// - iOS 26 and later (built with a Swift 6.2+ toolchain): system Liquid Glass,
///   tinted sky blue.
/// - iOS 17 to 25: the system ultra-thin material under a deep blue tint
///   (92%, emphasis 94%), the web's light tint only as a faint top sheen,
///   with a light hairline edge.
/// - Reduce Transparency: an opaque blue that keeps white type legible.
/// - Increase Contrast: a stronger tint (97%, emphasis 99%), no sheen, and a
///   firmer edge; with Reduce Transparency, the deeper opaque blue.
struct GlassBackground: View {
    let cornerRadius: CGFloat
    let emphasis: Bool

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    init(cornerRadius: CGFloat = 24, emphasis: Bool = false) {
        self.cornerRadius = cornerRadius
        self.emphasis = emphasis
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    private var increased: Bool { contrast == .increased }

    var body: some View {
        if reduceTransparency {
            // Opaque. With Increase Contrast as well, always the deeper blue
            // and a firmer edge.
            shape
                .fill(emphasis || increased ? ShalomTheme.glassSolidEmphasis : ShalomTheme.glassSolid)
                .overlay {
                    shape.strokeBorder(.white.opacity(increased ? 0.8 : 0.3),
                                       lineWidth: increased ? 1.5 : 1)
                }
        } else {
            translucent
        }
    }

    @ViewBuilder private var translucent: some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            Color.clear
                .glassEffect(
                    .regular.tint((emphasis ? ShalomTheme.glassSolidEmphasis : ShalomTheme.glassSolid)
                        .opacity(tintOpacity)),
                    in: shape
                )
                .overlay {
                    if increased { shape.strokeBorder(.white.opacity(0.8), lineWidth: 1.5) }
                }
        } else {
            materialGlass
        }
        #else
        materialGlass
        #endif
    }

    /// How much deep blue sits over the blur. White type needs a dark tint:
    /// the light material alone goes near-white over a cloud.
    private var tintOpacity: Double {
        switch (emphasis, increased) {
        case (true, true): 0.99
        case (true, false): 0.94
        case (false, true): 0.97
        case (false, false): 0.92
        }
    }

    /// iOS 17 to 25: system blur under a deep blue tint, the web's light
    /// tint kept only as a faint sheen across the top, and edge light.
    private var materialGlass: some View {
        shape
            .fill(.ultraThinMaterial)
            .environment(\.colorScheme, .light)
            .overlay {
                shape.fill((emphasis ? ShalomTheme.glassSolidEmphasis : ShalomTheme.glassSolid)
                    .opacity(tintOpacity))
            }
            .overlay {
                if !increased {
                    shape.fill(LinearGradient(
                        stops: [
                            .init(color: ShalomTheme.glassTintTop.opacity(0.08), location: 0),
                            .init(color: ShalomTheme.glassTintBottom.opacity(0), location: 0.45),
                        ],
                        startPoint: .top, endPoint: .bottom
                    ))
                }
            }
            .overlay {
                // Hairline edge, brighter along the top like light on glass.
                shape.strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(increased ? 0.8 : 0.5),
                                 .white.opacity(increased ? 0.6 : 0.2)],
                        startPoint: .top, endPoint: .bottom
                    ),
                    lineWidth: 1
                )
            }
    }
}

#Preview("Glass over the sky") {
    VStack(spacing: 20) {
        Text("Standard glass")
            .padding(.horizontal, 20).frame(minHeight: 44)
            .background { GlassBackground(cornerRadius: 22) }
        Text("Emphasis glass")
            .padding(.horizontal, 20).frame(minHeight: 44)
            .background { GlassBackground(cornerRadius: 22, emphasis: true) }
    }
    .font(.body.weight(.medium))
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background { SkyBackground() }
}
