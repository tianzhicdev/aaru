import AppKit

struct IconSpec {
  let filename: String
  let pixels: Int
}

let specs: [IconSpec] = [
  .init(filename: "Icon-20@2x.png", pixels: 40),
  .init(filename: "Icon-20@3x.png", pixels: 60),
  .init(filename: "Icon-29@2x.png", pixels: 58),
  .init(filename: "Icon-29@3x.png", pixels: 87),
  .init(filename: "Icon-40@2x.png", pixels: 80),
  .init(filename: "Icon-40@3x.png", pixels: 120),
  .init(filename: "Icon-60@2x.png", pixels: 120),
  .init(filename: "Icon-60@3x.png", pixels: 180),
  .init(filename: "Icon-20-ipad@1x.png", pixels: 20),
  .init(filename: "Icon-20-ipad@2x.png", pixels: 40),
  .init(filename: "Icon-29-ipad@1x.png", pixels: 29),
  .init(filename: "Icon-29-ipad@2x.png", pixels: 58),
  .init(filename: "Icon-40-ipad@1x.png", pixels: 40),
  .init(filename: "Icon-40-ipad@2x.png", pixels: 80),
  .init(filename: "Icon-76@1x.png", pixels: 76),
  .init(filename: "Icon-76@2x.png", pixels: 152),
  .init(filename: "Icon-83.5@2x.png", pixels: 167),
  .init(filename: "Icon-1024.png", pixels: 1024)
]

let arguments = CommandLine.arguments
guard arguments.count == 2 else {
  fputs("usage: swift scripts/generate_app_icons.swift <output_dir>\n", stderr)
  exit(1)
}

let outputDirectory = URL(fileURLWithPath: arguments[1], isDirectory: true)
let fileManager = FileManager.default
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

func drawIcon(size: CGFloat) -> NSBitmapImageRep {
  guard
    let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: Int(size),
      pixelsHigh: Int(size),
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap)
  else {
    fatalError("Missing graphics context")
  }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = graphicsContext
  let context = graphicsContext.cgContext

  let gradientColors = [
    NSColor(calibratedRed: 0.06, green: 0.14, blue: 0.18, alpha: 1).cgColor,
    NSColor(calibratedRed: 0.14, green: 0.32, blue: 0.35, alpha: 1).cgColor,
    NSColor(calibratedRed: 0.92, green: 0.65, blue: 0.32, alpha: 1).cgColor
  ] as CFArray
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let gradient = CGGradient(colorsSpace: colorSpace, colors: gradientColors, locations: [0.0, 0.62, 1.0])!
  context.drawLinearGradient(gradient, start: CGPoint(x: 0, y: size), end: CGPoint(x: size, y: 0), options: [])

  let dunePath = NSBezierPath()
  dunePath.move(to: CGPoint(x: 0, y: size * 0.30))
  dunePath.curve(to: CGPoint(x: size * 0.42, y: size * 0.24),
                 controlPoint1: CGPoint(x: size * 0.14, y: size * 0.36),
                 controlPoint2: CGPoint(x: size * 0.24, y: size * 0.18))
  dunePath.curve(to: CGPoint(x: size, y: size * 0.34),
                 controlPoint1: CGPoint(x: size * 0.58, y: size * 0.29),
                 controlPoint2: CGPoint(x: size * 0.82, y: size * 0.40))
  dunePath.line(to: CGPoint(x: size, y: 0))
  dunePath.line(to: CGPoint(x: 0, y: 0))
  dunePath.close()
  NSColor(calibratedRed: 0.90, green: 0.73, blue: 0.46, alpha: 1).setFill()
  dunePath.fill()

  let sunRect = CGRect(x: size * 0.21, y: size * 0.50, width: size * 0.58, height: size * 0.58)
  let sunPath = NSBezierPath(ovalIn: sunRect)
  NSColor(calibratedRed: 0.98, green: 0.85, blue: 0.54, alpha: 0.96).setFill()
  sunPath.fill()

  context.saveGState()
  let clipPath = NSBezierPath(ovalIn: sunRect)
  clipPath.addClip()

  let gate = NSBezierPath()
  gate.move(to: CGPoint(x: size * 0.34, y: size * 0.36))
  gate.line(to: CGPoint(x: size * 0.34, y: size * 0.73))
  gate.curve(to: CGPoint(x: size * 0.50, y: size * 0.82),
             controlPoint1: CGPoint(x: size * 0.34, y: size * 0.79),
             controlPoint2: CGPoint(x: size * 0.41, y: size * 0.82))
  gate.curve(to: CGPoint(x: size * 0.66, y: size * 0.73),
             controlPoint1: CGPoint(x: size * 0.59, y: size * 0.82),
             controlPoint2: CGPoint(x: size * 0.66, y: size * 0.79))
  gate.line(to: CGPoint(x: size * 0.66, y: size * 0.36))
  gate.lineWidth = max(size * 0.055, 2)
  NSColor(calibratedRed: 0.09, green: 0.20, blue: 0.20, alpha: 0.88).setStroke()
  gate.lineCapStyle = .round
  gate.stroke()

  let horizon = NSBezierPath()
  horizon.move(to: CGPoint(x: size * 0.12, y: size * 0.48))
  horizon.curve(to: CGPoint(x: size * 0.88, y: size * 0.46),
                controlPoint1: CGPoint(x: size * 0.33, y: size * 0.44),
                controlPoint2: CGPoint(x: size * 0.64, y: size * 0.52))
  horizon.lineWidth = max(size * 0.032, 1.5)
  NSColor(calibratedRed: 0.96, green: 0.94, blue: 0.84, alpha: 0.85).setStroke()
  horizon.stroke()

  context.restoreGState()

  let glow = NSBezierPath(ovalIn: CGRect(x: size * 0.13, y: size * 0.42, width: size * 0.74, height: size * 0.74))
  NSColor(calibratedRed: 1, green: 1, blue: 1, alpha: 0.08).setStroke()
  glow.lineWidth = max(size * 0.02, 1)
  glow.stroke()

  NSGraphicsContext.restoreGraphicsState()
  return bitmap
}

for spec in specs {
  let bitmap = drawIcon(size: CGFloat(spec.pixels))
  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode \(spec.filename)")
  }

  let fileURL = outputDirectory.appendingPathComponent(spec.filename)
  try data.write(to: fileURL)
  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
  process.arguments = ["-z", "\(spec.pixels)", "\(spec.pixels)", fileURL.path, "--out", fileURL.path]
  try process.run()
  process.waitUntilExit()
  guard process.terminationStatus == 0 else {
    fatalError("Unable to normalize \(spec.filename)")
  }
  print("generated \(spec.filename)")
}
