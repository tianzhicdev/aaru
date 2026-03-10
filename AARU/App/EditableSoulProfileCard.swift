import SwiftUI

struct EditableSoulProfileCard: View {
    @Binding var profile: SoulProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Soul Profile")
                .font(.title3.bold())

            EditableField(label: "Personality", text: $profile.personality, isMultiline: true)
            EditableArrayField(label: "Interests", items: $profile.interests)
            EditableArrayField(label: "Values", items: $profile.values)
            EditableArrayField(label: "Avoid", items: $profile.avoidTopics)

            if !profile.guessedFields.isEmpty {
                Text("AI guessed: \(profile.guessedFields.joined(separator: ", "))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct EditableField: View {
    let label: String
    @Binding var text: String
    var isMultiline: Bool = false
    @State private var isEditing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            if isEditing {
                if isMultiline {
                    TextEditor(text: $text)
                        .frame(minHeight: 60)
                        .padding(4)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else {
                    TextField(label, text: $text)
                        .textFieldStyle(.roundedBorder)
                }
                Button("Done") { isEditing = false }
                    .font(.caption.weight(.semibold))
            } else {
                Text(text)
                    .onTapGesture { isEditing = true }
            }
        }
    }
}

private struct EditableArrayField: View {
    let label: String
    @Binding var items: [String]
    @State private var isEditing = false
    @State private var editText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            if isEditing {
                TextField("Comma-separated", text: $editText)
                    .textFieldStyle(.roundedBorder)
                Button("Done") {
                    items = editText
                        .split(separator: ",")
                        .map { $0.trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty }
                    isEditing = false
                }
                .font(.caption.weight(.semibold))
            } else {
                Text(items.joined(separator: ", "))
                    .onTapGesture {
                        editText = items.joined(separator: ", ")
                        isEditing = true
                    }
            }
        }
    }
}
