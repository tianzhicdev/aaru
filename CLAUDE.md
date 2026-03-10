# AARU iOS QA Setup

## Project
- Scheme: AARU
- Bundle ID: com.tianzhichen.aaru
- Min iOS: 17.0
- Swift: 5.10
- Dependencies: Supabase (supabase-swift 2.23.1+)
- Generated with: XcodeGen (project.yml)

## Simulator
The default simulator is iPhone 17 Pro (iOS 26.3).

```bash
# Boot simulator (if not already running)
xcrun simctl boot "iPhone 17 Pro"
open -a Simulator
```

## Build & Run
```bash
# Build for simulator
xcodebuild build -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3' \
  -derivedDataPath ./DerivedData \
  | xcpretty

# Install and launch
xcrun simctl install booted ./DerivedData/Build/Products/Debug-iphonesimulator/AARU.app
xcrun simctl launch booted com.tianzhichen.aaru
```

## Run Unit Tests
```bash
xcodebuild test -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3' \
  -resultBundlePath ./TestResults \
  | xcpretty
```

## Maestro UI Tests
- Flows live in: ./maestro/
- Run single flow: `maestro test maestro/<flow>.yaml`
- Run all flows: `maestro test maestro/`
- Interactive inspector: `maestro studio`

## Screenshots / Visual Verification
```bash
# Capture current simulator state
xcrun simctl io booted screenshot /tmp/state.png

# Use this after any UI action to verify the UI is in expected state
```

## App Architecture
- Entry: AARU/App/AARUApp.swift
- Root navigation: RootView.swift (onboarding vs main)
- Onboarding flow: OnboardingView.swift (soul step -> avatar step)
- Main tabs: MainTabView.swift (World, Convos, Me)
- Screens: WorldScreen, ConvosScreen, ConversationDetailScreen, MeScreen
- Models: AppModel.swift, Models.swift, BackendClient.swift
- Tests: AARUTests/
