import UIKit
import SpriteKit

/// Extracts frames from LPC walk spritesheets.
/// Walk spritesheets are 576x256 (9 frames x 4 directions, each 64x64).
/// Directions: row 0=North, 1=West, 2=South, 3=East
enum SpriteSheetHelper {
    static let frameSize = 64
    static let walkFrameCount = 9

    enum Direction: Int {
        case north = 0, west, south, east
    }

    /// Load the walk spritesheet UIImage for a given spriteId.
    static func walkSheet(for spriteId: String) -> UIImage? {
        let name = "\(spriteId)_walk"
        guard let url = Bundle.main.url(forResource: name, withExtension: "png"),
              let image = UIImage(contentsOfFile: url.path) else {
            return nil
        }
        return image
    }

    /// Extract a single frame from the walk spritesheet.
    static func frame(from sheet: UIImage, direction: Direction, frameIndex: Int) -> UIImage? {
        guard let cgImage = sheet.cgImage else { return nil }
        let scale = CGFloat(cgImage.width) / sheet.size.width
        let fs = CGFloat(frameSize) * scale
        let x = CGFloat(frameIndex) * fs
        let y = CGFloat(direction.rawValue) * fs
        let rect = CGRect(x: x, y: y, width: fs, height: fs)
        guard let cropped = cgImage.cropping(to: rect) else { return nil }
        return UIImage(cgImage: cropped, scale: sheet.scale, orientation: .up)
    }

    /// Extract all walk frames for a direction as SKTextures.
    static func walkTextures(for spriteId: String, direction: Direction) -> [SKTexture] {
        guard let sheet = walkSheet(for: spriteId),
              let cgImage = sheet.cgImage else { return [] }

        let sheetWidth = CGFloat(cgImage.width)
        let sheetHeight = CGFloat(cgImage.height)
        let fw = CGFloat(frameSize) / (sheet.size.width)
        let fh = CGFloat(frameSize) / (sheet.size.height)

        var textures: [SKTexture] = []
        let fullTexture = SKTexture(cgImage: cgImage)
        fullTexture.filteringMode = .nearest

        for i in 0..<walkFrameCount {
            // SKTexture rect uses normalized 0-1 coords, origin at bottom-left
            // But our spritesheet has origin at top-left, so flip Y
            let x = CGFloat(i) * fw
            let y = 1.0 - CGFloat(direction.rawValue + 1) * fh
            let rect = CGRect(x: x, y: y, width: fw, height: fh)
            let tex = SKTexture(rect: rect, in: fullTexture)
            tex.filteringMode = .nearest
            textures.append(tex)
        }
        return textures
    }

    /// Get a single south-facing texture for static display.
    static func idleTexture(for spriteId: String) -> SKTexture? {
        let textures = walkTextures(for: spriteId, direction: .south)
        return textures.first
    }
}
