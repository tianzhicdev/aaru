# AARU App Store Metadata Draft

## Core Listing

App Name:
`AARU`

Subtitle:
`Soul-based conversations in a living world`

Promotional Text:
`Enter a shifting social world, meet other souls, and see which conversations open something deeper.`

Description:
`AARU is a social exploration game built around presence, personality, and compatibility. Create a soul profile, enter a stylized world, and drift into conversations with other wandering souls. Each exchange changes your compatibility and reveals which connections are worth pursuing.`

Keywords:
`social,conversation,world,compatibility,avatar,ai`

Primary Category:
`Games`

Suggested Secondary Category:
`Social Networking`

## Review Notes

Use this app as a live-service MVP:

- On first launch, tap `Enter AARU`
- Complete onboarding and generate a soul profile
- Use the random avatar generator
- Enter the world and open any conversation
- The app talks to Supabase Edge Functions for bootstrap, world sync, and conversation turns

If review requires a demo account, provide a pre-created device/session path or a TestFlight build note. The current build uses anonymous device bootstrap rather than username/password sign-in.

## Privacy Answers To Prepare

- Data linked to the user:
  - profile text the user writes
  - generated profile attributes
  - avatar selections
  - conversation content
- Data not currently collected for tracking:
  - advertising identifiers
  - cross-app tracking data
- Third-party processing:
  - Supabase for backend storage/functions

These answers must be confirmed against the final production implementation before submission.
