import ShalomCore
import SwiftUI

/// Paywall layout, prepared for a future approved activation. It has only a
/// preview mode: buttons are inert and the screen is labelled as a preview.
/// No production navigation presents it; only the DEBUG `#Preview` below does.
/// A live mode should be added in the same reviewed change that sets
/// `BillingActivation.approved` and real product IDs.
struct PaywallView: View {
    enum Mode { case previewOnly }

    let mode: Mode
    let products: [StoreProduct]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    previewBanner

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Support Shalom")
                            .font(.largeTitle.bold())
                        Text("Every feature is free right now. This screen is a layout preview for a possible future option.")
                            .foregroundStyle(.secondary)
                    }

                    ForEach(products) { product in
                        productRow(product)
                    }

                    Button("Restore Purchases") {}
                        .disabled(true)
                        .accessibilityHint("Unavailable in this preview. Purchases are turned off.")
                }
                .padding(24)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var previewBanner: some View {
        Label("Preview only. Purchases are turned off and nothing can be bought.",
              systemImage: "eye")
            .font(.subheadline.weight(.semibold))
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.yellow.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityAddTraits(.isHeader)
    }

    private func productRow(_ product: StoreProduct) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text(product.displayName).font(.headline)
                if !product.description.isEmpty {
                    Text(product.description).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button(product.displayPrice) {}
                .buttonStyle(.borderedProminent)
                .disabled(true)
                .accessibilityLabel("\(product.displayName), unavailable in preview")
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

#if DEBUG
#Preview("Paywall (preview only)") {
    // Placeholder rows: not App Store products, prices or trials.
    PaywallView(mode: .previewOnly, products: [
        StoreProduct(id: "preview.placeholder.a", displayName: "Placeholder option A",
                     displayPrice: "Price from App Store"),
        StoreProduct(id: "preview.placeholder.b", displayName: "Placeholder option B",
                     displayPrice: "Price from App Store"),
    ])
}
#endif
