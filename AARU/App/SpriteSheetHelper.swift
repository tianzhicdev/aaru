import UIKit
import SpriteKit

/// Provides character walk textures from a build-time texture atlas (Sprites.atlas).
/// Falls back to runtime spritesheet cropping if atlas frames are missing.
enum SpriteSheetHelper {
    static let frameWidth = 96
    static let frameHeight = 64
    static let walkFrameCount = 8
    static let idleFrameCount = 9  // human=9, goblin=8, skeleton=6 — atlas handles actual count
    static let validSpriteIds: Set<String> = Set(AvatarSprites.all)
    static let defaultSpriteId = "human_shorthair_light_default"

    private static let atlas = SKTextureAtlas(named: "Sprites")

    /// Preload the entire atlas into GPU memory.
    static func preload(completion: @escaping () -> Void = {}) {
        SKTextureAtlas.preloadTextureAtlases([atlas], withCompletionHandler: completion)
    }

    /// Resolve a sprite ID, falling back to default if unrecognized.
    static func resolve(_ spriteId: String) -> String {
        validSpriteIds.contains(spriteId) ? spriteId : defaultSpriteId
    }

    /// All walk frames as SKTextures (atlas-backed). Always east direction.
    static func walkTextures(for spriteId: String) -> [SKTexture] {
        let resolved = resolve(spriteId)
        let names = atlas.textureNames
        var textures: [SKTexture] = []
        for i in 0..<walkFrameCount {
            let name = "\(resolved)_walk_east_\(i)"
            guard names.contains(name) else { continue }
            let tex = atlas.textureNamed(name)
            tex.filteringMode = .nearest
            textures.append(tex)
        }
        if textures.isEmpty {
            return walkTexturesFallback(for: resolved)
        }
        return textures
    }

    /// All idle frames as SKTextures (atlas-backed). Falls back to first walk frame.
    static func idleTextures(for spriteId: String) -> [SKTexture] {
        let resolved = resolve(spriteId)
        let names = atlas.textureNames
        var textures: [SKTexture] = []
        // Try up to 9 frames (human has 9, goblin 8, skeleton 6)
        for i in 0..<idleFrameCount {
            let name = "\(resolved)_idle_east_\(i)"
            guard names.contains(name) else { break }
            let tex = atlas.textureNamed(name)
            tex.filteringMode = .nearest
            textures.append(tex)
        }
        if textures.isEmpty {
            // Fallback: use first walk frame as static idle
            if let first = walkTextures(for: spriteId).first {
                return [first]
            }
        }
        return textures
    }

    /// Single idle texture (first idle frame, or first walk frame).
    static func idleTexture(for spriteId: String) -> SKTexture? {
        idleTextures(for: spriteId).first
    }

    // MARK: - UIImage support (for AvatarEditorView)

    /// Load the walk spritesheet as UIImage.
    static func walkSheet(for spriteId: String) -> UIImage? {
        let name = "\(spriteId)_walk"
        guard let url = Bundle.main.url(forResource: name, withExtension: "png"),
              let image = UIImage(contentsOfFile: url.path) else {
            return nil
        }
        return image
    }

    /// Extract a single frame from a spritesheet UIImage.
    static func frame(from sheet: UIImage, frameIndex: Int) -> UIImage? {
        guard let cgImage = sheet.cgImage else { return nil }
        let scaleX = CGFloat(cgImage.width) / sheet.size.width
        let scaleY = CGFloat(cgImage.height) / sheet.size.height
        let fw = CGFloat(frameWidth) * scaleX
        let fh = CGFloat(frameHeight) * scaleY
        let x = CGFloat(frameIndex) * fw
        let rect = CGRect(x: x, y: 0, width: fw, height: fh)
        guard let cropped = cgImage.cropping(to: rect) else { return nil }
        return UIImage(cgImage: cropped, scale: sheet.scale, orientation: .up)
    }

    // MARK: - Fallback (runtime cropping, used if atlas is incomplete)

    private static func walkTexturesFallback(for spriteId: String) -> [SKTexture] {
        guard let sheet = walkSheet(for: spriteId),
              let cgImage = sheet.cgImage else { return [] }

        let fw: CGFloat = 1.0 / CGFloat(walkFrameCount)  // 0.125
        let fh: CGFloat = 1.0

        let fullTexture = SKTexture(cgImage: cgImage)
        fullTexture.filteringMode = .nearest

        var textures: [SKTexture] = []
        for i in 0..<walkFrameCount {
            let x = CGFloat(i) * fw
            let rect = CGRect(x: x, y: 0, width: fw, height: fh)
            let tex = SKTexture(rect: rect, in: fullTexture)
            tex.filteringMode = .nearest
            textures.append(tex)
        }
        return textures
    }
}
