import SwiftUI
import CoreLocation

struct SoulmateProfileSetupView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var age = ""
    @State private var gender = "male"
    @State private var preferredAgeMin = ""
    @State private var preferredAgeMax = ""
    @State private var preferredGenders: Set<String> = ["male", "female", "non_binary"]
    @State private var latitude: Double?
    @State private var longitude: Double?
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var hasExistingLocation = false
    @StateObject private var locationManager = LocationHelper()

    private var isEditing: Bool { model.soulmateProfile != nil }

    private let genderOptions = [
        ("male", "Male"),
        ("female", "Female"),
        ("non_binary", "Non-binary")
    ]

    private var allFieldsFilled: Bool {
        let hasName = !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasAge = Int(age) != nil
        let hasLocation = locationManager.hasLocation || hasExistingLocation
        let hasMinAge = Int(preferredAgeMin) != nil
        let hasMaxAge = Int(preferredAgeMax) != nil
        return hasName && hasAge && hasLocation && hasMinAge && hasMaxAge
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text(isEditing ? "Edit Your Profile" : "Set Up Your Profile")
                        .font(Theme.serif(28, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)

                    if !isEditing {
                        Text("Tell us a bit about yourself.")
                            .font(Theme.sans(14, weight: .light))
                            .foregroundStyle(Theme.textSecondary)
                    }
                }

                // MARK: - About You

                VStack(alignment: .leading, spacing: 20) {
                    sectionHeader("ABOUT YOU")

                    // Display Name
                    VStack(alignment: .leading, spacing: 8) {
                        fieldLabel("Your Name")
                        TextField("How you'd like to be known", text: $displayName)
                            .font(Theme.serif(18))
                            .foregroundStyle(Theme.textPrimary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    // Age
                    VStack(alignment: .leading, spacing: 8) {
                        fieldLabel("Your Age")
                        TextField("Age", text: $age)
                            .keyboardType(.numberPad)
                            .font(Theme.serif(18))
                            .foregroundStyle(Theme.textPrimary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    // Gender
                    VStack(alignment: .leading, spacing: 8) {
                        fieldLabel("Your Gender")
                        HStack(spacing: 10) {
                            ForEach(genderOptions, id: \.0) { value, label in
                                Button {
                                    gender = value
                                } label: {
                                    Text(label)
                                        .font(Theme.sans(14, weight: .medium))
                                        .foregroundStyle(gender == value ? .white : Theme.textSecondary)
                                        .padding(.horizontal, 18)
                                        .padding(.vertical, 12)
                                        .background(gender == value ? Theme.accentBright : Theme.surface)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    // Location
                    VStack(alignment: .leading, spacing: 8) {
                        fieldLabel("Location")
                        Button {
                            hasExistingLocation = false
                            locationManager.requestLocation()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: locationManager.hasLocation || hasExistingLocation ? "checkmark.circle.fill" : "location.fill")
                                    .foregroundStyle(Theme.accent)
                                Text(locationManager.hasLocation || hasExistingLocation ? "Location shared" : "Share my location")
                                    .font(Theme.sans(15))
                                    .foregroundStyle(Theme.textPrimary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(locationManager.hasLocation || hasExistingLocation ? Theme.accentBright.opacity(0.3) : Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                }

                // MARK: - Preferences

                VStack(alignment: .leading, spacing: 20) {
                    sectionHeader("WHO YOU'RE LOOKING FOR")

                    // Age range
                    VStack(alignment: .leading, spacing: 8) {
                        fieldLabel("Age Preference")
                        HStack(spacing: 12) {
                            TextField("Min", text: $preferredAgeMin)
                                .keyboardType(.numberPad)
                                .font(Theme.serif(18))
                                .foregroundStyle(Theme.textPrimary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(Theme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 14))

                            Text("to")
                                .font(Theme.sans(14, weight: .light))
                                .foregroundStyle(Theme.textSecondary)

                            TextField("Max", text: $preferredAgeMax)
                                .keyboardType(.numberPad)
                                .font(Theme.serif(18))
                                .foregroundStyle(Theme.textPrimary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(Theme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }

                    // Interested In
                    VStack(alignment: .leading, spacing: 10) {
                        fieldLabel("Interested In")
                        HStack(spacing: 10) {
                            ForEach(genderOptions, id: \.0) { value, label in
                                let isSelected = preferredGenders.contains(value)
                                Button {
                                    if isSelected {
                                        if preferredGenders.count > 1 {
                                            preferredGenders.remove(value)
                                        }
                                    } else {
                                        preferredGenders.insert(value)
                                    }
                                } label: {
                                    Text(label)
                                        .font(Theme.sans(14, weight: .medium))
                                        .foregroundStyle(isSelected ? Theme.textPrimary : Theme.textSecondary)
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 10)
                                        .background(isSelected ? Theme.accentBright.opacity(0.3) : Theme.surface)
                                        .overlay(
                                            Capsule()
                                                .strokeBorder(isSelected ? Theme.accent : .clear, lineWidth: 1)
                                        )
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                // MARK: - Error & Submit

                if let errorMessage {
                    Text(errorMessage)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.errorText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.errorBg)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                Button {
                    Task { await submit() }
                } label: {
                    Group {
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text(isEditing ? "Save" : "Continue")
                                .font(Theme.sans(17, weight: .medium))
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Theme.accentBright)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
            }
            .padding(.horizontal, 24)
            .padding(.top, 40)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.backgroundGradient)
        .onAppear {
            guard let profile = model.soulmateProfile else { return }
            displayName = profile.displayName ?? ""
            age = "\(profile.age)"
            gender = profile.gender
            preferredAgeMin = "\(profile.preferredAgeMin)"
            preferredAgeMax = "\(profile.preferredAgeMax)"
            preferredGenders = Set(profile.preferredGenders)
            latitude = profile.latitude
            longitude = profile.longitude
            hasExistingLocation = true
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(Theme.sans(12, weight: .medium))
            .foregroundStyle(Theme.accent)
            .textCase(.uppercase)
            .tracking(1.5)
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title)
            .font(Theme.sans(14, weight: .medium))
            .foregroundStyle(Theme.textPrimary)
    }

    private func submit() async {
        errorMessage = nil
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, trimmedName.count <= 50 else {
            errorMessage = "Please enter a name (1-50 characters)."
            return
        }
        guard let ageInt = Int(age), ageInt >= 18 else {
            errorMessage = "Please enter a valid age (18+)."
            return
        }
        guard let minAge = Int(preferredAgeMin), minAge >= 18 else {
            errorMessage = "Minimum age must be 18+."
            return
        }
        guard let maxAge = Int(preferredAgeMax), maxAge >= minAge else {
            errorMessage = "Maximum age must be >= minimum age."
            return
        }

        // Resolve location
        var lat: Double?
        var lng: Double?

        if let loc = locationManager.location {
            lat = loc.coordinate.latitude
            lng = loc.coordinate.longitude
        } else if hasExistingLocation, let existingLat = latitude, let existingLng = longitude {
            lat = existingLat
            lng = existingLng
        }

        guard let finalLat = lat, let finalLng = lng else {
            errorMessage = "Please share your location to enable matching."
            return
        }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let response = try await model.backend.saveSoulmateProfile(
                displayName: trimmedName,
                age: ageInt,
                gender: gender,
                latitude: finalLat,
                longitude: finalLng,
                preferredAgeMin: minAge,
                preferredAgeMax: maxAge,
                preferredGenders: Array(preferredGenders)
            )
            await MainActor.run {
                model.soulmateProfile = response.soulmateProfile
                if isEditing { dismiss() }
            }
        } catch {
            errorMessage = "Failed to save profile. Try again."
        }
    }
}

// MARK: - Location Helper

final class LocationHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var location: CLLocation?
    @Published var hasLocation = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestLocation() {
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.first
        hasLocation = location != nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Silently fail — user sees location button unchanged
    }
}
