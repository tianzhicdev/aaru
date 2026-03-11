# 2D Engine/Framework Research for AARU's World Renderer

## Context

AARU currently uses **SpriteKit** with a custom `WorldScene` (~526 lines in `WorldScreen.swift`) and `SpriteSheetHelper` (~70 lines). The implementation hand-builds: grid backdrop with `SKShapeNode` primitives (~100 line nodes), agent path interpolation in `update()`, sprite frame extraction from LPC PNGs at runtime, camera lerp, chat bubbles, and conversation link lines.

The question: **should we replace this with a proper 2D game engine?**

---

## A. SpriteKit (Current — Underutilized) ★ RECOMMENDED

**What's already working well:** Camera following, sprite animations from LPC sheets, chat bubbles, path interpolation, SwiftUI integration via `SpriteView`.

**What you're NOT using that would be transformative:**

1. **`SKTileMapNode`** — The single biggest upgrade. Instead of drawing the backdrop with `SKShapeNode` primitives and ~100 line nodes for the grid, a single `SKTileMapNode` renders the entire tile layer as **one node**. Apple benchmarks show it handles 90K+ tiles as a single draw call. For a 50x50 grid (2,500 tiles), this is trivial. You can layer multiple tile maps (ground, decorations, water) with near-zero overhead. Xcode has a built-in tile set editor.

2. **Texture Atlases (`.atlas` folders)** — Your `SpriteSheetHelper` manually crops `CGImage` regions at runtime. SpriteKit's native `.atlas` folders let Xcode optimize texture packing at build time, enable preloading via `SKTextureAtlas.preloadTextureAtlases()`, and provide compile-time name checking.

3. **`SKConstraint`** — Your camera follow code manually lerps in `update()`. `SKConstraint.distance(SKRange(constantValue: 0), to: playerNode)` does this automatically with zero per-frame code.

4. **`SKAction` sequences for movement** — Instead of manual `stepAlongPath()` with dt-based interpolation, `SKAction.move(to:duration:)` chained in a sequence is GPU-optimized and removes per-frame bookkeeping.

5. **`SKEmitterNode`** — Built-in particle system for ambient effects (fireflies, dust, water sparkle) with Xcode's visual particle editor.

6. **`SKShader`** — Custom fragment shaders for water shimmer, day/night cycle, ambient effects.

| Criterion | Rating |
|-----------|--------|
| SwiftUI integration | Native (`SpriteView`) — already working |
| Tile map support | Excellent (`SKTileMapNode`) |
| Sprite animation | Excellent (texture atlases + `SKAction.animate`) |
| Chat bubbles | Good (`SKLabelNode` + `SKShapeNode`, or SwiftUI overlay) |
| Binary size | **0 MB** (built into iOS) |
| Community | Moderate (Apple ecosystem, stable API) |
| Learning curve | **None** (already using it) |
| Cross-platform | Apple only (iOS, macOS, tvOS) |
| Maintenance | Apple-maintained, stable since iOS 10, Metal-backed |

**Verdict: This is the clear winner.** You're not recreating a game engine — you're just underusing the one you already have. The upgrade path is incremental.

