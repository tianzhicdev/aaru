import SwiftUI
import CoreLocation

struct SoulmateProfileSetupView: View {
    @EnvironmentObject private var model: AppModel
    @State private var displayName = ""
    @State private var age = ""
    @State private var gender = "male"
    @State private var preferredAgeMin = ""
    @State private var preferredAgeMax = ""
    @State private var preferredGenders: Set<String> = ["male", "female", "non_binary"]
    @State private var locationText = ""
    @State private var latitude: Double?
    @State private var longitude: Double?
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var useCurrentLocation = false
    @StateObject private var locationManager = LocationHelper()

    private let genderOptions = [
        ("male", "Male"),
        ("female", "Female"),
        ("non_binary", "Non-binary")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Set Up Your Profile")
                    .font(.title2.bold())
                    .foregroundColor(.white)

                Text("Before we can find your soulmate, tell us a bit about yourself.")
                    .font(.subheadline)
                    .foregroundColor(.gray)

                // Display Name
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your Name")
                        .font(.headline)
                        .foregroundColor(.white)
                    TextField("How you'd like to be known", text: $displayName)
                        .textFieldStyle(.roundedBorder)
                }

                // Age
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your Age")
                        .font(.headline)
                        .foregroundColor(.white)
                    TextField("Age", text: $age)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                }

                // Gender
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your Gender")
                        .font(.headline)
                        .foregroundColor(.white)
                    Picker("Gender", selection: $gender) {
                        ForEach(genderOptions, id: \.0) { value, label in
                            Text(label).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // Location
                VStack(alignment: .leading, spacing: 8) {
                    Text("Location")
                        .font(.headline)
                        .foregroundColor(.white)

                    Button {
                        useCurrentLocation = true
                        locationManager.requestLocation()
                    } label: {
                        HStack {
                            Image(systemName: "location.fill")
                            Text(locationManager.hasLocation ? "Location shared" : "Share my location")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(locationManager.hasLocation ? Color.green.opacity(0.3) : Color.blue.opacity(0.3))
                        .cornerRadius(8)
                    }

                    Text("or type a city/address:")
                        .font(.caption)
                        .foregroundColor(.gray)

                    TextField("City or address", text: $locationText)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: locationText) { _, _ in
                            useCurrentLocation = false
                        }
                }

                // Preferences
                VStack(alignment: .leading, spacing: 8) {
                    Text("Age Preference")
                        .font(.headline)
                        .foregroundColor(.white)
                    HStack {
                        TextField("Min", text: $preferredAgeMin)
                            .keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder)
                        Text("to")
                            .foregroundColor(.gray)
                        TextField("Max", text: $preferredAgeMax)
                            .keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Interested In")
                        .font(.headline)
                        .foregroundColor(.white)
                    ForEach(genderOptions, id: \.0) { value, label in
                        Toggle(label, isOn: Binding(
                            get: { preferredGenders.contains(value) },
                            set: { isOn in
                                if isOn {
                                    preferredGenders.insert(value)
                                } else if preferredGenders.count > 1 {
                                    preferredGenders.remove(value)
                                }
                            }
                        ))
                        .tint(Theme.accentBright)
                    }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                }

                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    } else {
                        Text("Save Profile")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.accentBright)
                .disabled(isSubmitting)
            }
            .padding()
        }
        .background(Color.black)
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

        if useCurrentLocation, let loc = locationManager.location {
            lat = loc.coordinate.latitude
            lng = loc.coordinate.longitude
        } else if !locationText.isEmpty {
            let geocoder = CLGeocoder()
            if let placemark = try? await geocoder.geocodeAddressString(locationText).first,
               let location = placemark.location {
                lat = location.coordinate.latitude
                lng = location.coordinate.longitude
            }
        }

        guard let finalLat = lat, let finalLng = lng else {
            errorMessage = "Please share your location or enter a valid city."
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
        // Silently fail — user can type location instead
    }
}
