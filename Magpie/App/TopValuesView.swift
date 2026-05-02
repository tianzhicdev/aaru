import SwiftUI

struct TopValuesView: View {
    let values: [TopValue]

    var body: some View {
        if !values.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                Text("Top Values")
                    .font(Theme.sans(12, weight: .medium))
                    .foregroundStyle(Theme.accent)
                    .textCase(.uppercase)
                    .tracking(1.5)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(values, id: \.value) { value in
                            Text(value.value)
                                .font(Theme.sans(12, weight: .medium))
                                .foregroundStyle(Theme.accentBright)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Theme.surface)
                                .clipShape(Capsule())
                        }
                    }
                    .padding(.horizontal, 2)
                }

                VStack(alignment: .leading, spacing: 10) {
                    ForEach(values, id: \.value) { value in
                        Text(value.description)
                            .font(Theme.serif(16))
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.leading)
                            .lineSpacing(3)
                    }
                }
            }
        }
    }
}