**Key resources:**
- [SKTileMapNode Documentation](https://developer.apple.com/documentation/spritekit/sktilemapnode)
- [Creating a Tile Map Programmatically](https://developer.apple.com/documentation/spritekit/sktilemapnode/creating_a_tile_map_programmatically)
- [SKTiled — TMX parser for SpriteKit](https://github.com/mfessenden/SKTiled)
- [MSKTiled — lightweight TMX -> SKTileMapNode](https://sanderfrenken.github.io/dev-blog/posts/msktiled/)
- [SpriteKit Animations & Texture Atlases — Kodeco](https://www.kodeco.com/144-spritekit-animations-and-texture-atlases-in-swift)

---

## B. Godot Engine (via SwiftGodotKit)

[SwiftGodotKit](https://github.com/migueldeicaza/SwiftGodotKit) embeds Godot 4.4 as a library into a Swift app. You add a `GodotAppView()` in SwiftUI, load a `.pck` file, and the engine renders inside your app. You can write game logic in GDScript or Swift (via [SwiftGodot](https://github.com/migueldeicaza/SwiftGodot) bindings).

**Strengths:**
- Godot's 2D engine is arguably the best for top-down tile-based games. Built-in `TileMapLayer` with autotiling, terrain painting, animated tiles.
- `AnimatedSprite2D` handles LPC spritesheets natively.
- Full scene editor for visual map design.
- Cross-platform: iOS, Android, web, desktop from one project.
- +30 MB binary overhead — modest.
- [Christian Selig wrote about how easy embedding is now](https://christianselig.com/2025/05/godot-ios-interop/).

**Dealbreakers for AARU:**
- **No iOS Simulator support.** Device-only testing = major development velocity hit.
- Only one `GodotApp` instance per application.
- Significant architectural shift — GDScript/Godot editor/`.pck` asset pipeline.
- Two build systems to maintain.

| Criterion | Rating |
|-----------|--------|
| SwiftUI integration | Good (GodotAppView, single instance only) |
| Tile map support | Excellent (TileMapLayer, autotiling) |
| Sprite animation | Excellent (AnimatedSprite2D) |
| Chat bubbles | Good (Label + Panel, or SwiftUI bridge) |
| Binary size | +30 MB |
| Community | Large and growing |
| Learning curve | **High** (new engine, editor, asset pipeline) |
| Cross-platform | Excellent |

**Verdict:** Best 2D engine available, but the no-simulator constraint and architectural overhead make it a poor fit at AARU's current stage. Reconsider if Android becomes a priority.

**Key resources:**
- [SwiftGodotKit](https://github.com/migueldeicaza/SwiftGodotKit)
- [Christian Selig — Embedding Godot in iOS](https://christianselig.com/2025/05/godot-ios-interop/)
- [Xogot Blog — Godot with SwiftUI](https://blog.xogot.com/godot-with-swiftui/)
- [LibGodot — coming in Godot 4.5](https://talks.godotengine.org/godotcon-us-2025/talk/XBJFYV/)

---

## C. Unity (Unity as a Library)

Build a Unity project for iOS → produces `UnityFramework.framework` → embed in Xcode workspace alongside SwiftUI app.

| Criterion | Rating |
|-----------|--------|
| SwiftUI integration | Poor (full-screen only, complex workspace) |
| Tile map support | Good (2D Tilemap) |
| Binary size | **+110 MB** (disqualifying for a social app) |
| Learning curve | High (C#, Unity Editor, UaaL bridge) |
| Cross-platform | Excellent |

**Verdict: No.** +110 MB binary for a 2D social app renderer is absurd. Full-screen-only rendering conflicts with SwiftUI integration. Massively overengineered.

**Resources:**
- [Unity — Integrating into iOS](https://docs.unity3d.com/Manual/UnityasaLibrary-iOS.html)
- [unity-swiftui reference project](https://github.com/bdeweygit/unity-swiftui)

---

## D. Cocos2d-x / Cocos Creator

**Cocos2d-x:** End-of-life since 2019. Not viable.

**Cocos Creator 3.x:** Actively maintained (v3.8), but no documented way to embed in a SwiftUI app. JS/TS scripting. China-focused community.

**Verdict: No.** No embedding story, declining Western community.

---

## E. Phaser.js / PixiJS (Web-based via WKWebView)

Render the world as a web page in `WKWebView` using Phaser or PixiJS.

**Strengths:** Cross-platform (web-first), excellent text/bubble rendering via HTML/CSS, same codebase could power a web client.

**Problems:**
- iOS WKWebView GPU rendering has been described as "completely broken" by developers across multiple iOS versions.
- JavaScript bridge adds latency for state updates.
- No native gestures, haptics, or iOS features from within the web view.

**Verdict:** Not for the primary iOS renderer. Could be useful for a future web client.

---

## F. Metal + Custom Renderer

**Verdict: No.** SpriteKit already runs on Metal internally. You'd be reimplementing what SpriteKit provides for free. Only justified for thousands of animated sprites or custom shaders. For 100 agents on a 50x50 grid, SpriteKit will never be the bottleneck.

---

## G. Tiled Map Editor + SpriteKit ★ USE THIS

[Tiled](https://www.mapeditor.org/) is the industry-standard free map editor. Design your Sunset Beach map visually, export `.tmx`, load into SpriteKit via:

1. **[SKTiled](https://github.com/mfessenden/SKTiled)** — Full TMX loader for SpriteKit, supports all features. Each tile = individual `SKSpriteNode` though.
2. **[MSKTiled](https://sanderfrenken.github.io/dev-blog/posts/msktiled/)** — Parses TMX into `SKTileMapNode` for single-node-per-layer performance. Best of both worlds.

**Verdict:** Design maps in Tiled, render with `SKTileMapNode`. This is the recommended workflow for AARU's Stardew Valley aesthetic.

---

## H. GameplayKit (Apple's Companion Framework)

Logic framework, not a renderer. Useful for:
- **Entity-Component System:** `GKEntity` + `GKComponent` to refactor `AgentVisualNode` into separate concerns (render, movement, chat state).
- **State Machines:** `GKStateMachine` for agent states (wandering, chatting, idle) instead of string checks.

**Verdict:** Worth adopting for code organization alongside SpriteKit, but not essential at current scale.

---

## I. Other Options (All Rejected)

| Engine | Why Not |
|--------|---------|
| Flame (Flutter) | Requires embedding Flutter runtime (+15 MB), maintaining Dart codebase alongside Swift |
| Defold | No SwiftUI embedding, produces standalone apps |
| LibGDX | Java, no Swift bindings |
| Raylib | C, no SwiftUI integration |
| Love2D | Lua, no iOS embedding |

---

## Summary Comparison

| Engine | SwiftUI | Tile Map | Binary | Learning | X-Platform | Verdict |
|--------|---------|----------|--------|----------|------------|---------|
| **SpriteKit** | Native | SKTileMapNode | 0 MB | None | Apple | **USE THIS** |
| Godot | Good | Excellent | +30 MB | High | Excellent | Future Android |
| Unity | Poor | Good | +110 MB | High | Excellent | No |
| Cocos Creator | None | Good | ~25 MB | High | Good | No |
| Phaser/PixiJS | WKWebView | Good | ~1 MB | Moderate | Web | Future web only |
| Metal | DIY | DIY | 0 MB | Extreme | Apple | No |
| GameplayKit | N/A | N/A | 0 MB | Low | Apple | Use alongside SpriteKit |

---

## Recommended Action Plan

**You are NOT recreating a game engine.** You're underusing the one you already have. Here's what to do:

### Phase 1: Tile Map (biggest visual upgrade)
1. Design the Sunset Beach map in **Tiled Map Editor** — sand, water, coffee shop zone, paths
2. Create tile assets (or use free LPC-compatible tilesets)
3. Replace `SKShapeNode` backdrop with `SKTileMapNode` layers (ground, decorations, water)
4. Eliminates ~100 shape/line nodes → 2-3 tile map nodes

### Phase 2: Animation Cleanup
1. Pre-slice LPC spritesheets into `.atlas` folders (build-time optimization)
2. Replace manual `stepAlongPath()` with `SKAction.move(to:duration:)` sequences
3. Use `SKConstraint` for camera follow (remove manual lerp code)

### Phase 3: Ambient Polish
1. Add `SKEmitterNode` particles — floating dust, water sparkle, fireflies at night
2. Add `SKShader` for water shimmer effect
3. Day/night tinting via scene-level color filter

### Phase 4: Code Architecture (if needed)
1. Adopt `GKEntity` + `GKComponent` pattern from GameplayKit
2. Separate rendering, movement, and chat into discrete components

**Estimated code reduction:** ~40% of WorldScreen.swift (remove manual grid drawing, path interpolation, camera lerp).
