# AARU MVP Release Checklist

## Build And Signing

- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `xcodebuild test -project AARU.xcodeproj -scheme AARU -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO`
- [x] Real `AppIcon` asset catalog present in `AARU/Assets.xcassets/AppIcon.appiconset`
- [ ] Set `DEVELOPMENT_TEAM` in [project.yml](/Users/tianzhichen/projects/aaru/project.yml) or Xcode signing settings
- [ ] Install a valid Apple Development or Apple Distribution signing identity in the local keychain
- [ ] Re-run `xcodebuild archive -project AARU.xcodeproj -scheme AARU -destination 'generic/platform=iOS' -archivePath build/AARU.xcarchive CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates`
- [ ] Re-run Xcode Organizer validation or `xcodebuild -exportArchive` with an App Store export options plist

Current blocker:
`xcodebuild archive` fails with `Signing for "AARU" requires a development team.`

## Product And Compliance

- [x] Privacy manifest present in `AARU/PrivacyInfo.xcprivacy`
- [ ] Host a public privacy policy URL
- [ ] Add the privacy policy URL in App Store Connect
- [ ] Confirm whether account creation is required; if yes, provide account deletion flow before submission
- [ ] Confirm age rating and disclosure answers for user-generated or AI-generated conversation content
- [ ] Confirm export compliance answers for standard Apple submission questionnaire
- [ ] Add content moderation policy for generated dialogue and profile text

## App Store Assets

- [x] 1024x1024 marketing icon generated
- [ ] iPhone screenshots from the current app flow
- [ ] iPad screenshots if iPad remains supported
- [ ] App Preview video, optional
- [ ] Final app name and subtitle
- [ ] Promotional text and keyword set

## Backend Production Readiness

- [x] Remote Supabase migrations applied
- [x] Edge functions deployed
- [x] `bootstrap-user` race hardened with idempotent user and NPC creation
- [ ] Move hard-coded Supabase anon key and project URL strategy into a deliberate release configuration plan
- [ ] Define production monitoring for edge function failures and bootstrap latency
- [ ] Add rate limiting and abuse controls for bootstrap/message endpoints
- [ ] Confirm backup and recovery plan for Supabase data

## QA Gate

- [x] Fresh-device live bootstrap verified repeatedly against deployed backend
- [ ] Manual onboarding regression pass on simulator
- [ ] Manual conversation regression pass with real backend
- [ ] Manual offline / poor-network behavior pass
- [ ] Crash-free smoke test on a physical iPhone
- [ ] TestFlight pass with external metadata and beta review text
