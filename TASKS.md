# AARU — Task Queue
> Populated from AARU_Implementation_Plan.md. Phases 0-2 appear largely complete based on existing code.

## Phase 0 — Project Setup (DONE)
- [x] Initialize Xcode project | project.yml exists, builds | xcodeproj present
- [x] Set up Supabase project | migrations exist | supabase/ directory populated
- [x] Create device UUID + Keychain persistence | SecureStore.swift | code reviewed
- [x] Schema migrations | 7 migration files | supabase/migrations/

## Phase 1 — Soul Profile & Onboarding (DONE)
- [x] Onboarding UI | OnboardingView.swift with soul + avatar steps | code reviewed
- [x] generate-soul-profile logic | soulProfile.ts with fallback | unit tests pass
- [x] Soul profile display with guessed_fields markers | SoulProfileCard in OnboardingView | code reviewed
- [x] Inline editing of soul profile fields | OnboardingView allows editing | code reviewed
- [x] Persist soul profile to backend | AppModel.saveSoulProfile | code reviewed

## Phase 2 — Avatar Editor (DONE)
- [x] Avatar editor UI | AvatarEditorView.swift with randomize | code reviewed
- [x] Deterministic avatar generation | avatar.ts avatarForSeed() | unit tests pass
- [x] Avatar persistence to backend | AppModel.saveAvatar | code reviewed

## Phase 3 — World Rendering (PARTIALLY DONE)
- [x] SpriteKit WorldScene | WorldScreen.swift ~410 lines | renders agents, grid, zones
- [x] Agent position rendering via Realtime | RealtimeBridge.swift | subscriptions wired
- [x] Chat bubbles above chatting avatars | WorldScene code | implemented
- [x] Bottom tab bar (World/Convos/Me) | MainTabView.swift | 3 tabs
- [ ] Seed instance with 30 NPC agents | Need NPC Soul Profiles + avatar configs | NPCs appear in world on boot
- [ ] World instance counter (👥 34/100) | WorldScreen shows count | accurate live count
- [ ] Tapping avatar shows bottom sheet with name + impression | UI interaction | sheet appears with data

## Phase 4 — Ka Movement Engine (PARTIALLY DONE)
- [x] World tick simulation | world.ts tickWorld() | unit tests pass (6 tests)
- [x] Ka state machine (wandering/approaching/chatting/cooldown) | AgentState type | states transition correctly
- [x] Grid occupancy (1 Ka per cell) | world.ts occupancy tracking | tested
- [x] Conversation initiation from adjacent cells | isAdjacent() | tested
- [x] Cooldown after conversation ends | endConversation() | tested
- [ ] Deploy world-tick as Edge Function | supabase/functions/ | function responds 200
- [ ] Configure pg_cron (500ms online, 5s offline) | Supabase cron | ticks run on schedule
- [ ] Positions broadcast via Supabase Realtime | Realtime channel | clients receive updates

## Phase 5 — Ka Conversation Engine (PARTIALLY DONE)
- [x] Ka system prompt from Soul Profile | ka.ts buildKaSystemPrompt() | code reviewed
- [x] Ka reply generation with fallback | ka.ts buildKaReply() | integration test passes
- [ ] Deploy ka-converse as Edge Function | supabase/functions/ | function responds 200
- [ ] end-conversation logic (entropy detection) | Edge Function | conversations end gracefully
- [ ] fetch-news cron (every 6h) | Edge Function + cron | news_items populated
- [ ] Conversation Detail screen — Ka Tab live messages | ConversationDetailScreen.swift | messages update in real time
- [ ] Message labels (🤖/👤) in UI | ConversationDetailScreen | labels always correct

## Phase 6 — Impression Engine (PARTIALLY DONE)
- [x] Impression evaluation (heuristic + LLM) | impression.ts | unit tests pass
- [x] Score accumulation (55/45 blend) | accumulateImpression() | tested
- [x] Ba unlock threshold check (72+) | isBaAvailableToViewer() | tested
- [ ] Deploy evaluate-compatibility as Edge Function | supabase/functions/ | function responds 200
- [ ] Impression score + summary in Conversations inbox | ConvosScreen.swift | visible per conversation
- [ ] Impression on avatar bottom sheet | WorldScreen.swift | shows after first conversation
- [ ] Unlock progress bar in inbox (Ka ────●──── Ba) | ConvosScreen.swift | visual progress

## Phase 7 — Ba Unlock & Human Interaction (NOT STARTED)
- [ ] Ba unlock threshold trigger | Edge Function | push sent when threshold crossed
- [ ] iOS push notification for Ba unlock | APNS integration | notification received
- [ ] Ba Tab in Conversation Detail (locked until threshold) | ConversationDetailScreen | tab visible but locked
- [ ] Human typing in Ba Tab | message type: human_typed | messages labeled 👤
- [ ] User can join Ka Tab conversation inline | ConversationDetailScreen | message appears labeled 👤
- [ ] Ka continues independently after user joins | ka-converse logic | Ka keeps replying
- [ ] Ba Tab only accessible from Convos inbox | navigation guard | no world-view path to Ba

## Phase 8 — Offline Ka Loop & NPC Population (NOT STARTED)
- [ ] Offline Ka loop via pg_cron at 5s tick | cron config | Ka wanders when user offline
- [ ] Offline limits (10 convos/day, 20 msgs/convo) | Edge Function logic | limits enforced
- [ ] NPC agents converse with real users | world tick + ka-converse | NPCs chat naturally
- [ ] NPC Ba permanently locked + labeled "AI Resident" | UI + data | label visible
- [ ] End-to-end offline test | user goes offline, returns to new activity | no orphaned state

## Post-POC (BACKLOG)
- [ ] Sign in with Apple (multi-device sync)
- [ ] Ka memory — agents remember past conversations
- [ ] Multiple world themes
- [ ] World travel between instances
- [ ] Richer avatar animations (walk cycles, idle, emotions)
- [ ] Social gravity toward compatible agents
- [ ] Premium tier — stronger LLM model for Ka
- [ ] Akh achievement — visual celebration
- [ ] Interest-based world zones
